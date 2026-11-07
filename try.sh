#!/bin/bash
# Builds the extension and opens it in Playwright's Chrome for Testing, for
# trying changes by hand. Uses its own profile in .chrome-profile/, so it
# doesn't touch your regular Chrome, and shortcuts you bind there are kept.
#
# While it's running, `./try.sh <url>` opens <url> in it the same way a link
# clicked in another app (like Slack) reaches Chrome.

set -euo pipefail
cd "$(dirname "$0")"
[[ -d node_modules ]] || npm ci
CHROME=$(node -e "import('@playwright/test').then(({ chromium }) => console.log(chromium.executablePath()))")
if [[ ! -x "$CHROME" ]]; then
  npx playwright install chromium
fi
if pgrep -f -- "--user-data-dir=$PWD/.chrome-profile" >/dev/null; then
  if [[ $# -gt 0 ]]; then
    # Launching again with the same profile hands the URLs to the running
    # browser, which is how other apps' links reach Chrome too.
    exec "$CHROME" --user-data-dir="$PWD/.chrome-profile" "$@"
  fi
  echo "Chrome for Testing is already running with this profile. Quit it (⌘Q) and run ./try.sh again." >&2
  echo "To open a link in it as if from another app: ./try.sh https://github.com" >&2
  exit 1
fi
npm run build
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
