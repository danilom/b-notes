const PIECES = 36;
const LASTS_MS = 1300;
/** Enough to fill the air above the button without reaching across his text. */
const FARTHEST_SIDEWAYS_PX = 190;
const HIGHEST_PX = 300;

const COLOURS = ['var(--chosen)', 'hsl(30 100% 50%)', 'hsl(145 45% 42%)', 'hsl(358 60% 52%)', 'hsl(48 95% 55%)'];

const between = (low: number, high: number): number => low + Math.random() * (high - low);

/**
 * A little burst from a button, for reaching the end of a long job.
 *
 * Plain elements and one CSS animation rather than a library or a canvas: he uses old
 * laptops, this happens for about a second, and it leaves nothing behind. It takes no
 * clicks, and where Windows is set to spare him animation it doesn't happen at all.
 *
 * @param container Where the pieces go: a modal's top layer shows only what is inside it.
 */
export function burstFrom(button: HTMLElement, container: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const from = button.getBoundingClientRect();
  const burst = document.createElement('div');
  burst.className = 'lektor-confetti';
  burst.setAttribute('aria-hidden', 'true');
  for (let at = 0; at < PIECES; at += 1) {
    const piece = document.createElement('span');
    piece.style.left = `${from.left + from.width / 2}px`;
    piece.style.top = `${from.top + from.height / 2}px`;
    piece.style.background = COLOURS[at % COLOURS.length] ?? '';
    piece.style.setProperty('--sideways', `${between(-FARTHEST_SIDEWAYS_PX, FARTHEST_SIDEWAYS_PX)}px`);
    piece.style.setProperty('--up', `${between(HIGHEST_PX * 0.4, HIGHEST_PX)}px`);
    piece.style.setProperty('--turn', `${between(-540, 540)}deg`);
    piece.style.animationDelay = `${between(0, 120)}ms`;
    burst.append(piece);
  }
  container.append(burst);
  setTimeout(() => burst.remove(), LASTS_MS + 200);
}
