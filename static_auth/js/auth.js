/**
 * Math Hunter Academy - Authentication Module
 * Handles Supabase auth, session management, and user nav UI
 */

// These will be set by the build script via a config script tag
const SUPABASE_URL = window.MHA_CONFIG?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.MHA_CONFIG?.SUPABASE_ANON_KEY || '';

let _supabase = null;
let _didValidateSessionThisPage = false;

function getSupabase() {
  if (!_supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

function getLoginRedirectUrl() {
  const currentUrl = new URL(window.location.href);
  const next = currentUrl.searchParams.get('next');
  const loginUrl = new URL('login.html', currentUrl);
  loginUrl.searchParams.set('confirmed', '1');
  if (next) {
    loginUrl.searchParams.set('next', next);
  }
  return loginUrl.toString();
}

function decodeAuthMessage(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch (_) {
    return value;
  }
}

function getFriendlyAuthMessage(error, context = 'auth') {
  const code = error?.code || error?.error_code || '';
  const rawMessage = error?.message || '';
  const normalized = rawMessage.toLowerCase();

  if (code === 'invalid_credentials') {
    return 'Email or password is incorrect, or this account is not confirmed yet.';
  }
  if (code === 'email_not_confirmed' || normalized.includes('email not confirmed')) {
    return 'Your email is not confirmed yet. Check your inbox and click the confirmation link.';
  }
  if (code === 'over_email_send_rate_limit' || normalized.includes('email rate limit exceeded')) {
    return 'Too many confirmation emails were requested. Please wait about a minute, then try again.';
  }
  if (code === 'otp_expired' || normalized.includes('otp') && normalized.includes('expired')) {
    return 'This confirmation link expired. Request a new confirmation email and try again.';
  }
  if (context === 'resend' && !rawMessage) {
    return 'Unable to resend confirmation email right now. Please try again shortly.';
  }
  return rawMessage || 'Authentication failed. Please try again.';
}

async function processAuthRedirect() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = searchParams.get('code');
  let confirmed = false;
  let error = null;

  if (code) {
    const { error: exchangeError } = await getSupabase().auth.exchangeCodeForSession(code);
    if (exchangeError) {
      error = exchangeError;
    } else {
      confirmed = true;
    }
  }

  if (
    searchParams.get('confirmed') === '1' ||
    searchParams.get('type') === 'signup' ||
    hashParams.get('type') === 'signup'
  ) {
    confirmed = true;
  }

  const redirectError =
    searchParams.get('error_description') ||
    hashParams.get('error_description') ||
    searchParams.get('error') ||
    hashParams.get('error');

  if (!error && redirectError) {
    error = { message: decodeAuthMessage(redirectError) };
  }

  return { confirmed, error };
}

function clearAuthRedirectParams() {
  const url = new URL(window.location.href);
  ['code', 'type', 'confirmed', 'error', 'error_description'].forEach((key) => {
    url.searchParams.delete(key);
  });
  const cleanSearch = url.searchParams.toString();
  const cleanUrl = `${url.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

/** Get current session, returns null if not logged in */
async function getSession() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;

  // Supabase can return a locally-cached session that no longer exists server-side
  // (common after long inactivity or manual session revocation). Validate once per
  // page-load and clear local auth state if the session is stale.
  if (_didValidateSessionThisPage) return session;
  _didValidateSessionThisPage = true;

  try {
    // We validate via a direct fetch so network flakiness doesn't produce noisy
    // console errors inside supabase-js (Playwright treats console errors as regressions).
    const token = String(session?.access_token || '');
    if (token && SUPABASE_URL && SUPABASE_ANON_KEY) {
      const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        const text = await resp.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
        const code = String(parsed?.error_code || parsed?.code || '');
        const msg = String(parsed?.msg || parsed?.message || text || '').toLowerCase();
        const looksLikeMissingSession =
          (resp.status === 403 && code === 'session_not_found') ||
          msg.includes('session_not_found') ||
          msg.includes('session from session_id claim');

        if (looksLikeMissingSession) {
          try {
            // Local-only so we don't fail if the remote session is already gone.
            await sb.auth.signOut({ scope: 'local' });
          } catch (_) {
            // ignore
          }
          return null;
        }
      }
    }
  } catch (_) {
    // If validation fails due to network issues, keep the local session and let
    // downstream calls decide how to handle it.
  }

  return session;
}

/**
 * Convenience helper: returns a usable access token or throws a friendly error.
 * Use this instead of sb.auth.getSession() directly so we reuse our stale-session
 * validation and avoid "session_not_found" surprises in downstream API calls.
 */
async function getAccessToken() {
  const session = await getSession();
  const token = String(session?.access_token || '').trim();
  if (!token) throw new Error('Session expired. Please log in again.');
  return token;
}

/** Get current user profile from profiles table */
async function getProfile() {
  const session = await getSession();
  if (!session) return null;

  const { data } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return data;
}

/** Sign up with email and password */
async function signUp(email, password, displayName) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getLoginRedirectUrl(),
      data: { display_name: displayName }
    }
  });

  if (error) throw error;

  // Create profile row
  if (data.user) {
    await sb.from('profiles').upsert({
      id: data.user.id,
      display_name: displayName,
      hunter_rank: 'E-Rank',
      xp_total: 0
    });
  }

  return data;
}

/** Resend email confirmation for an account */
async function resendSignupConfirmation(email) {
  const targetEmail = String(email || '').trim();
  if (!targetEmail) {
    throw new Error('Enter your email address first.');
  }
  const { error } = await getSupabase().auth.resend({
    type: 'signup',
    email: targetEmail,
    options: { emailRedirectTo: getLoginRedirectUrl() }
  });
  if (error) throw error;
}

/** Sign in with email and password */
async function signIn(email, password) {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

/** Sign out */
async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
  window.location.href = 'login.html';
}

/** Inject user nav bar into the page if logged in, or redirect to login */
async function initAuthUI(requireLogin = false) {
  const session = await getSession();

  if (!session && requireLogin) {
    window.location.href = 'login.html';
    return;
  }

  // Create user nav element
  const userNav = document.createElement('div');
  userNav.className = 'user-nav';

  if (!session) {
    // Show login/signup links for anonymous users
    userNav.innerHTML = `
      <div class="user-nav-info">
        <span class="user-nav-rank" style="background: linear-gradient(135deg, #444, #666);">GUEST</span>
        <span style="color: var(--text-secondary); font-size: 0.9em;">Progress won't be saved</span>
      </div>
      <a href="login.html" class="user-nav-login">Login</a>
      <a href="signup.html" class="user-nav-login" style="border-color: var(--accent-green); color: var(--accent-green);">Sign Up</a>
    `;
  } else {
    const profile = await getProfile();
    const displayName = profile?.display_name || session.user.email;
    const hunterRank = profile?.hunter_rank || 'E-Rank';
    const xp = profile?.xp_total || 0;

    userNav.innerHTML = `
      <div class="user-nav-info">
        <span class="user-nav-rank">${hunterRank}</span>
        <span class="user-nav-name">${displayName}</span>
        <span class="user-nav-xp">${xp} XP</span>
      </div>
      <button class="user-nav-logout" onclick="signOut()">Logout</button>
    `;
  }

  // Insert at top of body
  document.body.insertBefore(userNav, document.body.firstChild);
}

// Expose functions globally
window.MHA_Auth = {
  getSupabase,
  getSession,
  getAccessToken,
  getProfile,
  signUp,
  signIn,
  signOut,
  initAuthUI,
  resendSignupConfirmation,
  processAuthRedirect,
  clearAuthRedirectParams,
  getFriendlyAuthMessage
};
