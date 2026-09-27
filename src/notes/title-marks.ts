import { titleFrom } from './note-title.ts';

/** A mark he puts at the front of a title. */
interface Mark {
  /** Exactly as he types it: case and spaces count. */
  typed: string;
  /** What the list shows in its place, where that is not what he typed. */
  drawn?: string;
  /** Whether a place in a numbered series may follow it: `(UP) II 12`. */
  numbered?: boolean;
}

/**
 * His marks, one row each, as he spells them. Every spelling here was read off
 * his own titles; one that is not here is drawn as the words he typed, which
 * is always safe. A new one is a new row, and a test.
 *
 * Not here: the leading spaces he ranks by, which are the dots (`rankOf`).
 */
const MARKS: readonly Mark[] = [
  // The collection he is building, numbered in reading order. What it stands
  // for is his secret.
  { typed: '(UP)', numbered: true },
  { typed: '*(UP)', drawn: '★(UP)', numbered: true },

  // Kinds — perhaps esej and priča — with the letters that float or sink them.
  { typed: 'A (E)' },
  { typed: 'A(E)' },
  { typed: 'AA(E)' },
  { typed: 'yA (E)' },
  { typed: 'ZA (E)' },
  { typed: 'A(P)' },
  { typed: 'AA(P)' },

  // Letters that only float a text up the list, or sink it to the bottom.
  { typed: 'AA' },
  { typed: 'AAA' },
  { typed: 'AAAA' },
  { typed: 'ZZ' },
  { typed: 'ZZZ' },
  { typed: 'ZZZZ' },
  { typed: 'zz' },
  { typed: 'zzz' },
  { typed: 'zzzz' },
  { typed: 'y' },
];

/** The star he ranks a text by, in front of its name and after any mark. */
const STARS: readonly Mark[] = [
  { typed: '*', drawn: '★' },
  { typed: 'A*', drawn: 'A★' },
];

/*
  Where a mark ends. After a mark come spaces, or it runs straight into a
  capitalised word — `AAKafana`, `AA(E)Kafana`. Anything else and the letters
  are the start of a word of his, not a mark: `AABB grupa`, `zz1`.

  A star may run into anything: `*GRAD`, `*3USAoc`.

  After a numbered mark, maybe a place in the series: the series in roman
  numerals if he names one, then the number. The spaces around the number are
  his padding, right-aligned by hand so that 3 sorts above 12 above 104.
*/
const CAPITALISED_WORD = /^[A-ZČĆŠĐŽ][a-zčćšđž]/;
const SERIES_POSITION = /^(?:([IVX]{1,4})\s+)?(\d+)\s+/;

/**
 * His title as the list draws it: the mark he files it under, its place in a
 * numbered series, his star, and the rest.
 */
export interface TitleParts {
  /** As the list draws it: `(UP)`, `A (E)`, `AA`, `★(UP)`. */
  mark: string | null;
  /** Where it stands in a series under `(UP)`: `12`, `II 104`. */
  position: SeriesPosition | null;
  /** As the list draws it: `★`, `A★`. */
  star: string | null;
  /** Everything after, spaces collapsed as in `titleFrom`. */
  name: string;
}

/** A place in one of his numbered series. */
export interface SeriesPosition {
  /** Which series, where he names one: `II`. */
  series: string | null;
  number: string;
}

/**
 * Reads his marks off the front of a title, so the list can draw them as marks
 * rather than as words he wrote.
 *
 * Nothing is dropped but spaces — every letter he typed is still on screen —
 * and the order is untouched: it is read off the line as typed.
 */
export function titlePartsOf(titleLine: string): TitleParts {
  const unmarked: TitleParts = { mark: null, position: null, star: null, name: titleFrom(titleLine) };

  const mark = markAt(titleLine.trimStart(), MARKS, (after) => CAPITALISED_WORD.test(after));
  let rest = mark?.rest ?? titleLine.trimStart();

  let position: SeriesPosition | null = null;
  const place = mark?.numbered === true ? SERIES_POSITION.exec(rest) : null;
  if (place !== null) {
    position = { series: place[1] ?? null, number: place[2] ?? '' };
    rest = rest.slice(place[0].length);
  }

  const star = markAt(rest, STARS, () => true);
  rest = star?.rest ?? rest;

  const name = rest.replace(/\s+/g, ' ').trim();
  // Marks with nothing after them are a title of their own, not marks.
  if ((mark === null && star === null) || name.length === 0) return unmarked;
  return { mark: mark?.drawn ?? null, position, star: star?.drawn ?? null, name };
}

/**
 * The first of these marks the text starts with, and what follows it — or
 * null where none does, or where what follows says the letters are a word.
 *
 * @param mayRunOn Whether the mark may be followed straight by `after`, with
 *   no space between.
 */
function markAt(
  text: string,
  marks: readonly Mark[],
  mayRunOn: (after: string) => boolean,
): { drawn: string; numbered: boolean; rest: string } | null {
  for (const mark of marks) {
    if (!text.startsWith(mark.typed)) continue;
    const after = text.slice(mark.typed.length);
    const gap = /^\s*/.exec(after)?.[0] ?? '';
    if (gap.length === 0 && !mayRunOn(after)) continue;
    return { drawn: mark.drawn ?? mark.typed, numbered: mark.numbered === true, rest: after.slice(gap.length) };
  }
  return null;
}
