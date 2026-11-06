// Tests copying the current tab's URL.
//
// In real use, pressing the shortcut grants activeTab (so the tab's url is
// readable) and Chrome prompts for the optional clipboardWrite permission.
// Tests can't press extension shortcuts or click that prompt, so this loads a
// copy of dist/ whose manifest grants tabs, clipboardWrite and clipboardRead
// up front. The real manifest is tested by tests/extension.spec.ts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";

const launch = async (extensionPath: string) => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const serviceWorker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(serviceWorker.url()).host;
  return { context, serviceWorker, extensionId };
};

const distPath = path.resolve(import.meta.dirname, "../dist");

test("copies the current tab's URL", async () => {
  const testPath = fs.mkdtempSync(path.join(os.tmpdir(), "extension-"));
  fs.cpSync(distPath, testPath, { recursive: true });
  const manifestPath = path.join(testPath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.permissions.push("tabs", "clipboardWrite", "clipboardRead");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  const { context, serviceWorker, extensionId } = await launch(testPath);
  const url = `chrome-extension://${extensionId}/options.html?copy-me`;
  const page = await context.newPage();
  await page.goto(url);
  await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await (
      globalThis as unknown as { copyUrl: (tab: chrome.tabs.Tab) => Promise<void> }
    ).copyUrl(tab);
  });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await context.close();
});

test("the options page offers to allow copying", async () => {
  const { context, extensionId } = await launch(distPath);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole("button", { name: "Allow copying" })).toBeVisible();
  await context.close();
});
