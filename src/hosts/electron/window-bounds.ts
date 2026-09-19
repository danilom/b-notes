/**
 * Keeping the window on the desk.
 *
 * Plain rectangles and no Electron, so the arithmetic can be checked without a
 * screen: what can be wrong here is the sums, not the wiring.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How far over an edge the window may hang.
 *
 * Not zero, on purpose. Windows gives a maximised or snapped window bounds a
 * few pixels wider than the work area — the border overhangs it — and a rule
 * with no give in it would fight that every time he snapped the window to a
 * side. A few tens of pixels is invisible to him and leaves all of that alone.
 */
const SLACK = 32;

/** The whole desk: every screen he has, as one rectangle. */
export function deskAround(areas: readonly Rect[]): Rect {
  const first = areas[0];
  if (first === undefined) return { x: 0, y: 0, width: 0, height: 0 };

  const left = Math.min(...areas.map((area) => area.x));
  const top = Math.min(...areas.map((area) => area.y));
  const right = Math.max(...areas.map((area) => area.x + area.width));
  const bottom = Math.max(...areas.map((area) => area.y + area.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Slides a value back into a range, and to its start when it cannot fit. */
const into = (value: number, from: number, to: number): number =>
  Math.max(from, Math.min(value, Math.max(from, to)));

/**
 * Where the window is allowed to be, if where it is going is off the desk.
 *
 * Null when it is fine, which is almost always — so nothing argues with him
 * about where he likes his window, and moving between two screens is a move
 * across the desk rather than a move off one of them.
 *
 * It stops at the edge rather than being brought home from beyond it: he
 * should find the window will not go there, not watch it jump back from where
 * he put it.
 */
export function keptOnTheDesk(window: Rect, desk: Rect): Rect | null {
  const x = into(window.x, desk.x - SLACK, desk.x + desk.width + SLACK - window.width);
  const y = into(window.y, desk.y - SLACK, desk.y + desk.height + SLACK - window.height);
  if (x === window.x && y === window.y) return null;

  return { x, y, width: window.width, height: window.height };
}
