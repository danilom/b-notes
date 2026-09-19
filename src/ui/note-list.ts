import type { Note } from '../notes/note.ts';
import { type Language, describeWhen, strings } from '../language/wording.ts';

/** How many recent texts to offer before he has to look for himself. */
const RECENT_COUNT = 5;

export interface ListView {
  notes: readonly Note[];
  query: string;
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
  text: string;
  updatedAt: number;
}

export interface Section {
  heading: string;
  rows: readonly Row[];
  /** Shown but pushed down and dimmed — never removed from the list. */
  aside?: boolean;
}

/**
 * Matching ignores case. It deliberately does not yet ignore diacritics, which
 * he uses inconsistently — that's a known gap, tracked in TODO.md.
 */
export function matches(row: { text: string }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return row.text.toLowerCase().includes(needle);
}

function toRow(note: Note, words: ReturnType<typeof strings>): Row {
  return {
    id: note.id,
    title: note.title.length > 0 ? note.title : words.untitled,
    text: note.text,
    updatedAt: note.updatedAt,
  };
}

/**
 * The text he has open, when the search would otherwise leave it dimmed.
 *
 * Null unless something is actually hiding it: with no query nothing is, and a
 * text that matches is already at the top of what was found.
 */
function buriedOpenId(view: ListView): string | null {
  if (view.openId === null || view.query.trim().length === 0) return null;
  const open = view.notes.find((note) => note.id === view.openId);
  if (open === undefined) return null;
  return matches(open, view.query) ? null : view.openId;
}

function rowsFor(view: ListView): Row[] {
  const words = strings(view.language);
  const buried = buriedOpenId(view);
  // Shown above instead, so it isn't in two places at once.
  return view.notes.filter((note) => note.id !== buried).map((note) => toRow(note, words));
}

/**
 * The text he is in, pinned above every section and never dimmed.
 *
 * Two things end up here, for one reason. A text he has begun has no words in
 * it, so it can match no search and would sink into the dimmed remainder — at
 * the very moment Nedavni is gone too, leaving the text he just asked for
 * nowhere he would look. And a saved text he is editing can stop matching under
 * him: search for a word, open what you found, delete the word, and the list
 * quietly greys out the thing you are typing in.
 *
 * Neither is a text he is searching for. Both are the text he is in, and the
 * list is never allowed to hide that from him.
 */
export function openRowFor(view: ListView): Row | null {
  const words = strings(view.language);
  if (view.draft !== null) {
    return { id: null, title: words.untitledNew, text: '', updatedAt: view.draft.startedAt };
  }

  const buried = buriedOpenId(view);
  if (buried === null) return null;
  const note = view.notes.find((candidate) => candidate.id === buried);
  return note === undefined ? null : toRow(note, words);
}

/**
 * Sections promote, they never filter. Every text is present in every view, so
 * nothing can appear to have gone missing — searching pushes what didn't match
 * downwards rather than taking it away.
 */
export function sectionsFor(view: ListView): Section[] {
  const words = strings(view.language);
  const rows = rowsFor(view);
  const byRecency = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
  const all = [...rows].sort((a, b) => a.title.localeCompare(b.title, 'sr'));

  if (view.query.trim().length === 0) {
    return [
      { heading: words.sectionRecent, rows: byRecency.slice(0, RECENT_COUNT) },
      { heading: words.sectionAll, rows: all },
    ];
  }

  const found = byRecency.filter((row) => matches(row, view.query));
  const rest = all.filter((row) => !matches(row, view.query));
  return [
    { heading: words.sectionFound, rows: found },
    { heading: words.sectionAll, rows: rest, aside: true },
  ];
}

function rowElement(row: Row, view: ListView, aside: boolean): HTMLElement {
  const element = document.createElement('div');
  element.className = aside ? 'note aside' : 'note';

  // The draft gets no id, so clicking it has nothing to open — it is already
  // what he is in, and there is no file to read.
  if (row.id !== null) element.dataset['id'] = row.id;
  if (row.id === view.openId) element.setAttribute('aria-current', 'true');

  const title = document.createElement('span');
  title.className = 'note-title';
  title.textContent = row.title;

  const when = document.createElement('span');
  when.className = 'note-when';
  when.textContent = describeWhen(row.updatedAt, view.language);

  element.append(title, when);
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

    const heading = document.createElement('div');
    heading.className = 'section';
    heading.textContent = `${section.heading} · ${words.noteCount(section.rows.length)}`;
    container.append(heading);

    if (section.rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = words.nothingFound;
      container.append(empty);
      continue;
    }

    for (const row of section.rows) {
      container.append(rowElement(row, view, section.aside === true));
    }
  }
}
