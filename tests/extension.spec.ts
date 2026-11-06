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
    // Settings persist for the whole browser, so start each test from defaults.
    await serviceWorker.evaluate(() => chrome.storage.sync.clear());
    await use(new Tabs(serviceWorker));
  },
});

class Tabs {
  private names = new Map<number, string>();

  constructor(private serviceWorker: Worker) {}

  idOf(name: string) {
    const entry = [...this.names].find(([, other]) => other === name);
    if (!entry) {
      throw new Error(`no tab named ${name}`);
    }
    return entry[0];
  }

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

  ["focus-right", "a* [b] c", "a [b*] c"],
  ["focus-right", "a* {b} c", "a {b} c*"],
  ["focus-right", "a b c*", "a* b c"],
  ["focus-right", "{a} b c*", "{a} b* c"],
  ["focus-left", "a* b c", "a b c*"],
  ["focus-left", "a b* c", "a* b c"],

  ["new-tab-after-separator", "a ---{x} b c*", "a ---{x} new* b c"],
  ["new-tab-after-separator", "a ---[x] [b c*]", "a ---[x] new* [b c]"],
  ["new-tab-after-separator", "a b*", "———{new} new* a b"],
  ["new-tab-after-separator", "a* ———{x} b", "a ———{x} new* b"],

  ["move-across-separator", "a ---{x} b c*", "a c* ---{x} b"],
  ["move-across-separator", "a* b ---{x} c", "b ---{x} a* c"],
  ["move-across-separator", "a ---{x} [b c*]", "a c* ---{x} [b]"],
  ["move-across-separator", "a b+ ---{x} c d* e+", "a b+ d* e+ ---{x} c"],
  ["move-across-separator", "a+ b* c ---{x} d", "c ---{x} a+ b* d"],
  ["move-across-separator", "a b c*", "c* ———{new} a b"],
  ["move-across-separator", "a+ b c*", "a+ c* ———{new} b"],
  ["move-across-separator", "a ---{x} b ---{y} c*", "a c* ---{x} b ---{y}"],
  ["move-across-separator", "a —{x} b*", "a b* —{x}"],
  ["new-tab-after-separator", "a* -[x] b", "a -[x] new* b"],
];

for (const [command, before, after] of cases) {
  test(`${command}: ${before} -> ${after}`, async ({ tabs }) => {
    await tabs.setup(before);
    expect(await tabs.layout()).toBe(before);
    await tabs.run(command);
    expect(await tabs.layout()).toBe(after);
  });
}

// Sets the auto-close days by typing into the real options page.
const setAutoCloseDays = async (
  context: BrowserContext,
  serviceWorker: Worker,
  days: string
) => {
  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const input = page.getByLabel(/Close tabs to the right/);
  await expect(input).toHaveValue("");
  await input.fill(days);
  await expect
    .poll(() =>
      serviceWorker.evaluate(() => chrome.storage.sync.get("autoCloseAfterDays"))
    )
    .toEqual({ autoCloseAfterDays: Number(days) });
  await page.reload();
  await expect(input).toHaveValue(Number(days) > 0 ? days : "");
  await page.close();
};

test("auto-close is off by default", async ({ tabs }) => {
  await tabs.setup("a ---{x} b c*");
  await tabs.closeStaleTabs(8);
  expect(await tabs.layout()).toBe("a ---{x} b c*");
});

test("closes tabs right of --- after the set number of days", async ({
  tabs,
  extensionContext,
  serviceWorker,
}) => {
  await setAutoCloseDays(extensionContext, serviceWorker, "7");
  await tabs.setup("a ---{x} b [c d] e*");
  await tabs.closeStaleTabs(6);
  expect(await tabs.layout()).toBe("a ---{x} b [c d] e*");
  await tabs.closeStaleTabs(8);
  expect(await tabs.layout()).toBe("a ---{x} e*");
});

test("auto-close never closes separator tabs", async ({
  tabs,
  extensionContext,
  serviceWorker,
}) => {
  await setAutoCloseDays(extensionContext, serviceWorker, "1");
  await tabs.setup("a ---{x} b —{y z} c*");
  await tabs.closeStaleTabs(2);
  expect(await tabs.layout()).toBe("a ---{x} —{y z} c*");
});

test("0 days turns auto-close off", async ({
  tabs,
  extensionContext,
  serviceWorker,
}) => {
  await setAutoCloseDays(extensionContext, serviceWorker, "0");
  await tabs.setup("a ---{x} b c*");
  await tabs.closeStaleTabs(1000);
  expect(await tabs.layout()).toBe("a ---{x} b c*");
});

test("closes nothing without a --- group", async ({
  tabs,
  extensionContext,
  serviceWorker,
}) => {
  await setAutoCloseDays(extensionContext, serviceWorker, "7");
  await tabs.setup("a [b] c*");
  await tabs.closeStaleTabs(8);
  expect(await tabs.layout()).toBe("a [b] c*");
});

test("creates only one separator", async ({ tabs }) => {
  await tabs.setup("a*");
  await tabs.run("new-tab-after-separator");
  await tabs.run("new-tab-after-separator");
  expect(await tabs.layout()).toBe("———{new} new* new a");
});

// Opens a background tab the way a link would, from the tab named `opener`,
// or from outside the window if there's none.
const openTab = async (tabs: Tabs, serviceWorker: Worker, opener?: string) => {
  const openerTabId = opener ? tabs.idOf(opener) : undefined;
  await serviceWorker.evaluate(async (openerTabId) => {
    await chrome.storage.sync.set({ openNewTabsAfterSeparator: true });
    await chrome.tabs.create({ url: "about:blank", openerTabId, active: false });
  }, openerTabId);
};

const newTabCases: [opener: string | undefined, before: string, after: string][] = [
  [undefined, "a* ---{x} b c", "a* ---{x} new b c"],
  ["a", "a* ---{x} b", "a* ---{x} new b"],
  ["a", "[a*] ---{x} b", "[a*] ---{x} new b"],
  ["b", "a ---{x} b* c", "a ---{x} b* c new"],
  [undefined, "a* b c", "a* b c new"],
];

for (const [opener, before, after] of newTabCases) {
  test(`new tab opened from ${opener ?? "outside"}: ${before} -> ${after}`, async ({
    tabs,
    serviceWorker,
  }) => {
    await tabs.setup(before);
    await openTab(tabs, serviceWorker, opener);
    await expect.poll(() => tabs.layout()).toBe(after);
    // Make sure it stays there, for the cases where nothing should move.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await tabs.layout()).toBe(after);
  });
}

test("new tabs aren't moved by default", async ({ tabs, serviceWorker }) => {
  await tabs.setup("a* ---{x} b");
  await serviceWorker.evaluate(() => chrome.tabs.create({ url: "about:blank", active: false }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(await tabs.layout()).toBe("a* ---{x} b new");
});

test("unknown commands throw", async ({ tabs }) => {
  await tabs.setup("a*");
  await expect(tabs.run("nope")).rejects.toThrow("unimplemented command: nope");
});
