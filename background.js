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

chrome.commands.onCommand.addListener(async (command) => {
  const currentTabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const currentTab = currentTabs[0];

  const tabs = await chrome.tabs.query({
    currentWindow: true,
  });
  const tabGroups = await chrome.tabGroups.query({});

  // skips collapsed tab groups
  const getNextTab = (direction = 1) => {
    let nextTabIndex = currentTab.index;
    while (true) {
      nextTabIndex += direction;
      const nextTab = tabs[nextTabIndex];
      if (!nextTab) {
        return null;
      }
      const nextTabGroup = tabGroups.find(
        (tabGroup) => tabGroup.id === nextTab.groupId
      );
      if (nextTabGroup?.collapsed) {
        continue;
      }
      return nextTab;
    }
  };

  if (command === "new-tab-in-group") {
    const newTab = await chrome.tabs.create({ index: currentTab.index + 1 });
    // no current group
    if (currentTab.groupId === -1) {
      return;
    }
    await chrome.tabs.group({ tabIds: newTab.id, groupId: currentTab.groupId });
  } else if (command === "swap-right" || command === "swap-left") {
    const nextTab = getNextTab(command === "swap-right" ? 1 : -1);
    if (!nextTab) {
      await chrome.tabs.ungroup(currentTab.id);
    } else if (currentTab.groupId === -1 && nextTab.groupId !== -1) {
      // Only change this tab to the same group as the next tab.
      // This way, you can position the tab at the start of the tab group.
      await chrome.tabs.group({
        tabIds: currentTab.id,
        groupId: nextTab.groupId,
      });
    } else if (currentTab.groupId !== nextTab.groupId) {
      await chrome.tabs.ungroup(currentTab.id);
    } else {
      // Swap the tab with the next tab.
      await chrome.tabs.move(currentTab.id, { index: nextTab.index });
    }
  } else if (
    command === "focus-right-into-group" ||
    command === "focus-left-into-group"
  ) {
    const nextTab = getNextTab(command === "focus-right-into-group" ? 1 : -1);
    if (!nextTab) {
      return;
    }
    await chrome.tabs.update(nextTab.id, { active: true });
  } else {
    throw new Error(`unimplemented command: ${command}`);
  }
});
