/**
 * How a note's text becomes a filename, and how collisions are resolved.
 *
 * Pure on purpose. Both stores use these, so the browser mock produces exactly
 * the ids the real filesystem would — a mock that names things differently
 * would quietly invalidate anything judged against it.
 */
import { withoutDiacritics } from '../language/diacritics.ts';
import { titleOfResophName } from './resoph-note.ts';
import { isWindowsDeviceName } from './windows-device-names.ts';

/**
 * Notes are `.txt`. Windows opens that in Notepad on a double-click while `.md`
 * has no default handler at all — and the whole fallback plan is that he can
 * read his own writing without this app.
 */
export const EXTENSION = '.txt';

export function isNoteFile(fileName: string): boolean {
  return fileName.endsWith(EXTENSION);
}

/**
 * A note's id is its filename without the extension — never a path.
 *
 * Ids can arrive from a stale session file or a listing we didn't write, so
 * they're checked — but only for what would make one reach outside its
 * folder. Any name on disk is otherwise a name: his own, from Resoph, carry
 * leading spaces, trailing spaces and escapes, and 0.7.0 refused those and
 * lost his edits to them. Any subfolder path, such as a put-away note, is
 * built by the store rather than accepted.
 */
export function idOf(fileName: string): string {
  return fileName.endsWith(EXTENSION) ? fileName.slice(0, -EXTENSION.length) : fileName;
}

export function isNoteId(candidate: string): boolean {
  if (candidate.includes('/') || candidate.includes('\\')) return false;
  if (candidate === '.' || candidate === '..') return false;
  return candidate.trim().length > 0 && !isNoteFile(candidate);
}

export function requireNoteId(candidate: string): string {
  if (!isNoteId(candidate)) throw new Error(`Not the name of a note: ${candidate}`);
  return candidate;
}

/**
 * Where put-away notes go. Visible and in his language, because if he ever goes
 * looking through the folder himself this is the one place he might need.
 */
export const DELETED_FOLDER = 'Obrisano';

/**
 * Where earlier versions of his texts are kept.
 *
 * Beside his writing rather than with the log, so they travel and are backed up
 * with everything else. Visible and in his own language: if he ever opens that
 * folder he should find something he recognises, and every file in it is plain
 * text that opens in Notepad without this app existing.
 */
export const VERSIONS_FOLDER = 'Verzije';

/**
 * Where writing brought in from somewhere else is kept, one folder per source.
 *
 * Beside his texts rather than among them: an import is mostly older copies of
 * things he already has, and dropping six hundred of those into his list would
 * bury the writing he is actually working on. Each source keeps its own folder
 * under here — `Arhiva/Stari laptop 2021/` — so what came from where stays
 * answerable, and every file in it is plain text that opens in Notepad.
 *
 * Nothing reads these yet. The name is settled and the sample corpus is built
 * with it, so that the paths exist in one place when the dialog is written.
 */
export const ARCHIVE_FOLDER = 'Arhiva';

/** One source's folder. `name` is the folder he or the importer chose. */
export function archiveFolderFor(name: string): string {
  return `${ARCHIVE_FOLDER}/${name}`;
}

/**
 * Where an archived text's earlier versions sit.
 *
 * The same rule as everywhere else — a `Verzije` folder beside the text — so
 * one archive holds a whole text's history and can be moved or deleted whole.
 */
export function archivedVersionsFolderFor(archive: string, id: string): string {
  return `${archiveFolderFor(archive)}/${VERSIONS_FOLDER}/${id}`;
}

/**
 * The folder holding one note's earlier versions.
 *
 * One rule, applied wherever the note happens to live: versions sit in a
 * Verzije folder beside it. A note in his writing folder keeps them at
 * `Verzije/<id>`; one that has been put away keeps them at
 * `Obrisano/Verzije/<id>`, so everything about a deleted text is under
 * `Obrisano` and opening that folder shows the whole of it.
 *
 * Every path to a version is built here and nowhere else. A note's identity is
 * its filename today, which is fine while the only notes with versions are ones
 * that cannot be renamed — and the day that stops being true, this is the one
 * function that has to learn about it.
 */
export function versionsFolderFor(id: string): string {
  return `${VERSIONS_FOLDER}/${id}`;
}

/** Where they go once the note itself has been put away. */
export function putAwayVersionsFolderFor(id: string): string {
  return `${DELETED_FOLDER}/${VERSIONS_FOLDER}/${id}`;
}

/**
 * What one version is called: the moment it was taken.
 *
 * Local time, because the only person who will ever read it is in one place,
 * and because it is meant to be recognisable rather than precise. Sortable, and
 * free of the characters Windows refuses in a name.
 */
export function versionName(when: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  const day = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`;
  return `${day} ${two(when.getHours())}-${two(when.getMinutes())}-${two(when.getSeconds())}`;
}

/**
 * The first unused name for `base`, treating `own` as free.
 *
 * For the timestamps kept copies are filed under, where two taken in one
 * second have to be told apart and nothing may be overwritten. A copy's name
 * is ours and never his, so the brackets matter to nobody.
 */
export function nextFreeId(base: string, own: string | null, taken: ReadonlySet<string>): string {
  for (let attempt = 0; ; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base} (${attempt})`;
    if (candidate === own || !taken.has(candidate)) return candidate;
  }
}

/*
  Naming files once, and never again.

  b-notes no longer renames anything. A file is named when it is made, and to
  b-notes that name *is* the text from then on. Several machines work offline
  and Dropbox reconciles them later, matching files by path alone, so one name
  has to mean one text everywhere:

  1. The same text gets the same name on every machine — two machines copying
     one Resoph text offline must write one file, not two.
  2. Different texts get different names on every machine — or Dropbox makes
     one file of two texts, and one is filed away as a version of the other.
  3. The name is decided without looking at the folder, because each offline
     machine sees a different one; "the next free number" breaks both rules.

  So every name is a readable part and a tag that makes it unique. The
  reasoning, with examples, is in `RESOPH-COEXISTENCE.md` §4.7.
*/

/** Where a readable part is cut, at a word where one is near enough. */
const LONGEST_NAME = 50;

/**
 * What survives into a filename untouched: plain letters and digits, spaces,
 * and punctuation that every tool on his machines takes. Not `~`, which
 * separates the tag, so a readable part can never be mistaken for one.
 */
const PLAIN_NAME_CHARACTER = /[A-Za-z0-9 .,;!'()&+_-]/;

/** Said when a title leaves nothing usable, in the app's own language. */
const NO_TITLE = 'Bez naslova';

/**
 * A title as the readable part of a filename: safe in Notepad, zip and
 * Explorer, and never seen by him.
 *
 * Diacritics come off (Windows' own zip mangles them), anything else unusual
 * becomes a space, spaces are collapsed and trimmed — his leading spaces
 * included, which is precisely what Explorer refuses — and no trailing dot,
 * which Windows drops on its own.
 */
export function safeTitle(title: string): string {
  let plain = '';
  for (const character of withoutDiacritics(title)) {
    plain += PLAIN_NAME_CHARACTER.test(character) ? character : ' ';
  }
  let cleaned = plain.replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');

  if (cleaned.length > LONGEST_NAME) {
    const cut = cleaned.slice(0, LONGEST_NAME);
    const lastSpace = cut.lastIndexOf(' ');
    cleaned = (lastSpace >= LONGEST_NAME * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[. ]+$/, '');
  }

  if (cleaned.length === 0) return NO_TITLE;
  // Before, here: nobody sees this name, and `Con. Pismo` is a device to
  // Windows as surely as `Con` is.
  if (isWindowsDeviceName(cleaned)) return `_${cleaned}`;
  return cleaned;
}

/**
 * Six characters that stand for a piece of text: the same text gives the same
 * six on every machine, and texts that differ by one space give different ones.
 *
 * cyrb53, a small well-mixed hash, because shared code may not use Node's
 * crypto and nothing here needs to be secret — only stable and spread out.
 * Six characters of base 36 is about two billion values, and the only texts
 * that ever share a readable part are his handful of spacing variants.
 */
export function tagOf(text: string): string {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & second) + (first >>> 0);
  return hash.toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

/**
 * The name b-notes gives its copy of a Resoph text: the title made safe, and a
 * tag worked out from the Resoph file's exact name.
 *
 * Nothing else goes into it, so every machine that copies this Resoph file
 * writes the same file, and his spacing variants — `Pismo`, `   Pismo` — which
 * make the same readable part, still get different tags.
 */
export function copyNameFor(resophStem: string): string {
  return `${safeTitle(titleOfResophName(resophStem))} ~${tagOf(resophStem)}`;
}

/*
  The code at the end of a copy's name, with the number a second copy of the
  same Resoph file is given after it. Nothing else b-notes names ends this
  way: a text started here ends in the moment and the machine.
*/
const COPY_CODE = /~([0-9A-Z]{6})(?: \d+)?$/;

/**
 * The code a text taken over from Resoph carries in its file name, `~K3F9A2`,
 * or null for a text that has none. It never changes while the text is in
 * b-notes, whatever he does to its title, which is what makes it the way back
 * from the stub left in Resoph.
 */
export function codeOf(id: string): string | null {
  const found = COPY_CODE.exec(id);
  return found === null ? null : `~${found[1] ?? ''}`;
}

/** A machine's name as it can stand in a filename. */
function safeMachine(machine: string): string {
  const plain = withoutDiacritics(machine).replace(/[^A-Za-z0-9-]/g, '').slice(0, 20);
  return plain.length > 0 ? plain : 'PC';
}

/**
 * The name for a text he starts in b-notes: the first line made safe, and the
 * moment and machine it was started on.
 *
 * Unique by construction. Two machines each starting a text that opens with
 * `Pismo` offline would otherwise both write `Pismo.txt`, and Dropbox would make
 * one text of two.
 */
export function newNameFor(title: string, when: Date, machine: string): string {
  return `${safeTitle(title)} ~${versionName(when)} ${safeMachine(machine)}`;
}

/**
 * `base`, or `base 2`, `base 3`… — whichever is free.
 *
 * Only for the rare moves inside b-notes' own folder — back from Obrisano or
 * an archive — where a name built to be unique has somehow met itself. Never
 * a way of naming a text in the first place: that is decided without looking,
 * above.
 */
export function unusedName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let count = 2; ; count += 1) {
    const candidate = `${base} ${count}`;
    if (!taken.has(candidate)) return candidate;
  }
}
