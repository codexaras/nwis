#!/usr/bin/env bash
# eRTMAC-NWIS — one-command local run: installs deps, seeds the DB (first run), starts backend :8000 + frontend :3000
#   ./run.sh            start everything
#   ./run.sh --reseed   force regeneration of nwis.db + sample_docs before starting
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ---- pick a Python (3.11+) -----------------------------------------------------------------
PY=""
for cand in python3.11 python3.12 python3.13 python3 python; do
  if command -v "$cand" >/dev/null 2>&1; then
    if "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then PY="$cand"; break; fi
  fi
done
[ -n "$PY" ] || { echo "Python 3.11+ is required"; exit 1; }

# ---- backend ---------------------------------------------------------------------------------
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  echo "[nwis] creating virtualenv with $PY"
  "$PY" -m venv .venv
fi
if [ -x .venv/Scripts/python.exe ]; then VPY=".venv/Scripts/python.exe"; else VPY=".venv/bin/python"; fi
"$VPY" -m pip install -q --upgrade pip
"$VPY" -m pip install -q -r requirements.txt
if [ ! -f nwis.db ] || [ "${1:-}" = "--reseed" ]; then
  echo "[nwis] seeding synthetic dataset + sample documents"
  "$VPY" seed.py
fi
echo "[nwis] starting backend on http://localhost:8000"
"$VPY" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACK_PID=$!

# ---- frontend --------------------------------------------------------------------------------
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "[nwis] installing frontend dependencies"
  npm install --no-audit --no-fund
fi
echo "[nwis] starting frontend on http://localhost:3000"
trap 'echo; echo "[nwis] shutting down"; kill $BACK_PID 2>/dev/null || true' EXIT INT TERM
npm run dev -- --port 3000
