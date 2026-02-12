/**
 * Brady-only access gate + enrollment.
 *
 * Important note (plain language):
 * - The "Brady pages" are visible files on the website, but we enforce two layers:
 *   1) UI gating: redirect away if you're not logged in as Brady.
 *   2) Supabase RLS (database rules): even if someone guesses URLs, they cannot
 *      read/write Brady's private progress/journal tables.
 */

const BRADY_ALLOWED_EMAILS = [
  'bradyhyro67@gmail.com',
  'james@jamesbrady.org',
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAllowedEmail(email) {
  const normalized = normalizeEmail(email);
  return BRADY_ALLOWED_EMAILS.includes(normalized);
}

function safeNextPath(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.includes('://') || value.startsWith('//')) return '';
  if (value.toLowerCase().startsWith('javascript:')) return '';
  return value;
}

function bradyLoginUrl(nextPath) {
  const url = new URL('../login.html', window.location.href);
  const safeNext = safeNextPath(nextPath);
  if (safeNext) {
    url.searchParams.set('next', safeNext);
  }
  return url.toString();
}

function bradyIndexUrl(extraParams = {}) {
  const url = new URL('../index.html', window.location.href);
  Object.entries(extraParams || {}).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    url.searchParams.set(k, String(v));
  });
  return url.toString();
}

async function ensureAllowedStudentRow(session) {
  const sb = MHA_Auth.getSupabase();
  const email = normalizeEmail(session?.user?.email);
  if (!isAllowedEmail(email)) return;

  // This will succeed only for Brady because of RLS on allowed_students.
  const { error } = await sb.from('allowed_students').upsert({
    user_id: session.user.id,
    email: email,
  }, { onConflict: 'user_id' });

  if (error) {
    // Don't leak DB details to the UI. Provide a short actionable message.
    throw new Error('Access setup failed. Please refresh and try again. If it keeps happening, the database rules may not be installed yet.');
  }
}

async function requireBrady(opts = {}) {
  const nextPath = safeNextPath(opts.nextPath);
  const session = await MHA_Auth.getSession();

  if (!session) {
    window.location.href = bradyLoginUrl(nextPath);
    return null;
  }

  const email = normalizeEmail(session.user.email);
  if (!isAllowedEmail(email)) {
    window.location.href = bradyIndexUrl({ unauthorized: 1 });
    return null;
  }

  await ensureAllowedStudentRow(session);
  return { session };
}

async function copyTextFromEl(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = el.value || el.textContent || '';
  await navigator.clipboard.writeText(text);
}

window.MHA_Brady = {
  BRADY_ALLOWED_EMAILS,
  requireBrady,
  bradyLoginUrl,
  bradyIndexUrl,
  copyTextFromEl,
  normalizeEmail,
  isAllowedEmail,
  safeNextPath,
};
