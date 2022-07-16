# New Tab in Tab Group

A simple Chrome extension for opening tabs in the same tab group as the current tab.

## Loading from source

Go to `chrome://extensions`.

Click "Load unpacked".

Navigate to the `new-tab-in-tab-group` folder and click "Ok".

You're done! Press `⌘ Shift Y` to open tabs in the same tab group.

## Mapping to ⌘T

Go to `chrome://extensions/shortcuts`.

Under the "New Tab in Group" extension, in the "Open New Tab in Tab Group" shortcut, click the ✎ icon.

Press `⌘T`. You're done!

## Releasing

```
./package.sh
```

Then, go to https://chrome.google.com/webstore/devconsole and upload the `new-tab-in-tab-group.zip` file just created.
