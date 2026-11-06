// The first tab group titled "---" splits the window: tabs to its left are
// kept, tabs to its right are temporary. New tabs open right after it, and
// temporary tabs close after a week without a visit.

export const SEPARATOR_TITLE = "---";
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type Tab = { index: number; groupId: number };

// Returns the leftmost "---" group in `tabs` and the index of its first and
// last tab, or undefined if there isn't one.
export const findSeparator = (
  tabs: Tab[],
  tabGroups: { id: number; title?: string }[]
): { groupId: number; start: number; end: number } | undefined => {
  const separatorIds = new Set(
    tabGroups
      .filter((tabGroup) => tabGroup.title === SEPARATOR_TITLE)
      .map((tabGroup) => tabGroup.id)
  );
  const sorted = [...tabs].sort((a, b) => a.index - b.index);
  const first = sorted.find((tab) => separatorIds.has(tab.groupId));
  if (!first) {
    return undefined;
  }
  const groupTabs = sorted.filter((tab) => tab.groupId === first.groupId);
  return {
    groupId: first.groupId,
    start: first.index,
    end: groupTabs[groupTabs.length - 1].index,
  };
};

// Tabs to the right of the separator that haven't been visited in a week.
// Active and pinned tabs are never stale.
export const findStaleTabs = <
  T extends Tab & { active: boolean; pinned: boolean; lastAccessed?: number }
>(
  tabs: T[],
  tabGroups: { id: number; title?: string }[],
  now: number
): T[] => {
  const separator = findSeparator(tabs, tabGroups);
  if (!separator) {
    return [];
  }
  return tabs.filter(
    (tab) =>
      tab.index > separator.end &&
      !tab.active &&
      !tab.pinned &&
      tab.lastAccessed !== undefined &&
      now - tab.lastAccessed > STALE_AFTER_MS
  );
};
