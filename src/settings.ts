// Settings are stored with chrome.storage.sync, so they follow the user across
// computers. Change them on the extension's options page (options.html).

export type Settings = {
  // Close regular tabs after this many days without a visit. 0 turns
  // auto-close off.
  autoCloseAfterDays: number;
  // Move newly opened tabs to just left of the barrier, as the newest regular
  // tab. See shouldMoveNewTab.
  moveNewTabsToRegular: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  autoCloseAfterDays: 0,
  moveNewTabsToRegular: false,
};

export const getSettings = async (): Promise<Settings> => {
  const stored = await chrome.storage.sync.get([
    ...Object.keys(DEFAULT_SETTINGS),
    // 1.0.12 stored moveNewTabsToRegular under this name.
    "openNewTabsAfterSeparator",
  ]);
  const { openNewTabsAfterSeparator, ...settings } = stored;
  return {
    ...DEFAULT_SETTINGS,
    moveNewTabsToRegular: openNewTabsAfterSeparator ?? false,
    ...settings,
  } as Settings;
};

export const setSettings = (settings: Partial<Settings>) =>
  chrome.storage.sync.set(settings);
