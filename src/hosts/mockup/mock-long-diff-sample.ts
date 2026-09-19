import { DAY, HOUR, type SampleCopy, type SampleFile, sampleFilesFor } from './mock-sample-files.ts';

/**
 * A long text carrying the kind of editing he actually does, for looking at a
 * diff that has to scroll.
 *
 * The prose is invented and generated rather than written out here: a fixture
 * whose point is its length would otherwise be several thousand words of source
 * nobody reads. Seeded, so it is the same text on every start — a diff sample
 * that shifted under you would be worse than none.
 *
 * What is worth reading is `STATES` at the bottom. Each entry is one past state
 * of the text, named for the edit that took it to the next, so the copies can
 * be understood without reading a word of the prose.
 */
export const LONG_SAMPLE_ID = 'Long diff sample';

const TITLE = LONG_SAMPLE_ID;

/** His own flavour, taken from the corpus generator so it sits in the list unremarkably. */
const WORDS =
  `i u na za se je da ne su bio bila kao sve što još samo tada onda ovdje tamo
   čovjek žena dijete kuća grad more planina put voda kamen drvo sunce mjesec
   noć dan jutro veče ljeto zima pamćenje priča riječ jezik pjesma slika boja
   vrijeme godina sjećanje tišina glas korak ruka oko srce misao san istina
   lice prozor vrata sto stolica knjiga papir olovka pismo brat sestra majka
   otac djed baba prijatelj susjed vojnik general voz brod most rijeka polje
   šuma snijeg kiša vjetar oblak zvijezda pas mačka ptica konj cvijet trava`
    .split(/\s+/)
    .filter((word) => word.length > 0);

/** Mulberry32: four lines, and the same text on every machine. */
function randomFrom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function makeParagraphs(count: number, seed: number): string[] {
  const random = randomFrom(seed);
  const pick = <T,>(from: readonly T[]): T => from[Math.floor(random() * from.length)] as T;
  const between = (least: number, most: number): number =>
    least + Math.floor(random() * (most - least + 1));

  const sentence = (): string => {
    const words = Array.from({ length: between(6, 13) }, () => pick(WORDS));
    const said = words.join(' ');
    return `${said.charAt(0).toUpperCase()}${said.slice(1)}${random() < 0.12 ? '?' : '.'}`;
  };

  return Array.from({ length: count }, () =>
    Array.from({ length: between(3, 6) }, sentence).join(' '),
  );
}

const without = (paragraphs: readonly string[], from: number, count: number): string[] => [
  ...paragraphs.slice(0, from),
  ...paragraphs.slice(from + count),
];

const moved = (paragraphs: readonly string[], from: number, to: number): string[] => {
  const rest = without(paragraphs, from, 1);
  const carried = paragraphs[from];
  if (carried === undefined) return [...paragraphs];
  return [...rest.slice(0, to), carried, ...rest.slice(to)];
};

const replacing = (paragraphs: readonly string[], at: number, with_: string): string[] =>
  paragraphs.map((paragraph, index) => (index === at ? with_ : paragraph));

/** One sentence of a paragraph changed, and the rest of it left alone. */
const editedSentence = (paragraph: string, said: string): string => {
  const sentences = paragraph.split(/(?<=[.?]) /);
  return [...sentences.slice(0, -1), said].join(' ');
};

const OPENING = 56;
const SEED = 20260920;

const original = [TITLE, ...makeParagraphs(OPENING, SEED)];
/** A section he decided did not belong, taken out in one go. */
const afterCutting = without(original, 31, 6);
/** A paragraph carried up the page, and another one written again from scratch. */
const afterRearranging = replacing(
  moved(afterCutting, 6, 21),
  // Clear of the run deleted further down, or nothing would ever see it
  // rewritten: both states would have lost the paragraph either way.
  27,
  makeParagraphs(1, SEED + 1)[0] ?? '',
);
/** Two months later, four more paragraphs at the end. */
const afterWritingMore = [...afterRearranging, ...makeParagraphs(4, SEED + 2)];
/**
 * What he has now: seven paragraphs gone in one save — the accident the copies
 * exist for — and one sentence changed elsewhere, which paragraph-level
 * comparison can only report as a whole paragraph swapped.
 */
const afterDeleting = without(afterWritingMore, 9, 7);
const now = replacing(
  afterDeleting,
  23,
  editedSentence(
    afterDeleting[23] ?? '',
    'Ovu rečenicu je promijenio poslije, i samo nju u cijelom pasusu.',
  ),
);

const asText = (paragraphs: readonly string[]): string => paragraphs.join('\n\n');

/**
 * Each past state, newest first, named for the edit that ended it.
 *
 * Every one of them is further from his text than the one before, which is what
 * a list of copies of a text he keeps working on actually looks like.
 */
const STATES: { ago: number; ended: string; paragraphs: readonly string[] }[] = [
  { ago: 2 * HOUR, ended: 'seven paragraphs deleted, and one sentence edited', paragraphs: afterWritingMore },
  { ago: 9 * DAY, ended: 'four paragraphs written at the end', paragraphs: afterRearranging },
  { ago: 63 * DAY, ended: 'one paragraph moved up, one rewritten', paragraphs: afterCutting },
  { ago: 240 * DAY, ended: 'a six-paragraph section cut', paragraphs: original },
];

export const LONG_SAMPLE_TEXT = asText(now);

const COPIES: SampleCopy[] = STATES.map(({ ago, paragraphs }) => ({ ago, text: asText(paragraphs) }));

/** Every file the long sample is made of. */
export function longDiffSample(when: number, writingFolder: string): SampleFile[] {
  return sampleFilesFor(
    writingFolder,
    LONG_SAMPLE_ID,
    { text: LONG_SAMPLE_TEXT, ago: 35 * 60_000, copies: COPIES },
    when,
  );
}
