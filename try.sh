#!/bin/bash
# Builds the extension and opens it in Playwright's Chrome for Testing, for
# trying changes by hand. Uses its own profile in .chrome-profile/, so it
# doesn't touch your regular Chrome, and shortcuts you bind there are kept.

set -euo pipefail
cd "$(dirname "$0")"
[[ -d node_modules ]] || npm ci
npm run build
CHROME=$(node -e "import('@playwright/test').then(({ chromium }) => console.log(chromium.executablePath()))")
if [[ ! -x "$CHROME" ]]; then
  npx playwright install chromium
fi
if pgrep -f -- "--user-data-dir=$PWD/.chrome-profile" >/dev/null; then
  echo "Chrome for Testing is already running with this profile. Quit it (⌘Q) and run ./try.sh again." >&2
  exit 1
fi
# Chrome caches an unpacked extension's service worker and reuses it on the
# next launch as long as the manifest version is unchanged, so without this
# you'd keep running the old background.js.
rm -rf ".chrome-profile/Default/Service Worker"
exec "$CHROME" \
  --user-data-dir="$PWD/.chrome-profile" \
  --disable-extensions-except="$PWD/dist" \
  --load-extension="$PWD/dist" \
  --no-first-run \
  --no-default-browser-check \
  chrome://extensions/shortcuts
