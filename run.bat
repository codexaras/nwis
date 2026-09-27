@echo off
REM eRTMAC-NWIS — one-command local run (Windows): installs deps, seeds the DB (first run), starts backend :8000 + frontend :3000
REM   run.bat            start everything
REM   run.bat --reseed   force regeneration of nwis.db + sample_docs before starting
setlocal
set ROOT=%~dp0
cd /d "%ROOT%backend"

REM ---- pick a Python launcher (3.11+) --------------------------------------------------------
set PY=
py -3.11 -c "import sys" >nul 2>&1 && set PY=py -3.11
if not defined PY py -3.12 -c "import sys" >nul 2>&1 && set PY=py -3.12
if not defined PY py -3.13 -c "import sys" >nul 2>&1 && set PY=py -3.13
if not defined PY python -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>&1 && set PY=python
if not defined PY (
  echo Python 3.11+ is required. Install from https://www.python.org/downloads/
  exit /b 1
)

if not exist .venv (
  echo [nwis] creating virtualenv
  %PY% -m venv .venv
)
set VPY=%ROOT%backend\.venv\Scripts\python.exe
"%VPY%" -m pip install -q --upgrade pip
"%VPY%" -m pip install -q -r requirements.txt
if not exist nwis.db (
  echo [nwis] seeding synthetic dataset + sample documents
  "%VPY%" seed.py
) else if "%~1"=="--reseed" (
  echo [nwis] re-seeding synthetic dataset + sample documents
  "%VPY%" seed.py
)

echo [nwis] starting backend on http://localhost:8000
start "NWIS backend :8000" cmd /k ""%VPY%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

cd /d "%ROOT%frontend"
if not exist node_modules (
  echo [nwis] installing frontend dependencies
  call npm install --no-audit --no-fund
)
echo [nwis] starting frontend on http://localhost:3000
start "NWIS frontend :3000" cmd /k "npm run dev -- --port 3000"

echo.
echo eRTMAC-NWIS is starting: backend http://localhost:8000/docs   frontend http://localhost:3000
echo Close the two console windows to stop.
endlocal
