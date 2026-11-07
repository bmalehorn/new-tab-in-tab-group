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

// Whether a tab that was just opened should move to right after the separator:
// tabs opened from outside the window (another app, another window, the +
// button) or from a pinned tab or a tab left of the separator. Tabs opened
// from a tab right of the separator stay where Chrome put them.
export const shouldMoveNewTab = <
  T extends Tab & {
    id?: number;
    pinned: boolean;
    active?: boolean;
    openerTabId?: number;
  }
>(
  tab: T,
  tabs: T[],
  tabGroups: { id: number; title?: string }[]
): boolean => {
  const separator = findSeparator(tabs, tabGroups);
  if (!separator || tab.pinned) {
    return false;
  }
  if (tab.index === separator.end + 1 && tab.groupId === -1) {
    return false;
  }
  const opener = tabs.find((other) => other.id === tab.openerTabId);
  if (!opener) {
    return true;
  }
  if (
    opener.pinned ||
    opener.index < separator.start ||
    opener.groupId === separator.groupId
  ) {
    return true;
  }
  // Chrome also sets openerTabId on links opened from other apps, to whatever
  // tab was active, but puts those tabs at the end of the window, in front. A
  // link clicked in a page opens right after its opener, or after the opener's
  // other recently opened tabs. So only trust the opener if every tab between
  // the two was also opened from it.
  //
  // If the opener is the last tab, both kinds land at the end. Then guess from
  // whether it opened in front: links from other apps always do, while
  // ⌘-clicked links open in the background.
  const isLast = tabs.every((other) => other.index <= tab.index);
  if (isLast && tab.active) {
    return true;
  }
  const openedNextToOpener =
    tab.index > opener.index &&
    tabs
      .filter((other) => other.index > opener.index && other.index < tab.index)
      .every((other) => other.openerTabId === opener.id);
  return !openedNextToOpener;
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
