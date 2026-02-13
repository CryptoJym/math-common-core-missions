# Brady E2E Playwright Pass

Playwright now covers:

- Access guarding (`/brady/*` redirect behavior with safe `next` handling)
- Login UI validation and auth UX
- Authenticated Brady dashboard and assignment navigation
- Assignment runner guard behavior (including full submission validation)
- Daily training sections, drafts, and upload validation
- Reading & journal validation, table persistence, AI prompt toggle
- Admin portal management UI and optional mutate coverage

This folder is intentionally defensive: it checks runtime health (`console` and
`requestfailed`), duplicate IDs, and edge-case UX flows so regressions are
caught early.

`@smoke`-tagged regression tests are available in `tests/e2e/brady-regression.spec.js` for a fast pass:

- Public route smoke
- Brady route guard safety
- Avatar dashboard render checks
- Assignment write-path proof (quiz submit triggers attempt persistence request)

Run only the smoke set with:

```bash
BRADY_E2E_SCOPE=smoke BRADY_BASE_URL=https://math-common-core-missions.vercel.app \
BRADY_ADMIN_EMAIL=you@example.com \
BRADY_ADMIN_PASSWORD=secure-password \
./scripts/run_brady_e2e.sh
```

or by running the file directly:

```bash
./node_modules/.bin/playwright test --config=tests/e2e/playwright.config.js tests/e2e/brady-regression.spec.js
```

Run the full suite with:

```bash
BRADY_E2E_SCOPE=full ./scripts/run_brady_e2e.sh
```

## Install & Run

Use the provided helper. It will install Playwright locally (to this repo only)
if it is missing.

```bash
cd /Users/jamesbrady/Projects/math-common-core-missions
./scripts/run_brady_e2e.sh
```

Override base URL and credentials as needed:

```bash
BRADY_BASE_URL=https://math-common-core-missions.vercel.app \
BRADY_ADMIN_EMAIL=you@example.com \
BRADY_ADMIN_PASSWORD=secure-password \
./scripts/run_brady_e2e.sh
```

## Optional mutating admin check

By default, write tests are off.

```bash
BRADY_E2E_MUTATE=1 \
BRADY_ADMIN_EMAIL=you@example.com \
BRADY_ADMIN_PASSWORD=secure-password \
./scripts/run_brady_e2e.sh
```

## Local static testing

If you run the site locally from `dist`:

```bash
cd /Users/jamesbrady/Projects/math-common-core-missions
python3 -m http.server 4173 -d dist

BRADY_BASE_URL=http://127.0.0.1:4173 \
BRADY_ADMIN_EMAIL=you@example.com \
BRADY_ADMIN_PASSWORD=secure-password \
./scripts/run_brady_e2e.sh
```

## Notes

- Test runner config: `tests/e2e/playwright.config.js`
- Run target test file directly if needed:

```bash
./node_modules/.bin/playwright test --config=tests/e2e/playwright.config.js tests/e2e/brady-platform.spec.js
```
