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

Run `./package.sh`.
Go to https://chrome.google.com/webstore/devconsole.
Find the extension in that list.
Click on "Package" on the left.
Upload the `new-tab-in-tab-group.zip` file.
Click "Store listing".
Click "Submit for review".

## Packaging

I think this only has to be run once to create an extension.

Go to `chrome://extensions/`.
Click "pack extension".
Locate the `new-tab-in-tab-group` folder. It will create a .crx file and a .pem file.

Then, go to https://chrome.google.com/webstore/devconsole and upload the `new-tab-in-tab-group.crx` file just created.
