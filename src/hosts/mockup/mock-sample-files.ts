import {
  archiveFolderFor,
  archivedVersionsFolderFor,
  baseOf,
  claimName,
  versionName,
} from '../../notes/note-naming.ts';

/**
 * Turning a sample text and its copies into pretend files.
 *
 * The one place in this host that knows where a version file goes and what it
 * is called. The samples themselves are content and nothing else, so a fixture
 * can be read for what it demonstrates rather than for path arithmetic.
 */
export interface SampleFile {
  path: string;
  text: string;
  updatedAt: number;
}

/** One earlier state of a sample text, and how long ago it was that state. */
export interface SampleCopy {
  ago: number;
  text: string;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Every file one sample is made of.
 *
 * @param now What to hang the ages off, so a sample stays recent however long
 * the browser has had it.
 */
export function sampleFilesFor(
  writingFolder: string,
  id: string,
  sample: { text: string; ago: number; copies: readonly SampleCopy[] },
  now: number,
): SampleFile[] {
  const versionAt = (takenAt: number): string =>
    `${writingFolder}/Verzije/${id}/${versionName(new Date(takenAt))}.txt`;

  return [
    { path: `${writingFolder}/${id}.txt`, text: sample.text, updatedAt: now - sample.ago },
    ...sample.copies.map(({ ago, text }): SampleFile => {
      const takenAt = now - ago;
      return { path: versionAt(takenAt), text, updatedAt: takenAt };
    }),
  ];
}

/** One text standing in an archive, before that folder's numbering is applied. */
export interface ArchivedSample {
  /** The name it arrives under, which may collide with another in the folder. */
  wants: string;
  text: string;
  updatedAt: number;
  /** Earlier states of it, kept beside it exactly as a live text's are. */
  copies?: readonly { text: string; takenAt: number }[];
}

/**
 * Every file one archive folder is made of.
 *
 * An archive numbers within itself, like every other folder: a name borrowed
 * from his list arrives carrying the number it has *there*, which is about a
 * collision that happened somewhere else, so it comes off and any collision in
 * here is settled in here. Which is the whole reason this lives beside the
 * version paths rather than in the sample — it is the app's naming rule, and
 * the fixture is not allowed a second copy of it.
 */
export function archiveFilesFor(
  writingFolder: string,
  archive: string,
  texts: readonly ArchivedSample[],
): SampleFile[] {
  const folder = `${writingFolder}/${archiveFolderFor(archive)}`;
  const files: SampleFile[] = [];
  const taken = new Set<string>();

  for (const text of texts) {
    const { id, displaced } = claimName(baseOf(text.wants), null, taken);
    if (displaced !== null) {
      // The one already holding the bare name takes a number, and the file
      // written for it earlier in this loop has to follow.
      for (const written of files) {
        if (written.path === `${folder}/${displaced.from}.txt`) {
          written.path = `${folder}/${displaced.to}.txt`;
        }
      }
      taken.delete(displaced.from);
      taken.add(displaced.to);
    }
    taken.add(id);

    files.push({ path: `${folder}/${id}.txt`, text: text.text, updatedAt: text.updatedAt });
    for (const copy of text.copies ?? []) {
      files.push({
        path: `${writingFolder}/${archivedVersionsFolderFor(archive, id)}/${versionName(new Date(copy.takenAt))}.txt`,
        text: copy.text,
        updatedAt: copy.takenAt,
      });
    }
  }

  return files;
}
