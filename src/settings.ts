// Settings are stored with chrome.storage.sync, so they follow the user across
// computers. Change them on the extension's options page (options.html).

export type Settings = {
  // Close tabs right of the separator after this many days without a visit.
  // 0 turns auto-close off.
  autoCloseAfterDays: number;
};

export const DEFAULT_SETTINGS: Settings = {
  autoCloseAfterDays: 0,
};

export const getSettings = async (): Promise<Settings> =>
  ({
    ...DEFAULT_SETTINGS,
    ...(await chrome.storage.sync.get(DEFAULT_SETTINGS)),
  }) as Settings;

export const setSettings = (settings: Partial<Settings>) =>
  chrome.storage.sync.set(settings);
