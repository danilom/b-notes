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
