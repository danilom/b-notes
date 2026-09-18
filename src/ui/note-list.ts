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

function rowsFor(view: ListView): Row[] {
  const words = strings(view.language);
  const rows: Row[] = view.notes.map((note) => ({
    id: note.id,
    title: note.title.length > 0 ? note.title : words.untitled,
    text: note.text,
    updatedAt: note.updatedAt,
  }));

  // Empty text, so a search can never claim the draft as a match: it falls into
  // the dimmed section on its own, the same way anything unmatched does.
  if (view.draft !== null) {
    rows.push({ id: null, title: words.untitled, text: '', updatedAt: view.draft.startedAt });
  }
  return rows;
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
