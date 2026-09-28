/**
 * What b-notes leaves in a Resoph file when it takes the text over: a short,
 * loud note in place of his words, so that the text lives in one program at a
 * time and Resoph can no longer be written in by mistake.
 *
 * Written into the file rather than the file deleted: Resoph puts back files
 * that disappear from its folder, but reads a changed file as it is.
 */

/*
  ============================================================================
  THIS IS AN ON-DISK FORMAT, AND THE RULE BELOW IS FROZEN.

  Every stub ever written stays in his Resoph folder for good — Resoph puts it
  back if it goes — and a laptop left off for months comes back running an
  old b-notes. So every version, older and newer, must reach the same verdict
  on every stub, whoever wrote it. That only holds if the rule never changes.

  A Resoph file is a stub if and only if:
    1. at least one line starts with `[b-notes]`, leading spaces aside;
    2. what is counted as his comes to 20 characters or fewer.
  Counting ignores spaces, tabs and line breaks. What is counted as his:
    - on a line starting with `[b-notes]`: anything past the first 150
      characters after the prefix;
    - on the first line, when it has no prefix: anything past its first 100
      characters — room for the title Resoph writes there when its
      "include title in file" setting is on;
    - every other line without the prefix: all of it.

  Nothing else is looked at. So the WORDING IS FREE TO CHANGE — any line, any
  number of lines, in any order — as long as every line b-notes writes starts
  with the prefix and fits in 150 characters after it. The prefix, the three
  numbers and the counting are what may never change.

  Every wording that has shipped is kept, verbatim, in
  `test/resoph-stub.test.ts`, and must go on being recognised. Changing the
  wording means adding a sample there; a test fails until you do.
  ============================================================================
*/
const PREFIX = '[b-notes]';
const LINE_ROOM = 150;
const FIRST_LINE_ROOM = 100;
const STRAY = 20;

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

/**
 * What the stub says, in his words. By the text's code rather than its title:
 * the title is his first line, which he may change, or empty, and his titles
 * repeat; the code stays with the text, and b-notes' search finds exactly that
 * one — a deleted text too, from the strip under the list.
 *
 * A moved text is one he will want to go on with, so it says how. A deleted
 * one he need not do anything about, so it says first that it is kept, and
 * only then how to have it back if he ever wants it.
 */
const SAYS: Record<StubKind, (code: string) => readonly string[]> = {
  moved: (code) => [
    '📋 OVAJ TEKST JE PREMEŠTEN U B-NOTES',
    '❌ NE PIŠI OVDE — ovde ga više nema.',
    `Otvori b-notes i ukucaj ${code} u pretragu.`,
  ],
  deleted: (code) => [
    '🗑 OVAJ TEKST JE OBRISAN IZ B-NOTES',
    '❌ NE PIŠI OVDE — ovde ga više nema.',
    'Sačuvan je među obrisanima u b-notes.',
    '',
    'Ako ti ikad zatreba, otvori b-notes,',
    `ukucaj ${code} u pretragu i vrati ga`,
    'iz "Obrisani tekstovi".',
  ],
};

/** Where b-notes can be had, for a machine that does not have it yet. */
const RELEASES = 'https://github.com/danilom/b-notes/releases';

const two = (value: number): string => String(value).padStart(2, '0');

/** Characters as he would count them: letters and marks, not spaces. */
const counted = (text: string): number => [...text.replace(/\s/g, '')].length;

/**
 * A path that fits a stub line, shortened in the middle where it would not.
 * The end is kept, since that is the file's name; the code finds the text
 * either way, and the path is only there for whoever is helping him.
 */
function fitted(label: string, path: string): string {
  const room = LINE_ROOM - [...` ${label} `].length;
  const characters = [...path];
  if (characters.length <= room) return path;
  const head = 20;
  return `${characters.slice(0, head).join('')}…${characters.slice(head + 1 - room).join('')}`;
}

/**
 * The stub for a text: every line prefixed, Windows line endings as Resoph
 * writes its own files, and an empty line last, so a click below the text or
 * Ctrl+End puts him on a line of his own, where what he types counts.
 */
export function stubText({ kind, when, machine, path, code }: StubFacts): string {
  const at = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}:${two(when.getMinutes())}`;
  const lines = [
    ...SAYS[kind](code),
    '',
    `Datum: ${at}, ${machine}`,
    `Fajl: ${fitted('Fajl:', path)}`,
    `Program: ${RELEASES}`,
  ];
  return `${lines.map((line) => (line === '' ? '' : `${PREFIX} ${line}`)).join('\r\n')}\r\n`;
}

/** What follows the prefix on a stub line, or null for a line without one. */
function afterPrefix(line: string): string | null {
  const trimmed = line.trimStart();
  return trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : null;
}

/** Characters past `room`, counted the same way. */
const beyond = (text: string, room: number): number => Math.max(0, counted(text) - room);

interface Measured {
  /** Lines starting with the prefix. */
  marked: number;
  /** Characters counted as his under the frozen rule. */
  his: number;
  /** Characters on the first line that the rule lets pass as a title. */
  allowed: number;
}

function measured(body: string): Measured {
  const lines = body.replaceAll('\r\n', '\n').split('\n');
  const result: Measured = { marked: 0, his: 0, allowed: 0 };
  for (const [index, line] of lines.entries()) {
    const rest = afterPrefix(line);
    if (rest !== null) {
      result.marked += 1;
      result.his += beyond(rest, LINE_ROOM);
    } else if (index === 0) {
      result.his += beyond(line, FIRST_LINE_ROOM);
      result.allowed += counted(line) - beyond(line, FIRST_LINE_ROOM);
    } else {
      result.his += counted(line);
    }
  }
  return result;
}

/**
 * Whether a Resoph file holds a stub b-notes left, rather than his writing.
 * The frozen rule at the top of this file, and nothing else.
 *
 * @param body the file's text, as it is on disk.
 */
export function isStub(body: string): boolean {
  const { marked, his } = measured(body);
  return marked > 0 && his <= STRAY;
}

/**
 * Whether a stub holds anything the rule let pass that is not b-notes' own:
 * a few stray characters, or a first line he wrote. Kept before anything is
 * written over the stub, since the rule only hides these — writing over them
 * is what would lose them.
 */
export function holdsAnythingElse(body: string): boolean {
  const { his, allowed } = measured(body);
  return his + allowed > 0;
}
