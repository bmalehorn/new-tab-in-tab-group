#!/bin/bash
# Package the extension, upload it to the Chrome Web Store, and submit it for review.
# Credentials live in .deploy.env (untracked). See "Automated deploys" in README.md.

set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .deploy.env ]]; then
  echo "Missing .deploy.env. See 'Automated deploys' in README.md." >&2
  exit 1
fi
source .deploy.env
: "${CWS_CLIENT_ID:?}" "${CWS_CLIENT_SECRET:?}" "${CWS_REFRESH_TOKEN:?}" "${CWS_PUBLISHER_ID:?}" "${CWS_EXTENSION_ID:?}"

ITEM="publishers/$CWS_PUBLISHER_ID/items/$CWS_EXTENSION_ID"
API="https://chromewebstore.googleapis.com/v2/$ITEM"
UPLOAD_API="https://chromewebstore.googleapis.com/upload/v2/$ITEM"

TOKEN=$(curl -sSf https://oauth2.googleapis.com/token \
  -d client_id="$CWS_CLIENT_ID" \
  -d client_secret="$CWS_CLIENT_SECRET" \
  -d refresh_token="$CWS_REFRESH_TOKEN" \
  -d grant_type=refresh_token | jq -r .access_token)

api() {
  local method=$1 url=$2
  shift 2
  curl -sS -X "$method" -H "Authorization: Bearer $TOKEN" "$@" "$url"
}

LOCAL_VERSION=$(jq -r .version manifest.json)
STATUS=$(api GET "$API:fetchStatus")
PUBLISHED_VERSION=$(echo "$STATUS" | jq -r '.publishedItemRevisionStatus.distributionChannels[0].crxVersion // "none"')
SUBMITTED_VERSION=$(echo "$STATUS" | jq -r '.submittedItemRevisionStatus.distributionChannels[0].crxVersion // "none"')
echo "Local: $LOCAL_VERSION, published: $PUBLISHED_VERSION, submitted: $SUBMITTED_VERSION"

if [[ "${1:-}" == "--status" ]]; then
  echo "$STATUS" | jq .
  exit 0
fi

# The store rejects uploads while a submission is in review, so this withdraws it.
if [[ "${1:-}" == "--cancel" ]]; then
  api POST "$API:cancelSubmission" | jq .
  exit 0
fi

if [[ "$LOCAL_VERSION" == "$PUBLISHED_VERSION" || "$LOCAL_VERSION" == "$SUBMITTED_VERSION" ]]; then
  echo "Version $LOCAL_VERSION is already in the store. Bump \"version\" in manifest.json first." >&2
  exit 1
fi

npm test
./package.sh

echo "Uploading..."
RESULT=$(api POST "$UPLOAD_API:upload" -T new-tab-in-tab-group.zip)
echo "$RESULT" | jq .
STATE=$(echo "$RESULT" | jq -r .uploadState)
while [[ "$STATE" == "IN_PROGRESS" || "$STATE" == "UPLOAD_IN_PROGRESS" ]]; do
  sleep 5
  STATE=$(api GET "$API:fetchStatus" | jq -r .lastAsyncUploadState)
  echo "Upload state: $STATE"
done
if [[ "$STATE" != "SUCCEEDED" ]]; then
  echo "Upload failed: $STATE" >&2
  exit 1
fi

# The dashboard only asks for justifications of permissions in an uploaded
# draft, so a release that adds permissions is uploaded first, then published.
if [[ "${1:-}" == "--upload-only" ]]; then
  echo "Uploaded $LOCAL_VERSION as a draft. Fill in anything the dashboard asks for, then run ./deploy.sh to publish."
  exit 0
fi

echo "Publishing..."
RESULT=$(api POST "$API:publish" -H "Content-Type: application/json" -d '{}')
echo "$RESULT" | jq .
if echo "$RESULT" | jq -e .error >/dev/null; then
  exit 1
fi
echo "Submitted $LOCAL_VERSION for review."
