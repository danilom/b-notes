/**
 * Keeping the window somewhere he can reach it.
 *
 * Plain rectangles and no Electron, so the arithmetic can be checked without a
 * screen: the part that can be wrong here is the sums, not the wiring.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How much of the window has to stay on the desk before it counts as lost.
 *
 * Generous on purpose. This is not here to keep the window tidy — dragging it
 * half off the side is his business — it is here for the case where he has
 * dragged it so far that there is nothing left to take hold of.
 */
const MUST_REMAIN = { width: 220, height: 90 };

const overlap = (from: number, to: number, within: number, size: number): number =>
  Math.min(to, within + size) - Math.max(from, within);

/** Slides a value back into a range, and to its start when it cannot fit. */
const into = (value: number, from: number, span: number, size: number): number =>
  Math.max(from, Math.min(value, from + span - size));

/**
 * Where the window should be, if where it is has put it out of his reach.
 *
 * Null when it is fine, which is almost always — so the caller does nothing at
 * all in the ordinary case and there is no argument with him about where he
 * likes his window.
 *
 * When it is not fine it comes all the way back rather than just far enough to
 * grab: he is not trying to keep it mostly off the screen, and a window he can
 * see the whole of is the one he was expecting.
 */
export function pulledBackOnScreen(window: Rect, workArea: Rect): Rect | null {
  const across = overlap(window.x, window.x + window.width, workArea.x, workArea.width);
  const down = overlap(window.y, window.y + window.height, workArea.y, workArea.height);
  if (across >= MUST_REMAIN.width && down >= MUST_REMAIN.height) return null;

  return {
    x: into(window.x, workArea.x, workArea.width, window.width),
    y: into(window.y, workArea.y, workArea.height, window.height),
    width: window.width,
    height: window.height,
  };
}
