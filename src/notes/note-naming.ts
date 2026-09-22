/**
 * How a note's text becomes a filename, and how collisions are resolved.
 *
 * Pure on purpose. Both stores use these, so the browser mock produces exactly
 * the ids the real filesystem would — a mock that names things differently
 * would quietly invalidate anything judged against it.
 */

/**
 * Notes are `.txt`. Windows opens that in Notepad on a double-click while `.md`
 * has no default handler at all — and the whole fallback plan is that he can
 * read his own writing without this app.
 */
export const EXTENSION = '.txt';

/**
 * Formats his corpus already holds, which we convert on sight.
 *
 * The Notepad argument applies to these just as much, so leaving them alone
 * would exempt precisely the files the fallback was meant to cover.
 */
export const CONVERTIBLE_EXTENSIONS: readonly string[] = ['.md'];

export function isNoteFile(fileName: string): boolean {
  return fileName.endsWith(EXTENSION);
}

export function isConvertibleNoteFile(fileName: string): boolean {
  return CONVERTIBLE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

/**
 * A note's id is its filename without the extension — never a path, and never
 * carrying `.txt` or `.md`.
 *
 * Which means ids have to be unique where filenames alone would not be:
 * `Esej.md` and `Esej.txt` are one id, not two, and the second of them has to
 * become `Esej (1)`.
 *
 * Ids are derived from his own text and can also arrive from a stale session
 * file or a listing we didn't write, so they're checked. Any subfolder path,
 * such as a put-away note, is built by the store rather than accepted.
 */
export function idOf(fileName: string): string {
  const extension = [EXTENSION, ...CONVERTIBLE_EXTENSIONS].find((candidate) =>
    fileName.endsWith(candidate),
  );
  return extension === undefined ? fileName : fileName.slice(0, -extension.length);
}

export function isNoteId(candidate: string): boolean {
  if (candidate.includes('/') || candidate.includes('\\')) return false;
  if (isNoteFile(candidate) || isConvertibleNoteFile(candidate)) return false;
  return candidate.length > 0 && candidate.trim() === candidate;
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

/** Dropbox renames one side of a sync collision to "essay (Someone's conflicted copy 2026-09-18).txt". */
const CONFLICTED_COPY = /\(.+conflicted copy \d{4}-\d{2}-\d{2}(?: \d+)?\)/i;

/** Our own disambiguating suffix, which looks exactly like Simplenote's. */
const COPY_SUFFIX = / \(\d+\)$/;

/**
 * The name with every one of our suffixes taken off, not merely the last.
 *
 * Stripping once left `Pismo (1) (1)` reading as `Pismo (1)`, so a doubled name
 * never healed: it survived a save, a delete and a restore, gathering another
 * every time it collided again. To exhaustion, so damage already on disk goes
 * the first time the text is written.
 */
function withoutCopySuffix(name: string): string {
  let bare = name;
  for (let shorter = bare.replace(COPY_SUFFIX, ''); shorter !== bare; shorter = bare.replace(COPY_SUFFIX, '')) {
    bare = shorter;
  }
  return bare;
}

const RESERVED_CHARACTERS = '<>:"/\\|?*';
const RESERVED_ON_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function isConflictedCopy(fileName: string): boolean {
  return CONFLICTED_COPY.test(fileName);
}

/**
 * Windows rejects the reserved punctuation outright, and control characters
 * have no business in a filename. Written as a check rather than a regex so no
 * invisible character has to appear in this file.
 */
function withoutUnusableCharacters(title: string): string {
  let out = '';
  for (const character of title) {
    const code = character.codePointAt(0) ?? 0;
    out += RESERVED_CHARACTERS.includes(character) || code < 32 ? ' ' : character;
  }
  return out;
}

/** The filename a title wants, before any collision is resolved. */
export function fileNameBase(title: string): string {
  const cleaned = withoutUnusableCharacters(title)
    .replace(/\s+/g, ' ')
    .trim()
    // Windows silently drops trailing dots, which would desync name from title.
    .replace(/\.+$/, '')
    .trim();

  /*
    His own trailing `(1)` is not allowed to become part of the name.

    The suffix is ours: it is what a collision adds, and a base that already
    carries one stacks another on the next clash — `Pismo (1) (1)`. He labels
    drafts with *prefixes* rather than suffixes, and not one of his 592 titles
    ends this way, so taking the namespace back costs him nothing he does.

    Only the file is affected. The title he reads comes from his text and still
    says whatever he wrote, so the two can differ and he never sees it.
  */
  const bare = withoutCopySuffix(cleaned).trim();

  if (bare.length === 0) return 'Bez naslova';
  if (RESERVED_ON_WINDOWS.test(bare)) return `_${bare}`;
  return bare;
}

/**
 * An id with any disambiguating suffix removed, for comparing against a freshly
 * derived name.
 *
 * Only ever used for that comparison — the title itself always comes from the
 * text, never from parsing an id, so a suffix can't accumulate.
 */
export function baseOf(id: string): string {
  return withoutCopySuffix(idOf(id));
}

/**
 * The first unused id for `base`, treating the note's own id as free.
 *
 * `taken` holds ids, not filenames, so an existing `Esej.md` stops a new note
 * from claiming `Esej` — the two would otherwise be one id over two files.
 *
 * For names that are not his — the timestamp a kept copy is filed under, the
 * name a text takes on its way into `Obrisano` — where the only question is
 * that nothing is overwritten. Texts in his list are named by `claimName`,
 * which has the rest of the rule.
 */
export function nextFreeId(base: string, own: string | null, taken: ReadonlySet<string>): string {
  for (let attempt = 0; ; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base} (${attempt})`;
    if (candidate === own || !taken.has(candidate)) return candidate;
  }
}

/** Our suffix taken off a name: `Pismo (2)` is `Pismo` and 2. */
function splitCopySuffix(name: string): { base: string; number: number } | null {
  const match = / \((\d+)\)$/.exec(name);
  const digits = match?.[1];
  if (match === null || digits === undefined) return null;
  return { base: name.slice(0, match.index), number: Number(digits) };
}

/**
 * The number a text carries, or null if it carries none.
 *
 * What the list shows beside a title, which is why it is read off the name
 * rather than counted: the number he reads has to be the number on the file, or
 * the one time it matters — him in the folder without the app, on the phone —
 * the app has sent him to the wrong file.
 */
export function copyNumberOf(id: string): number | null {
  return splitCopySuffix(id)?.number ?? null;
}

/**
 * The group a name belongs to: everything that would collide on one title.
 *
 * One suffix, not all of them — the same reading `claimName` numbers by. A
 * stacked `Pismo (1) (2)`, which nothing writes any more, is its own group and
 * is settled back to `Pismo (1)` rather than being folded in beside a `Pismo`
 * that may already hold the number it carries.
 */
export function baseGroupOf(id: string): string {
  return splitCopySuffix(id)?.base ?? id;
}

/** One text renamed, and what it is renamed to. */
export interface Renaming {
  from: string;
  to: string;
}

/**
 * The rename a base-group needs, if any, for the invariant to hold:
 *
 *   a group of one is unnumbered; a group of more than one is entirely
 *   numbered; numbers already given never change.
 *
 * At most one, because a group is either size one or it isn't, and only one
 * text can be holding the bare name. One pass always settles it.
 *
 * Called wherever the set of names in a folder changes, and over every group
 * once at startup. It is what makes a group that lost its last sibling drop
 * its number — `Pismo (7)` alone becomes `Pismo` — and what repairs a group
 * left half-numbered by a rename that failed.
 */
export function settleGroup(base: string, ids: ReadonlySet<string>): Renaming | null {
  const members: string[] = [];
  let highest = 0;
  for (const id of ids) {
    if (baseGroupOf(id) !== base) continue;
    members.push(id);
    highest = Math.max(highest, copyNumberOf(id) ?? 0);
  }

  const only = members.length === 1 ? members[0] : undefined;
  if (only !== undefined) {
    // `base` can only be taken by a text outside this group when the group's
    // own name ends in a number — a stacked name nothing writes any more. The
    // rename would overwrite a text, so the malformed name is left standing.
    if (only === base || ids.has(base)) return null;
    return { from: only, to: base };
  }

  if (members.length > 1 && ids.has(base)) return { from: base, to: `${base} (${highest + 1})` };
  return null;
}

/**
 * A name for a text, and the older text that has to move aside for it.
 *
 * `displaced` is the one already holding the bare name. It is not a rename he
 * asked for, which is why it is handed back rather than done here: whoever
 * carries it out has to move that text's kept copies with it, and has to do it
 * where a failure can be reported.
 */
export interface ClaimedName {
  id: string;
  displaced: { from: string; to: string } | null;
}

/**
 * The name a text takes, given everything already in his folder.
 *
 * A text alone in its name stays plain — `Pismo`. The moment a second one
 * wants that name, *both* are numbered: `Pismo (1)` and `Pismo (2)`, and no
 * member of a group is left bare. Half the group would otherwise have to be
 * numbered by counting rows at the time the list is drawn, and a count says
 * `(2)` about a file called `Pismo (1).txt` — which breaks the one promise the
 * plain-text format was chosen to keep, that he can find his own writing in
 * the folder without this app.
 *
 * Numbers only ever go up. Deleting `Pismo (2)` leaves `(1)` and `(3)` behind
 * and the next one is `(4)`, rather than filling the hole: a number that gets
 * reused is a number that means two different texts a month apart, and the
 * gap costs nothing but a gap.
 */
export function claimName(base: string, own: string | null, taken: ReadonlySet<string>): ClaimedName {
  let highest = 0;
  for (const id of taken) {
    if (id === own) continue;
    const split = splitCopySuffix(id);
    if (split !== null && split.base === base) highest = Math.max(highest, split.number);
  }

  const bareTaken = base !== own && taken.has(base);
  if (!bareTaken && highest === 0) return { id: base, displaced: null };

  let next = highest + 1;
  let displaced: ClaimedName['displaced'] = null;
  if (bareTaken) {
    displaced = { from: base, to: `${base} (${next})` };
    next += 1;
  }
  return { id: `${base} (${next})`, displaced };
}
