#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

VENV_DIR="${ROOT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [ -x "${VENV_DIR}/bin/python" ]; then
  PYTHON_BIN="${VENV_DIR}/bin/python"
fi

python_ready() {
  "${PYTHON_BIN}" - <<'PY' >/dev/null 2>&1
import importlib.util
import sys

required = ("markdown", "pytest")
missing = [name for name in required if importlib.util.find_spec(name) is None]
sys.exit(1 if missing else 0)
PY
}

ensure_python_ready() {
  if python_ready; then
    return
  fi

  echo "[autopilot] preparing local Python environment"
  if [ ! -x "${VENV_DIR}/bin/python" ]; then
    python3 -m venv "${VENV_DIR}"
  fi

  "${VENV_DIR}/bin/python" -m pip install -r requirements.txt
  PYTHON_BIN="${VENV_DIR}/bin/python"
}

ensure_python_ready

echo "[autopilot] rebuilding site assets"
"${PYTHON_BIN}" build_solo_leveling_site.py

echo "[autopilot] running js tests"
node --test js_tests/*.test.js

echo "[autopilot] running build-output tests"
"${PYTHON_BIN}" -m pytest tests/test_build_output.py

echo "[autopilot] verifying committed dist is in sync"
git diff --exit-code -- dist

echo "[autopilot] all checks passed"
