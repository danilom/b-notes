import { icon } from './icons.ts';

/**
 * The little arrows at the ends of a scrollbar, drawn ourselves.
 *
 * Windows had these for most of the years he has been using one, and they ask
 * less of him than dragging a thumb that is eleven pixels tall does. Chromium
 * can draw its own — `::-webkit-scrollbar-button` — but only under conditions I
 * could not pin down: it needs an opaque background before it is given any room
 * at all, it ignores a background image, and the same rule that worked scoped to
 * one element did nothing written for all of them. These are ordinary buttons
 * sitting over the ends of the bar instead, which behave the way everything
 * else in the app behaves and can be styled without guessing.
 */

/** How far one press moves it: about two lines, so a press is a small step. */
const STEP = 48;
/** While he holds it down. Slow enough to be steerable, quick enough to travel. */
const REPEAT_MS = 60;

export interface ScrollArrows {
  /** Shows or hides them, depending on whether there is anywhere to go. */
  update: () => void;
}

function arrow(
  scroller: HTMLElement,
  direction: 1 | -1,
  name: string,
  mark: 'previous' | 'next',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className =
    direction === -1 ? 'scroll-arrow scroll-arrow-up' : 'scroll-arrow scroll-arrow-down';
  button.title = name;
  button.setAttribute('aria-label', name);
  button.setAttribute('tabindex', '-1');
  button.append(icon(mark));

  let repeating: ReturnType<typeof setInterval> | undefined;
  const stop = (): void => {
    clearInterval(repeating);
    repeating = undefined;
  };

  button.addEventListener('mousedown', (event) => {
    // Leaves the pen in his hand: pressing this must not take the cursor out of
    // whatever he was typing in.
    event.preventDefault();
    scroller.scrollTop += STEP * direction;
    stop();
    repeating = setInterval(() => {
      scroller.scrollTop += STEP * direction;
    }, REPEAT_MS);
  });

  for (const ending of ['mouseup', 'mouseleave', 'blur'] as const) {
    button.addEventListener(ending, stop);
  }
  window.addEventListener('mouseup', stop);

  return button;
}

/**
 * Puts a pair of arrows over the ends of one scroller's bar.
 *
 * `over` has to be a positioned box that the scroller fills, since that is what
 * the arrows are placed against.
 */
export function addScrollArrows(
  scroller: HTMLElement,
  over: HTMLElement,
  names: { up: string; down: string },
): ScrollArrows {
  const up = arrow(scroller, -1, names.up, 'previous');
  const down = arrow(scroller, 1, names.down, 'next');
  over.append(up, down);

  const update = (): void => {
    // Nothing to scroll means no bar, and an arrow with no bar under it is a
    // mark floating over his writing.
    const somewhereToGo = scroller.scrollHeight > scroller.clientHeight + 1;
    up.hidden = !somewhereToGo;
    down.hidden = !somewhereToGo;
  };

  scroller.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  update();

  return { update };
}
