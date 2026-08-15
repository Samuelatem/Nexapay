#!/usr/bin/env bash
# NexaPay QA - generate the screenshot evidence pack.
# Usage: ./run-evidence.sh
set -e
cd "$(dirname "$0")"

echo
echo " NexaPay QA - evidence run"
echo " ========================="
echo

command -v node >/dev/null 2>&1 || {
  echo " [X] Node.js is not installed. Get the LTS build from https://nodejs.org"
  exit 1
}

if [ ! -f .env ]; then
  cp .env.example .env
  echo " Created .env. Fill in the three passwords from Annexe A, then run this again."
  exit 0
fi

echo " [1/5] Installing dependencies..."
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund || npm install --no-audit --no-fund; else npm install --no-audit --no-fund; fi
echo " [2/5] Type check...";              npm run typecheck
echo " [3/5] API suite...";               npm run test:api || true
echo " [4/5] Browser (one time)...";      npx playwright install chromium
echo " [5/5] Screenshots...";             npm run evidence

echo
echo " Done."
echo "   Screenshots : evidence/screenshots/"
echo "   HTML report : evidence/html-report/index.html"
npm run report
