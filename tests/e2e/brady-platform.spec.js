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
    await page.goto('about:blank');
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
  await page.goto(toAbs('login.html?next=brady/index.html'), { waitUntil: 'domcontentloaded' });
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
    await page.goto(toAbs('brady/assignments.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/assignments.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should include assignments route').toContain('assignments');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated reading page redirects to login with validated next path', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await page.goto(toAbs('brady/reading.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/reading.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should include reading route').toContain('reading');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated avatar page redirects to login with validated next path', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await page.goto(toAbs('brady/avatar.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/avatar.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should include avatar route').toContain('avatar');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated /brady/ redirects to login with validated next path', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await page.goto(toAbs('brady/'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/daily.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/daily.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should include daily route').toContain('daily');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated assignment deep link redirects with next context', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await page.goto(toAbs('brady/assignment.html?id=math_fractions_number_line'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/assignment.html');
    const nextParam = new URL(page.url()).searchParams.get('next');
    expect(nextParam, 'next should target the assignment route').toContain('assignment.html');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('unauthenticated admin portal requires login', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await page.goto(toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

    await assertAuthRedirect(page, 'brady/admin.html');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('login page sanitizes unsafe next parameter and signup handoff', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await page.goto(toAbs('login.html?next=javascript:alert(1)'), { waitUntil: 'domcontentloaded' });
    const signHrefUnsafe = await page.locator('#signupLink').getAttribute('href');

    expect(signHrefUnsafe, 'unsafe next should be stripped from signup link').not.toContain('javascript');
    expect(signHrefUnsafe, 'unsafe next should be stripped from signup link').toBe('signup.html');

    await page.fill('#email', 'nope@example.com');
    await page.fill('#password', 'short');
    await page.click('#submitBtn');
    await expect(page.locator('#authError')).toBeHidden();
    await expect(page).toHaveURL(/login\.html/);

    await page.goto(toAbs('login.html?next=brady/index.html'), { waitUntil: 'domcontentloaded' });
    const signHrefSafe = await page.locator('#signupLink').getAttribute('href');
    const signupUrl = signHrefSafe ? new URL(signHrefSafe, toAbs('login.html')) : null;

    expect(signHrefSafe, 'signup link should remain in app').not.toBeNull();
    expect(signupUrl?.searchParams.get('next'), 'safe next should be preserved for signup handoff').toBe('brady/index.html');
    await assertNoRuntimeErrors(page, runtime);
  });

  test('login page has user-first form and safe validation flow', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await clearAuthState(page);
    await page.goto(toAbs('login.html'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('index.html'), { waitUntil: 'domcontentloaded' });
    await assertBackLinks(page, 'index');
    await assertNoRuntimeErrors(page, runtime);
  });
});

test.describe('Brady dashboard and assignments flow (authenticated)', () => {
  test('HQ dashboard renders key UX sections and survives refresh', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/index.html');
    await page.goto(toAbs('brady/index.html'), { waitUntil: 'domcontentloaded' });
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
    await page.goto(toAbs('brady/avatar.html'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/assignments.html'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/assignments.html'), { waitUntil: 'domcontentloaded' });

    const startBtn = page.locator('a:has-text("Start Test"), button:has-text("Start Test")').first();
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      startBtn.click(),
    ]);

    await expect(page.locator('#assignmentTitle')).toBeVisible();
    await expect(page.locator('#quizContainer')).toBeVisible();
    await expect(page.locator('#quizContainer h2')).toContainText(/Test|Loading|Test Locked|Review|No test found/);
    await page.waitForSelector('[data-question], #resultsContainer', { timeout: 20_000 });

  const isSubmitVisible = await page.locator('#submitQuiz').isVisible().catch(() => false);
  const resultsHeading = (await page.locator('#resultsContainer h2').first().textContent().catch(() => ''))
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
    await page.goto(toAbs('brady/assignment.html?id=math_equivalent_fractions&seed=123456'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/assignment.html?id=not-found-id'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/daily.html'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/daily.html'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/reading.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#saveReading')).toBeVisible();
    await expect(page.locator('#fillPrompt')).toBeVisible();

    await setFutureDate(page, 1);
    await page.selectOption('#book', 'anthem');
    await page.fill('#minutes', '700');
    await page.fill('#journal', 'Validation run entry for automated test.');
    const invalidSave = Promise.race([
      page.waitForResponse((resp) => {
        const req = resp.request();
        return req.url().includes('brady_reading_log') && req.method() === 'POST' && resp.status() < 400;
      }, { timeout: 5_000 }).then(() => true).catch(() => false),
      page.waitForTimeout(1200).then(() => null),
    ]);
    await page.click('#saveReading');
    const minutesOverflow = await page.locator('#minutes').evaluate((input) => Boolean(input.validity?.rangeOverflow));
    expect(minutesOverflow, 'minutes input should reflect HTML range overflow at >600').toBeTruthy();
    const invalidSaveResponse = await invalidSave;
    expect(invalidSaveResponse, 'invalid save should not call brady_reading_log').toBeFalsy();

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
    const validSave = page.waitForResponse((resp) => {
      const req = resp.request();
      return req.url().includes('brady_reading_log') && req.method() === 'POST';
    });
    await page.click('#saveReading');
    const validSaveResponse = await validSave;
    expect(validSaveResponse.status(), 'valid save should call brady_reading_log endpoint').toBeLessThan(400);
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
    await page.goto(toAbs('brady/reading.html'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/reading.html'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/coach.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1')).toHaveText('AI Coach');
    await expect(page.locator('#planContainer')).toBeVisible();
    await expect(page.locator('#profileContainer')).toBeVisible();

    // Allow the auto-run to call the backend and update UI (or show alert).
    await page.waitForTimeout(1200);
    expect(page.url().includes('login.html'), 'Coach should not redirect to login with a valid session').toBeFalsy();
    await assertNoRuntimeErrors(page, runtime);
  });
});

test.describe('Admin portal', () => {
  test('Admin portal loads learner management UI and context controls', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/admin.html');
    await page.goto(toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#downloadExportBtn')).toBeVisible();
    await expect(page.locator('#exportStart')).toBeVisible();
    await expect(page.locator('#exportEnd')).toBeVisible();

    // Use the default date range prefilled by the UI (today + last 7 days).
    const exportResp = page.waitForResponse((resp) => {
      const req = resp.request();
      return req.url().includes('/api/brady/export') && req.method() === 'POST';
    }, { timeout: 25_000 });

    await page.click('#downloadExportBtn');
    const resp = await exportResp;
    expect(resp.status(), 'export endpoint should respond successfully').toBeLessThan(400);

    const out = await resp.json().catch(() => null);
    expect(Boolean(out && out.export_version), 'export should return JSON payload').toBeTruthy();
    expect(out.data && typeof out.data === 'object', 'export should include data object').toBeTruthy();

    await assertNoRuntimeErrors(page, runtime);
  });

  test('Admin can create then delete a pending learner link when mutate mode is enabled', async ({ page }) => {
    test.skip(!SHOULD_MUTATE_ADMIN, 'Set BRADY_E2E_MUTATE=1 to run write tests.');
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/admin.html');
    await page.goto(toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

    const token = Date.now();
    const email = `e2e-${token}@example.invalid`;
    const name = `E2E Learner ${token}`;

    await page.fill('#learnerEmail', email);
    await page.fill('#learnerName', name);
    await page.selectOption('#learnerRole', 'student');

    const addResponse = page.waitForResponse((resp) =>
      resp.url().includes('brady_sub_accounts') &&
      resp.request().method() === 'POST' &&
      resp.status() < 400
    );
    await page.click('form#addSubAccountForm button[type="submit"]');
    await addResponse;

    await expect(page.locator('#subAccountSummary')).toContainText('record', { timeout: 20_000 });
    const row = page.locator('#subAccountList table tbody tr').filter({ hasText: email }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    const deleteBtn = row.locator('button[data-delete-learner]');
    if (await deleteBtn.isVisible()) {
      const deleteResp = page.waitForResponse((resp) =>
        resp.url().includes('brady_sub_accounts') &&
        resp.request().method() === 'DELETE' &&
        resp.status() < 400
      );
      await deleteBtn.click();
      await deleteResp;
      await expect(row).toBeHidden({ timeout: 20_000 });
    }

    await assertNoRuntimeErrors(page, runtime);
  });

  test('Admin can switch learner context back to self', async ({ page }) => {
    const runtime = await installRuntimeGuards(page);
    await signInAdmin(page);
    await assertRouteExistsOrSkip(page, 'brady/admin.html');
    await page.goto(toAbs('brady/admin.html'), { waitUntil: 'domcontentloaded' });

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
    await page.goto(toAbs('brady/index.html'), { waitUntil: 'domcontentloaded' });

    const logoutButton = page.locator('.user-nav-logout');
    await expect(logoutButton).toBeVisible({ timeout: 10_000 });
    await logoutButton.click();
    await page.waitForURL(/login\.html/, { timeout: 10_000 });

    await page.goto(toAbs('brady/assignments.html'), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#email')).toBeVisible();
    await assertNoRuntimeErrors(page, runtime);
  });
});
