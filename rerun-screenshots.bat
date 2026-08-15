@echo off
REM Re-run just the screenshot capture. Assumes run-evidence.bat already
REM installed everything once.
setlocal
cd /d "%~dp0"
echo.
echo  Capturing screenshots...
echo.
call npm run evidence
echo.
echo  Screenshots are in evidence\screenshots\
start "" "evidence\screenshots"
pause
