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

/**
 * Takes the band out, and gives back the scroll it took. The bar goes back to `home`, hidden.
 */
export function closeBarBand(box: HTMLElement, bar: HTMLElement, home: HTMLElement): void {
  for (const band of box.querySelectorAll<HTMLElement>(`.${BAND_CLASS}`)) {
    if (band.contains(bar)) {
      bar.hidden = true;
      home.append(bar);
    }
    const parent = band.parentNode;
    band.remove();
    parent?.normalize();
    box.scrollTop -= Number(band.dataset['scrolledBy'] ?? 0);
  }
}

/**
 * Opens the band above the line `over` is on, as tall as the bar less a little, and puts the
 * bar in it, centred on it. Any band already open closes first.
 *
 * On the first line the box's own padding is the room already, so the band is drawn there,
 * pulled up by as much as it is tall: it takes no space and the line does not move.
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
  { mayDrawInPadding = true } = {},
): HTMLElement | null {
  closeBarBand(box, bar, home);
  const line = over.getClientRects()[0];
  if (line === undefined) return null;
  const { start, isFirstLine } = lineStart(box, over, line.top);

  bar.hidden = false;
  const height = Math.max(0, Math.round(bar.offsetHeight - 2 * SHORTER_THAN_BAR_PX));
  // A span made a block: it may go in among the spans of the text.
  const band = document.createElement('span');
  band.className = BAND_CLASS;
  // The bar's own ground: a click on it, beside the buttons, does nothing. Let through to the
  // text, it was a click on nothing in particular, which puts the bar away, band and all.
  band.addEventListener('click', (event) => event.stopPropagation());
  band.style.height = `${height}px`;
  if (isFirstLine && mayDrawInPadding) band.style.marginTop = `-${height}px`;
  if (start === null) over.before(band);
  else placeBefore(start, band);
  bar.style.top = `-${SHORTER_THAN_BAR_PX}px`;
  band.append(bar);
  reachToTheEdges(box, band);
  // Not on the first line: scrolled back, its band would go up under the stepper it was moved to clear.
  if (!isFirstLine) {
    box.scrollTop += height;
    band.dataset['scrolledBy'] = String(height);
  }
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

/** Where an inline element's own words begin, inside whatever border and padding it has now. */
function contentTop(element: Element): number | null {
  const box = element.getClientRects()[0];
  if (box === undefined) return null;
  const style = getComputedStyle(element);
  return box.top + (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.paddingTop) || 0);
}

/**
 * How far above its words a change or a letter must reach to the top of its line: the line's
 * own spacing, which is where a band's bottom is when one is open. Set on the element itself,
 * and on any others given, for a look that draws it on the band's grey reaching up that far,
 * with a band or without one. Each element its own, as a change and a letter can be on lines
 * of different spacing at once.
 *
 * Read with a marker of no height put in where the line starts, which, being a block, sits
 * exactly between that line and the one above and moves nothing; then taken out. From the
 * element's words, not its edge, so whatever padding it has now does not count.
 *
 * @param alike Elements to be given the same reach, as the pieces of a change on later lines.
 */
export function measureJoin(box: HTMLElement, element: Element, alike: Iterable<Element> = []): void {
  const words = contentTop(element);
  if (words === null) return;
  const { start } = lineStart(box, element, words);
  const marker = document.createElement('span');
  marker.style.display = 'block';
  if (start === null) element.before(marker);
  else placeBefore(start, marker);
  const lineTop = marker.getBoundingClientRect().top;
  const parent = marker.parentNode;
  marker.remove();
  parent?.normalize();
  const reach = `${Math.max(0, words - lineTop)}px`;
  for (const each of [element, ...alike]) if (each instanceof HTMLElement) each.style.setProperty(JOIN, reach);
}

/**
 * How far the box is scrolled for the band open in it. A review drawn again puts its box back
 * where it was scrolled to before, which, done after the new drawing's band has opened, undid the
 * band's scroll and moved the line he was on down by its height: it puts it back plus this.
 */
export function scrollTakenByBand(box: ParentNode): number {
  return [...box.querySelectorAll<HTMLElement>(`.${BAND_CLASS}`)].reduce((taken, band) => taken + Number(band.dataset['scrolledBy'] ?? 0), 0);
}

/** Whether this is the first line's band, drawn in the box's padding and taking no space. */
export const isDrawnInPadding = (band: HTMLElement): boolean => band.style.marginTop !== '';

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
