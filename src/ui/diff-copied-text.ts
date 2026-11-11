/**
 * What copying from the review puts on the clipboard: the text as it will be, and nothing
 * else. Left to the browser, a copy took the words not going in along with those that are,
 * the marks drawn for corrections and changed spacing, and the bar's own buttons.
 *
 * The copy is cut from the text as his choices leave it, not put together from what is drawn:
 * what is drawn has lost things on the way, paragraph breaks, which are drawn as blocks and
 * not as the breaks they were, and a space put in where a break was, which is not drawn at
 * all. What is drawn only says where the selection starts and ends in that text.
 */

/** A change's own space, drawn outside it (diff-view.ts), which its wording has already. */
export const MOVED_SPACE = 'diff-change-space';

/** Drawn in the text but not part of it, or there already in a change's wording. */
const NOT_TEXT = `.diff-bar-band, .diff-bar, .diff-correction-mark, .${MOVED_SPACE}`;
const CHANGE = '.diff-change';
/** The rest of a change that goes on into the next paragraph, which its wording covers. */
const CARRIED = '.diff-change-carried';

/** A run of the text as drawn, in order, and how much of it is selected, if any. */
interface Run {
  text: string;
  selected: { start: number; end: number } | null;
}

/** How much of a text node is inside the range: all of it, or from or to where the range starts or ends in it. */
function selectedIn(node: Text, range: Range): Run['selected'] {
  if (!range.intersectsNode(node)) return null;
  const start = node === range.startContainer ? range.startOffset : 0;
  const end = node === range.endContainer ? range.endOffset : node.length;
  return start < end ? { start, end } : null;
}

/** The text as drawn, run by run: plain text as it stands, and each change once, as its wording. */
function runsOf(box: HTMLElement, range: Range, wordingOf: (change: Element) => string): Run[] {
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  const runs: Run[] = [];
  const seen = new Map<Element, Run>();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!(node instanceof Text) || parent === null) continue;
    if (parent.closest(NOT_TEXT) !== null || parent.closest(CARRIED) !== null) continue;
    const change = parent.closest(CHANGE);
    if (change === null) {
      runs.push({ text: node.data, selected: selectedIn(node, range) });
      continue;
    }
    // The whole of a change, for any of it selected: a piece of a wording is no wording.
    const run = seen.get(change) ?? { text: wordingOf(change), selected: null };
    if (!seen.has(change)) {
      seen.set(change, run);
      runs.push(run);
    }
    if (range.intersectsNode(node)) run.selected = { start: 0, end: run.text.length };
  }
  return runs;
}

/**
 * The text a range of the drawn review stands for, as it will be: each run found in turn in
 * that text, and the copy cut from where the first selected one starts to where the last ends.
 * Null where a run is not to be found there, which would be a fault in the drawing.
 */
export function copiedText(box: HTMLElement, range: Range, wordingOf: (change: Element) => string, textNow: string): string | null {
  let cursor = 0;
  let [from, to] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const run of runsOf(box, range, wordingOf)) {
    // Spacing alone is everywhere; the runs either side of it place it.
    if (!/\S/.test(run.text)) continue;
    const at = textNow.indexOf(run.text, cursor);
    if (at < 0) return null;
    cursor = at + run.text.length;
    if (run.selected === null) continue;
    from = Math.min(from, at + run.selected.start);
    to = Math.max(to, at + run.selected.end);
  }
  return from <= to ? textNow.slice(from, to) : '';
}

/** A review on the page, and how to read its changes and its text as it will be. */
interface CopiedReview {
  box: HTMLElement;
  wordingOf: (change: Element) => string;
  textNow: () => string;
}

/** Reviews drawn, the newest last; those since drawn again, and gone from the page, are dropped as found. */
const reviews: CopiedReview[] = [];
let isListening = false;

/**
 * The selection cut down to the box: a selection reaching out of it, started over the bar
 * floating above the first line, say, or in the legend, takes only the text.
 */
function rangeInBox(selected: Range, box: HTMLElement): Range | null {
  if (!selected.intersectsNode(box)) return null;
  const inside = document.createRange();
  inside.selectNodeContents(box);
  if (box.contains(selected.startContainer)) inside.setStart(selected.startContainer, selected.startOffset);
  if (box.contains(selected.endContainer)) inside.setEnd(selected.endContainer, selected.endOffset);
  return inside;
}

/**
 * One listener for the page, not one for the box: the browser sends a copy to where the
 * selection starts, or to the page itself, which need not be in the box at all.
 */
function onCopy(event: ClipboardEvent): void {
  const selection = getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed || event.clipboardData === null) return;
  for (const [at, review] of [...reviews.entries()].reverse()) {
    if (!review.box.isConnected) {
      reviews.splice(at, 1);
      continue;
    }
    const range = rangeInBox(selection.getRangeAt(0), review.box);
    if (range === null) continue;
    const copied = copiedText(review.box, range, review.wordingOf, review.textNow());
    if (copied === null) {
      console.warn('A copy from the review could not be placed in the text as it will be; left to the browser');
      return;
    }
    event.clipboardData.setData('text/plain', copied);
    event.preventDefault();
    return;
  }
}

/**
 * Copying any of the box gives the text as it will be. One that cannot be placed in the text
 * is left to the browser.
 */
export function copyOnlyWhatGoesIn(box: HTMLElement, wordingOf: (change: Element) => string, textNow: () => string): void {
  if (!isListening) document.addEventListener('copy', onCopy);
  isListening = true;
  // Each choice draws the review again: those gone from the page go now, not at the next copy.
  const gone = reviews.filter((review) => !review.box.isConnected);
  for (const review of gone) reviews.splice(reviews.indexOf(review), 1);
  reviews.push({ box, wordingOf, textNow });
}
