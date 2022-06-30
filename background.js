chrome.commands.onCommand.addListener(function () {
  chrome.tabs.query(
    { active: true, currentWindow: true },
    function (currentTabs) {
      var currentTab = currentTabs[0];
      chrome.tabs.create({ index: currentTab.index + 1 }, function (newTab) {
        // no current group
        if (currentTab.groupId === -1) {
          return;
        }
        chrome.tabs.group({ tabIds: newTab.id, groupId: currentTab.groupId });
      });
    }
  );
});
