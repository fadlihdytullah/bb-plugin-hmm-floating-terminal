// Geometry for the floating terminal window.
//
// The window is anchored to the bottom-right corner, so its resize grip sits in
// the top-left one: a drag away from the anchor is a size change, never a move.
// Every bound lives here because the same clamp applies to the initial size, a
// viewport resize, and a drag in progress.

export type Size = { width: number; height: number };

/** Under this a prompt wraps into unreadable stubs. */
export const MIN_SIZE: Size = { width: 360, height: 220 };

/** Maximized still leaves the host's own chrome visible around the window. */
const MAX_FRACTION = 0.9;

/** Comfortable default before the viewport has a say. */
const PREFERRED: Size = { width: 760, height: 640 };

/** Space kept between the window and the viewport edges. */
const GUTTER = 32;

const DEFAULT_FRACTION = 0.75;

export function maxSize(viewportWidth: number, viewportHeight: number): Size {
  return {
    width: Math.max(MIN_SIZE.width, Math.round(viewportWidth * MAX_FRACTION)),
    height: Math.max(MIN_SIZE.height, Math.round(viewportHeight * MAX_FRACTION)),
  };
}

export function clampSize(
  size: Size,
  viewportWidth: number,
  viewportHeight: number,
): Size {
  const max = maxSize(viewportWidth, viewportHeight);
  return {
    width: Math.min(Math.max(Math.round(size.width), MIN_SIZE.width), max.width),
    height: Math.min(
      Math.max(Math.round(size.height), MIN_SIZE.height),
      max.height,
    ),
  };
}

export function defaultSize(
  viewportWidth: number,
  viewportHeight: number,
): Size {
  return clampSize(
    {
      width: Math.min(PREFERRED.width, viewportWidth - GUTTER) * DEFAULT_FRACTION,
      height:
        Math.min(PREFERRED.height, viewportHeight - GUTTER) * DEFAULT_FRACTION,
    },
    viewportWidth,
    viewportHeight,
  );
}
