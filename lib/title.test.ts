import assert from "node:assert/strict";
import test from "node:test";
import { labelOf, TITLE, titleFor } from "./title.ts";

test("default title becomes Terminal n", () => {
  assert.equal(labelOf(`${TITLE} 3`), "Terminal 3");
});

test("custom name round-trips and stays owned", () => {
  const title = titleFor("api server");
  assert.ok(title.startsWith(TITLE));
  assert.equal(labelOf(title), "api server");
});

test("foreign title is untouched", () => {
  assert.equal(labelOf("zsh"), "zsh");
});
