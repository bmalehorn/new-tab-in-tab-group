# New Tab in Tab Group

A simple Chrome extension for opening tabs in the same tab group as the current tab.

## Loading from source

Run `npm install && npm run build`. This compiles `src/background.ts` and puts the full extension in `dist/`.

Go to `chrome://extensions`.

Click "Load unpacked".

Navigate to the `new-tab-in-tab-group/dist` folder and click "Ok".

After changing the source, run `npm run build` again and click the reload icon on the extension.

You're done! Press `⌘ Shift Y` to open tabs in the same tab group.

## Mapping to ⌘T

Go to `chrome://extensions/shortcuts`.

Under the "New Tab in Group" extension, in the "Open New Tab in Tab Group" shortcut, click the ✎ icon.

Press `⌘T`. You're done!

## Automated deploys

Bump `"version"` in `manifest.json`, then run `./deploy.sh`. It packages the zip, uploads it with the [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api), and submits it for review. `./deploy.sh --status` prints the store's current state.

One-time setup, which puts credentials in the untracked `.deploy.env`:

1. Go to https://console.cloud.google.com/projectcreate and create a project (e.g. `chrome-webstore-deploy`).
2. Go to https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com and click Enable.
3. Go to https://console.cloud.google.com/auth/overview, configure the consent screen as External, and add your Google account under Audience > Test users.
4. Go to https://console.cloud.google.com/auth/clients and create an OAuth client of type "Web application", with authorized redirect URI `https://developers.google.com/oauthplayground`. Copy the client ID and secret.
5. Go to https://developers.google.com/oauthplayground. Click the gear icon, check "Use your own OAuth credentials", and paste the client ID and secret.
6. In "Input your own scopes", enter `https://www.googleapis.com/auth/chromewebstore` and click Authorize APIs. Sign in as the account that owns the extension. Click "Exchange authorization code for tokens" and copy the refresh token.
7. Go to https://chrome.google.com/webstore/devconsole. Your publisher ID is under Account / Publisher settings.
8. Create `.deploy.env`:

   ```bash
   CWS_CLIENT_ID=...
   CWS_CLIENT_SECRET=...
   CWS_REFRESH_TOKEN=...
   CWS_PUBLISHER_ID=...
   CWS_EXTENSION_ID=nnbnphmhdbcgnekonlgniafbpcpapkep
   ```

> If the consent screen stays in "Testing" mode, the refresh token expires after 7 days. Click "Publish app" on the consent screen page to avoid that (no verification needed for personal use).

## Releasing manually

Run `./package.sh`.
Go to https://chrome.google.com/webstore/devconsole.
Find the extension in that list.
Click on "Package" on the left.
Upload the `new-tab-in-tab-group.zip` file.
Click "Store listing".
Click "Submit for review".

## Packaging

I think this only has to be run once to create an extension.

Go to `chrome://extensions/`.
Click "pack extension".
Run `npm run build`, then locate the `new-tab-in-tab-group/dist` folder. It will create a .crx file and a .pem file.

Then, go to https://chrome.google.com/webstore/devconsole and upload the `new-tab-in-tab-group.crx` file just created.
