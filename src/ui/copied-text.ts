import { type Language, strings } from '../language/wording.ts';
import { countWords } from '../notes/word-count.ts';

/**
 * What the copy button puts on the clipboard: his text, and one line saying
 * which text it is.
 *
 * He sends the same essay several times as he works on it, and at the far end
 * they arrive as a pile of pasted text with nothing to tell one from the next
 * — including the ones he has already sent once. The line answers that: two
 * copies carrying the same date and the same count are the same writing, and a
 * date from years ago is an old text sent again rather than a new one.
 *
 * Under his text rather than over it, for a reason beyond taste: a text's name
 * comes from its first line, so anything put at the top would become what the
 * text is called the moment it were ever pasted back in.
 */

/**
 * The blank lines between his last sentence and the app's line.
 *
 * Two, where a paragraph break is one. A single break would make the line look
 * like a last short paragraph of his own.
 */
const GAP = '\n\n\n';

/**
 * The date, written the one way that means the same thing to everyone.
 *
 * From the local parts of the day rather than `toISOString`, which is UTC: a
 * text saved at half past midnight would otherwise be stamped with the day
 * before, and a wrong date here is invisible — it still looks exactly like a
 * date, and it is wrong in the direction that matters, which is older.
 */
function isoDate(at: number): string {
  const when = new Date(at);
  const month = `${when.getMonth() + 1}`.padStart(2, '0');
  const day = `${when.getDate()}`.padStart(2, '0');
  return `${when.getFullYear()}-${month}-${day}`;
}

/**
 * His text with the line appended.
 *
 * @param text What is in front of him, which is what goes on the clipboard —
 *   it can be a second or two ahead of the last save.
 * @param savedAt When it was last written to disk, or null for a text that has
 *   never been saved. Null leaves the date out rather than standing in `now`
 *   for it: a text is unsaved either for the second before its first save or
 *   because saving is failing, and in the second case a date would be a
 *   statement about a write that never happened.
 */
export function textToCopy(text: string, savedAt: number | null, language: Language): string {
  const words = strings(language);
  // Counted from his text, not from what this returns: the line would
  // otherwise be counting itself.
  const counted = words.wordCount(countWords(text));
  const said =
    savedAt === null ? counted : `${words.lastChanged}: ${isoDate(savedAt)} · ${counted}`;

  // Trailing blank lines trimmed, so the gap is the one above and not however
  // many times he pressed Enter before stopping.
  return `${text.replace(/\s+$/, '')}${GAP}${said}`;
}
