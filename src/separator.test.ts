import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findSeparator,
  findStaleTabs,
  isSeparator,
  NEW_SEPARATOR_TITLE,
  shouldMoveNewTab,
} from "./separator.ts";

const UNGROUPED = -1;
const tabGroups = [
  { id: 1, title: "work" },
  { id: 2, title: "---" },
  { id: 3, title: "—" },
];

test("isSeparator accepts titles made only of dashes", () => {
  for (const title of ["-", "---", "—", "–—", "―――", "−−−", " --- ", NEW_SEPARATOR_TITLE]) {
    assert.equal(isSeparator({ title }), true, title);
  }
  for (const title of [undefined, "", "a-", "--x", "___", "..."]) {
    assert.equal(isSeparator({ title }), false, String(title));
  }
});

test("findSeparator returns the leftmost --- group", () => {
  const tabs = [
    { index: 0, groupId: 1 },
    { index: 1, groupId: 2 },
    { index: 2, groupId: 2 },
    { index: 3, groupId: UNGROUPED },
    { index: 4, groupId: 3 },
  ];
  assert.deepEqual(findSeparator(tabs, tabGroups), {
    groupId: 2,
    start: 1,
    end: 2,
  });
});

test("findSeparator ignores --- groups in other windows", () => {
  // Group 2 exists, but none of these tabs are in it.
  const tabs = [{ index: 0, groupId: UNGROUPED }];
  assert.equal(findSeparator(tabs, tabGroups), undefined);
});

test("shouldMoveNewTab moves tabs opened from outside or left of ---", () => {
  // pinned | a | --- | b | new
  const tabs: {
    id: number;
    index: number;
    groupId: number;
    pinned: boolean;
    openerTabId?: number;
  }[] = [
    { id: 10, index: 0, groupId: UNGROUPED, pinned: true },
    { id: 11, index: 1, groupId: UNGROUPED, pinned: false },
    { id: 12, index: 2, groupId: 2, pinned: false },
    { id: 13, index: 3, groupId: UNGROUPED, pinned: false },
  ];
  const opened = (openerTabId?: number, extra = {}) => {
    const tab = { id: 99, index: 4, groupId: UNGROUPED, pinned: false, openerTabId, ...extra };
    return shouldMoveNewTab(tab, [...tabs, tab], tabGroups);
  };
  assert.equal(opened(undefined), true, "no opener");
  assert.equal(opened(42), true, "opener in another window");
  assert.equal(opened(10), true, "opened from a pinned tab");
  assert.equal(opened(11), true, "opened from left of ---");
  assert.equal(opened(12), true, "opened from the --- group");
  assert.equal(opened(13), false, "opened from right of ---");
  assert.equal(opened(undefined, { pinned: true }), false, "new tab is pinned");
  assert.equal(opened(undefined, { index: 3 }), false, "already right after ---");
});

test("shouldMoveNewTab moves links from other apps, which Chrome gives the active tab as opener", () => {
  // --- | b | d | c, where d was opened from b, and b is active.
  const before = [
    { id: 12, groupId: 2 },
    { id: 13, groupId: UNGROUPED },
    { id: 15, groupId: UNGROUPED, openerTabId: 13 },
    { id: 14, groupId: UNGROUPED },
  ];
  // Inserts a new tab opened "from b" at `index` and checks whether it moves.
  const opened = (index: number) => {
    const tab = { id: 99, groupId: UNGROUPED, openerTabId: 13 };
    const tabs = [...before.slice(0, index), tab, ...before.slice(index)].map(
      (other, i) => ({ pinned: false, ...other, index: i })
    );
    return shouldMoveNewTab(tabs[index], tabs, tabGroups);
  };
  assert.equal(opened(2), false, "right after b: a link clicked in b");
  assert.equal(opened(3), false, "after b's other child d: a link clicked in b");
  assert.equal(opened(4), true, "at the end, past c: a link from another app");
});

test("shouldMoveNewTab guesses from active when the opener is the last tab", () => {
  // --- | b, then a tab opened "from b" at the end.
  const tabs = (active: boolean) => [
    { id: 12, index: 0, groupId: 2, pinned: false },
    { id: 13, index: 1, groupId: UNGROUPED, pinned: false },
    { id: 99, index: 2, groupId: UNGROUPED, pinned: false, openerTabId: 13, active },
  ];
  const move = (active: boolean) =>
    shouldMoveNewTab(tabs(active)[2], tabs(active), tabGroups);
  assert.equal(move(true), true, "in front: probably from another app");
  assert.equal(move(false), false, "in the background: a ⌘-clicked link in b");
});

test("shouldMoveNewTab does nothing without a separator", () => {
  const tab = { id: 1, index: 0, groupId: UNGROUPED, pinned: false };
  assert.equal(shouldMoveNewTab(tab, [tab], tabGroups), false);
});

const now = 1_000_000_000_000;
const tab = (index: number, groupId: number, ageMs: number, extra = {}) => ({
  index,
  groupId,
  active: false,
  pinned: false,
  lastAccessed: now - ageMs,
  ...extra,
});
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const old = MAX_AGE + 1;
const recent = MAX_AGE - 1;

test("findStaleTabs returns old tabs right of the separator", () => {
  const tabs = [
    tab(0, UNGROUPED, old), // left of the separator
    tab(1, 2, old), // in the separator
    tab(2, UNGROUPED, old),
    tab(3, UNGROUPED, recent),
    tab(4, 1, old), // grouped, still right of the separator
    tab(5, UNGROUPED, old, { active: true }),
    tab(6, UNGROUPED, old, { lastAccessed: undefined }),
    tab(7, 3, old), // in a second separator
  ];
  assert.deepEqual(
    findStaleTabs(tabs, tabGroups, now, MAX_AGE).map((tab) => tab.index),
    [2, 4]
  );
});

test("findStaleTabs closes nothing without a separator", () => {
  const tabs = [tab(0, UNGROUPED, old), tab(1, 1, old)];
  assert.deepEqual(findStaleTabs(tabs, tabGroups, now, MAX_AGE), []);
});
