#!/bin/bash

set -xeuo pipefail
# cd to directory of script
cd "$(dirname "$0")"
cd ../
zip -r new-tab-in-tab-group.zip new-tab-in-tab-group/{background.js,manifest.json}
