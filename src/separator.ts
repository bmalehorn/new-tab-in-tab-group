// The first tab group titled with only dashes, like "---", splits the window:
// tabs to its left are kept, tabs to its right are temporary. New tabs open
// right after it, and temporary tabs can close after some days without a visit.
// The commands that use it create one if it's missing.

// Any dash-like characters count, since macOS turns "--" into "—" as you type.
// \p{Pd} covers -, –, —, ― and friends; U+2212 is the minus sign.
const SEPARATOR_TITLE = /^\s*[\p{Pd}\u2212]+\s*$/u;

// Title for separators the extension creates.
export const NEW_SEPARATOR_TITLE = "———";

export const isSeparator = (tabGroup: { title?: string }) =>
  SEPARATOR_TITLE.test(tabGroup.title ?? "");

type Tab = { index: number; groupId: number };

// Returns the leftmost "---" group in `tabs` and the index of its first and
// last tab, or undefined if there isn't one.
export const findSeparator = (
  tabs: Tab[],
  tabGroups: { id: number; title?: string }[]
): { groupId: number; start: number; end: number } | undefined => {
  const separatorIds = new Set(
    tabGroups.filter(isSeparator).map((tabGroup) => tabGroup.id)
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

// Tabs to the right of the separator that haven't been visited in `maxAgeMs`.
// Active and pinned tabs, and tabs in any separator group, are never stale.
export const findStaleTabs = <
  T extends Tab & { active: boolean; pinned: boolean; lastAccessed?: number }
>(
  tabs: T[],
  tabGroups: { id: number; title?: string }[],
  now: number,
  maxAgeMs: number
): T[] => {
  const separator = findSeparator(tabs, tabGroups);
  if (!separator) {
    return [];
  }
  const separatorIds = new Set(
    tabGroups.filter(isSeparator).map((tabGroup) => tabGroup.id)
  );
  return tabs.filter(
    (tab) =>
      tab.index > separator.end &&
      !separatorIds.has(tab.groupId) &&
      !tab.active &&
      !tab.pinned &&
      tab.lastAccessed !== undefined &&
      now - tab.lastAccessed > maxAgeMs
  );
};
