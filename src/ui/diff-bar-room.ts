/**
 * Room above the line the change bar is over, so the bar covers no words of the line above.
 *
 * The text flows, so there is no line to give a margin to. Instead an empty block goes in at
 * the place the line starts on screen: the line above ends where it ended, the line itself
 * starts with the same word at the same width, and so every line wraps as it did, only lower.
 * The box scrolls by as much, so the line he clicked stays under the pointer and what moves is
 * what was above it.
 */

const ROOM_CLASS = 'diff-bar-room';

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
 * Where the line `over` is on starts, and how low the line above reaches. Going back a
 * character at a time, the first one drawn higher up is the end of the line above.
 */
function lineStart(box: HTMLElement, over: Element, lineTop: number): { start: TextPlace | null; aboveBottom: number | null } {
  let start: TextPlace | null = null;
  for (const node of textBefore(box, over)) {
    for (let offset = node.length - 1; offset >= 0; offset -= 1) {
      if (/\s/.test(node.data.charAt(offset))) continue;
      const rect = characterRect(node, offset);
      if (rect === null) continue;
      if (rect.bottom <= lineTop + 1) return { start, aboveBottom: rect.bottom };
      start = { node, offset };
    }
  }
  return { start, aboveBottom: null };
}

/** Takes the room out again, wherever it is, and gives back the scroll it took. */
export function removeBarRoom(box: HTMLElement): void {
  for (const room of box.querySelectorAll<HTMLElement>(`.${ROOM_CLASS}`)) {
    // The first line's band takes no space, so it gives none back.
    const height = room.style.marginTop === '' ? room.offsetHeight : 0;
    const parent = room.parentNode;
    room.remove();
    parent?.normalize();
    box.scrollTop -= height;
  }
}

/** How much shorter the gap is than the bar, at top and bottom alike: a little, so the bar stands on it. */
const SHORTER_THAN_BAR_PX = 2;

/**
 * Opens a gap above the line `over` is on, as tall as the bar less a little, between that line
 * and the one above, each keeping its usual spacing: the gap is the space added, shaded, and the
 * bar sits centred on it.
 *
 * On the first line the box's own padding is the room already, so the band is drawn there,
 * pulled up by as much as it is tall: it takes no space and the line does not move.
 *
 * @returns The gap, for the bar to be centred on, or null where none could be made.
 */
export function makeBarRoom(box: HTMLElement, over: Element, barHeight: number): HTMLElement | null {
  removeBarRoom(box);
  const line = over.getClientRects()[0];
  if (line === undefined) return null;
  const { start, aboveBottom } = lineStart(box, over, line.top);
  const isFirstLine = aboveBottom === null;
  const height = Math.max(0, Math.round(barHeight - 2 * SHORTER_THAN_BAR_PX));

  const room = document.createElement('span');
  room.className = ROOM_CLASS;
  room.style.height = `${height}px`;
  if (isFirstLine) room.style.marginTop = `-${height}px`;
  if (start === null) over.before(room);
  else placeBefore(start, room);
  if (!isFirstLine) box.scrollTop += height;
  return room;
}

/**
 * Before the line's first character, and outside any box that character begins: a line
 * starting with another change gets the room above that change, not inside its marks.
 */
function placeBefore({ node, offset }: TextPlace, room: HTMLElement): void {
  // The spaces before stay at the end of the line above, where the text's kept spacing hangs them.
  let outermost: Node = offset > 0 ? node.splitText(offset) : node;
  while (outermost.parentElement !== null && !outermost.parentElement.classList.contains('diff-paragraph') && isFirst(outermost)) {
    outermost = outermost.parentElement;
  }
  outermost.parentNode?.insertBefore(room, outermost);
}

/** Whether nothing at all comes before this in its parent. */
function isFirst(child: Node): boolean {
  for (let before = child.previousSibling; before !== null; before = before.previousSibling) {
    if ((before.textContent ?? '') !== '') return false;
  }
  return true;
}
