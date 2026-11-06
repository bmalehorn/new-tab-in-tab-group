// Loads dist/ as an unpacked extension in Playwright's Chromium and runs each
// command against real tabs and tab groups.
//
// Tab layouts are written as strings: "a [b* c] ---{d e} f" means tab a, an
// expanded group with b and c, a collapsed group titled "---" with d and e,
// then f. The active tab has a *, other selected tabs have a +. Tabs the
// extension opens are named "new".

import path from "node:path";
import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Worker,
} from "@playwright/test";

type TabState = {
  id: number;
  groupId: number;
  active: boolean;
  highlighted: boolean;
};
type GroupState = { id: number; collapsed: boolean; title?: string };

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
    const tokens = layout.match(/[^\s[\]{}]*[[{]|[\]}]|[^\s[\]{}]+/g) ?? [];
    const tabs: {
      name: string;
      group?: number;
      active: boolean;
      highlighted: boolean;
    }[] = [];
    const groups: { collapsed: boolean; title: string }[] = [];
    let group: number | undefined;
    for (const token of tokens) {
      if (token.endsWith("[") || token.endsWith("{")) {
        group = groups.length;
        groups.push({ collapsed: token.endsWith("{"), title: token.slice(0, -1) });
      } else if (token === "]" || token === "}") {
        group = undefined;
      } else {
        tabs.push({
          name: token.replace(/[*+]$/, ""),
          group,
          active: token.endsWith("*"),
          highlighted: token.endsWith("+"),
        });
      }
    }

    const ids = await this.serviceWorker.evaluate(
      async ({ tabs, groups }) => {
        const oldTabs = await chrome.tabs.query({});
        const ids: number[] = [];
        for (const _ of tabs) {
          const tab = await chrome.tabs.create({ url: "about:blank" });
          ids.push(tab.id!);
        }
        await chrome.tabs.remove(oldTabs.map((tab) => tab.id!));
        for (let group = 0; group < groups.length; group++) {
          const tabIds = ids.filter((_, i) => tabs[i].group === group);
          const groupId = await chrome.tabs.group({
            tabIds: tabIds as [number, ...number[]],
          });
          await chrome.tabGroups.update(groupId, groups[group]);
        }
        const activeIndex = tabs.findIndex((tab) => tab.active);
        await chrome.tabs.update(ids[activeIndex], { active: true });
        // The first highlighted tab becomes active, so list the active one first.
        const otherIndexes = tabs.flatMap((tab, i) => (tab.highlighted ? [i] : []));
        if (otherIndexes.length > 0) {
          await chrome.tabs.highlight({ tabs: [activeIndex, ...otherIndexes] });
        }
        return ids;
      },
      { tabs, groups }
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

  // Closes tabs as if `days` days had passed since every tab was last visited.
  async closeStaleTabs(days: number) {
    await this.serviceWorker.evaluate(
      (now) =>
        (
          globalThis as unknown as {
            closeStaleTabs: (now: number) => Promise<void>;
          }
        ).closeStaleTabs(now),
      Date.now() + days * 24 * 60 * 60 * 1000
    );
  }

  async layout(): Promise<string> {
    const { tabs, groups } = await this.serviceWorker.evaluate(async () => ({
      tabs: (await chrome.tabs.query({})).map(
        ({ id, groupId, active, highlighted }): TabState => ({
          id: id!,
          groupId,
          active,
          highlighted,
        })
      ),
      groups: (await chrome.tabGroups.query({})).map(
        ({ id, collapsed, title }): GroupState => ({ id, collapsed, title })
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
      const marker = tab.active ? "*" : tab.highlighted ? "+" : "";
      parts.push((this.names.get(tab.id) ?? "new") + marker);
    }
    if (currentGroup !== -1) {
      parts.push(closing(groups, currentGroup));
    }
    return parts.join(" ").replace(/([[{]) /g, "$1").replace(/ ([\]}])/g, "$1");
  }
}

const findGroup = (groups: GroupState[], id: number) =>
  groups.find((group) => group.id === id);
const opening = (groups: GroupState[], id: number) => {
  const group = findGroup(groups, id);
  return (group?.title ?? "") + (group?.collapsed ? "{" : "[");
};
const closing = (groups: GroupState[], id: number) =>
  findGroup(groups, id)?.collapsed ? "}" : "]";

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

  ["new-tab-after-separator", "a ---{x} b c*", "a ---{x} new* b c"],
  ["new-tab-after-separator", "a ---[x] [b c*]", "a ---[x] new* [b c]"],
  ["new-tab-after-separator", "a b*", "new* a b"],

  ["move-across-separator", "a ---{x} b c*", "a c* ---{x} b"],
  ["move-across-separator", "a* b ---{x} c", "b ---{x} a* c"],
  ["move-across-separator", "a ---{x} [b c*]", "a c* ---{x} [b]"],
  ["move-across-separator", "a b+ ---{x} c d* e+", "a b+ d* e+ ---{x} c"],
  ["move-across-separator", "a+ b* c ---{x} d", "c ---{x} a+ b* d"],
  ["move-across-separator", "a b c*", "c* a b"],
  ["move-across-separator", "a ---{x} b ---{y} c*", "a c* ---{x} b ---{y}"],
];

for (const [command, before, after] of cases) {
  test(`${command}: ${before} -> ${after}`, async ({ tabs }) => {
    await tabs.setup(before);
    expect(await tabs.layout()).toBe(before);
    await tabs.run(command);
    expect(await tabs.layout()).toBe(after);
  });
}

test("closes tabs right of --- after 7 days without a visit", async ({ tabs }) => {
  await tabs.setup("a ---{x} b [c d] e*");
  await tabs.closeStaleTabs(6);
  expect(await tabs.layout()).toBe("a ---{x} b [c d] e*");
  await tabs.closeStaleTabs(8);
  expect(await tabs.layout()).toBe("a ---{x} e*");
});

test("closes nothing without a --- group", async ({ tabs }) => {
  await tabs.setup("a [b] c*");
  await tabs.closeStaleTabs(8);
  expect(await tabs.layout()).toBe("a [b] c*");
});

test("unknown commands throw", async ({ tabs }) => {
  await tabs.setup("a*");
  await expect(tabs.run("nope")).rejects.toThrow("unimplemented command: nope");
});
