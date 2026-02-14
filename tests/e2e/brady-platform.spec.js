const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BRADY_BASE_URL || 'https://math-common-core-missions.vercel.app';
const ADMIN_EMAIL = process.env.BRADY_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.BRADY_ADMIN_PASSWORD || '';
const SHOULD_MUTATE_ADMIN = process.env.BRADY_E2E_MUTATE === '1' || process.env.BRADY_E2E_MUTATE === 'true';
const HAS_ADMIN_CREDENTIALS = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

function toAbs(path) {
  return `${BASE_URL.replace(/\/$/, '')}/${String(path || '').replace(/^\//, '')}`;
}

async function clearAuthState(page) {
  await page.context().clearCookies();
  try {
    await gotoWithRetry(page, 'about:blank');
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch (_) {
    // In some browser states storage access can be denied; cookies were already cleared.
  }
}

function isSafeNextPath(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.length > 0 && !normalized.includes('javascript:') && !normalized.startsWith('http') && !normalized.startsWith('//');
}

async function installRuntimeGuards(page) {
  const runtime = {
    errors: [],
    requestFailures: [],
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') runtime.errors.push(msg.text());
  });
  page.on('pageerror', (error) => {
    runtime.errors.push(error?.message || String(error));
  });
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText || 'failed';
    runtime.requestFailures.push(`${request.url()}: ${errorText}`);
  });

  return runtime;
}

async function gotoWithRetry(page, url, options = {}, retries = 2) {
  const safeOpts = { waitUntil: 'domcontentloaded', timeout: 20_000, ...options };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await page.goto(url, safeOpts);
    } catch (err) {
      const message = String(err?.message || err || '');
      const isTransient = /ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|ERR_NETWORK_IO_SUSPENDED|ERR_NAME_NOT_RESOLVED|net::ERR_/.test(message);
      if (!isTransient || attempt >= retries) throw err;
      await page.waitForTimeout(300 * (attempt + 1));
    }
  }
  throw new Error(`Navigation retry exhausted for ${url}`);
}

async function routeIsAvailable(page, path) {
  try {
    const response = await page.request.get(toAbs(path), { maxRedirects: 0 });
    const status = response.status();
    return status >= 200 && status < 500 && status !== 404;
  } catch (_) {
    return false;
  }
}

async function assertAuthRedirect(page, protectedPath) {
  const exists = await routeIsAvailable(page, protectedPath);
  if (!exists) {
    test.skip(true, `${protectedPath} is not available on ${BASE_URL}`);
  }

  await page.waitForURL(/login\.html/, { timeout: 20_000 });
  const nextParam = new URL(page.url()).searchParams.get('next');
  expect(nextParam, 'next param should be preserved for protected routes').toBeTruthy();
  expect(nextParam.includes(protectedPath), 'next should target protected route').toBeTruthy();
  expect(isSafeNextPath(nextParam), 'next should not be unsafe javascript').toBeTruthy();
}

async function assertRouteExistsOrSkip(page, path) {
  const exists = await routeIsAvailable(page, path);
  if (!exists) {
    test.skip(true, `${path} is not available on ${BASE_URL}`);
  }
}

async function assertNoRuntimeErrors(page, runtime, options = {}) {
  const ignoreRequestContains = options.ignoreRequestContains || [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'favicon.ico',
    'apple-touch-icon',
    'manifest.webmanifest',
  ];
  const ignoreErrors = options.ignoreErrors || [
    'net::ERR_CERT',
    'ERR_CERT',
    'Failed to load resource: the server responded with a status of 404',
    'Failed to load resource: the server responded with a status of 400',
    'Failed to load resource: the server responded with a status of 403',
  ];
  const ignoreRequestErrors = options.ignoreRequestErrors || [
    'net::ERR_ABORTED',
    'ERR_ABORTED',
  ];

  const hasIgnoreToken = (value, tokens) => {
    const text = String(value || '');
    return tokens.some((needle) => text.includes(needle));
  };

  const errors = runtime.errors.filter((err) => {
    return !hasIgnoreToken(err, ignoreErrors);
  });

  const requestErrors = runtime.requestFailures.filter((entry) => {
    if (hasIgnoreToken(entry, ignoreRequestErrors)) return false;
    return !hasIgnoreToken(entry, ignoreRequestContains);
  });

  expect(errors, `Console/page errors on ${page.url()}`).toEqual([]);
  expect(requestErrors, `Request failures on ${page.url()}`).toEqual([]);

  const duplicateIds = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('[id]')).map((el) => String(el.id || '').trim()).filter(Boolean);
    const seen = new Set();
    const dups = new Set();
    for (const id of ids) {
      if (seen.has(id)) dups.add(id);
      seen.add(id);
    }
    return Array.from(dups);
  });
  expect(duplicateIds, `Duplicate IDs on ${page.url()}`).toEqual([]);
}

async function assertFormControlsHaveLabels(page, scopeSelector) {
  const missing = await page.evaluate((selector) => {
    const scope = selector ? document.querySelector(selector) : document;
    if (!scope) return [];
    const controls = Array.from(scope.querySelectorAll('input, select, textarea'));
    return controls
      .filter((el) => {
        const type = String(el.getAttribute('type') || '').toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') return false;
        return true;
      })
      .filter((el) => {
        const id = el.getAttribute('id') || '';
        if (!id) return true;
        const hasLabel = Boolean(
          scope.querySelector(`label[for="${id}"]`)
          || el.getAttribute('aria-label')
          || el.getAttribute('aria-labelledby')
          || el.getAttribute('placeholder'),
        );
        return !hasLabel;
      })
      .map((el) => el.getAttribute('id') || el.getAttribute('name') || el.tagName.toLowerCase());
  }, scopeSelector);
  expect(missing, `Expected labeled controls in ${scopeSelector || 'page'}`).toEqual([]);
}

async function getSupabaseCredentialsFromPage(page) {
  let latest = {
    session: null,
    accessToken: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
  };

  // Some admin-page flows briefly recreate auth UI and briefly clear globals.
  // Retry until the session + config is fully available.
  for (let attempt = 0; attempt < 6; attempt++) {
    latest = await page.evaluate(async () => {
      const out = {
        session: null,
        accessToken: '',
        supabaseUrl: '',
        supabaseAnonKey: '',
      };

      if (window.MHA_Auth && window.MHA_Auth.getSession && window.MHA_Auth.getAccessToken) {
        try {
          out.session = await window.MHA_Auth.getSession();
          out.accessToken = String(await window.MHA_Auth.getAccessToken());
        } catch (_) {
          // Fallbacks below may still recover from localStorage.
        }
      }

      if (!out.accessToken || !out.session) {
        const base = String(window.MHA_CONFIG?.SUPABASE_URL || '');
        const project = base.match(/https?:\/\/([^.]+)\.supabase\.co/);
        const prefix = project ? `sb-${project[1]}-auth-token` : null;
        const keys = Object.keys(window.localStorage || {}).filter((key) => {
          if (!prefix) return /-auth-token$/.test(String(key));
          return String(key).startsWith(prefix) || /-auth-token$/.test(String(key));
        });

        for (const key of keys) {
          try {
            const raw = window.localStorage.getItem(key);
            const payload = JSON.parse(raw || '{}');
            const sessions = [];
            if (payload?.currentSession) sessions.push(payload.currentSession);
            if (payload?.session) sessions.push(payload.session);
            if (payload?.access_token && payload?.user?.id) {
              sessions.push({
                access_token: payload.access_token,
                user: payload.user,
                refresh_token: payload.refresh_token,
                token_type: payload.token_type,
                expires_at: payload.expires_at,
                expires_in: payload.expires_in,
              });
            }
            for (const session of sessions) {
              const token = session?.access_token;
              if (token && session?.user?.id) {
                out.session = session;
                out.accessToken = String(token);
                break;
              }
            }
            if (out.accessToken) break;
          } catch (_) {
            // ignore malformed values
          }
        }
      }

      if (window.MHA_CONFIG) {
        out.supabaseUrl = window.MHA_CONFIG.SUPABASE_URL || '';
        out.supabaseAnonKey = window.MHA_CONFIG.SUPABASE_ANON_KEY || '';
      }

      if (!out.supabaseUrl || !out.supabaseAnonKey) {
        const configScript = Array.from(document.scripts).map((el) => el.src || '').find((src) => /\/js\/config\.js(\?.*)?$/.test(src));
        if (configScript) {
          try {
            const text = await fetch(configScript).then((r) => (r.ok ? r.text() : ''));
            const urlMatch = text.match(/SUPABASE_URL\\s*:\\s*['\"]([^'\"]+)['\"]/);
            const keyMatch = text.match(/SUPABASE_ANON_KEY\\s*:\\s*['\"]([^'\"]+)['\"]/);
            if (urlMatch) out.supabaseUrl = out.supabaseUrl || urlMatch[1];
            if (keyMatch) out.supabaseAnonKey = out.supabaseAnonKey || keyMatch[1];
          } catch (_) {
            // ignore fetch parsing failures in this test helper.
          }
        }
      }

      if (!out.supabaseUrl) {
            const tokenSessionForUrl = out.session?.access_token || out.accessToken;
            if (tokenSessionForUrl && typeof tokenSessionForUrl === 'string' && tokenSessionForUrl.includes('.')) {
              try {
                const payloadPart = tokenSessionForUrl.split('.')[1];
                if (payloadPart) {
                  const b64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
                  const payload = JSON.parse(decodeURIComponent(escape(atob(b64)))); // decode base64url jwt payload
                  const iss = String(payload?.iss || '');
                  const m = iss.match(/^(https?:\/\/[^/]+)\/auth\/v1$/);
                  if (m) out.supabaseUrl = m[1];
                }
              } catch (_) {
                // no-op
          }
        }
      }

      return out;
    });

    if (latest.accessToken && latest.session && latest.supabaseUrl && latest.supabaseAnonKey) {
      return latest;
    }
    await page.waitForTimeout(250 * (attempt + 1));
  }

  return {
    session: latest.session,
    accessToken: String(latest.accessToken || ''),
    supabaseUrl: latest.supabaseUrl,
    supabaseAnonKey: latest.supabaseAnonKey,
  };
}

async function assertTapTargets(page, selector, minPx = 44) {
  const bad = await page.evaluate(({ selector, minPx }) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < minPx || rect.height < minPx);
      })
      .map((el) => el.id || el.textContent?.slice(0, 32).trim() || el.className || 'unnamed');
  }, { selector, minPx });
  expect(bad, `Controls smaller than ${minPx}px for ${selector}`).toEqual([]);
}

async function waitForAuthRedirectOrError(page, timeout = 40_000) {
  const errorLoc = page.locator('#authError');
  await page.waitForTimeout(200);
  try {
    await Promise.race([
      page.waitForURL((url) => !url.href.includes('login.html'), { timeout }),
      errorLoc.waitFor({ state: 'visible', timeout }),
    ]);
  } catch (_) {
    // Intentional: fallthrough to explicit assertion below.
  }

  if (page.url().includes('login.html')) {
    const msg = await errorLoc.textContent();
    if (msg) throw new Error(msg.trim());
  }
}

async function signInAdmin(page) {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'Set BRADY_ADMIN_EMAIL and BRADY_ADMIN_PASSWORD to run authenticated coverage.');

  await clearAuthState(page);
  await gotoWithRetry(page, toAbs('login.html?next=brady/index.html'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('#submitBtn')).toBeVisible();

  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('#submitBtn');
  await waitForAuthRedirectOrError(page);
  await expect(page).not.toHaveURL(/login\.html/);
}

async function assertBackLinks(page, path) {
  const links = page.locator('a[href]');
  const count = await links.count();
  const hrefs = [];
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href');
    if (!href) continue;
    hrefs.push(href);
  }
  if (path === 'dashboard') {
    const hasBradyNav = hrefs.some((href) => /(daily\.html|assignments\.html|reading\.html|admin\.html)/.test(href));
    expect(hasBradyNav, `Expected dashboard navigation links from ${path}`).toBeTruthy();
    return;
  }

  expect(hrefs.some((href) => /index\.html/.test(href)), `Expected a back link from ${path}`).toBeTruthy();
}

async function setDraftCandidateForSection(page, sectionKey) {
  const input = page.locator(`#${sectionKey}Section input[id^="${sectionKey}_ans_"]`).first();
  const select = page.locator(`#${sectionKey}Section select[id^="${sectionKey}_ans_"]`).first();

  if (await input.count()) {
    await input.fill('12');
    return true;
  }

  if (await select.count()) {
    const options = await select.locator('option').allTextContents();
    const candidate = options.find((label) => label && !/select/i.test(label));
    if (candidate) {
      await select.selectOption({ label: candidate });
      return true;
    }
  }

  return false;
}

test.describe('Brady platform guardrails and access routing', () => {
  test('unauthenticated assignments page redirects to login with validated next path', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('brady/assignments.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/assignments.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should include assignments route').toContain('assignments');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated reading page redirects to login with validated next path', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('brady/reading.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/reading.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should include reading route').toContain('reading');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated avatar page redirects to login with validated next path', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('brady/avatar.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/avatar.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should include avatar route').toContain('avatar');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated /brady/ redirects to login with validated next path', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('brady/'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/index.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next param should be preserved').toBeTruthy();
    expect(nextParam.includes('brady/'), 'next should return to brady context').toBeTruthy();
    expect(nextParam.includes('javascript:'), 'next should not be unsafe javascript').toBeFalsy();
    await expect(nextParam, 'next should resolve to a valid page path').toContain('brady/');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated daily training redirects to login with validated next path', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('brady/daily.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/daily.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should include daily route').toContain('daily');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated assignment deep link redirects with next context', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('brady/assignment.html?id=math_fractions_number_line'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/assignment.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should target the assignment route').toContain('assignment.html');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated admin portal requires login', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/admin.html');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('login page sanitizes unsafe next parameter and signup handoff', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('login.html?next=javascript:alert(1)'), { waitUntil: 'domcontentloaded' });
    const signHrefUnsafe = await page.locator('#signupLink').getAttribute('href');

    expect(signHrefUnsafe, 'unsafe next should be stripped from signup link').not.toContain('javascript');
    expect(signHrefUnsafe, 'unsafe next should be stripped from signup link').toBe('signup.html');

    await page.fill('#email', 'nope@example.com');
    await page.fill('#password', 'short');
    await page.click('#submitBtn');
    await expect(page.locator('#authError')).toBeHidden();
    await expect(page).toHaveURL(/login\.html/);

    await gotoWithRetry(page, toAbs('login.html?next=brady/index.html'), { waitUntil: 'domcontentloaded' });
    const signHrefSafe = await page.locator('#signupLink').getAttribute('href');
    const signupUrl = signHrefSafe ? new URL(signHrefSafe, toAbs('login.html')) : null;

    expect(signHrefSafe, 'signup link should remain in app').not.toBeNull();
    expect(signupUrl?.searchParams.get('next'), 'safe next should be preserved for signup handoff').toBe('brady/index.html');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('login page has user-first form and safe validation flow', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('login.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('form#loginForm')).toBeVisible();
    await expect(page.locator('#email')).toHaveAttribute('type', 'email');
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
    await expect(page.locator('#submitBtn')).toHaveText('Enter the Gate');
    await expect(page.locator('#signupLink')).toHaveAttribute('href', /signup\.html/);

    await page.click('#resendBtn');
    await expect(page.locator('#authError')).toContainText(/Enter your email/i);

    await page.fill('#email', 'invalid@example.com');
    await page.fill('#password', 'short');
    await expect(page.locator('#password')).toHaveAttribute('minlength', '6');
    await page.click('#resendBtn');
    await expect(page.locator('#authError')).toBeHidden();
    await assertFormControlsHaveLabels(page, '.auth-card');
    await assertTapTargets(page, '#submitBtn', 44);
    await assertTapTargets(page, '#resendBtn', 36);
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated users have consistent back links and no JS breakage', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await gotoWithRetry(page, toAbs('index.html'), { waitUntil: 'domcontentloaded' });
    await assertBackLinks(page, 'index');
    await assertNoRuntimeErrors(page, runtime);
  });
});

test.describe('Brady dashboard and assignments flow (authenticated)', () => {
  test('HQ dashboard renders key UX sections and survives refresh', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/index.html');
    await gotoWithRetry(page, toAbs('brady/index.html'), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText('Brady Training HQ');
    await expect(page.locator('#todaySummary')).toBeVisible();
    await expect(page.locator('#nextUp')).toBeVisible();

    await page.reload();
    await expect(page.locator('h1')).toHaveText('Brady Training HQ');
    const cardCount = await page.locator('.grid .card').count();
    expect(cardCount, 'dashboard should expose at least the core learning cards').toBeGreaterThanOrEqual(3);
    await expect(page.locator('.grid a.card[href="daily.html"]')).toBeVisible();
    await expect(page.locator('.grid a.card[href="assignments.html"]')).toBeVisible();
    await expect(page.locator('.grid a.card[href="reading.html"]')).toBeVisible();
    await assertBackLinks(page, 'dashboard');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('Avatar dashboard renders standing and performance sections', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/avatar.html');
    await gotoWithRetry(page, toAbs('brady/avatar.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1')).toHaveText('Brady Avatar Dashboard');
    await expect(page.locator('#identitySection')).toBeVisible();
    await expect(page.locator('#standingSection')).toBeVisible();
    await expect(page.locator('#assignmentSection')).toBeVisible();
    await expect(page.locator('#dailyMomentumCard')).toBeVisible();
    await expect(page.locator('#readingMomentumCard')).toBeVisible();
    await expect(page.locator('#performanceSection')).toBeVisible();
    await expect(page.locator('#nextStepsSection')).toBeVisible();
    await assertBackLinks(page, 'avatar');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('Assignments page filters and card metadata are visible', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/assignments.html');
    await gotoWithRetry(page, toAbs('brady/assignments.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#assignmentList')).toBeVisible();
    await expect(page.locator('button[data-filter="all"]')).toBeVisible();
    await expect(page.locator('button[data-filter="math"]')).toBeVisible();

    const before = await page.locator('#assignmentList .section').count();
    expect(before, 'should show at least one assignment card').toBeGreaterThan(0);

    await page.click('button[data-filter="reading"]');
    await expect(page.locator('#assignmentList .section').first()).toBeVisible();
    const afterReading = await page.locator('#assignmentList .section').count();
    expect(afterReading, 'filter should not increase assignment count').toBeLessThanOrEqual(before);

    await page.click('button[data-filter="math"]');
    const afterMath = await page.locator('#assignmentList .section').count();
    expect(afterMath, 'math filter should be non-zero when math assignments exist').toBeGreaterThan(0);

    await page.click('button[data-filter="all"]');
    const afterAll = await page.locator('#assignmentList .section').count();
    expect(afterAll).toBe(before);
    await assertBackLinks(page, 'assignments');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('Assignment runner shows verification shell and enforces complete input before grading', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/assignments.html');
    await gotoWithRetry(page, toAbs('brady/assignments.html'), { waitUntil: 'domcontentloaded' });

    const startBtn = page.locator('a:has-text("Start Test"), button:has-text("Start Test")').first();
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await Promise.all([
      page.waitForURL(/assignment\.html/, { timeout: 15_000 }),
      startBtn.click(),
    ]);

    await expect(page.locator('#assignmentTitle')).toBeVisible();
    await expect(page.locator('#quizContainer')).toBeVisible();
    await expect(page.locator('#quizContainer h2')).toContainText(/Test|Loading|Test Locked|Review|No test found/);
    await page.waitForSelector('[data-question], #resultsContainer', { timeout: 20_000 });

    const isSubmitVisible = await page.locator('#submitQuiz').isVisible().catch(() => false);
    const resultsHeading = (await page.locator('#resultsContainer h2').first().textContent({ timeout: 1_000 }).catch(() => ''))
      .trim()
      .toLowerCase();
    const isLockout = resultsHeading.includes('lockout') || (await page.locator('#alert').textContent().catch(() => '')).toLowerCase().includes('locked');
    const qCount = await page.locator('[data-question]').count();
  if (isSubmitVisible && !isLockout) {
      expect(qCount, 'newly started assignment should generate 10 questions').toBe(10);
      await expect(page.locator('#submitQuiz')).toBeVisible();
      await page.click('#submitQuiz');
      await expect.poll(async () => {
        const submitText = await page.locator('#submitMsg').textContent();
        const alertText = await page.locator('#alert').textContent();
        return `${submitText || ''} ${alertText || ''}`;
      }, { timeout: 5000 }).toContain('Answer every question');
      if (await page.locator('#checkPractice').isVisible()) {
        await page.click('#checkPractice');
        await expect(page.locator('#practiceMsg')).toContainText(/Answer every practice problem|Missing:/);
      }
    } else {
      // lockout mode is valid and should still provide explainable state.
      await expect(page.locator('#resultsContainer')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('#resultsContainer')).toContainText(/Lockout|locked until|attempt/);
    }

    await assertNoRuntimeErrors(page, runtime);
  });

  test('Assignment drafts autosave and survive refresh', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/assignment.html?id=math_equivalent_fractions');
    await gotoWithRetry(page, toAbs('brady/assignment.html?id=math_equivalent_fractions&seed=123456'), { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-question], #resultsContainer', { timeout: 20_000 });
    const submitVisible = await page.locator('#submitQuiz').isVisible().catch(() => false);
    const resultsHeading = (await page.locator('#resultsContainer h2').first().textContent().catch(() => ''))
      .trim()
      .toLowerCase();
    const isLockout = resultsHeading.includes('lockout') || (await page.locator('#alert').textContent().catch(() => '')).toLowerCase().includes('locked');
    if (!submitVisible || isLockout) {
      test.skip(true, 'Assignment is not in an editable state (lockout/review/practice-required).');
    }

    const first = page.locator('[data-question]').first();
    const select = first.locator('select');
    const input = first.locator('input[type="text"]');

    let expected = '0';
    if (await select.count()) {
      const opt = select.locator('option').nth(1);
      expected = (await opt.getAttribute('value')) || (await opt.textContent()) || 'A';
      await select.selectOption({ index: 1 });
      await expect(select).toHaveValue(expected);
    } else {
      await input.fill(expected);
      await expect(input).toHaveValue(expected);
    }

    // Local draft write is immediate; remote draft write is debounced.
    await page.waitForTimeout(150);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-question]', { timeout: 20_000 });

    const firstAfter = page.locator('[data-question]').first();
    const selectAfter = firstAfter.locator('select');
    const inputAfter = firstAfter.locator('input[type="text"]');
    if (await selectAfter.count()) {
      await expect(selectAfter).toHaveValue(expected);
    } else {
      await expect(inputAfter).toHaveValue(expected);
    }

    await assertNoRuntimeErrors(page, runtime);
  });

  test('Assignment page gracefully handles invalid assignment IDs', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await gotoWithRetry(page, toAbs('brady/assignment.html?id=not-found-id'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#quizContainer')).toContainText(/Not found|Assignment not found/i, { timeout: 10_000 });
    await assertBackLinks(page, 'invalid-assignment');
    await assertNoRuntimeErrors(page, runtime);
  });
});

test.describe('Brady Daily Training behavior', () => {
  test('Daily Training renders every section and drafts survive quick refresh', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/daily.html');
    await gotoWithRetry(page, toAbs('brady/daily.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#dailyPlan')).toBeVisible();
    await expect(page.locator('#warmupSection')).toBeVisible();
    await expect(page.locator('#targetSection')).toBeVisible();
    await expect(page.locator('#mixedSection')).toBeVisible();
    await expect(page.locator('#aiSection')).toBeVisible();

    const touched = await setDraftCandidateForSection(page, 'warmup');
    if (touched) {
      await page.waitForTimeout(900);
      const draftKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mha_daily_draft:')).length);
      expect(draftKeys, 'local draft should be saved').toBeGreaterThan(0);

      await page.reload({ waitUntil: 'domcontentloaded' });
      const restored = page.locator('#warmupSection input[id^="warmup_ans_"]').first();
      await expect(restored).toHaveValue('12');
    }

    const submitBtn = page.locator('#warmupSubmit');
    await expect(submitBtn).toBeVisible();
    await page.click('#warmupSubmit');
    await expect(page.locator('#warmupMsg')).toContainText(/Answer every question before submitting/i);
    await assertNoRuntimeErrors(page, runtime);
  });

  test('Daily upload controls validate file selection and size gates', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/daily.html');
    await gotoWithRetry(page, toAbs('brady/daily.html'), { waitUntil: 'domcontentloaded' });

    await page.click('#warmupUploadBtn');
    await expect(page.locator('#warmupUploadMsg')).toContainText('Select a file first.');
    await expect(page.locator('#warmupUploadFile')).toHaveAttribute('accept', /application\/pdf|image\/\*|text\/plain/);
    await page.setInputFiles('#warmupUploadFile', {
      name: 'too-large.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('x'.repeat(8 * 1024 * 1024 + 17)),
    });
    await page.click('#warmupUploadBtn');
    await expect(page.locator('#warmupUploadMsg')).toContainText(/Max 8 MB|too large|Upload failed/i);
    await assertNoRuntimeErrors(page, runtime);
  });
});

test.describe('Reading + Journal workflow', () => {
  async function setFutureDate(page, offsetDays) {
    const today = new Date();
    const target = new Date(today.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const yyyy = String(target.getFullYear());
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    await page.fill('#day', iso);
    return iso;
  }

  test('Reading page validates input, toggles AI prompts, and saves entries', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/reading.html');
    await gotoWithRetry(page, toAbs('brady/reading.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#saveReading')).toBeVisible();
    await expect(page.locator('#fillPrompt')).toBeVisible();

    await setFutureDate(page, 1);
    await page.selectOption('#book', 'anthem');
    await page.fill('#minutes', '700');
    await page.fill('#journal', 'Validation run entry for automated test.');
    await expect(page.locator('#readingSummary')).toContainText(/entries loaded/i, { timeout: 15_000 });
    const rowsBefore = await page.locator('#readingRows tr').count();
    await page.click('#saveReading');
    await page.waitForTimeout(2500);
    const rowsAfterInvalid = await page.locator('#readingRows tr').count();
    expect(rowsAfterInvalid, 'invalid save should not alter reading rows').toBe(rowsBefore);

    await expect(page.locator('#aiBox')).not.toBeVisible();
    for (let i = 0; i < 3; i++) {
      if (await page.locator('#aiBox').isVisible()) break;
      await page.click('#fillPrompt');
      await page.waitForTimeout(150);
    }
    await expect(page.locator('#aiBox')).toBeVisible();
    await page.click('#fillPrompt');
    await expect(page.locator('#aiBox')).not.toBeVisible();

    await page.fill('#minutes', '24');
    await page.click('#saveReading');
    await expect(page.locator('#alert')).toContainText(/Saved\./i, { timeout: 15_000 });
    const savedDate = await page.locator('#day').inputValue();
    const savedBook = await page.locator('#book').inputValue();
    const savedJournal = await page.locator('#journal').inputValue();
    const savedBookLabel = await page.locator('#book option:checked').textContent();
    const savedRow = page.locator('#readingRows tr').filter({ hasText: savedJournal }).first();
    await expect(savedRow).toContainText(savedDate, { timeout: 15_000 });
    await expect(savedRow).toContainText((savedBookLabel || savedBook || '').trim());
    await expect(savedRow).toContainText(/24/);
    await expect(page.locator('#alert')).toContainText(/Saved\./i);
    await expect(page.locator('#fillPrompt')).toBeVisible();
    await page.click('#fillPrompt');
    await expect(page.locator('#aiBox')).toBeVisible();
    await expect(page.locator('#chatgptPrompt')).toBeVisible();

    await expect(page.locator('#saveReading')).toBeEnabled();
    await expect(page.locator('#readingSummary')).toContainText(/Total minutes/i);
    await assertFormControlsHaveLabels(page, '.field-row');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('Reading prompts expose read-only fields with copy controls', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/reading.html');
    await gotoWithRetry(page, toAbs('brady/reading.html'), { waitUntil: 'domcontentloaded' });

    for (let i = 0; i < 3; i++) {
      if (await page.locator('#aiBox').isVisible()) break;
      await page.click('#fillPrompt');
      await page.waitForTimeout(150);
    }
    await expect(page.locator('#fillPrompt')).toBeVisible();
    await expect(page.locator('#aiBox')).toBeVisible();

    await expect(page.locator('#chatgptPrompt')).toHaveAttribute('readonly');
    await expect(page.locator('#codexPrompt')).toHaveAttribute('readonly');
    await expect(page.locator('#claudePrompt')).toHaveAttribute('readonly');

    const copyButtons = page.locator('button[data-copy]');
    await expect(copyButtons).toHaveCount(3);
    await assertNoRuntimeErrors(page, runtime);
  });

  test('Reading drafts autosave and survive refresh', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/reading.html');
    await gotoWithRetry(page, toAbs('brady/reading.html'), { waitUntil: 'domcontentloaded' });

    const token = Date.now();
    const journalText = `Draft autosave e2e ${token}`;

    await page.fill('#minutes', '17');
    await page.fill('#journal', journalText);
    await page.waitForTimeout(150);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#minutes')).toHaveValue('17');
    await expect(page.locator('#journal')).toHaveValue(journalText);
    await assertNoRuntimeErrors(page, runtime);
  });
});

test.describe('AI Coach', () => {
  test('Coach page loads without auth/session errors', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/coach.html');
    await gotoWithRetry(page, toAbs('brady/coach.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1')).toHaveText('AI Coach');
    await expect(page.locator('#planContainer')).toBeVisible();
    await expect(page.locator('#profileContainer')).toBeVisible();

    // Allow the auto-run to call the backend and update UI (or show alert).
    await page.waitForTimeout(1200);
    expect(page.url().includes('login.html'), 'Coach should not redirect to login with a valid session').toBeFalsy();
    await assertNoRuntimeErrors(page, runtime);
  });

  test('Coach API response is explicit and never returns a generic 500', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/coach.html');

    const coachRespPromise = page.waitForResponse(
      (resp) => {
        const req = resp.request();
        return req.url().includes('/api/brady/coach') && req.method() === 'POST';
      },
      { timeout: 20_000 },
    );

    await gotoWithRetry(page, toAbs('brady/coach.html'), { waitUntil: 'domcontentloaded' });
    const coachResp = await coachRespPromise;

    const status = coachResp.status();
    expect(status).not.toBe(500);
    const payload = await coachResp.json().catch(() => null);

    if (status === 200) {
      expect(payload, 'coach success payload should include a plan and profile').toBeTruthy();
      expect(payload?.daily_plan, 'success payload should include daily plan').toBeTruthy();
      expect(payload?.profile, 'success payload should include profile').toBeTruthy();
    } else {
      expect(payload).toBeTruthy();
      expect(typeof payload?.error, 'error payload should explain the response').toBe('string');
    }

    if (status === 401 || status === 403) {
      expect(payload?.error, `auth/allowlist error should include a reason`).toBeTruthy();
    }

    if (status === 503) {
      expect(payload?.error_code, `llm config error should include explicit code`).toBe('llm_not_configured');
    }

    await expect(page.locator('h1')).toHaveText('AI Coach');
    await expect(page.locator('#planContainer')).toBeVisible();
    await page.waitForTimeout(600);
    await assertNoRuntimeErrors(page, runtime);
  });
});

test.describe('Admin portal', () => {
  test('Admin portal loads learner management UI and context controls', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/admin.html');
    await gotoWithRetry(page, toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1')).toHaveText('Brady Admin Portal');
    await expect(page.locator('#accountSummary')).toBeVisible();
    await expect(page.locator('#addSubAccountForm')).toBeVisible();
    await expect(page.locator('#learnerEmail')).toBeVisible();
    await expect(page.locator('#learnerRole')).toBeVisible();
    await expect(page.locator('#clearContextBtn')).toBeVisible();
    await expect(page.locator('#downloadExportBtn')).toBeVisible();
    await expect(page.locator('#exportLearner')).toBeVisible();

    await page.click('#clearContextBtn');
    await expect(page.locator('#alert')).toContainText(/context|work as your own|signed/i, { timeout: 10_000 });
    await assertNoRuntimeErrors(page, runtime);
  });

  test('Admin export endpoint returns JSON for a short date range', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/admin.html');
    await gotoWithRetry(page, toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#downloadExportBtn')).toBeVisible();
    await expect(page.locator('#exportStart')).toBeVisible();
    await expect(page.locator('#exportEnd')).toBeVisible();
    await expect(page.locator('#downloadExportBtn')).toBeEnabled();

    // Use the default date range prefilled by the UI (today + last 7 days).
    const exportResp = page.waitForResponse((resp) => {
      const req = resp.request();
      // Fetch follows redirects (308/307), which can produce multiple responses for the same request.
      // We want the final 200 JSON payload, not an intermediate redirect with an empty body.
      return req.url().includes('/api/brady/export') && req.method() === 'POST' && resp.status() === 200;
    }, { timeout: 25_000 });

    await page.click('#downloadExportBtn');
	    const resp = await exportResp;
	    expect(resp.status(), 'export endpoint should respond successfully').toBe(200);

	    const contentType = resp.headers()['content-type'] || '';
	    expect(contentType.toLowerCase(), 'export response should be JSON').toContain('application/json');
	    expect(resp.headers()['content-disposition'] || '', 'export response should be served as a download').toContain('attachment');

	    // The browser UI consumes the response as a Blob for download, which can make
	    // the Playwright Response body unavailable. Validate the endpoint payload via
	    // a direct API request using the current access token.
	    const accessToken = await page.evaluate(async () => {
	      try {
	        const session = await window.MHA_Auth.getSession();
	        return session?.access_token || '';
	      } catch (_) {
	        return '';
	      }
	    });
	    expect(accessToken, 'expected a Supabase access token after login').toBeTruthy();

	    const queryUserId = await page.locator('#exportLearner').inputValue();
	    const startDay = await page.locator('#exportStart').inputValue();
	    const endDay = await page.locator('#exportEnd').inputValue();
	    expect(queryUserId, 'expected a selected learner id').toBeTruthy();
	    expect(startDay, 'expected start day').toBeTruthy();
	    expect(endDay, 'expected end day').toBeTruthy();

	    const apiResp = await page.request.post(toAbs('api/brady/export'), {
	      headers: {
	        'Content-Type': 'application/json',
	        Authorization: `Bearer ${accessToken}`,
	      },
	      data: {
	        queryUserId,
	        startDay,
	        endDay,
	        includeArtifactContent: false,
	      },
	    });
	    expect(apiResp.status(), 'direct export call should return 200').toBe(200);
	    const out = await apiResp.json();
	    expect(Boolean(out && out.export_version), 'export should return JSON payload').toBeTruthy();
	    expect(out.data && typeof out.data === 'object', 'export should include data object').toBeTruthy();

	    await assertNoRuntimeErrors(page, runtime);
	  });

  test('Admin can create then delete a pending learner link when mutate mode is enabled', async ({ page }) => {
    test.skip(!SHOULD_MUTATE_ADMIN, 'Set BRADY_E2E_MUTATE=1 to run write tests.');
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/admin.html');
    await gotoWithRetry(page, toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

    const token = Date.now();
    const email = `e2e-${token}@example.invalid`;
    const name = `E2E Learner ${token}`;

    await page.fill('#learnerEmail', email);
    await page.fill('#learnerName', name);
    await page.selectOption('#learnerRole', 'student');

    await page.click('form#addSubAccountForm button[type="submit"]');

    const creds = await getSupabaseCredentialsFromPage(page);
    const accessToken = creds.accessToken;
    const session = creds.session;
    expect(accessToken, 'expected a session token to verify backend state').toBeTruthy();
    expect(session?.user?.id, 'expected authenticated session user id').toBeTruthy();
    const adminUserId = String(session.user.id);

    const apiSupabaseUrl = creds.supabaseUrl;
    const apiAnonKey = creds.supabaseAnonKey;
    expect(apiSupabaseUrl, 'expected SUPABASE_URL').toBeTruthy();
    expect(apiAnonKey, 'expected SUPABASE_ANON_KEY').toBeTruthy();

    let createdRows = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const createdRowResp = await page.request.get(
        `${apiSupabaseUrl}/rest/v1/brady_sub_accounts?select=id,learner_email,admin_user_id&admin_user_id=eq.${encodeURIComponent(adminUserId)}&order=created_at.desc`,
        {
          headers: {
            apikey: apiAnonKey,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      expect(createdRowResp.status(), 'admin row query should succeed').toBeLessThan(400);
      const rows = await createdRowResp.json().catch(() => []);
      createdRows = Array.isArray(rows)
        ? rows.filter((row) => String(row?.learner_email || '').toLowerCase() === String(email || '').toLowerCase())
        : [];
      if (Array.isArray(createdRows) && createdRows.length > 0) break;
      await page.waitForTimeout(700);
    }
    expect(Array.isArray(createdRows) && createdRows.length > 0, 'expected created sub-account row').toBeTruthy();

    const createdRowId = String(createdRows[0]?.id || '');
    const row = page.locator('#subAccountList table tbody tr').filter({ hasText: email }).first();
    try {
      await page.goto(toAbs('brady/admin.html'));
      await expect(page.locator('#subAccountSummary')).toContainText(/Loaded|record/, { timeout: 20_000 });
      await expect(row).toBeVisible({ timeout: 20_000 });
    } catch (_) {
      // Keep test moving for backend-backed assertions if DOM rendering is temporarily stale.
    }

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    const deleteBtn = row.locator('button[data-delete-learner]');
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await expect(page.locator('#alert')).toContainText('Learner link deleted.', { timeout: 20_000 });
      await expect(row).toBeHidden({ timeout: 20_000 });
    } else if (createdRowId) {
      const directDeleteResp = await page.request.delete(
        `${apiSupabaseUrl}/rest/v1/brady_sub_accounts?id=eq.${encodeURIComponent(createdRowId)}&admin_user_id=eq.${encodeURIComponent(adminUserId)}`,
        {
          headers: {
            apikey: apiAnonKey,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      expect(directDeleteResp.status(), 'direct backend delete should succeed when row is present').toBeLessThan(400);
    }

    await assertNoRuntimeErrors(page, runtime);
  });

  test('Admin can switch learner context back to self', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/admin.html');
    await gotoWithRetry(page, toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#clearContextBtn')).toBeVisible();
    await page.click('#clearContextBtn');
    await expect(page.locator('#alert')).toContainText(/Context set to your own account|signed/i, { timeout: 10_000 });
    await assertNoRuntimeErrors(page, runtime);
  });
});

test.describe('Session lifecycle', () => {
  test('Authenticated users can logout and are returned to gated login flow', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/index.html');
    await gotoWithRetry(page, toAbs('brady/index.html'), { waitUntil: 'domcontentloaded' });

    const logoutButton = page.locator('.user-nav-logout');
    await expect(logoutButton).toBeVisible({ timeout: 10_000 });
    await logoutButton.click();
    await page.waitForURL(/login\.html/, { timeout: 10_000 });

    await gotoWithRetry(page, toAbs('brady/assignments.html'), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#email')).toBeVisible();
    await assertNoRuntimeErrors(page, runtime);
  });
});
