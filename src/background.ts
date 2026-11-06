import { getNextTab } from "./getNextTab.ts";
import { findSeparator, findStaleTabs } from "./separator.ts";
import { getSettings } from "./settings.ts";

// "commands": {
//   "swap-right": {
//     "suggested_key": {
//       "default": "Ctrl+Right"
//     },
//     "description": "Reorder tab to the right"
//   },
//   "swap-left": {
//     "suggested_key": {
//       "default": "Ctrl+Left"
//     },
//     "description": "Reorder tab to the left"
//   },
//   "swap-right-skipping-tab-groups": {
//     "description": "Reorder tab to the right, skipping tab groups"
//   },
//   "swap-left-skipping-tab-groups": {
//     "description": "Reorder tab to the left, skipping tab groups"
//   },
//   "collapse-group": {
//     "description": "Collapse tab group"
//   },
//   "focus-right": {
//     "description": "Move focus right"
//   },
//   "focus-left": {
//     "description": "Move focus left"
//   },
//   "focus-left-into-group": {
//     "description": "Move focus left into tab group"
//   },
//   "focus-right-into-group": {
//     "description": "Move focus right into tab group"
//   },
//   "focus-to-next-group-or-tab-right": {
//     "description": "Move focus to next tab group or tab on the right, collapsing current tab group"
//   },
//   "focus-to-next-group-or-tab-left": {
//     "description": "Move focus to next tab group or tab on the left, collapsing current tab group"
//   },
//   "rename-tab-group": {
//     "description": "Rename tab group"
//   },
//   "create-tab-group": {
//     "description": "Create tab group"
//   },
//   "swap-group-right": {
//     "description": "Reorder tab group to the right"
//   },
//   "swap-group-left": {
//     "description": "Reorder tab group to the left"
//   },
//   "new-tab-in-group": {
//     "description": "Open New Tab in Group",
//     "suggested_key": {
//       "default": "Ctrl+Shift+Y",
//       "mac": "Command+Shift+Y"
//     }
//   }

export const handleCommand = async (command: string) => {
  const currentTabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const currentTab = currentTabs[0];
  if (currentTab?.id === undefined) {
    return;
  }
  const currentTabId = currentTab.id;

  const tabs = await chrome.tabs.query({
    currentWindow: true,
  });
  const tabGroups = await chrome.tabGroups.query({});

  if (command === "new-tab-in-group") {
    const newTab = await chrome.tabs.create({ index: currentTab.index + 1 });
    // no current group
    if (currentTab.groupId === -1) {
      return;
    }
    if (newTab.id === undefined) {
      return;
    }
    await chrome.tabs.group({ tabIds: newTab.id, groupId: currentTab.groupId });
  } else if (command === "swap-right" || command === "swap-left") {
    const direction = command === "swap-right" ? 1 : -1;
    const { nextTab, skipped } = getNextTab(tabs, tabGroups, currentTab.index, direction);
    if (!nextTab) {
      await chrome.tabs.ungroup(currentTabId);
      if (skipped) {
        // if you skipped a collapsed tab group, I still want to swap to the far left / right
        if (direction === -1) {
          await chrome.tabs.move(currentTabId, { index: 0 });
        } else {
          await chrome.tabs.move(currentTabId, { index: tabs.length });
        }
      }
    } else if (currentTab.groupId === -1 && nextTab.groupId !== -1) {
      // Only change this tab to the same group as the next tab.
      // This way, you can position the tab at the start of the tab group.
      await chrome.tabs.group({
        tabIds: currentTabId,
        groupId: nextTab.groupId,
      });
    } else if (currentTab.groupId !== nextTab.groupId) {
      await chrome.tabs.ungroup(currentTabId);
    } else if (skipped) {
      // for some reason, this was skipping over 1 extra tab each time.
      // Undo this by subtracting the direction.
      await chrome.tabs.move(currentTabId, {
        index: nextTab.index - direction,
      });
    } else {
      // Swap the tab with the next tab.
      await chrome.tabs.move(currentTabId, { index: nextTab.index });
    }
  } else if (
    command === "focus-right-into-group" ||
    command === "focus-left-into-group"
  ) {
    const direction = command === "focus-right-into-group" ? 1 : -1;
    const { nextTab } = getNextTab(tabs, tabGroups, currentTab.index, direction);
    if (nextTab?.id === undefined) {
      return;
    }
    await chrome.tabs.update(nextTab.id, { active: true });
  } else if (command === "focus-right" || command === "focus-left") {
    // Like Chrome's own ⌘⇧] / ⌘⇧[, wraps around at the ends, but also skips
    // collapsed groups.
    const direction = command === "focus-right" ? 1 : -1;
    let { nextTab } = getNextTab(tabs, tabGroups, currentTab.index, direction);
    if (!nextTab) {
      const start = direction === 1 ? -1 : tabs.length;
      ({ nextTab } = getNextTab(tabs, tabGroups, start, direction));
    }
    if (nextTab?.id === undefined) {
      return;
    }
    await chrome.tabs.update(nextTab.id, { active: true });
  } else if (command === "new-tab-after-separator") {
    await newTabAfterSeparator(tabs, tabGroups);
  } else if (command === "move-across-separator") {
    await moveAcrossSeparator(currentTab, tabs, tabGroups);
  } else {
    throw new Error(`unimplemented command: ${command}`);
  }
};

// Pinned tabs always come first, so "leftmost" means right after them.
const firstUnpinnedIndex = (tabs: chrome.tabs.Tab[]) =>
  tabs.filter((tab) => tab.pinned).length;

const newTabAfterSeparator = async (
  tabs: chrome.tabs.Tab[],
  tabGroups: chrome.tabGroups.TabGroup[]
) => {
  const separator = findSeparator(tabs, tabGroups);
  const index = separator ? separator.end + 1 : firstUnpinnedIndex(tabs);
  const newTab = await chrome.tabs.create({ index });
  // A tab created at the edge of a group can land inside it.
  if (newTab.id !== undefined && newTab.groupId !== -1) {
    await chrome.tabs.ungroup(newTab.id);
  }
};

// Moves the selected tabs to just left of the separator, or if the active tab
// is already left of it, to just right of it.
const moveAcrossSeparator = async (
  currentTab: chrome.tabs.Tab,
  tabs: chrome.tabs.Tab[],
  tabGroups: chrome.tabGroups.TabGroup[]
) => {
  const separator = findSeparator(tabs, tabGroups);
  const tabIds = tabs
    .filter(
      (tab) =>
        tab.highlighted &&
        !tab.pinned &&
        (!separator || tab.groupId !== separator.groupId)
    )
    .map((tab) => tab.id)
    .filter((id) => id !== undefined);
  if (tabIds.length === 0) {
    return;
  }
  const groupedIds = tabs
    .filter((tab) => tab.id !== undefined && tabIds.includes(tab.id))
    .filter((tab) => tab.groupId !== -1)
    .map((tab) => tab.id!);
  if (groupedIds.length > 0) {
    await chrome.tabs.ungroup(groupedIds as [number, ...number[]]);
  }

  if (!separator) {
    // Moving each tab to the front in reverse keeps their order.
    for (const tabId of [...tabIds].reverse()) {
      await chrome.tabs.move(tabId, { index: firstUnpinnedIndex(tabs) });
    }
    return;
  }

  // Each move shifts the separator, so look it up again every time.
  const separatorRange = async () => {
    const separatorTabs = await chrome.tabs.query({
      groupId: separator.groupId,
    });
    const indexes = separatorTabs.map((tab) => tab.index);
    return { start: Math.min(...indexes), end: Math.max(...indexes) };
  };

  if (currentTab.index < separator.start) {
    for (const tabId of [...tabIds].reverse()) {
      const { end } = await separatorRange();
      const tab = await chrome.tabs.get(tabId);
      // If the tab is left of the separator, removing it shifts the separator left.
      await chrome.tabs.move(tabId, { index: tab.index < end ? end : end + 1 });
    }
  } else {
    for (const tabId of tabIds) {
      const { start } = await separatorRange();
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.move(tabId, {
        index: tab.index < start ? start - 1 : start,
      });
    }
  }
};

export const closeStaleTabs = async (now = Date.now()) => {
  const { autoCloseAfterDays } = await getSettings();
  if (!(autoCloseAfterDays > 0)) {
    return;
  }
  const maxAgeMs = autoCloseAfterDays * 24 * 60 * 60 * 1000;
  const windows = await chrome.windows.getAll({ populate: true });
  const tabGroups = await chrome.tabGroups.query({});
  const staleIds = windows
    .flatMap((window) => findStaleTabs(window.tabs ?? [], tabGroups, now, maxAgeMs))
    .map((tab) => tab.id)
    .filter((id) => id !== undefined);
  if (staleIds.length > 0) {
    await chrome.tabs.remove(staleIds);
  }
};

chrome.commands.onCommand.addListener(handleCommand);

const CLOSE_STALE_TABS_ALARM = "close-stale-tabs";
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLOSE_STALE_TABS_ALARM) {
    closeStaleTabs();
  }
});
// The service worker restarts often. Recreating the alarm each time would
// reset its timer, so only create it if it's missing.
chrome.alarms.get(CLOSE_STALE_TABS_ALARM).then((alarm) => {
  if (!alarm) {
    chrome.alarms.create(CLOSE_STALE_TABS_ALARM, { periodInMinutes: 60 });
  }
});

// Keyboard shortcuts can't be pressed from automated tests, and the tests
// can't wait a week, so the browser tests call these directly from the service
// worker. See tests/extension.spec.ts.
Object.assign(globalThis, { handleCommand, closeStaleTabs });
