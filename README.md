# New Tab in Tab Group

A Chrome extension with shortcuts for creating tabs, reordering tabs and tab groups, and closing old tabs.

## Loading from source

Run `npm install && npm run build`. This compiles `src/background.ts` and puts the full extension in `dist/`.

Go to `chrome://extensions`.

Click "Load unpacked".

Navigate to the `new-tab-in-tab-group/dist` folder and click "Ok".

After changing the source, run `npm run build` again and click the reload icon on the extension.

You're done! Press `⌘ Shift Y` to open tabs in the same tab group.

## Testing

Run `npm test`. The first time, also run `npx playwright install chromium`.

1. `npm run test:unit` runs the `src/**/*.test.ts` unit tests with Node's built-in test runner.
2. `npm run test:browser` builds `dist/`, loads it as an extension in Playwright's Chromium, and runs each command against real tabs and tab groups. See `tests/extension.spec.ts`. Keyboard shortcuts can't be pressed from automation, so the tests call the command handler from the extension's service worker. Add `--headed` to watch.

`./deploy.sh` runs the tests before uploading.

## The `---` separator

Create a tab group titled `---` (collapse it so it takes little space). Tabs to its left are ones you keep. Tabs to its right are temporary:

- "Open new tab after the --- tab group" opens a tab right after `---`. With no `---` group, it opens leftmost.
- "Move selected tabs to the other side of the --- tab group" moves the selected tabs to just left of `---`, or to just right of it if the current tab is already on the left. With no `---` group, it moves them leftmost.
- Tabs to the right of `---` close automatically once they haven't been visited for 7 days. Pinned and active tabs never close. With no `---` group, nothing closes.

## Shortcuts

| Shortcut      | Command                                                    | Set automatically? |
| ------------- | ---------------------------------------------------------- | ------------------ |
| `⌘ Shift Y`   | Open New Tab in Group                                      | Yes                |
| `⌘ Shift ↑`   | Swap tab to the left                                       | Yes                |
| `⌘ Shift ↓`   | Swap tab to the right                                      | Yes                |
| `⌘T`          | Open new tab after the --- tab group                       | No                 |
| `⌘D`          | Move selected tabs to the other side of the --- tab group  | No                 |

Chrome only applies default shortcuts on a fresh install, and never for keys Chrome itself uses like `⌘T` and `⌘D`. To bind any shortcut by hand:

1. Go to `chrome://extensions/shortcuts`.
2. Find the "Tab and Tab Group Shortcuts" extension.
3. Click the ✎ icon next to the command and press the keys, e.g. `⌘T`.

If a key is already bound to another command of this extension, remove it from that command first.

## Automated deploys

Bump `"version"` in `manifest.json`, then run `./deploy.sh`. It packages the zip, uploads it with the [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api), and submits it for review. `./deploy.sh --status` prints the store's current state. The store won't take a new upload while a version is in review; `./deploy.sh --cancel` withdraws that submission.

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
