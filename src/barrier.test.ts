import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findBarrier,
  findStaleTabs,
  isBarrier,
  NEW_BARRIER_TITLE,
  shouldMoveNewTab,
} from "./barrier.ts";

const UNGROUPED = -1;
const tabGroups = [
  { id: 1, title: "work" },
  { id: 2, title: "---" },
  { id: 3, title: "—" },
];

test("isBarrier accepts titles made only of dashes", () => {
  for (const title of ["-", "---", "—", "–—", "―――", "−−−", " --- ", NEW_BARRIER_TITLE]) {
    assert.equal(isBarrier({ title }), true, title);
  }
  for (const title of [undefined, "", "a-", "--x", "___", "..."]) {
    assert.equal(isBarrier({ title }), false, String(title));
  }
});

test("findBarrier returns the leftmost --- group", () => {
  const tabs = [
    { index: 0, groupId: 1 },
    { index: 1, groupId: 2 },
    { index: 2, groupId: 2 },
    { index: 3, groupId: UNGROUPED },
    { index: 4, groupId: 3 },
  ];
  assert.deepEqual(findBarrier(tabs, tabGroups), {
    groupId: 2,
    start: 1,
    end: 2,
  });
});

test("findBarrier ignores --- groups in other windows", () => {
  // Group 2 exists, but none of these tabs are in it.
  const tabs = [{ index: 0, groupId: UNGROUPED }];
  assert.equal(findBarrier(tabs, tabGroups), undefined);
});

test("shouldMoveNewTab moves tabs that land in or right of the barrier, or come from pinned tabs", () => {
  // pinned | a | b | --- | c
  const tabs: {
    id: number;
    index: number;
    groupId: number;
    pinned: boolean;
    openerTabId?: number;
  }[] = [
    { id: 10, index: 0, groupId: UNGROUPED, pinned: true },
    { id: 11, index: 1, groupId: UNGROUPED, pinned: false },
    { id: 12, index: 2, groupId: UNGROUPED, pinned: false },
    { id: 13, index: 3, groupId: 2, pinned: false },
    { id: 14, index: 4, groupId: UNGROUPED, pinned: false },
  ];
  // Inserts a new tab at `index` and checks whether it moves.
  const opened = (index: number, openerTabId?: number, extra = {}) => {
    const tab = { id: 99, groupId: UNGROUPED, pinned: false, openerTabId, ...extra };
    const all = [...tabs.slice(0, index), tab, ...tabs.slice(index)].map(
      (other, i) => ({ ...other, index: i })
    );
    return shouldMoveNewTab(all[index], all, tabGroups);
  };
  assert.equal(opened(5, undefined), true, "at the end: another app, window, or the + button");
  assert.equal(opened(5, 11), true, "at the end, with a regular tab as opener: another app");
  assert.equal(opened(5, 14), true, "next to sticky tab c: a link clicked in c");
  assert.equal(opened(4, 13, { groupId: 2 }), true, "in the barrier");
  assert.equal(opened(1, 10), true, "right after the pinned tabs: a link in a pinned tab");
  assert.equal(opened(2, 11), false, "next to regular tab a: a link clicked in a");
  assert.equal(opened(1, undefined), false, "left of the barrier, no opener");
  assert.equal(opened(3, 10), false, "already just left of the barrier");
  assert.equal(opened(5, undefined, { pinned: true }), false, "new tab is pinned");
});

test("shouldMoveNewTab does nothing without a barrier", () => {
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

test("findStaleTabs returns old regular tabs", () => {
  const tabs = [
    tab(0, UNGROUPED, old, { pinned: true }),
    tab(1, UNGROUPED, old),
    tab(2, UNGROUPED, recent),
    tab(3, 1, old), // grouped, still regular
    tab(4, UNGROUPED, old, { active: true }),
    tab(5, UNGROUPED, old, { lastAccessed: undefined }),
    tab(6, 2, old), // in the barrier
    tab(7, UNGROUPED, old), // sticky
    tab(8, 3, old), // in a second barrier
  ];
  assert.deepEqual(
    findStaleTabs(tabs, tabGroups, now, MAX_AGE).map((tab) => tab.index),
    [1, 3]
  );
});

test("findStaleTabs closes nothing without a barrier", () => {
  const tabs = [tab(0, UNGROUPED, old), tab(1, 1, old)];
  assert.deepEqual(findStaleTabs(tabs, tabGroups, now, MAX_AGE), []);
});
