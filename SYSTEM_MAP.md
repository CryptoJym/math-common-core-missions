# Level Up System Map (Plain Language)

## Where this code lives
- Main repo on this machine: `/Users/jamesbrady/Projects/math-common-core-missions`
- Git branch right now: `main`

## What each main folder does
- `static_auth/`
  - This is the human-edited source for the authenticated app pages.
  - You edit Level Up UI here first.
  - Includes:
    - `static_auth/index.html` (public landing page)
    - `static_auth/login.html`, `static_auth/signup.html`
    - `static_auth/brady/*.html` (HQ, Assignments, Daily, Reading, Avatar, Coach, Admin)
    - `static_auth/js/*.js` (page behavior, auth, nav, progress, sync status)
- `dist/`
  - This is the generated site output that gets deployed.
  - Vercel serves this folder directly.
  - Important: this folder is committed in git. If it drifts from source, CI fails.
- `api/brady/*.js`
  - Server endpoints (coach responses, export, quiz generation, artifact review).
  - These run on the hosting platform as backend handlers.
- `supabase/migrations/`
  - Database change history (tables for assignments, drafts, artifacts, reviews, learner linking).
- `js_tests/`
  - Node tests for UI files and backend route behavior.
- `tests/test_build_output.py`
  - Python tests that verify generated `dist` output.
- `scripts/autopilot_check.sh`
  - One command that rebuilds, tests, and verifies no output drift.
- `.github/workflows/levelup-autopilot.yml`
  - CI guardrail on push/PR for the same checks.

## How the app works (simple)
1. A browser loads static pages from `dist/`.
2. Frontend JS in `dist/js/` handles:
   - sign-in/session checks,
   - page navigation,
   - progress save/load,
   - sync state chip (`Saved`, `Syncing`, `Needs internet`).
3. Data is stored in Supabase.
4. AI/coach and export actions call server endpoints in `api/brady/`.

## Rebuild + verify workflow
Run from repo root:

```bash
bash scripts/autopilot_check.sh
```

What it does:
1. Rebuilds `dist` from source (`build_solo_leveling_site.py`).
2. Runs all JS tests (`node --test js_tests/*.test.js`).
3. Runs build-output Python tests (`pytest tests/test_build_output.py`).
4. Fails if `dist` changed but was not committed.

## Why this reduces maintainer load
- Broken build/test state is caught automatically in CI.
- `dist` drift is blocked before merge.
- Branding and sync-state expectations are covered by tests:
  - `js_tests/levelup_branding_surface.test.js`
  - `js_tests/levelup_sync_status_integration.test.js`
  - `js_tests/levelup_autopilot_ci.test.js`

## Deployment reality
- `vercel.json` points Vercel to `dist` as the output directory.
- Because `buildCommand` is `null`, the deployment uses committed files directly.
- Implication: every UI source change must be rebuilt so `dist` is updated and committed.

## Password reset email note
- Password reset delivery is handled by Supabase Auth email settings, not by the static page itself.
- If reset links are not arriving, check:
  1. Supabase Auth email provider configuration (SMTP),
  2. sender domain verification,
  3. spam/junk folder and provider suppressions.
