const textarea = document.getElementById("text") as HTMLTextAreaElement;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen" || message.type !== "copy") {
    return;
  }
  // navigator.clipboard needs the document to be focused, which an offscreen
  // document never is, so use the older execCommand.
  textarea.value = message.text;
  textarea.select();
  sendResponse(document.execCommand("copy"));
});
