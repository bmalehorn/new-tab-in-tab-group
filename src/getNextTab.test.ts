import { test } from "node:test";
import assert from "node:assert/strict";
import { getNextTab } from "./getNextTab.ts";

const UNGROUPED = -1;
const tab = (name: string, groupId = UNGROUPED) => ({ name, groupId });

// a | [b c] (group 1, expanded) | [d e] (group 2, collapsed) | f
const tabs = [tab("a"), tab("b", 1), tab("c", 1), tab("d", 2), tab("e", 2), tab("f")];
const tabGroups = [
  { id: 1, collapsed: false },
  { id: 2, collapsed: true },
];

const next = (currentIndex: number, direction: number) => {
  const { nextTab, skipped } = getNextTab(tabs, tabGroups, currentIndex, direction);
  return { name: nextTab?.name, skipped };
};

test("moves to the adjacent tab", () => {
  assert.deepEqual(next(1, 1), { name: "c", skipped: false });
  assert.deepEqual(next(2, -1), { name: "b", skipped: false });
});

test("enters expanded groups", () => {
  assert.deepEqual(next(0, 1), { name: "b", skipped: false });
});

test("skips collapsed groups", () => {
  assert.deepEqual(next(2, 1), { name: "f", skipped: true });
  assert.deepEqual(next(5, -1), { name: "c", skipped: true });
});

test("returns no tab at the edges", () => {
  assert.deepEqual(next(0, -1), { name: undefined, skipped: false });
  assert.deepEqual(next(5, 1), { name: undefined, skipped: false });
});

test("reports skipped when only collapsed tabs remain", () => {
  const allCollapsed = [tab("a"), tab("b", 2), tab("c", 2)];
  const { nextTab, skipped } = getNextTab(allCollapsed, tabGroups, 0, 1);
  assert.equal(nextTab, undefined);
  assert.equal(skipped, true);
});
