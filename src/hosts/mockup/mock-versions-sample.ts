import { versionName } from '../../notes/note-naming.ts';

/**
 * A text with a copy of every shape the versions list can show.
 *
 * Placed on every start rather than only into an empty browser, so it is always
 * there and always says the same thing — the rows are what is being looked at,
 * and a fixture that has been edited since is no use for looking at them. It
 * follows that editing this text in the browser does not survive a reload.
 *
 * Only the browser host has it. The packaged app is never built from this
 * folder, so there is nothing here to leave switched on by accident.
 */
export const SAMPLE_ID = 'Versions sample';

const TITLE = SAMPLE_ID;
const OLD_TITLE = 'Staro ime';

const A = 'A. Ovaj pasus stoji u svakoj kopiji, pa se nigde ne pojavljuje kao razlika.';
const B = 'B. Ovaj pasus je u tekstu sada. Kopija koja ga nema prijavljuje ga kao Nedostaje.';
const C = 'C. I ovaj je u tekstu sada, a neke kopije su ga izgubile.';
const X = 'X. Ovog pasusa više nema u tekstu. Kopija koja ga čuva prijavljuje ga kao Dodato.';
const Y = 'Y. Još jedan pasus koji je ispao iz teksta, uz naslov koji je tada bio drugačiji.';
/** The same thirteen words as C, so the row has no difference in length to report. */
const C_SAME_LENGTH = 'C. Ali ovde je ovaj pasus drugačiji, iako je broj reči isti tu.';

const text = (...paragraphs: string[]): string => paragraphs.join('\n\n');

/** What the text says now, which every copy below is read against. */
export const SAMPLE_TEXT = text(TITLE, A, B, C);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * One copy and the row it is there to produce.
 *
 * `shows` is not read by anything — it is the label on the fixture, so that a
 * row that stops matching its description is visible as one.
 */
interface SampleVersion {
  ago: number;
  shows: string;
  text: string;
}

const VERSIONS: SampleVersion[] = [
  {
    ago: 12 * MINUTE,
    shows: 'longer, and holds one paragraph his text has lost',
    text: text(TITLE, A, B, C, X),
  },
  {
    ago: 3 * HOUR,
    shows: 'shorter, and has nothing to give back',
    text: text(TITLE, A, B),
  },
  {
    ago: 26 * HOUR,
    shows: 'differs both ways at once',
    text: text(TITLE, A, X, C),
  },
  {
    ago: 4 * DAY,
    shows: 'opened under a different title',
    text: text(OLD_TITLE, A, B, C, Y),
  },
  {
    ago: 5 * DAY,
    shows: 'nothing at all — dropped from the list before it is drawn',
    text: SAMPLE_TEXT,
  },
  {
    ago: 40 * DAY,
    shows: 'the same number of words, and not the same writing',
    text: text(TITLE, A, B, C_SAME_LENGTH),
  },
  {
    ago: 800 * DAY,
    shows: 'no difference lines, because he rewrote all of it',
    text: text('Sasvim drugi tekst', 'Nijedan pasus odavde nije ostao u tekstu.'),
  },
];

export interface SampleFile {
  path: string;
  text: string;
  updatedAt: number;
}

/**
 * Every file the sample is made of, ready to be written over whatever is there.
 *
 * @param now What to hang the copies' ages off, so they stay recent however
 * long the browser has had them.
 * @param writingFolder Where the host keeps his texts.
 */
export function versionsSample(now: number, writingFolder: string): SampleFile[] {
  const note: SampleFile = {
    path: `${writingFolder}/${SAMPLE_ID}.txt`,
    text: SAMPLE_TEXT,
    updatedAt: now - 8 * MINUTE,
  };

  return [
    note,
    ...VERSIONS.map(({ ago, text: kept }): SampleFile => {
      const takenAt = now - ago;
      return {
        path: `${writingFolder}/Verzije/${SAMPLE_ID}/${versionName(new Date(takenAt))}.txt`,
        text: kept,
        updatedAt: takenAt,
      };
    }),
  ];
}
