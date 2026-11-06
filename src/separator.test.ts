import { test } from "node:test";
import assert from "node:assert/strict";
import { findSeparator, findStaleTabs, STALE_AFTER_MS } from "./separator.ts";

const UNGROUPED = -1;
const tabGroups = [
  { id: 1, title: "work" },
  { id: 2, title: "---" },
  { id: 3, title: "---" },
];

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

const now = 1_000_000_000_000;
const tab = (index: number, groupId: number, ageMs: number, extra = {}) => ({
  index,
  groupId,
  active: false,
  pinned: false,
  lastAccessed: now - ageMs,
  ...extra,
});
const old = STALE_AFTER_MS + 1;
const recent = STALE_AFTER_MS - 1;

test("findStaleTabs returns old tabs right of the separator", () => {
  const tabs = [
    tab(0, UNGROUPED, old), // left of the separator
    tab(1, 2, old), // in the separator
    tab(2, UNGROUPED, old),
    tab(3, UNGROUPED, recent),
    tab(4, 1, old), // grouped, still right of the separator
    tab(5, UNGROUPED, old, { active: true }),
    tab(6, UNGROUPED, old, { lastAccessed: undefined }),
  ];
  assert.deepEqual(
    findStaleTabs(tabs, tabGroups, now).map((tab) => tab.index),
    [2, 4]
  );
});

test("findStaleTabs closes nothing without a separator", () => {
  const tabs = [tab(0, UNGROUPED, old), tab(1, 1, old)];
  assert.deepEqual(findStaleTabs(tabs, tabGroups, now), []);
});
