@echo off
title SIH26002 - NER Logistics Intelligence - Start
echo ==================================================
echo   SIH26002 - NER Logistics Intelligence Platform
echo ==================================================
echo.

REM ---- Check Node is installed ----
node -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed on this laptop.
  echo.
  echo   1. Go to https://nodejs.org
  echo   2. Download the LTS version ^(22.5 or newer^)
  echo   3. Install it, then double-click this file again
  echo.
  pause
  exit /b 1
)

REM ---- Check Node is new enough (needs 22.5+ for the built-in SQLite) ----
for /f "tokens=1 delims=." %%a in ('node -v') do set NODEMAJOR=%%a
set NODEMAJOR=%NODEMAJOR:v=%
if %NODEMAJOR% LSS 22 (
  echo [ERROR] Your Node.js is version %NODEMAJOR% - too old.
  echo This app needs Node.js 22.5 or newer ^(it uses Node's built-in SQLite^).
  echo.
  echo   Install the latest LTS from https://nodejs.org then run this file again.
  echo.
  pause
  exit /b 1
)
for /f %%v in ('node -v') do echo Node.js %%v - OK
echo.

REM ---- Backend packages: already bundled, so this normally skips (works offline) ----
if exist "%~dp0backend\node_modules\express" (
  echo [1/3] Backend packages already present - skipping install.
) else (
  echo [1/3] Installing backend packages ^(needs internet, ~1 min^)...
  cd /d "%~dp0backend"
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
)

REM ---- Database: shipped pre-seeded with real road data, so this normally skips ----
if exist "%~dp0backend\data\sih.db" (
  echo [2/3] Demo database already present - skipping seed.
  echo       ^(To start from fresh demo data, run RESET-DEMO-DATA.bat^)
) else (
  echo [2/3] Creating and seeding the demo database...
  cd /d "%~dp0backend"
  call npm run migrate
  if errorlevel 1 goto fail
  call npm run seed
  if errorlevel 1 goto fail
)

REM ---- Frontend packages ----
if exist "%~dp0frontend\node_modules\vite" (
  echo [3/3] Frontend packages already present - skipping install.
) else (
  echo [3/3] Installing frontend packages ^(needs internet, ~1 min^)...
  cd /d "%~dp0frontend"
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
)

echo.
echo Starting both servers...
start "SIH BACKEND - keep this open"  cmd /k "cd /d %~dp0backend && npm run dev"
start "SIH FRONTEND - keep this open" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ==================================================
echo   Two new windows opened - KEEP THEM OPEN.
echo.
echo   Opening the app in your browser in 12 seconds:
echo       http://localhost:5173
echo.
echo   Login: manager@sih.gov.in   Password: Demo@1234
echo ==================================================
REM 'ping' used as a sleep - 'timeout' fails when there is no interactive console
ping -n 13 127.0.0.1 >nul
start http://localhost:5173
exit /b 0

:fail
echo.
echo ==================================================
echo  [ERROR] A step above failed.
echo  Scroll up, read the error text, and send it to Claude.
echo ==================================================
pause
exit /b 1
