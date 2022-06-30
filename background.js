chrome.commands.onCommand.addListener(function(command) {
  chrome.tabs.query({active: true, currentWindow: true}, function(currentTabs) {
    var curr = currentTabs[0];
    chrome.tabs.create({index: curr.index+1}, function(newTab) {
      chrome.tabs.group({tabIds: newTab.id, groupId: curr.groupId});
    });
  });
});
