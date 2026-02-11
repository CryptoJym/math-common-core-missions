/**
 * Math Hunter Academy - Authentication Module
 * Handles Supabase auth, session management, and user nav UI
 */

// These will be set by the build script via a config script tag
const SUPABASE_URL = window.MHA_CONFIG?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.MHA_CONFIG?.SUPABASE_ANON_KEY || '';

let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

/** Get current session, returns null if not logged in */
async function getSession() {
  const { data: { session } } = await getSupabase().auth.getSession();
  return session;
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
window.MHA_Auth = { getSupabase, getSession, getProfile, signUp, signIn, signOut, initAuthUI };
