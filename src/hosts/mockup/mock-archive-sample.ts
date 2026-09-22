import { type ArchivedSample, DAY, type SampleFile, archiveFilesFor } from './mock-sample-files.ts';

/**
 * Three folders of writing brought in from somewhere else, for building the
 * Arhiva dialog against.
 *
 * Nothing reads them yet. They are here so that when the dialog is written
 * there is already something to point it at that behaves the way the real
 * thing will — which above all means being mostly *duplicates*. An import is
 * overwhelmingly older copies of texts he already has; a fixture of nine
 * interesting unique documents would make the feature look useful in a way it
 * will not be, and would never ask the question the dialog exists to answer,
 * which is "do I already have this one?".
 *
 * So most of what is in here is borrowed from his list and cut back to an
 * earlier state, which gives a comparison against the live text something to
 * show. The few that are unique are the ones that justify the feature at all.
 *
 * No title is written in this file. They are borrowed from the generated
 * corpus and handed in, because his titles are his first lines and this file
 * is in the repository.
 */

/** A live text lent to an archive, to stand in it as an older copy. */
export interface BorrowedText {
  name: string;
  text: string;
}

/**
 * How much of a borrowed text an archived copy still holds.
 *
 * Not the same for each, so a comparison has something uneven to report rather
 * than one paragraph missing from every one of them.
 */
const KEPT = [0.55, 0.8, 0.35, 0.7, 0.45, 0.9] as const;

/** Cut back to roughly what it said earlier, at a paragraph boundary. */
function earlierDraft(text: string, keep: number): string {
  const paragraphs = text.split('\n\n');
  if (paragraphs.length < 2) return text.slice(0, Math.max(1, Math.floor(text.length * keep)));
  return paragraphs.slice(0, Math.max(1, Math.round(paragraphs.length * keep))).join('\n\n');
}

/*
  The texts that are in no folder but an archive — invented here, and the only
  writing in this file. Short, because what is being built against them is the
  list and the bringing-back, not the reading.
*/
const ONLY_HERE = [
  'Pismo iz Kotora\n\nPisao sam ti ovo pismo u jesen, sa terase iznad zaliva.\n\nNikada ga nisam poslao, pa stoji ovde.',
  'Recept moje majke\n\nTri jaja, kasika secera, malo soli.\n\nOstalo se radi po osecaju, govorila je.',
  'Beleske sa puta\n\nVoz je kasnio cetiri sata.\n\nCitao sam i gledao kroz prozor, i nista se vise ne secam.',
  'Spisak za popravku\n\nSlavina u kupatilu.\n\nVrata od ostave koja se ne zatvaraju do kraja.',
] as const;

/**
 * What the one text with copies said before each of them.
 *
 * Aged against the text rather than against today, so a copy is always older
 * than what it is a copy of, however the archives are dated.
 */
const EARLIER_STATES = [
  { before: 150 * DAY, text: 'Pismo iz Kotora\n\nPocinjem ponovo, ne znam kako da nastavim.' },
  { before: 100 * DAY, text: 'Pismo iz Kotora\n\nPisao sam ti ovo pismo u jesen.' },
  {
    before: 40 * DAY,
    text: 'Pismo iz Kotora\n\nPisao sam ti ovo pismo u jesen, sa terase iznad zaliva.',
  },
] as const;

/**
 * One archive as a shape rather than as paths.
 *
 * `borrows` is how many of the lent texts it takes, `unique` which of the
 * invented ones it holds, and `withCopies` whether the first of those carries
 * a Verzije folder. Exactly one archive does: bringing back a text that has a
 * history behind it is its own case, and it needs somewhere to be tried.
 */
interface ArchiveShape {
  name: string;
  ago: number;
  borrows: number;
  unique: readonly number[];
  withCopies?: boolean;
}

// Dated to match what each folder claims to be. A row reading 2023 inside a
// folder called 2021 is a fixture arguing with itself.
const ARCHIVES: readonly ArchiveShape[] = [
  { name: 'Stari laptop 2021', ago: 1750 * DAY, borrows: 2, unique: [0], withCopies: true },
  { name: 'Simplenote 2019', ago: 2600 * DAY, borrows: 3, unique: [1, 2] },
  { name: 'Telefon', ago: 700 * DAY, borrows: 1, unique: [3] },
];

/** How many live texts the sample wants lent to it. */
export const BORROWED_COUNT = ARCHIVES.reduce((sum, archive) => sum + archive.borrows, 0);

/**
 * Every file the three archives are made of.
 *
 * @param borrowed live texts to stand in the archives as earlier copies of
 * themselves — at least `BORROWED_COUNT` of them, and with some body to cut
 * back, or there is nothing for a comparison to find.
 */
export function archiveSample(
  now: number,
  writingFolder: string,
  borrowed: readonly BorrowedText[],
): SampleFile[] {
  const files: SampleFile[] = [];
  let lent = 0;

  for (const archive of ARCHIVES) {
    const texts: ArchivedSample[] = [];

    for (let i = 0; i < archive.borrows; i += 1) {
      const text = borrowed[lent];
      if (text === undefined) break;
      texts.push({
        wants: text.name,
        text: earlierDraft(text.text, KEPT[lent % KEPT.length] ?? 0.5),
        // Staggered within the archive, so the list has an order to show.
        updatedAt: now - archive.ago - lent * 9 * DAY,
      });
      lent += 1;
    }

    archive.unique.forEach((which, index) => {
      const text = ONLY_HERE[which];
      if (text === undefined) return;
      const wroteAt = now - archive.ago + index * 4 * DAY;
      const carries = archive.withCopies === true && index === 0;
      texts.push({
        wants: text.split('\n')[0] ?? `Bez naslova ${which}`,
        text,
        updatedAt: wroteAt,
        ...(carries
          ? {
              copies: EARLIER_STATES.map((was) => ({
                text: was.text,
                takenAt: wroteAt - was.before,
              })),
            }
          : {}),
      });
    });

    files.push(...archiveFilesFor(writingFolder, archive.name, texts));
  }

  return files;
}
