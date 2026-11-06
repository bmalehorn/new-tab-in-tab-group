// Loads dist/ as an unpacked extension in Playwright's Chromium and runs each
// command against real tabs and tab groups.
//
// Tab layouts are written as strings: "a [b* c] {d e} f" means tab a, an
// expanded group with b and c, a collapsed group with d and e, then f. The
// active tab has a *. Tabs the extension opens are named "new".

import path from "node:path";
import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Worker,
} from "@playwright/test";

type TabState = { id: number; groupId: number; active: boolean };
type GroupState = { id: number; collapsed: boolean };

const test = base.extend<
  { tabs: Tabs },
  { extensionContext: BrowserContext; serviceWorker: Worker }
>({
  extensionContext: [
    async ({}, use) => {
      const extensionPath = path.resolve(import.meta.dirname, "../dist");
      const context = await chromium.launchPersistentContext("", {
        // The "chromium" channel is the full browser in headless mode, which
        // supports extensions. The default headless shell doesn't.
        channel: "chromium",
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      });
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  serviceWorker: [
    async ({ extensionContext: context }, use) => {
      const [serviceWorker] = context.serviceWorkers();
      await use(serviceWorker ?? (await context.waitForEvent("serviceworker")));
    },
    { scope: "worker" },
  ],
  tabs: async ({ serviceWorker }, use) => {
    await use(new Tabs(serviceWorker));
  },
});

class Tabs {
  private names = new Map<number, string>();

  constructor(private serviceWorker: Worker) {}

  // Replaces every tab in the window with the given layout.
  async setup(layout: string) {
    const tokens = layout.match(/[[\]{}]|[^\s[\]{}]+/g) ?? [];
    const tabs: { name: string; group?: number; active: boolean }[] = [];
    const collapsed: boolean[] = [];
    let group: number | undefined;
    for (const token of tokens) {
      if (token === "[" || token === "{") {
        group = collapsed.length;
        collapsed.push(token === "{");
      } else if (token === "]" || token === "}") {
        group = undefined;
      } else {
        const active = token.endsWith("*");
        tabs.push({ name: token.replace("*", ""), group, active });
      }
    }

    const ids = await this.serviceWorker.evaluate(
      async ({ tabs, collapsed }) => {
        const oldTabs = await chrome.tabs.query({});
        const ids: number[] = [];
        for (const _ of tabs) {
          const tab = await chrome.tabs.create({ url: "about:blank" });
          ids.push(tab.id!);
        }
        await chrome.tabs.remove(oldTabs.map((tab) => tab.id!));
        for (let group = 0; group < collapsed.length; group++) {
          const tabIds = ids.filter((_, i) => tabs[i].group === group);
          const groupId = await chrome.tabs.group({
            tabIds: tabIds as [number, ...number[]],
          });
          await chrome.tabGroups.update(groupId, {
            collapsed: collapsed[group],
          });
        }
        const activeIndex = tabs.findIndex((tab) => tab.active);
        await chrome.tabs.update(ids[activeIndex], { active: true });
        return ids;
      },
      { tabs, collapsed }
    );
    this.names = new Map(ids.map((id, i) => [id, tabs[i].name]));
  }

  async run(command: string) {
    await this.serviceWorker.evaluate(
      (command) =>
        (
          globalThis as unknown as {
            handleCommand: (command: string) => Promise<void>;
          }
        ).handleCommand(command),
      command
    );
  }

  async layout(): Promise<string> {
    const { tabs, groups } = await this.serviceWorker.evaluate(async () => ({
      tabs: (await chrome.tabs.query({})).map(
        ({ id, groupId, active }): TabState => ({ id: id!, groupId, active })
      ),
      groups: (await chrome.tabGroups.query({})).map(
        ({ id, collapsed }): GroupState => ({ id, collapsed })
      ),
    }));
    const parts: string[] = [];
    let currentGroup = -1;
    for (const tab of tabs) {
      if (tab.groupId !== currentGroup) {
        if (currentGroup !== -1) {
          parts.push(closing(groups, currentGroup));
        }
        if (tab.groupId !== -1) {
          parts.push(opening(groups, tab.groupId));
        }
        currentGroup = tab.groupId;
      }
      parts.push((this.names.get(tab.id) ?? "new") + (tab.active ? "*" : ""));
    }
    if (currentGroup !== -1) {
      parts.push(closing(groups, currentGroup));
    }
    return parts.join(" ").replace(/([[{]) /g, "$1").replace(/ ([\]}])/g, "$1");
  }
}

const isCollapsed = (groups: GroupState[], id: number) =>
  groups.find((group) => group.id === id)?.collapsed;
const opening = (groups: GroupState[], id: number) =>
  isCollapsed(groups, id) ? "{" : "[";
const closing = (groups: GroupState[], id: number) =>
  isCollapsed(groups, id) ? "}" : "]";

const cases: [command: string, before: string, after: string][] = [
  ["new-tab-in-group", "a [b* c]", "a [b new* c]"],
  ["new-tab-in-group", "a* b", "a new* b"],

  ["swap-right", "a* b c", "b a* c"],
  ["swap-right", "a* [b c]", "[a* b c]"],
  ["swap-right", "[a* b] c", "[b a*] c"],
  ["swap-right", "[a b*] c", "[a] b* c"],
  ["swap-right", "[a b*]", "[a] b*"],
  ["swap-right", "a* {b c} d", "{b c} a* d"],
  ["swap-right", "a* {b c}", "{b c} a*"],
  ["swap-left", "a b* c", "b* a c"],
  ["swap-left", "[a b] c*", "[a b c*]"],
  ["swap-left", "a {b c} d*", "a d* {b c}"],

  ["focus-right-into-group", "a* [b c]", "a [b* c]"],
  ["focus-right-into-group", "a* {b c} d", "a {b c} d*"],
  ["focus-right-into-group", "a b*", "a b*"],
  ["focus-left-into-group", "[a b] c*", "[a b*] c"],
];

for (const [command, before, after] of cases) {
  test(`${command}: ${before} -> ${after}`, async ({ tabs }) => {
    await tabs.setup(before);
    expect(await tabs.layout()).toBe(before);
    await tabs.run(command);
    expect(await tabs.layout()).toBe(after);
  });
}

test("unknown commands throw", async ({ tabs }) => {
  await tabs.setup("a*");
  await expect(tabs.run("nope")).rejects.toThrow("unimplemented command: nope");
});
