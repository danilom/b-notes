/**
 * What b-notes leaves in a Resoph file when it takes the text over: a short,
 * loud note in place of his words, so that the text lives in one program at a
 * time and Resoph can no longer be written in by mistake.
 *
 * Written into the file rather than the file deleted: Resoph puts back files
 * that disappear from its folder, but reads a changed file as it is.
 */

/** Why the text left Resoph. */
export type StubKind = 'moved' | 'deleted';

/** What goes into the lines for whoever has to find the text again. */
export interface StubFacts {
  kind: StubKind;
  when: Date;
  /** The machine it was taken over on, since the path may differ on another. */
  machine: string;
  /** The text's file in b-notes' folder, as Windows writes the path. */
  path: string;
  /** The code in that file's name, `~K3F9A2`, which b-notes' search finds it by. */
  code: string;
}

/** The first line: loud, and the thing a stub is known by. */
const HEADLINES: Record<StubKind, string> = {
  moved: '!!! OVAJ TEKST JE PREMEŠTEN U B-NOTES !!!',
  deleted: '!!! OVAJ TEKST JE OBRISAN U B-NOTES !!!',
};

/**
 * What to do, in his words. By its code rather than its title: the title is
 * his first line, which he may change, or empty, and his titles repeat; the
 * code stays with the text, and b-notes' search finds exactly that one.
 */
const SAYS: Record<StubKind, readonly string[]> = {
  moved: ['NE PIŠI OVDE — ovde ga više nema.', 'Otvori b-notes i ukucaj {code} u pretragu.'],
  deleted: [
    'NE PIŠI OVDE — ovde ga više nema.',
    'Otvori b-notes, ukucaj {code} u pretragu i vrati ga iz „Obrisani tekstovi".',
  ],
};

/**
 * Where a text's code goes in what the stub says, and what stands in for it
 * when a stub on disk is measured: the same number of characters as any code.
 */
const CODE_SLOT = '{code}';
const ANY_CODE = '~000000';

const saidWith = (kind: StubKind, code: string): string[] =>
  SAYS[kind].map((line) => line.replace(CODE_SLOT, code));

/** Where b-notes can be had, for a machine that does not have it yet. */
const RELEASES = 'https://github.com/danilom/b-notes/releases';

/**
 * Lines for whoever has to recover the text — when, where, and from what — each
 * marked, and each of a shape that ends where it should, so that words typed
 * onto the end of one are not mistaken for part of the stub.
 */
const RECORD = '[b-notes] ';
const RECORD_LINES: readonly RegExp[] = [
  /^\[b-notes\] \d{4}-\d{2}-\d{2} \d{2}:\d{2}, \S{1,40}$/,
  /^\[b-notes\] .+\.txt$/,
  new RegExp(`^\\[b-notes\\] ${RELEASES.replaceAll('.', '\\.')}$`),
];

/**
 * How many characters of his may sit in a stub before it counts as his writing
 * again. A stray keystroke or two stays a stub; a sentence does not, because a
 * text he wrote into must never be hidden.
 */
const STRAY = 20;

const two = (value: number): string => String(value).padStart(2, '0');

/**
 * The part of a line that is one of the stub's marked lines, or null. A few
 * stray characters after it are left off, since the end of the stub is where
 * a stray keystroke is likeliest to land; more than a few, and the line is his.
 */
function recordIn(line: string): string | null {
  if (!line.startsWith(RECORD)) return null;
  for (let stray = 0; stray <= STRAY && stray < line.length; stray += 1) {
    const kept = line.slice(0, line.length - stray);
    if (RECORD_LINES.some((shape) => shape.test(kept))) return kept;
  }
  return null;
}

/** The stub for a text, with Windows line endings, as Resoph writes its own files. */
export function stubText({ kind, when, machine, path, code }: StubFacts): string {
  const at = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}:${two(when.getMinutes())}`;
  return [
    HEADLINES[kind],
    ...saidWith(kind, code),
    '',
    `${RECORD}${at}, ${machine}`,
    `${RECORD}${path}`,
    `${RECORD}${RELEASES}`,
  ].join('\r\n');
}

/**
 * Whether a Resoph file holds a stub b-notes left, rather than his writing.
 *
 * Known by its marks — the loud first line, the marked lines at the end — and
 * forgiving of a few stray characters anywhere, which he is likely to leave.
 * Everything else counts as his: a stub he has written a sentence into is a
 * text of his again.
 *
 * @param body the file's text, as it is on disk.
 */
export function isStub(body: string): boolean {
  const lines = body.replaceAll('\r\n', '\n').split('\n');
  const marked = lines.some((line) => Object.values(HEADLINES).includes(line) || line.startsWith(RECORD));
  if (!marked) return false;

  const counted = (text: string): number => text.replace(/\s/g, '').length;
  const records = lines.map(recordIn).filter((record) => record !== null);
  const stubFor = (kind: StubKind): number =>
    counted([HEADLINES[kind], ...saidWith(kind, ANY_CODE), ...records].join(''));
  const all = counted(lines.join(''));
  // Measured against its own kind, which its first line says. The two differ
  // in length by more than the stray allowance, so measured against either, a
  // moved stub with a sentence of his in it would pass for a deleted one.
  // Either only when that line is gone.
  const kinds = (Object.keys(HEADLINES) as StubKind[]).filter((kind) => lines.includes(HEADLINES[kind]));
  const candidates = kinds.length > 0 ? kinds : (Object.keys(HEADLINES) as StubKind[]);
  return candidates.some((kind) => Math.abs(all - stubFor(kind)) <= STRAY);
}
