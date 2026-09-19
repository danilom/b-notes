/**
 * The start of something, flattened onto one line.
 *
 * His paragraphs are hard-wrapped and separated by blank lines, neither of
 * which survives being put in a row, so the whitespace collapses first.
 *
 * @param most How many characters the line has room for.
 */
export function onOneLine(text: string, most: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= most) return flat;

  const cut = flat.slice(0, most);
  const lastSpace = cut.lastIndexOf(' ');
  // Cut at a word where one is near enough to the end. A word chopped in half
  // reads as the app having broken something; a line a few characters shorter
  // than it had to be reads as nothing at all.
  const kept = lastSpace > most * 0.7 ? cut.slice(0, lastSpace) : cut;
  return `${kept.trimEnd()}…`;
}

/**
 * The start and the end of something, with the middle left out.
 *
 * For a paragraph he can already read in full somewhere else, where the job is
 * only to let him recognise which one it is. Both ends, because the start alone
 * does not tell him where a long paragraph was going.
 *
 * @param most How many characters the two ends have between them.
 */
export function beginningAndEnd(text: string, most: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= most) return flat;

  const half = Math.floor(most / 2);
  const opening = flat.slice(0, half);
  const closing = flat.slice(-half);

  // Cut at a word on both sides, and fall back to the blunt cut rather than
  // leave almost nothing: a run of one long word has no space to cut at.
  const afterWord = opening.lastIndexOf(' ');
  const beforeWord = closing.indexOf(' ');
  const head = afterWord > half * 0.7 ? opening.slice(0, afterWord) : opening;
  const tail = beforeWord !== -1 && beforeWord < half * 0.3 ? closing.slice(beforeWord + 1) : closing;

  return `${head.trimEnd()} … ${tail.trimStart()}`;
}
