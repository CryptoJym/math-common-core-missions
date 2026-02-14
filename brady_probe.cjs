const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const email = process.env.BRADY_ADMIN_EMAIL || '';
  const password = process.env.BRADY_ADMIN_PASSWORD || '';
  const base = process.env.BRADY_BASE_URL || 'https://math-common-core-missions.vercel.app';

  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/rest/v1/brady_reading_log') || u.includes('/rest/v1/brady_sub_accounts')) {
      console.log('REQ', req.method(), u);
    }
  });
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/rest/v1/brady_reading_log') || u.includes('/rest/v1/brady_sub_accounts')) {
      console.log('RES', res.status(), res.request().method(), u);
    }
  });

  await page.goto(`${base}/login.html?next=brady/index.html`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#submitBtn');
  await page.waitForURL((u) => !u.href.includes('login.html'), { timeout: 60000 });

  await page.goto(`${base}/brady/reading.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#saveReading');
  await page.fill('#day', '2026-02-13');
  await page.selectOption('#book', 'anthem');
  await page.fill('#minutes', '24');
  await page.fill('#journal', 'probe entry');
  await page.click('#saveReading');
  await page.waitForTimeout(3000);

  await page.goto(`${base}/brady/admin.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#addSubAccountForm');
  const token = Date.now();
  const email2 = `probe-${token}@example.invalid`;
  await page.fill('#learnerEmail', email2);
  await page.fill('#learnerName', `Probe ${token}`);
  await page.selectOption('#learnerRole', 'student');
  await page.click('form#addSubAccountForm button[type="submit"]');
  await page.waitForTimeout(4000);

  await context.close();
  await browser.close();
})();
