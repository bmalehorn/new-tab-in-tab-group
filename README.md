# New Tab in Tab Group

A Chrome extension with shortcuts for creating tabs, reordering tabs and tab groups, and closing old tabs.

## Loading from source

To try the extension without installing it, run `./try.sh`. It builds the extension and opens it in Chrome for Testing (installed by Playwright) with its own profile, so it works even where your regular Chrome blocks unpacked extensions. Don't sign in to work accounts there. After changing the source, quit it (⌘Q) and run `./try.sh` again. `./try.sh` clears Chrome's cached copy of the background script each launch; without that, Chrome keeps running the old code until the version in `manifest.json` changes. Shortcuts you bind there are kept in `.chrome-profile/`. Links from other apps like Slack open in your regular Chrome, so to test those, run `./try.sh https://github.com` while it's open. That hands the URL to it the same way another app would.

To load it into your regular Chrome instead:

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

## The `---` barrier

Create a tab group titled `---` (collapse it so it takes little space). This is the barrier. Any title made only of dashes works, like `-` or `—`, which helps since macOS turns `--` into `—` as you type. If there are several, the leftmost one counts. It splits the window in two:

```
pinned tabs | regular tabs | --- | sticky tabs
```

Regular tabs are temporary, oldest on the left and newest on the right, the same order Chrome uses. Sticky tabs are ones you keep.

- "Open new regular tab" opens a tab just left of the barrier.
- "Toggle selected tabs between regular and sticky" moves the selected tabs to just right of the barrier, or to just left of it if the current tab is already sticky.
- If there's no barrier, both commands first create one at the far right: a collapsed group titled `———` holding a blank tab. Every existing tab becomes a regular tab, so if auto-close is on they can close after the set number of days.
- Newly opened tabs move to just left of the barrier: links from other apps or windows, the + button, and links opened from pinned tabs or sticky tabs. Links opened from regular tabs stay where Chrome puts them. Off by default, turn it on in Settings.
- Optionally, regular tabs close automatically once they haven't been visited for some number of days. Pinned, active and sticky tabs, and tabs in any `---` group, never close. With no barrier, nothing closes. This is off by default, see Settings.

## Settings

Go to `chrome://extensions`, click Details on "Tab and Tab Group Shortcuts", then click "Extension options". Or right-click the extension's icon in the toolbar and click Options.

- "Move newly opened tabs to just left of the `---` barrier": off by default.
- "Close regular tabs after N days without a visit": empty by default, which means off. 0 also means off.

## Shortcuts

Only `⌘ Shift Y` is set automatically, and only on a fresh install. Suggested bindings:

| Shortcut    | Command                                                   |
| ----------- | --------------------------------------------------------- |
| `⌘ Shift Y` | Open New Tab in Group                                     |
| `⌘T`        | Open new regular tab, just left of the --- barrier        |
| `⌘D`        | Toggle selected tabs between regular and sticky           |
| `⌘ Shift ↑` | Swap tab to the left                                      |
| `⌘ Shift ↓` | Swap tab to the right                                     |
| `⌘ Shift ,` | Move focus to the tab on the left, wrapping around        |
| `⌘ Shift .` | Move focus to the tab on the right, wrapping around       |
| `⌘ Shift C` | Copy the current tab's URL                                |

To bind a shortcut:

1. Go to `chrome://extensions/shortcuts`.
2. Find the "Tab and Tab Group Shortcuts" extension.
3. Click the ✎ icon next to the command and press the keys, e.g. `⌘T`.

If a key is already bound to another command of this extension, remove it from that command first.

"Copy the current tab's URL" needs permission to write to the clipboard. Chrome asks the first time you use it; you can also allow it on the Settings page. `⌘ Shift C` replaces DevTools' "inspect element" shortcut while DevTools is closed; pick another key if you use that.

Chrome's own previous / next tab shortcuts (`⌘ Shift [` / `⌘ Shift ]` and `⌘ Option ←` / `⌘ Option →`) can't be taken over. Extension shortcuts can't use brackets or combine `⌘` with `Option`. The "Move focus ... wrapping around" commands work like Chrome's but skip collapsed groups, and `⌘ Shift ,` / `⌘ Shift .` is the closest available pair.

## Releasing

Releases go to the [Chrome Web Store listing](https://chromewebstore.google.com/detail/nnbnphmhdbcgnekonlgniafbpcpapkep) with `./deploy.sh`, which uses the [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api).

1. Bump `"version"` in `manifest.json`. The store rejects a version it already has.
   If you added a permission to `manifest.json`, the store needs a reason for it before it will publish, and the dashboard only asks once the new version is uploaded. Run `./deploy.sh --upload-only`, fill in the reason in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) under Privacy practices, then continue. Skipping this makes publishing fail with `INVALID_ITEM_METADATA`.
2. Run `./deploy.sh`. It runs `npm test`, builds the zip with `./package.sh`, uploads it, and submits it for review. Success looks like:

   ```
   "state": "PENDING_REVIEW"
   Submitted 1.0.9 for review.
   ```

3. Wait for review, usually under a day. Google emails you when it's approved or rejected. Approved versions publish automatically.
4. Commit and push the version bump.

Other commands:

- `./deploy.sh --status` prints the published and in-review versions. Use it to check on a review, or to check your credentials work.
- `./deploy.sh --cancel` withdraws the version that's in review. You need this to replace it, because uploads fail while a version is in review:

  ```
  "message": "You may not edit or publish an item that is in review."
  ```

### One-time credential setup

`./deploy.sh` reads credentials from `.deploy.env`, which is untracked. If it's missing, `./deploy.sh` says so. To create it:

1. Go to https://console.cloud.google.com/projectcreate and create a project (e.g. `chrome-webstore-deploy`).
2. Go to https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com and click Enable.
3. Go to https://console.cloud.google.com/auth/overview and configure the consent screen as External. Fill in the branding; the privacy and terms links can point at [PRIVACY](PRIVACY) and [TERMS](TERMS), with `github.com` as the authorized domain.
4. Go to https://console.cloud.google.com/auth/audience and click "Publish app". Otherwise sign-in fails with "Error 403: access_denied" for anyone not listed as a test user, and refresh tokens expire after 7 days.
5. Go to https://console.cloud.google.com/auth/clients and create an OAuth client of type "Web application", with authorized redirect URI `https://developers.google.com/oauthplayground`. Copy the client ID and secret.
6. Go to https://developers.google.com/oauthplayground. Click the gear icon, check "Use your own OAuth credentials", and paste the client ID and secret.
7. In "Input your own scopes", enter `https://www.googleapis.com/auth/chromewebstore` and click Authorize APIs. Sign in as the account that owns the extension. When it says "Google hasn't verified this app", click Advanced, then "Go to ... (unsafe)", then Continue.
8. Click "Exchange authorization code for tokens" and copy the refresh token.
9. Go to https://chrome.google.com/webstore/devconsole. Your publisher ID is under Account / Publisher settings.
10. Create `.deploy.env`:

    ```bash
    CWS_CLIENT_ID=...
    CWS_CLIENT_SECRET=...
    CWS_REFRESH_TOKEN=...
    CWS_PUBLISHER_ID=...
    CWS_EXTENSION_ID=nnbnphmhdbcgnekonlgniafbpcpapkep
    ```

11. Run `./deploy.sh --status`. If it prints the published version, you're done.

## Releasing manually

If `./deploy.sh` doesn't work, you can upload by hand.

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
