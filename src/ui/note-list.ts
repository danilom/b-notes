import { compareTitles } from '../notes/note-title.ts';
import { isResophId } from '../notes/resoph-note.ts';
import { type TitleParts, titlePartsOf } from '../notes/title-marks.ts';
import type { LiveNote } from '../notes/writing.ts';
import { toSearchable } from '../language/diacritics.ts';
import { foundGroups } from './search-results.ts';
import { hasEveryWord, wordsOf } from './phrase-match.ts';
import { matchesIn } from './text-match.ts';
import { type Language, describeWhen, strings } from '../language/wording.ts';

export interface ListView {
  notes: readonly LiveNote[];
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
  /** A text just taken over from Resoph, whose Resoph icon is shown once more, going. */
  justTakenOver?: string | null;
  language: Language;
  /** The moment a search's "recent" is measured from: now, unless a test says otherwise. */
  now?: number;
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
  /** Still in Resoph: typing in it will take it over. */
  inResoph: boolean;
  /** Folded, so `macka` finds `mačka` and `mačka` finds `macka`. */
  searchable: string;
  /** The code in its file's name, which a search finds it by too. */
  code: string | null;
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
export function matches(row: Searched, query: string): boolean {
  const words = wordsOf(query);
  if (words.length === 0) return true;
  // Every word, together or apart, as the list finds them.
  return hasEveryWord(row.searchable, words) || foundByCode(row, query) !== null;
}

/** What a search looks through: his words, and the code in his file's name. */
interface Searched {
  searchable: string;
  code?: string | null;
}

/**
 * The code a text was found by, where its words did not match, or null.
 *
 * A text taken over from Resoph carries a code in its file name, `~K3F9A2`,
 * and the stub left in Resoph tells him to search for it: the one way back to
 * a text whose title he has since changed, or emptied, among titles that
 * repeat. Searched like any of his words, so part of it finds it too; and
 * shown on the row when that is what matched, since nothing in the text says
 * why it is there.
 */
export function foundByCode(row: Searched, query: string): string | null {
  const needle = toSearchable(query.trim());
  if (needle.length === 0 || hasEveryWord(row.searchable, wordsOf(query))) return null;
  const code = row.code ?? null;
  return code !== null && toSearchable(code).includes(needle) ? code : null;
}

function titleOf(note: LiveNote, words: ReturnType<typeof strings>): string {
  return note.title.length > 0 ? note.title : words.untitled;
}

function toRow(note: LiveNote, words: ReturnType<typeof strings>): Row {
  return {
    id: note.id,
    title: titleOf(note, words),
    sortTitle: note.sortTitle,
    rank: note.rank,
    parts: titlePartsOf(note.sortTitle),
    inResoph: isResophId(note.id),
    searchable: note.searchable,
    code: note.code,
    updatedAt: note.updatedAt,
  };
}

function rowsFor(view: ListView): Row[] {
  const words = strings(view.language);
  return view.notes.map((note) => toRow(note, words));
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
    inResoph: false,
    searchable: '',
    code: null,
    updatedAt: view.draft.startedAt,
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

  // Two groups at most, each under a heading that says where he was found,
  // in the order search-results.ts explains. One heading when nothing was.
  const { inTitle, inText, asPart } = foundGroups(all, view.query, view.now ?? Date.now());
  const groups: Section[] = [
    { heading: words.sectionFoundInTitle, rows: inTitle },
    { heading: words.sectionFoundInText, rows: inText },
    { heading: words.sectionFoundAsPart, rows: asPart },
  ].filter((group) => group.rows.length > 0);
  const found: Section[] = groups.length > 0 ? groups : [{ heading: words.sectionFound, rows: [] }];
  return [...found, { heading: words.sectionAll, rows: all, aside: true }];
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

  const words = strings(view.language);
  // Only among what was found: the rest are there whatever he searched for.
  const code = aside ? null : foundByCode(row, view.query);
  const query = aside ? '' : view.query;
  element.append(headingOf(row, words, code, query), when, ...resophMarkOf(row, view, words));
  return element;
}

/**
 * Resoph's icon after the date on a text still in Resoph, so he has some sense
 * of which ones are: typing in one takes it over. On the row just taken over,
 * the icon once more, going. The picture itself is the stylesheet's.
 */
function resophMarkOf(row: Row, view: ListView, words: ReturnType<typeof strings>): HTMLElement[] {
  const leaving = row.id !== null && row.id === view.justTakenOver;
  if (!row.inResoph && !leaving) return [];
  const mark = span(leaving ? 'note-in-resoph leaving' : 'note-in-resoph', '');
  mark.title = words.inResophHint;
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', words.inResophHint);
  return [mark];
}

/**
 * The title and what he put in front of it, as one heading: the signal for his
 * leading spaces, his mark, his place in a series, his star, then the name.
 *
 * Beside the name rather than in it, so a name long enough to be cut short
 * never takes a mark with it.
 */
function headingOf(row: Row, words: ReturnType<typeof strings>, code: string | null, query: string): HTMLElement {
  const heading = span('note-heading', '');
  const { mark, position, starred, name } = row.parts;
  const marked = mark !== null || starred;

  if (row.rank > 0) {
    const rank = span('note-rank', '');
    rank.dataset['rank'] = String(row.rank);
    rank.setAttribute('aria-hidden', 'true');
    heading.append(rank);
  }
  if (mark !== null) heading.append(markOf(mark));
  if (position !== null) {
    if (position.series !== null) heading.append(span('note-series', position.series));
    heading.append(span('note-position', position.number));
  }
  if (starred) {
    const star = span('note-star', '\u2605');
    star.setAttribute('aria-hidden', 'true');
    heading.append(star);
  }
  heading.append(titleWithMatches(marked ? name : row.title, query));
  if (code !== null) heading.append(span('note-code', code));
  return heading;
}

/** His collection's mark, which is drawn as a sign rather than as he typed it. */
const COLLECTION_MARK = '(UP)';

/**
 * His mark as the list draws it: as he typed it, except `(UP)`, which leads
 * hundreds of rows and is drawn as its two letters in the rank bars' box, so
 * a row starts the same way whichever of the two leads it.
 */
function markOf(mark: string): HTMLElement {
  if (mark !== COLLECTION_MARK) return span('note-mark', mark);
  const sign = span('note-mark note-collection', 'UP');
  sign.setAttribute('aria-label', mark);
  return sign;
}

/**
 * The name, with what a search found in it marked the way his text marks it,
 * so a row says why it is there. Only in the name: his marks are drawn apart
 * from it, and a match inside one of those goes unmarked, which is rare.
 * Built of text and `mark` elements, never markup, like the marks in his text.
 */
function titleWithMatches(text: string, query: string): HTMLElement {
  const title = span('note-title', '');
  let from = 0;
  for (const { start, end } of matchesIn(text, query, 'any-word')) {
    const found = document.createElement('mark');
    found.className = 'note-found';
    found.textContent = text.slice(start, end);
    title.append(text.slice(from, start), found);
    from = end;
  }
  title.append(text.slice(from));
  return title;
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
