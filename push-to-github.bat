@echo off
REM ===================================================================
REM  Push this project to https://github.com/Samuelatem/Nexaplay.git
REM ===================================================================
setlocal
cd /d "%~dp0"

echo.
echo  Pushing to GitHub
echo  =================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo  [X] Git is not installed.
  echo      Get it from https://git-scm.com/download/win then run this again.
  echo.
  pause
  exit /b 1
)

REM --- safety check: never push the AI placeholder -------------------
findstr /c:"TO BE COMPLETED" docs\07-ai-usage.md >nul 2>nul
if not errorlevel 1 (
  echo  [X] STOP. docs\07-ai-usage.md still contains the placeholder box.
  echo      The recruiter would see "TO BE COMPLETED BY THE CANDIDATE".
  echo      Write that section first, then run this again.
  echo.
  pause
  exit /b 1
)

REM --- remove personal notes before publishing -----------------------
if exist "HOW-TO-RUN.md" (
  echo  Removing HOW-TO-RUN.md ^(your notes, not for the recruiter^)...
  del /q "HOW-TO-RUN.md"
)
if exist "GITHUB.md" del /q "GITHUB.md"

if not exist ".git" (
  echo  Initialising repository...
  git init
  git branch -M main
)

git remote remove origin >nul 2>nul
git remote add origin https://github.com/Samuelatem/Nexaplay.git

echo.
echo  Staging files...
git add .

echo.
echo  ================= WILL BE COMMITTED =================
git status --short
echo  =====================================================
echo.

REM --- final safety: .env must never be staged -----------------------
git diff --cached --name-only | findstr /x ".env" >nul 2>nul
if not errorlevel 1 (
  echo  [X] STOP. .env is staged. It contains passwords.
  git reset .env
  echo      Removed it from staging. Check .gitignore, then run again.
  pause
  exit /b 1
)

echo  If the list above looks wrong, close this window now.
echo  If it looks right, press a key to commit and push.
pause >nul

git commit -m "NexaPay QA assessment: strategy, test design, automation and findings"
git push -u origin main

if errorlevel 1 (
  echo.
  echo  Push failed. Most likely one of:
  echo    - the repo already has commits. Try:  git pull --rebase origin main
  echo      then run this again.
  echo    - GitHub asked for a password. It wants a Personal Access Token,
  echo      not your account password. Make one at:
  echo      https://github.com/settings/tokens  ^(classic, scope: repo^)
  echo      Use your username, and paste the token where it asks for a password.
  echo.
  pause
  exit /b 1
)

echo.
echo  Done. Check https://github.com/Samuelatem/Nexaplay
echo.
pause
