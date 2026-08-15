@echo off
REM ===================================================================
REM  NexaPay QA - generate the screenshot evidence pack
REM  Double-click this file. Takes about 3 minutes the first time.
REM ===================================================================
setlocal

cd /d "%~dp0"

echo.
echo  NexaPay QA - evidence run
echo  =========================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js is not installed.
  echo      Get it from https://nodejs.org  ^(LTS version^), then run this again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo  [1/5] Creating .env from the template...
  copy /y ".env.example" ".env" >nul
  echo.
  echo  ^>^> Open .env and fill in the three passwords from Annexe A of the brief,
  echo     then run this file again.
  echo.
  notepad .env
  pause
  exit /b 0
)

echo  [1/5] Installing dependencies...
if exist "package-lock.json" (
  call npm ci --no-audit --no-fund
) else (
  call npm install --no-audit --no-fund
)
if errorlevel 1 (
  echo.
  echo  npm ci failed, retrying with npm install...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
)

echo.
echo  [2/5] Type check...
call npm run typecheck
if errorlevel 1 goto :fail

echo.
echo  [3/5] Running the API suite...
call npm run test:api

echo.
echo  [4/5] Installing the browser ^(one time, ~150 MB^)...
call npx playwright install chromium
if errorlevel 1 goto :fail

echo.
echo  [5/5] Capturing screenshots...
call npm run evidence

echo.
echo  =========================================================
echo   Done.
echo.
echo   Screenshots : evidence\screenshots\
echo   HTML report : evidence\html-report\index.html
echo.
echo   Opening both now...
echo  =========================================================
echo.

start "" "evidence\screenshots"
call npm run report

pause
exit /b 0

:fail
echo.
echo  Something failed above. Check the message, fix it, run again.
echo.
pause
exit /b 1
