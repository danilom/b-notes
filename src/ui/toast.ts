/**
 * A line that floats over his writing for a moment and then goes.
 *
 * For the one kind of thing the status line is wrong for. That line reports a
 * *state* — `Sačuvano 2019` is how things are, and it is true until it isn't.
 * This reports an *event*: something happened, it is finished, and there will
 * be nothing to see about it a minute from now.
 *
 * Copying to the clipboard is the strongest case in the app, and the reason
 * this exists: nothing on screen changes at all when it works, so a grey line
 * in the corner is the difference between a button he trusts and one he
 * presses four times.
 *
 * Successes only. A failure must never float away — `Tekst nije sačuvan` has
 * to stay in front of him until it is resolved, because trouble he did not
 * happen to be looking at is trouble he never knew about.
 */

/** Long enough to read twice without hurrying, for a message of two lines. */
const STAYS = 6000;

/**
 * How the one on screen is taken down, if there is one.
 *
 * Module-wide rather than held inside each call, because two of them must
 * never be running at once: the second message would be carried off by the
 * first one's timer, part way through its own few seconds.
 */
let takeDown: (() => void) | null = null;

/**
 * Says something once, over whatever he is looking at.
 *
 * It goes on its own after a while, and sooner if he does anything at all:
 * the moment he is typing or clicking again he has moved on, and a message
 * about what he did before is in the way rather than in hand.
 */
export function flashToast(element: HTMLElement, said: string, how: string): void {
  takeDown?.();

  const loud = document.createElement('strong');
  loud.textContent = said;
  const quiet = document.createElement('span');
  quiet.textContent = how;
  element.replaceChildren(loud, quiet);

  element.hidden = false;
  /*
    Asking for a measurement, purely so the browser settles the element where
    it is before the class lands. Without it both changes are dealt with in one
    go, there is no state to fade from, and the block simply appears.
  */
  void element.offsetHeight;
  element.classList.add('up');

  const hide = (): void => {
    clearTimeout(timer);
    element.classList.remove('up');
    element.hidden = true;
    document.removeEventListener('pointerdown', hide, true);
    document.removeEventListener('keydown', hide, true);
    if (takeDown === hide) takeDown = null;
  };
  const timer = setTimeout(hide, STAYS);
  takeDown = hide;

  // Captured, so a click on something that stops the event still puts this
  // away. It is a message, not a control, and it never swallows the click.
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
}
