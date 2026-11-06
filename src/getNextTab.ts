// Finds the tab next to `currentIndex` in `direction`, skipping tabs inside
// collapsed tab groups. `skipped` is true if any collapsed tabs were skipped.
export const getNextTab = <T extends { groupId: number }>(
  tabs: T[],
  tabGroups: { id: number; collapsed: boolean }[],
  currentIndex: number,
  direction: number
): { nextTab?: T; skipped: boolean } => {
  let nextTabIndex = currentIndex;
  let skipped = false;
  while (true) {
    nextTabIndex += direction;
    const nextTab = tabs[nextTabIndex];
    if (!nextTab) {
      return { nextTab, skipped };
    }
    const nextTabGroup = tabGroups.find(
      (tabGroup) => tabGroup.id === nextTab.groupId
    );
    if (nextTabGroup && nextTabGroup.collapsed) {
      skipped = true;
      continue;
    }
    return { nextTab, skipped };
  }
};
