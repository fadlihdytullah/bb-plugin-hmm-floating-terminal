import assert from "node:assert/strict";
import { test } from "node:test";
import { clampSize, defaultSize, MIN_SIZE, maxSize } from "./frame.ts";

test("default size is 75% of the preferred box on a roomy viewport", () => {
  assert.deepEqual(defaultSize(1920, 1200), { width: 570, height: 480 });
});

test("default size follows a small viewport instead of the preferred box", () => {
  assert.deepEqual(defaultSize(600, 500), { width: 426, height: 351 });
});

test("clamping floors at the minimum and ceilings at 90% of the viewport", () => {
  assert.deepEqual(clampSize({ width: 10, height: 10 }, 1920, 1200), MIN_SIZE);
  assert.deepEqual(clampSize({ width: 9999, height: 9999 }, 1000, 800), {
    width: 900,
    height: 720,
  });
});

test("a viewport smaller than the minimum still yields a usable box", () => {
  const size = clampSize({ width: 800, height: 600 }, 200, 150);
  assert.deepEqual(size, MIN_SIZE);
  assert.deepEqual(maxSize(200, 150), MIN_SIZE);
});
