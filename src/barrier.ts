// The first tab group titled with only dashes, like "---", is the barrier. It
// splits the window into regular tabs on its left and sticky tabs on its
// right:
//
//   pinned tabs | regular tabs | barrier | sticky tabs
//
// New tabs open just left of the barrier, so regular tabs run from oldest on
// the left to newest on the right, the same order Chrome uses. Regular tabs can
// close after some days without a visit. The commands that use the barrier
// create one if it's missing.

// Any dash-like characters count, since macOS turns "--" into "—" as you type.
// \p{Pd} covers -, –, —, ― and friends; U+2212 is the minus sign.
const BARRIER_TITLE = /^\s*[\p{Pd}−]+\s*$/u;

// Title for barriers the extension creates.
export const NEW_BARRIER_TITLE = "———";

export const isBarrier = (tabGroup: { title?: string }) =>
  BARRIER_TITLE.test(tabGroup.title ?? "");

type Tab = { index: number; groupId: number };

// Returns the leftmost "---" group in `tabs` and the index of its first and
// last tab, or undefined if there isn't one.
export const findBarrier = (
  tabs: Tab[],
  tabGroups: { id: number; title?: string }[]
): { groupId: number; start: number; end: number } | undefined => {
  const barrierIds = new Set(
    tabGroups.filter(isBarrier).map((tabGroup) => tabGroup.id)
  );
  const sorted = [...tabs].sort((a, b) => a.index - b.index);
  const first = sorted.find((tab) => barrierIds.has(tab.groupId));
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

// Whether a tab that was just opened should move to just left of the barrier,
// making it the newest regular tab. Chrome opens tabs from outside the window
// (another app, another window, the + button) at the end of the window, among
// the sticky tabs, and links from a sticky tab next to it, so anything that
// lands in the barrier or right of it moves. Left of the barrier, only links
// from pinned tabs move, since Chrome puts them right after the pinned tabs.
// Links from regular tabs stay where Chrome put them.
export const shouldMoveNewTab = <
  T extends Tab & { id?: number; pinned: boolean; openerTabId?: number }
>(
  tab: T,
  tabs: T[],
  tabGroups: { id: number; title?: string }[]
): boolean => {
  const barrier = findBarrier(tabs, tabGroups);
  if (!barrier || tab.pinned) {
    return false;
  }
  if (tab.index >= barrier.start) {
    return true;
  }
  if (tab.index === barrier.start - 1 && tab.groupId === -1) {
    return false;
  }
  const opener = tabs.find((other) => other.id === tab.openerTabId);
  return opener?.pinned ?? false;
};

// Regular tabs that haven't been visited in `maxAgeMs`. Active and pinned
// tabs are never stale, and neither are the barrier and sticky tabs.
export const findStaleTabs = <
  T extends Tab & { active: boolean; pinned: boolean; lastAccessed?: number }
>(
  tabs: T[],
  tabGroups: { id: number; title?: string }[],
  now: number,
  maxAgeMs: number
): T[] => {
  const barrier = findBarrier(tabs, tabGroups);
  if (!barrier) {
    return [];
  }
  return tabs.filter(
    (tab) =>
      tab.index < barrier.start &&
      !tab.active &&
      !tab.pinned &&
      tab.lastAccessed !== undefined &&
      now - tab.lastAccessed > maxAgeMs
  );
};
