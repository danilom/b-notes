/**
 * Where to scroll a diff so one change is in front of him.
 *
 * Not at the very top of the view. A paragraph arriving hard against the top
 * edge reads as the start of something, and these never are — what he needs to
 * see is that the marked block sits inside his text, which means seeing some of
 * the text above it.
 */
export interface Change {
  /** How far down the scrolling box the change begins. */
  top: number;
  height: number;
}

export interface View {
  height: number;
  /** How far the box can scroll: its content height less its own. */
  scrollable: number;
}

/** How much of the view to leave above a change that fits under it. */
const ROOM_ABOVE = 0.4;
/** And above one that does not, where the room costs him the change itself. */
const ROOM_WHEN_TALL = 0.12;

export function scrollShowing(change: Change, view: View): number {
  const fits = change.height <= view.height * (1 - ROOM_ABOVE);
  const above = view.height * (fits ? ROOM_ABOVE : ROOM_WHEN_TALL);

  return Math.max(0, Math.min(change.top - above, view.scrollable));
}
