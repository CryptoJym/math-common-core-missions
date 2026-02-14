const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadAuthContext({ getSessionSession, profile, signOutImpl }) {
  const state = {
    insertedNode: null,
    bodyClasses: [],
    remoteSignOutCalled: false,
    localSignOutCalled: false,
    locationHref: 'https://example.test/',
  };

  const auth = {
    getSession: async () => ({ data: { session: getSessionSession || null } }),
    signOut: async (options) => {
      if (options && options.scope === 'local') {
        state.localSignOutCalled = true;
        return signOutImpl?.local || {};
      }
      state.remoteSignOutCalled = true;
      if (signOutImpl?.remote) {
        return signOutImpl.remote();
      }
      return { error: null };
    },
    signInWithPassword: async () => ({ error: null }),
    signUp: async () => ({ data: null, error: null }),
    resend: async () => ({ error: null }),
    exchangeCodeForSession: async () => ({ error: null }),
    auth: null,
  };
  auth.auth = auth;

  const body = {
    firstChild: null,
    insertBefore: (node) => {
      state.insertedNode = node;
    },
    classList: {
      add: (value) => {
        state.bodyClasses.push(value);
      },
    },
  };

  const context = vm.createContext({
    window: {
      MHA_CONFIG: {},
      supabase: {
        createClient: () => auth,
      },
      location: {
        get href() {
          return state.locationHref;
        },
        set href(v) {
          state.locationHref = String(v);
        },
      },
      __test: state,
    },
    document: {
      addEventListener: () => {},
      createElement: () => ({ set innerHTML(value) { this._innerHTML = String(value); }, get innerHTML() { return this._innerHTML || ''; }, set className(v) { this._className = String(v); }, get className() { return this._className || ''; } }),
      body,
    },
    fetch: () => Promise.resolve({ ok: true }),
    Number,
    String,
    Object,
    JSON,
    Date,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    console,
    setInterval,
    clearInterval,
  });

  const from = () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: profile }),
      }),
    }),
  });
  auth.from = () => from();
  auth.storage = {};

  context.window.supabase.createClient = () => auth;
  const filePath = path.join(__dirname, '..', 'static_auth', 'js', 'auth.js');
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, context, { filename: filePath });

  return { context, state };
}

test('initAuthUI escapes user profile data when rendering nav', async () => {
  const { context, state } = loadAuthContext({
    getSessionSession: {
      user: { id: 'u1', email: 'student@example.test' },
      access_token: 'token',
    },
    profile: {
      display_name: '<img src=x onerror=alert(1)>',
      hunter_rank: '<script>bad()</script>',
      xp_total: 12,
    },
  });

  await context.window.MHA_Auth.initAuthUI(false);
  const html = state.insertedNode?.innerHTML || '';
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(!html.includes('<script>bad()</script>'));
  assert.equal(state.bodyClasses.includes('has-user-nav'), true);
});

test('signOut falls back to local signout and still redirects when remote signout fails', async () => {
  const { context, state } = loadAuthContext({
    signOutImpl: {
      remote: async () => {
        throw new Error('network');
      },
    },
  });

  await context.window.MHA_Auth.signOut();
  assert.equal(state.remoteSignOutCalled, true);
  assert.equal(state.localSignOutCalled, true);
  assert.equal(state.locationHref.endsWith('login.html'), true);
});
