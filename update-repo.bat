@echo off
REM Tidy the repo and push the update.
setlocal
cd /d "%~dp0"

echo.
echo  Tidying and pushing...
echo.

REM push-to-github.bat is personal tooling, it should not be in a submission
if exist "push-to-github.bat" git rm --cached "push-to-github.bat" >nul 2>nul
if exist "rerun-screenshots.bat" git rm --cached "rerun-screenshots.bat" >nul 2>nul
if exist "update-repo.bat" git rm --cached "update-repo.bat" >nul 2>nul

echo push-to-github.bat>> .gitignore
echo rerun-screenshots.bat>> .gitignore
echo update-repo.bat>> .gitignore

git add .
git status --short
echo.
git commit -m "Remove personal tooling from the submission; add screenshot evidence"
git push

if errorlevel 1 (
  echo.
  echo  Push failed. If it mentions the token again, same fix as before.
  pause
  exit /b 1
)

echo.
echo  Done. Refresh https://github.com/Samuelatem/Nexaplay
echo.
pause
