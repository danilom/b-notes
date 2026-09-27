import { compareTitles } from '../notes/note-title.ts';
import { type LengthBand, type LengthBands, bandOf } from '../notes/text-length.ts';
import { type TitleParts, titlePartsOf } from '../notes/title-marks.ts';
import type { LiveNote } from '../notes/writing.ts';
import { toSearchable } from '../language/diacritics.ts';
import { type Language, describeWhen, strings } from '../language/wording.ts';
import { pageGlyph } from './page-glyph.ts';

export interface ListView {
  notes: readonly LiveNote[];
  /**
   * Where one length band becomes the next, taken from his whole corpus.
   *
   * Handed in rather than worked out here: they are the same for every row, so
   * counting them per row would be counting the corpus once per text.
   */
  lengths: LengthBands;
  query: string;
  /**
   * How many recent texts to offer before he has to look for himself. His to
   * set, in Izgled, because how many essays a man has on the go is his habit.
   */
  recentCount: number;
  openId: string | null;
  /**
   * A text he has asked for but not yet written into, so one with no file
   * behind it. Shown so the list answers the instant he clicks, rather than a
   * second later when the first autosave lands.
   */
  draft: Draft | null;
  language: Language;
}

export interface Draft {
  /** When he asked for it: shown as its time, and sorts it to the top. */
  startedAt: number;
}

/**
 * One line of the list, whether or not there's a file behind it.
 *
 * A draft has no `id`, which is also precisely what marks it as the open one —
 * `openId` is null exactly while the draft is what he's in.
 */
export interface Row {
  id: string | null;
  title: string;
  /** What the rows are put in order by: his first line, leading spaces kept. */
  sortTitle: string;
  /**
   * How high he ranked it with leading spaces. Shown as a mark rather than as
   * the spaces themselves, which make a row look broken.
   */
  rank: 0 | 1 | 2 | 3;
  /** His marks, read off the front of the title so they can be drawn as marks. */
  parts: TitleParts;
  /** The other side's version of a text both sides changed, until he writes in it. */
  otherVersion: boolean;
  /** How full a page to draw beside it, from empty to four lines. */
  length: LengthBand;
  /** Folded, so `macka` finds `mačka` and `mačka` finds `macka`. */
  searchable: string;
  updatedAt: number;
}

export interface Section {
  heading: string;
  rows: readonly Row[];
  /** Shown but pushed down and dimmed — never removed from the list. */
  aside?: boolean;
}

/**
 * Matching ignores case and diacritics alike.
 *
 * Both sides are already folded — his text when it was loaded, the query here —
 * so this is a plain comparison of plain strings, which is why searching got
 * quicker rather than slower when diacritics stopped mattering.
 */
export function matches(row: { searchable: string }, query: string): boolean {
  const needle = toSearchable(query.trim());
  if (needle.length === 0) return true;
  return row.searchable.includes(needle);
}

function titleOf(note: LiveNote, words: ReturnType<typeof strings>): string {
  return note.title.length > 0 ? note.title : words.untitled;
}

function toRow(note: LiveNote, words: ReturnType<typeof strings>, lengths: LengthBands): Row {
  return {
    id: note.id,
    title: titleOf(note, words),
    sortTitle: note.sortTitle,
    rank: note.rank,
    parts: titlePartsOf(note.sortTitle),
    otherVersion: note.otherVersion === true,
    searchable: note.searchable,
    updatedAt: note.updatedAt,
    length: bandOf(note.bytes, lengths),
  };
}

function rowsFor(view: ListView): Row[] {
  const words = strings(view.language);
  return view.notes.map((note) => toRow(note, words, view.lengths));
}

/**
 * The text he has begun, which belongs to no section.
 *
 * It has no words in it, so it can match no search and would sink into the
 * dimmed remainder — at the very moment Nedavni is gone too, leaving the text
 * he just asked for nowhere he would look. It also has no file yet, so there is
 * no row anywhere else for it to be.
 *
 * A saved text he is editing briefly lived here too, for the case where it
 * stops matching under him: search for a word, open what you found, delete the
 * word. That moved a row he had just clicked from where he clicked it to the
 * top of the list, which is a worse thing to watch than a row going quiet. It
 * stays where it belongs now and is marked instead — the list still never
 * hides the text he is in, it just no longer carries it about.
 */
export function openRowFor(view: ListView): Row | null {
  const words = strings(view.language);
  if (view.draft === null) return null;
  return {
    id: null,
    title: words.untitledNew,
    sortTitle: '',
    rank: 0,
    parts: { mark: null, position: null, starred: false, name: words.untitledNew },
    otherVersion: false,
    searchable: '',
    updatedAt: view.draft.startedAt,
    // Nothing written in it yet, which is exactly what an empty page says.
    length: 0,
  };
}

/**
 * Sections promote, they never filter.
 *
 * Svi tekstovi means all of them, always — every text he has, in one order,
 * whatever else is on screen. Anything above it is a shortcut into it rather
 * than a slice taken out of it, so a text found by a search and a text he has
 * open are each in two places at once, and that is the point: the complete list
 * is the one thing in the app that never changes shape under him.
 *
 * It used to hold only what a search had *not* matched, which made the heading
 * name something it wasn't, and made clicking a dimmed row look like the row
 * had gone — it left the remainder the moment it became the text he was in,
 * and reappeared at the top with nothing to connect the two.
 */
export function sectionsFor(view: ListView): Section[] {
  const words = strings(view.language);
  const rows = rowsFor(view);
  const byRecency = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
  // Texts reading the same fall back to their id, which is what their number
  // is read from — so a run of them counts up rather than arriving in whatever
  // order the folder was read in. Numerically, or `(10)` would sort above `(2)`.
  const all = [...rows].sort(
    (a, b) =>
      // By his first line as he typed it, in the order Resoph lists it: a
      // space sorts before any letter, so the more leading spaces, the higher
      // — his way of ranking a text, and why this is his order rather than an
      // alphabet. His marks work the same way, by where they sort.
      compareTitles(a.sortTitle, b.sortTitle) ||
      (a.id ?? '').localeCompare(b.id ?? '', 'sr', { numeric: true }),
  );

  if (view.query.trim().length === 0) {
    return [
      { heading: words.sectionRecent, rows: byRecency.slice(0, view.recentCount) },
      { heading: words.sectionAll, rows: all },
    ];
  }

  const found = byRecency.filter((row) => matches(row, view.query));
  return [
    { heading: words.sectionFound, rows: found },
    { heading: words.sectionAll, rows: all, aside: true },
  ];
}

function rowElement(row: Row, view: ListView, aside: boolean): HTMLElement {
  const element = document.createElement('div');
  element.className = aside ? 'note aside' : 'note';

  // The draft gets no id, so clicking it has nothing to open — it is already
  // what he is in, and there is no file to read.
  if (row.id !== null) element.dataset['id'] = row.id;
  if (row.id === view.openId) element.setAttribute('aria-current', 'true');

  const when = document.createElement('span');
  when.className = 'note-when';
  when.textContent = describeWhen(row.updatedAt, view.language);

  element.append(pageGlyph(row.length), headingOf(row, strings(view.language)), when);
  return element;
}

/**
 * The title and what he put in front of it, as one heading: the signal for his
 * leading spaces, his mark, his place in a series, his star, then the name.
 *
 * Beside the name rather than in it, so a name long enough to be cut short
 * never takes a mark with it.
 */
function headingOf(row: Row, words: ReturnType<typeof strings>): HTMLElement {
  const heading = span('note-heading', '');
  const { mark, position, starred, name } = row.parts;
  const marked = mark !== null || starred;

  if (row.rank > 0) {
    const rank = span('note-rank', '');
    rank.dataset['rank'] = String(row.rank);
    rank.setAttribute('aria-hidden', 'true');
    heading.append(rank);
  }
  if (mark !== null) heading.append(span('note-mark', mark));
  if (position !== null) {
    if (position.series !== null) heading.append(span('note-series', position.series));
    heading.append(span('note-position', position.number));
  }
  if (starred) {
    const star = span('note-star', '\u2605');
    star.setAttribute('aria-hidden', 'true');
    heading.append(star);
  }
  heading.append(span('note-title', marked ? name : row.title));
  // Straight after the name, quietly: beside the text it is the other version
  // of, which reads the same.
  if (row.otherVersion) heading.append(span('note-other', words.otherVersion));
  return heading;
}

function span(className: string, text: string): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

export function renderList(container: HTMLElement, view: ListView): void {
  const words = strings(view.language);
  container.replaceChildren();

  if (view.notes.length === 0 && view.draft === null) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = words.noNotesYet;
    container.append(empty);
    return;
  }

  const open = openRowFor(view);
  if (open !== null) {
    const element = rowElement(open, view, false);
    element.classList.add('pinned');
    // Only the unwritten one is italic: the other has a title of his own.
    if (view.draft !== null) element.classList.add('draft');
    container.append(element);
  }

  for (const section of sectionsFor(view)) {
    if (section.rows.length === 0 && section.aside === true) continue;

    // Each section is its own block, and not merely a heading followed by loose
    // rows. A sticky heading holds at the top of whatever contains it, so as
    // siblings of every row they all pinned themselves to the top of the list at
    // once and drew over each other. Inside a block of its own, a heading holds
    // only while its own texts are on screen and the next one pushes it off.
    const block = document.createElement('div');
    block.className = 'section-block';

    const heading = document.createElement('div');
    heading.className = 'section';
    heading.textContent = `${section.heading} · ${words.noteCount(section.rows.length)}`;
    block.append(heading);

    if (section.rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = words.nothingFound;
      block.append(empty);
      container.append(block);
      continue;
    }

    for (const row of section.rows) {
      block.append(rowElement(row, view, section.aside === true));
    }
    container.append(block);
  }
}
