/**
 * How many words are in a piece of his writing.
 *
 * Whitespace-separated, which is what he would get counting by hand. A comma
 * or a full stop stuck to a word does not make a second one, and a hyphenated
 * name stays one word — both of which match how he would read the number.
 */
export function countWords(text: string): number {
  const written = text.trim();
  if (written.length === 0) return 0;
  return written.split(/\s+/).length;
}
