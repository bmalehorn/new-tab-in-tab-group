#!/bin/bash

set -xeuo pipefail
# cd to directory of script
cd "$(dirname "$0")"
[[ -d node_modules ]] || npm ci
npm run build
rm -f new-tab-in-tab-group.zip
(cd dist && zip -r ../new-tab-in-tab-group.zip .)
