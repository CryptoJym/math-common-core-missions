/**
 * Brady-only access gate + learner context.
 *
 * Notes:
 * - The pages are still accessible at URL level, but we enforce:
 *   1) Login + allowlisted email.
 *   2) Row-level ownership in database using auth user + configured sub-accounts.
 * - Learner context allows a parent/admin account to work while saving under a
 *   selected learner_id.
 */

const BRADY_ALLOWED_EMAILS = [
  'bradyhyro67@gmail.com',
  'james@jamesbrady.org',
];

// Auto-seeded admin -> learner relationships.
// This ensures a parent/admin account can start managing a learner right away,
// even if the learner has not signed up yet (record will be "pending" until claimed).
const BRADY_PRESEED_LINKS = {
  'james@jamesbrady.org': [
    {
      learnerEmail: 'bradyhyro67@gmail.com',
      learnerName: 'Hyro',
      learnerRole: 'student',
    },
  ],
};

const BRADY_CONTEXT_KEY_PREFIX = 'mha_brady_active_learner_id';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAllowedEmail(email) {
  return BRADY_ALLOWED_EMAILS.includes(normalizeEmail(email));
}

function bradyContextKey(sessionUserId) {
  return `${BRADY_CONTEXT_KEY_PREFIX}:${String(sessionUserId || '').trim()}`;
}

function normalizeLearnerId(value) {
  const v = String(value || '').trim();
  return v || null;
}

function getActiveLearnerFromStorage(sessionUserId) {
  try {
    return normalizeLearnerId(localStorage.getItem(bradyContextKey(sessionUserId)));
  } catch (_) {
    return null;
  }
}

function setActiveLearnerInStorage(sessionUserId, learnerId) {
  const id = normalizeLearnerId(learnerId);
  const key = bradyContextKey(sessionUserId);
  if (!id) {
    localStorage.removeItem(key);
    return null;
  }
  localStorage.setItem(key, id);
  return id;
}

function normalizeBradyRole(value) {
  const v = String(value || 'student').trim().toLowerCase();
  if (['parent', 'teacher', 'student', 'child'].includes(v)) return v;
  return 'student';
}

function describeLearner(session, subAccounts, learnerId) {
  const actorId = normalizeLearnerId(session?.user?.id);
  const normalized = normalizeLearnerId(learnerId);

  if (!normalized || normalized === actorId) {
    return {
      learnerId: actorId,
      label: 'Me (Account Owner)',
      role: 'parent',
      isSelf: true,
      active: true,
      hasIdentity: Boolean(actorId),
    };
  }

  const active = (subAccounts || [])
    .filter((row) => row && row.is_active !== false)
    .find((row) => normalizeLearnerId(row.learner_id) === normalized);

  if (active) {
    const email = String(active.learner_email || '').trim();
    const name = String(active.learner_name || '').trim();
    const label = name || email || `Sub Account (${normalized.slice(0, 6)}…)`;
    return {
      learnerId: normalized,
      label,
      role: normalizeBradyRole(active.learner_role),
      isSelf: false,
      active: true,
      hasIdentity: true,
      email,
      name,
    };
  }

  return {
    learnerId: actorId,
    label: 'Me (Account Owner)',
    role: 'parent',
    isSelf: true,
    active: true,
    hasIdentity: Boolean(actorId),
  };
}

async function hasSubAccountAccess(session) {
  try {
    const rows = await loadAccessibleSubAccounts(session);
    return Array.isArray(rows) && rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function loadSubAccounts(session) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_sub_accounts')
    .select('id,admin_user_id,learner_id,learner_email,learner_name,learner_role,is_active,created_at')
    .eq('admin_user_id', session.user.id)
    .eq('is_active', true)
    .order('learner_name', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadAccessibleSubAccounts(session) {
  const sb = MHA_Auth.getSupabase();
  const { data, error } = await sb
    .from('brady_sub_accounts')
    .select('id,admin_user_id,learner_id,learner_email,learner_name,learner_role,is_active,created_at')
    .eq('learner_email', normalizeEmail(session?.user?.email))
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

function learnerSessionLabel(session, subAccounts, learnerId) {
  const normalized = normalizeLearnerId(learnerId);
  const actorEmail = normalizeEmail(session?.user?.email);
  if (!normalized) return describeLearner(session, subAccounts, normalized);

  const byId = (subAccounts || []).find((row) => normalizeLearnerId(row.learner_id) === normalized);
  if (byId) return describeLearner(session, subAccounts, normalized);

  // If this is the actor's own child account, show their email as the learner label.
  if (actorEmail) {
    return {
      learnerId: normalized,
      label: actorEmail,
      role: 'student',
      isSelf: true,
      active: true,
      hasIdentity: true,
    };
  }

  return describeLearner(session, subAccounts, normalized);
}

async function claimPendingSubAccounts(session) {
  const email = normalizeEmail(session?.user?.email);
  if (!email) return;

  const sb = MHA_Auth.getSupabase();
  await sb
    .from('brady_sub_accounts')
    .update({ learner_id: session.user.id, is_active: true })
    .eq('learner_email', email)
    .is('learner_id', null)
    .eq('is_active', true);
}

async function seedPreconfiguredSubAccounts(session) {
  const adminEmail = normalizeEmail(session?.user?.email);
  const links = BRADY_PRESEED_LINKS[adminEmail];
  if (!Array.isArray(links) || links.length === 0) return;

  const sb = MHA_Auth.getSupabase();

  let existingRows = [];
  try {
    const { data, error } = await sb
      .from('brady_sub_accounts')
      .select('learner_email')
      .eq('admin_user_id', session.user.id);
    if (error) return;
    existingRows = data || [];
  } catch (_) {
    return;
  }

  const existing = new Set(existingRows.map((row) => normalizeEmail(row?.learner_email)));

  for (const link of links) {
    const learnerEmail = normalizeEmail(link?.learnerEmail);
    if (!learnerEmail) continue;
    if (existing.has(learnerEmail)) continue;

    const payload = {
      admin_user_id: session.user.id,
      learner_id: null,
      learner_email: learnerEmail,
      learner_name: String(link?.learnerName || '').trim() || null,
      learner_role: normalizeBradyRole(link?.learnerRole),
      is_active: true,
    };

    const { error } = await sb.from('brady_sub_accounts').insert(payload);
    if (error) {
      const message = String(error?.message || '');
      if (error?.code === '23505' || message.includes('duplicate key value')) {
        existing.add(learnerEmail);
        continue;
      }
      // Defensive: never block page access due to a seeding failure.
      return;
    }

    existing.add(learnerEmail);
  }
}

async function getBradyContext(session, opts = {}) {
  await claimPendingSubAccounts(session);

  const isAdmin = isAllowedEmail(normalizeEmail(session?.user?.email));
  const subAccounts = isAdmin
    ? await loadSubAccounts(session)
    : await loadAccessibleSubAccounts(session);

  if (!isAdmin && subAccounts.length === 0) {
    return {
      session,
      context: describeLearner(session, [], normalizeLearnerId(session?.user?.id)),
      subAccounts: [],
    };
  }

  const fallbackLearner = normalizeLearnerId(session.user.id);
  const saved = getActiveLearnerFromStorage(session.user.id);
  const requested = opts.learnerId ? normalizeLearnerId(opts.learnerId) : null;

  if (requested && requested !== fallbackLearner) {
    const match = (subAccounts || []).find((row) => normalizeLearnerId(row.learner_id) === requested);
    if (match) {
      setActiveLearnerInStorage(session.user.id, requested);
      const desc = describeLearner(session, subAccounts, requested);
      return { session, context: desc, subAccounts };
    }

    setActiveLearnerInStorage(session.user.id, null);
  } else if (saved) {
    const resolved = describeLearner(session, subAccounts, saved);
    if (!resolved.isSelf) {
      return {
        session,
        context: resolved,
        subAccounts,
      };
    }

    setActiveLearnerInStorage(session.user.id, null);
  }

  return {
    session,
    context: describeLearner(session, subAccounts, fallbackLearner),
    subAccounts,
  };
}

async function setBradyLearner(session, learnerId) {
  const requested = normalizeLearnerId(learnerId);
  const actorId = normalizeLearnerId(session?.user?.id);

  // Clearing context back to self should not require a database roundtrip.
  // This keeps the UX snappy and avoids flakiness when the admin portal is
  // interacted with before background loads settle.
  if (!requested || requested === actorId) {
    setActiveLearnerInStorage(session.user.id, null);
    return actorId;
  }

  const subAccounts = await loadSubAccounts(session);

  const match = (subAccounts || []).find((row) => normalizeLearnerId(row.learner_id) === requested);
  if (!match) {
    throw new Error('Learner is not available for this account.');
  }

  setActiveLearnerInStorage(session.user.id, requested);
  return requested;
}

function clearBradyLearner(session) {
  setActiveLearnerInStorage(session.user.id, null);
}

function getBradyLearnerId(session, context) {
  const contextId = normalizeLearnerId(context?.learnerId);
  const actorId = normalizeLearnerId(session?.user?.id);
  return contextId || actorId;
}

function getBradyQueryUser(session, context) {
  const learnerId = getBradyLearnerId(session, context);
  return { userId: learnerId, actorId: normalizeLearnerId(session?.user?.id) };
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

  const { error } = await sb.from('allowed_students').upsert({
    user_id: session.user.id,
    email,
  }, { onConflict: 'user_id' });

  if (error) {
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

  // Important for pending sub-account records: try to claim any pending link
  // that matches the logged-in learner email before deciding access.
  await claimPendingSubAccounts(session);

  const email = normalizeEmail(session.user.email);
  const hasAccess = isAllowedEmail(email) || await hasSubAccountAccess(session);
  if (!hasAccess) {
    window.location.href = bradyIndexUrl({ unauthorized: 1 });
    return null;
  }

  if (isAllowedEmail(email)) {
    await ensureAllowedStudentRow(session);
    await seedPreconfiguredSubAccounts(session);
  }

  const contextPayload = await getBradyContext(session, opts);

  // If actor is not a top-level admin, keep learner context as their own id.
  if (!isAllowedEmail(email)) {
    contextPayload.context = learnerSessionLabel(session, contextPayload.subAccounts, contextPayload.context.learnerId);
  }

  return {
    session,
    context: contextPayload.context,
    subAccounts: contextPayload.subAccounts,
  };
}

async function copyTextFromEl(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = el.value || el.textContent || '';
  await navigator.clipboard.writeText(text);
}

window.MHA_Brady = {
  BRADY_ALLOWED_EMAILS,
  BRADY_PRESEED_LINKS,
  requireBrady,
  bradyLoginUrl,
  bradyIndexUrl,
  bradyContextKey,
  copyTextFromEl,
  setBradyLearner,
  clearBradyLearner,
  getBradyContext,
  getBradyLearnerId,
  getBradyQueryUser,
  loadSubAccounts,
  hasSubAccountAccess,
  seedPreconfiguredSubAccounts,
  describeLearner,
  normalizeEmail,
  isAllowedEmail,
  safeNextPath,
  normalizeLearnerId,
  loadAccessibleSubAccounts,
};
