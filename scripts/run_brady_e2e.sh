#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=""
EXTRA_ARGS=()
if [ "${1:-}" != "" ] && [ -f "$1" ]; then
  ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
  EXTRA_ARGS+=("$1")
elif [ "${1:-}" != "" ]; then
  ROOT_DIR="$1"
else
  ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
fi
BASE_URL="${BRADY_BASE_URL:-https://math-common-core-missions.vercel.app}"
CONFIG_PATH="${ROOT_DIR}/tests/e2e/playwright.config.js"
SCOPE="${BRADY_E2E_SCOPE:-full}"

if [ "${SCOPE}" = "smoke" ] || [ "${SCOPE}" = "regression" ]; then
  EXTRA_ARGS+=(--grep "@smoke")
  echo "[playwright] running smoke/regression mode (tagged tests only)"
fi

if [ -n "${BRADY_E2E_FILE:-}" ]; then
  EXTRA_ARGS+=("${BRADY_E2E_FILE}")
fi

if [ ! -d "${ROOT_DIR}/node_modules/@playwright/test" ]; then
  echo "[playwright] installing playwright test runner (if needed)"
  npm install --prefix "${ROOT_DIR}" --no-save --no-package-lock @playwright/test@1.50.0 >/dev/null
fi

echo "[playwright] ensuring chromium is available"
if [ -x "${ROOT_DIR}/node_modules/.bin/playwright" ]; then
  "${ROOT_DIR}/node_modules/.bin/playwright" install chromium
else
  npx --yes @playwright/test@1.50.0 install chromium
fi

echo "[playwright] running brady e2e suite against ${BASE_URL}"
BRADY_BASE_URL="${BASE_URL}" \
  "${ROOT_DIR}/node_modules/.bin/playwright" \
  test --config="${CONFIG_PATH}" "${EXTRA_ARGS[@]}"
