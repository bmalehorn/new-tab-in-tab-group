// Settings are stored with chrome.storage.sync, so they follow the user across
// computers. Change them on the extension's options page (options.html).

export type Settings = {
  autoCloseStaleTabs: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  autoCloseStaleTabs: false,
};

export const getSettings = async (): Promise<Settings> =>
  ({
    ...DEFAULT_SETTINGS,
    ...(await chrome.storage.sync.get(DEFAULT_SETTINGS)),
  }) as Settings;

export const setSettings = (settings: Partial<Settings>) =>
  chrome.storage.sync.set(settings);
