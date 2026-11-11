/**
 * The band the change bar stands on: a shaded strip opened between the line the bar is for
 * and the line above, with the bar inside it. The two are one thing, so they cannot part:
 * the band is in the text and scrolls with it, and the bar goes wherever the band does.
 *
 * The text flows, so there is no line to give a margin to. Instead an empty block goes in at
 * the place the line starts on screen: the line above ends where it ended, the line itself
 * starts with the same word at the same width, and so every line wraps as it did, only lower.
 * Each line keeps its own spacing; the band is the space added. The box scrolls by as much,
 * so the line he clicked stays under the pointer and what moves is what was above it.
 */

const BAND_CLASS = 'diff-bar-band';

/** How much shorter the band is than the bar, at top and bottom alike: a little, so the bar stands on it. */
const SHORTER_THAN_BAR_PX = 3;

/** A place in the text: before the character at `offset` in `node`. */
interface TextPlace {
  node: Text;
  offset: number;
}

/** Where a character is drawn, or nothing for one not drawn, such as a space collapsed away. */
function characterRect(node: Text, offset: number): DOMRect | null {
  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, offset + 1);
  const rect = range.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

/** The text before `over` in the box, last first. */
function textBefore(box: HTMLElement, over: Element): Text[] {
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text) || over.contains(node)) continue;
    if (node.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING) found.push(node);
  }
  return found.reverse();
}

/**
 * Where the line `over` is on starts, and whether there is a line above it. Going back a
 * character at a time, the first one drawn higher up is the end of the line above.
 */
function lineStart(box: HTMLElement, over: Element, lineTop: number): { start: TextPlace | null; isFirstLine: boolean } {
  let start: TextPlace | null = null;
  for (const node of textBefore(box, over)) {
    for (let offset = node.length - 1; offset >= 0; offset -= 1) {
      if (/\s/.test(node.data.charAt(offset))) continue;
      const rect = characterRect(node, offset);
      if (rect === null) continue;
      if (rect.bottom <= lineTop + 1) return { start, isFirstLine: false };
      start = { node, offset };
    }
  }
  return { start, isFirstLine: true };
}

/** How the band opens and closes: at once, or over `ms`, with something to do after each step. */
export interface BandMotion {
  ms?: number;
  /** Lines moved: what is placed beside them goes again. */
  onStep?: () => void;
}

/** The next step of each band moving now, and its sure end, to be cancelled if it is moved again. */
const moving = new WeakMap<HTMLElement, { step: number; end: ReturnType<typeof setTimeout> }>();

/** Past the motion's time, the end comes by a timer: where frames are held back, as for a window out of sight, it would never come. */
const SURE_END_SLACK_MS = 60;

/**
 * Sets the band's height, and scrolls the box by as much as that changed, where the band was
 * made to scroll it: so the line under it stays where it is and what is above moves.
 */
function setBandHeight(box: HTMLElement, band: HTMLElement, height: number): void {
  const before = Number.parseFloat(band.style.height) || 0;
  band.style.height = `${height}px`;
  if (band.dataset['inPadding'] === 'true') band.style.marginTop = `-${height}px`;
  if (band.dataset['scrolls'] === 'true') box.scrollTop += height - before;
}

/** From its height now to `to`, over `ms`, slowing at the end; at once where `ms` is nothing. */
function moveBand(box: HTMLElement, band: HTMLElement, to: number, { ms = 0, onStep }: BandMotion, done?: () => void): void {
  const before = moving.get(band);
  if (before !== undefined) {
    cancelAnimationFrame(before.step);
    clearTimeout(before.end);
  }
  const from = Number.parseFloat(band.style.height) || 0;
  const startedAt = performance.now();
  const frame = (now: number): void => {
    const share = ms <= 0 ? 1 : Math.min(1, (now - startedAt) / ms);
    const eased = 1 - (1 - share) ** 3;
    setBandHeight(box, band, from + (to - from) * eased);
    onStep?.();
    const going = moving.get(band);
    if (share < 1 && going !== undefined) {
      going.step = requestAnimationFrame(frame);
      return;
    }
    if (going !== undefined) {
      cancelAnimationFrame(going.step);
      clearTimeout(going.end);
    }
    moving.delete(band);
    done?.();
  };
  // The first step at once, which asks for the next: one chain of frames, and the timer behind it.
  if (ms > 0) moving.set(band, { step: 0, end: setTimeout(() => frame(startedAt + ms), ms + SURE_END_SLACK_MS) });
  frame(startedAt);
}

/**
 * Takes the band out, and gives back the scroll it took, at once or shrinking over the motion's
 * time. The bar goes back to `home`, hidden, at once.
 */
export function closeBarBand(box: HTMLElement, bar: HTMLElement, home: HTMLElement, motion: BandMotion = {}): void {
  for (const band of box.querySelectorAll<HTMLElement>(`.${BAND_CLASS}`)) {
    if (band.contains(bar)) {
      bar.hidden = true;
      // Back to being placed from the top, as it is outside a band.
      bar.style.bottom = '';
      home.append(bar);
    }
    if (band.dataset['closing'] === 'true') continue;
    band.dataset['closing'] = 'true';
    moveBand(box, band, 0, motion, () => {
      const parent = band.parentNode;
      band.remove();
      parent?.normalize();
    });
  }
}

/**
 * Opens the band above the line `over` is on, as tall as the bar less a little, and puts the
 * bar in it, centred on it. Any band already open closes first.
 *
 * On the first line the box's own padding is the room already, so the band is drawn there,
 * pulled up by as much as it is tall: it takes no space and the line does not move.
 *
 * Over the motion's time the band grows from nothing, the box scrolling with it, while the bar
 * stands where it ends up from the start: it hangs from the band's bottom, which stays at the line.
 *
 * @param home Where the bar goes back to when the band closes.
 * @param options.mayDrawInPadding False where the padding is taken, by the stepper with no
 *   room beside it: the first line then gets a band of its own, below the padding.
 * @returns The band, or null where `over` is not drawn.
 */
export function openBarBand(
  box: HTMLElement,
  over: Element,
  bar: HTMLElement,
  home: HTMLElement,
  { mayDrawInPadding = true, ...motion }: { mayDrawInPadding?: boolean } & BandMotion = {},
): HTMLElement | null {
  closeBarBand(box, bar, home, motion);
  const line = over.getClientRects()[0];
  if (line === undefined) return null;
  const { start, isFirstLine } = lineStart(box, over, line.top);

  bar.hidden = false;
  const height = Math.max(0, Math.round(bar.offsetHeight - 2 * SHORTER_THAN_BAR_PX));
  // A span made a block: it may go in among the spans of the text.
  const band = document.createElement('span');
  band.className = BAND_CLASS;
  band.style.height = '0px';
  if (isFirstLine && mayDrawInPadding) band.dataset['inPadding'] = 'true';
  // Not on the first line: scrolled back, its band would go up under the stepper it was moved to clear.
  if (!isFirstLine) band.dataset['scrolls'] = 'true';
  if (start === null) over.before(band);
  else placeBefore(start, band);
  bar.style.top = '';
  bar.style.bottom = `-${SHORTER_THAN_BAR_PX}px`;
  band.append(bar);
  reachToTheEdges(box, band);
  moveBand(box, band, height, motion);
  return band;
}

/**
 * How far the band's shading reaches past it on either side, to the edges of the box: exactly
 * that far, since anything past them would make the box scroll sideways.
 */
function reachToTheEdges(box: HTMLElement, band: HTMLElement): void {
  const [inside, own] = [box.getBoundingClientRect(), band.getBoundingClientRect()];
  const left = inside.left + box.clientLeft;
  // Rounded down: a fraction of a pixel over the edge brought up a sideways scrollbar.
  band.style.setProperty('--reach-left', `${Math.floor(own.left - left)}px`);
  band.style.setProperty('--reach-right', `${Math.floor(left + box.clientWidth - own.right)}px`);
}

const JOIN = '--band-join';

/**
 * How far above its words a change must reach to the top of its line: the line's own spacing,
 * which is where a band's bottom is when one is open. Set on the box, for a look that draws the
 * current change on the band's grey, reaching up that far, with a band or without one.
 *
 * Read with a marker of no height put in where the line starts, which, being a block, sits
 * exactly between that line and the one above and moves nothing; then taken out.
 */
export function measureJoin(box: HTMLElement, change: Element): void {
  // Taken off first: a reach set before is in the measure, as the top of the change's padding.
  box.style.removeProperty(JOIN);
  const words = change.getClientRects()[0];
  if (words === undefined) return;
  const { start } = lineStart(box, change, words.top);
  const marker = document.createElement('span');
  marker.style.display = 'block';
  if (start === null) change.before(marker);
  else placeBefore(start, marker);
  const lineTop = marker.getBoundingClientRect().top;
  const parent = marker.parentNode;
  marker.remove();
  parent?.normalize();
  box.style.setProperty(JOIN, `${Math.max(0, words.top - lineTop)}px`);
}

/** Whether this is the first line's band, drawn in the box's padding and taking no space. */
export const isDrawnInPadding = (band: HTMLElement): boolean => band.dataset['inPadding'] === 'true';

/**
 * The bar along its band: from `wantedLeft` on the screen, kept inside the box.
 */
export function seatBarAt(box: HTMLElement, band: HTMLElement, bar: HTMLElement, wantedLeft: number): void {
  const bandLeft = band.getBoundingClientRect().left;
  const boxLeft = box.getBoundingClientRect().left + box.clientLeft;
  const lowest = boxLeft - bandLeft;
  // A pixel in from the edge: right up against it, a fraction over made the box scroll sideways.
  const highest = Math.floor(lowest + box.clientWidth - bar.getBoundingClientRect().width) - 1;
  bar.style.left = `${Math.max(lowest, Math.min(wantedLeft - bandLeft, highest))}px`;
}

/**
 * Before the line's first character, and outside any box that character begins: a line
 * starting with another change gets the band above that change, not inside its marks.
 */
function placeBefore({ node, offset }: TextPlace, band: HTMLElement): void {
  // The spaces before stay at the end of the line above, where the text's kept spacing hangs them.
  let outermost: Node = offset > 0 ? node.splitText(offset) : node;
  while (outermost.parentElement !== null && !outermost.parentElement.classList.contains('diff-paragraph') && isFirst(outermost)) {
    outermost = outermost.parentElement;
  }
  outermost.parentNode?.insertBefore(band, outermost);
}

/** Whether nothing at all comes before this in its parent. */
function isFirst(child: Node): boolean {
  for (let before = child.previousSibling; before !== null; before = before.previousSibling) {
    if ((before.textContent ?? '') !== '') return false;
  }
  return true;
}
