# AGENTS.md

Chrome extension (Manifest V3) that adds keyboard shortcuts for tabs and tab groups. Published on the Chrome Web Store as `nnbnphmhdbcgnekonlgniafbpcpapkep`. See README.md for what each feature does.

## Layout

- `src/background.ts`: service worker. `handleCommand` runs each keyboard command; `closeStaleTabs` runs hourly from a `chrome.alarms` alarm.
- `src/getNextTab.ts`, `src/separator.ts`: pure logic with no `chrome.*` calls, so they can be unit tested in Node.
- `src/settings.ts`: settings in `chrome.storage.sync`, with defaults.
- `src/options.html`, `src/options.ts`: the extension's options page.
- `src/offscreen.html`, `src/offscreen.ts`: offscreen document that writes to the clipboard, since service workers can't.
- `manifest.json`: commands, permissions, version. Copied into `dist/` by the build.
- `tests/extension.spec.ts`: Playwright tests against the real extension.
- `deploy.sh`, `package.sh`: release scripts.

## Commands

```bash
npm install
npx playwright install chromium   # once, for the browser tests
npm run build                     # tsc into dist/, plus manifest, icon, options.html
npm run typecheck
npm test                          # unit tests, then browser tests
```

`dist/` is the complete unpacked extension. `./try.sh` builds it and opens it in Chrome for Testing with a separate profile, for trying changes by hand. Chrome caches an unpacked extension's service worker per version and reuses it across launches, so `./try.sh` deletes `.chrome-profile/Default/Service Worker` before each launch. If someone reports a change not taking effect in that browser, check it was relaunched with `./try.sh`.

## Conventions

- TypeScript with `strict`. Imports between source files use the `.ts` extension (`import { x } from "./x.ts"`); `tsc` rewrites them to `.js`. This lets Node run the unit tests on the `.ts` files directly.
- The service worker is an ES module (`"type": "module"` in the manifest).
- A new file that the extension loads directly, like an HTML page, must be added to the `cp` in the `build` script in `package.json`.
- Keep dependencies to dev tooling only (`typescript`, `@types/chrome`, `@playwright/test`). The extension ships no third-party code.
- Don't add the `tabs` permission. `chrome.tabs` works without it; it only unlocks reading a tab's `url`, `pendingUrl`, `title` and `favIconUrl`, which this extension doesn't need. Requesting it anyway got 1.0.8 rejected as "Purple Potassium" (requesting but not using a permission).
- Create tabs with `createTab` in `background.ts`, not `chrome.tabs.create`. The `tabs.onCreated` listener moves new tabs to after the separator, and `createTab` is how it knows to leave the extension's own tabs alone.
- `clipboardWrite` is in `optional_permissions` and requested on first use of `copy-url`, because a new permission with a warning disables the extension for existing users until they accept it. Use optional permissions the same way for any future permission with a warning. `permissions.request` must run during the shortcut's user gesture, before any `await`.
- New permissions can trigger a warning to users and a slower store review. Prefer ones with no warning, and mention any new permission in the commit message. Before releasing, the user has to justify each new permission in the Developer Dashboard's Privacy practices tab, or publishing fails with `INVALID_ITEM_METADATA`.
- Comments explain why, not what.

## Testing

Put logic that doesn't need `chrome.*` into a pure function with a unit test (`src/*.test.ts`, Node's built-in `node:test`).

Test anything that touches tabs in `tests/extension.spec.ts`. `tests/copyUrl.spec.ts` loads a copy of `dist/` with extra permissions, because tests can't press shortcuts (which grants `activeTab`) or accept permission prompts. Those tests load `dist/` into Playwright's Chromium (`channel: "chromium"`, because the default headless shell can't load extensions). Automated tests can't press extension keyboard shortcuts, so the tests call `handleCommand` and `closeStaleTabs` directly in the service worker. `background.ts` exposes both on `globalThis` for this.

Each test case describes tab layouts as strings:

```
["move-across-separator", "a b+ ---{x} c d* e+", "a b+ d* e+ ---{x} c"],
```

- `[a b]` is an expanded group and `{a b}` a collapsed one. A prefix sets the group's title: `---{x}`. A separator is any group titled with only dashes (`-`, `—`, ...), see `isSeparator` in `src/separator.ts`.
- `*` marks the active tab and `+` other selected tabs.
- Tabs the extension creates show up as `new`.

Every test starts from a fresh set of tabs and default settings, except that moving new tabs after the separator is off (because `setup()` creates tabs). The "new tab opened from" tests turn it on. Run `npx playwright test --headed` to watch.

When adding a test, check it fails without the fix. Chrome's tab APIs have off-by-one surprises around group edges and collapsed groups, which is why these tests use a real browser instead of mocks.

## Keyboard shortcuts

Don't add `suggested_key` defaults to existing commands: users already have their own bindings, and a new default can take a key they use. Chrome also ignores `suggested_key` for keys it uses itself (like ⌘T and ⌘D), allows at most 4, and only applies them on a fresh install. Users bind shortcuts in `chrome://extensions/shortcuts`.

Extension shortcuts can only use A-Z, 0-9, comma, period, arrows, Home/End, PageUp/PageDown, Space, Insert, Delete and media keys, and can't combine ⌘ (Ctrl) with Option (Alt). So Chrome's ⌘⇧[ / ⌘⇧] can't be rebound.

When adding a command, update the shortcut table in README.md.

## Releasing

Don't deploy unless asked. To release:

1. Bump `"version"` in `manifest.json`.
2. Run `./deploy.sh`. It runs the tests, uploads the zip, and submits it for review.

Credentials are in the untracked `.deploy.env`. Never print or commit them.

- `./deploy.sh --status` shows the published and in-review versions.
- Uploads fail while a version is in review. `./deploy.sh --cancel` withdraws it. That's a user-visible action, so ask before using it.
