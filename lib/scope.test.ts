import assert from "node:assert/strict";
import test from "node:test";
import { resolveScope, type Tab } from "./scope.ts";

const tab = (terminalId: string): Tab => ({
  terminalId,
  label: terminalId,
  cwd: "/tmp",
});

const loaded = { scope: "proj_a", tabs: [tab("t1"), tab("t2")] };

test("a scope with no loaded tabs shows nothing", () => {
  assert.deepEqual(resolveScope(null, "proj_a", undefined), {
    tabs: [],
    activeId: null,
  });
});

test("tabs loaded for another project never leak into this one", () => {
  const view = resolveScope(loaded, "proj_b", "t2");
  assert.deepEqual(view.tabs, []);
  assert.equal(view.activeId, null);
});

test("the remembered tab wins when the project still has it", () => {
  assert.equal(resolveScope(loaded, "proj_a", "t2").activeId, "t2");
});

test("a remembered tab that is gone falls back to the first", () => {
  assert.equal(resolveScope(loaded, "proj_a", "closed").activeId, "t1");
});

test("no memory for this project selects the first tab", () => {
  assert.equal(resolveScope(loaded, "proj_a", undefined).activeId, "t1");
});
