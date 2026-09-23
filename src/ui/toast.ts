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
 * Says something once, over whatever he is looking at.
 *
 * It goes on its own after a while, and sooner if he does anything at all:
 * the moment he is typing or clicking again he has moved on, and a message
 * about what he did before is in the way rather than in hand.
 */
export function flashToast(element: HTMLElement, said: string, how: string): void {
  const loud = document.createElement('strong');
  loud.textContent = said;
  const quiet = document.createElement('span');
  quiet.textContent = how;
  element.replaceChildren(loud, quiet);
  element.hidden = false;

  let hide = (): void => {};
  const timer = setTimeout(() => {
    hide();
  }, STAYS);

  hide = (): void => {
    clearTimeout(timer);
    element.hidden = true;
    document.removeEventListener('pointerdown', hide, true);
    document.removeEventListener('keydown', hide, true);
    // Nothing left to do on a second call, and there will be one: the timer
    // and his next keystroke both end up here.
    hide = (): void => {};
  };

  // Captured, so a click on something that stops the event still puts this
  // away. It is a message, not a control, and it never swallows the click.
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
}
