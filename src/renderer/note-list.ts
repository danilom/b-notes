import type { Note } from '../shared/notes.ts';
import { type Language, describeWhen, strings } from '../shared/strings.ts';

/** How many recent texts to offer before he has to look for himself. */
const RECENT_COUNT = 5;

export interface ListView {
  notes: readonly Note[];
  query: string;
  openId: string | null;
  language: Language;
}

interface Section {
  heading: string;
  notes: readonly Note[];
  /** Shown but pushed down and dimmed — never removed from the list. */
  aside?: boolean;
}

/**
 * Matching ignores case. It deliberately does not yet ignore diacritics, which
 * he uses inconsistently — that's a known gap, tracked in TODO.md.
 */
export function matches(note: Note, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return note.text.toLowerCase().includes(needle);
}

/**
 * Sections promote, they never filter. Every text is present in every view, so
 * nothing can appear to have gone missing — searching pushes what didn't match
 * downwards rather than taking it away.
 */
export function sectionsFor(view: ListView): Section[] {
  const words = strings(view.language);
  const byRecency = [...view.notes].sort((a, b) => b.updatedAt - a.updatedAt);
  const all = [...view.notes].sort((a, b) => a.title.localeCompare(b.title, 'sr'));

  if (view.query.trim().length === 0) {
    return [
      { heading: words.sectionRecent, notes: byRecency.slice(0, RECENT_COUNT) },
      { heading: words.sectionAll, notes: all },
    ];
  }

  const found = byRecency.filter((note) => matches(note, view.query));
  const rest = all.filter((note) => !matches(note, view.query));
  return [
    { heading: words.sectionFound, notes: found },
    { heading: words.sectionAll, notes: rest, aside: true },
  ];
}

function noteRow(note: Note, view: ListView, aside: boolean): HTMLElement {
  const words = strings(view.language);
  const row = document.createElement('div');
  row.className = aside ? 'note aside' : 'note';
  row.dataset['id'] = note.id;
  if (note.id === view.openId) row.setAttribute('aria-current', 'true');

  const title = document.createElement('span');
  title.className = 'note-title';
  title.textContent = note.title.length > 0 ? note.title : words.untitled;

  const when = document.createElement('span');
  when.className = 'note-when';
  when.textContent = describeWhen(note.updatedAt, view.language);

  row.append(title, when);
  return row;
}

export function renderList(container: HTMLElement, view: ListView): void {
  const words = strings(view.language);
  container.replaceChildren();

  if (view.notes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = words.noNotesYet;
    container.append(empty);
    return;
  }

  for (const section of sectionsFor(view)) {
    if (section.notes.length === 0 && section.aside === true) continue;

    const heading = document.createElement('div');
    heading.className = 'section';
    heading.textContent = `${section.heading} · ${words.noteCount(section.notes.length)}`;
    container.append(heading);

    if (section.notes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = words.nothingFound;
      container.append(empty);
      continue;
    }

    for (const note of section.notes) {
      container.append(noteRow(note, view, section.aside === true));
    }
  }
}
