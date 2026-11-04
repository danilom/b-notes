/** One item of either list, and which of them has it. */
export interface AlignedItem {
  kind: 'same' | 'onlyFrom' | 'onlyTo';
  text: string;
}

/**
 * How many insertions and deletions an alignment will look for before calling
 * the two sides simply replaced.
 *
 * The search keeps about edits²/2 numbers, so this is what bounds it: some 32 MB
 * at the limit, on a laptop with 4 GB.
 */
const MOST_EDITS = 4000;

/** How far along `from` a path gets by taking one more of its items, or -1 where none leads here. */
const reachedAcross = (before: Int32Array, slot: number): number =>
  slot > 0 ? (before[slot - 1] ?? 0) + 1 : -1;

/** How far along `from` a path stands after taking one more of `to`, or -1 where none leads here. */
const reachedDown = (before: Int32Array, slot: number, edits: number): number =>
  slot < edits ? (before[slot] ?? 0) : -1;

/**
 * Myers' greedy search: for each number of edits in turn, how far along `from`
 * each diagonal can get. Done when one reaches the end of both.
 *
 * Its cost follows how much the two differ rather than how long they are, and
 * that is why it is here. The table it replaced cost words × words whatever the
 * edit, so a proofreader's few changes to a long paragraph took seventeen
 * seconds at 30,000 words and ran out of memory at 60,000.
 *
 * Nothing stops a path running off the end of a side, and nothing needs to: it
 * can never come back, and getting that far costs more edits than the real end
 * does, so the real end is always found first.
 *
 * @returns One row per number of edits, for walking back; null past MOST_EDITS.
 */
function furthestReached(from: readonly string[], to: readonly string[]): Int32Array[] | null {
  const trace: Int32Array[] = [];
  const most = Math.min(from.length + to.length, MOST_EDITS);

  for (let edits = 0; edits <= most; edits += 1) {
    const before = trace.at(-1) ?? new Int32Array(0);
    const row = new Int32Array(edits + 1);

    for (let slot = 0; slot <= edits; slot += 1) {
      const diagonal = 2 * slot - edits;
      let x = edits === 0 ? 0 : Math.max(reachedAcross(before, slot), reachedDown(before, slot, edits));
      while (x < from.length && x - diagonal < to.length && from[x] === to[x - diagonal]) x += 1;
      row[slot] = x;
      if (x === from.length && x - diagonal === to.length) {
        trace.push(row);
        return trace;
      }
    }
    trace.push(row);
  }
  return null;
}

/**
 * Walks the search back from the end to the path it found, in reading order.
 *
 * Where either step would do, the step taken last is one of `to`, which reads
 * as what `from` had coming before what `to` has in its place.
 */
function pathThrough(trace: readonly Int32Array[], from: readonly string[], to: readonly string[]): AlignedItem[] {
  const backwards: AlignedItem[] = [];
  let x = from.length;
  let y = to.length;

  for (let edits = trace.length - 1; edits > 0; edits -= 1) {
    const before = trace[edits - 1] ?? new Int32Array(0);
    const slot = (x - y + edits) / 2;
    const across = reachedAcross(before, slot);
    const down = reachedDown(before, slot, edits);
    const start = Math.max(across, down);

    for (; x > start; x -= 1, y -= 1) backwards.push({ kind: 'same', text: from[x - 1] ?? '' });

    if (down >= across) {
      y -= 1;
      backwards.push({ kind: 'onlyTo', text: to[y] ?? '' });
    } else {
      x -= 1;
      backwards.push({ kind: 'onlyFrom', text: from[x] ?? '' });
    }
  }
  for (; x > 0; x -= 1) backwards.push({ kind: 'same', text: from[x - 1] ?? '' });

  return backwards.reverse();
}

/** Lines two lists up, keeping as many items in common as can be kept in order. */
export function alignSequences(from: readonly string[], to: readonly string[]): AlignedItem[] {
  const trace = furthestReached(from, to);
  if (trace !== null) return pathThrough(trace, from, to);

  return [
    ...from.map((text): AlignedItem => ({ kind: 'onlyFrom', text })),
    ...to.map((text): AlignedItem => ({ kind: 'onlyTo', text })),
  ];
}
