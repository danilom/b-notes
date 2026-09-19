import { versionName } from '../../notes/note-naming.ts';

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

/** Where one sample's copies live, so a sample can clear its own before writing. */
export function versionsFolderFor(writingFolder: string, id: string): string {
  return `${writingFolder}/Verzije/${id}/`;
}

/**
 * The files as they should stand once every sample has been placed.
 *
 * Each sample's copies are cleared first. Their ages are counted from now, so
 * their filenames differ on every start — without this they would breed a fresh
 * set on every reload, which is what they did until someone counted the rows.
 */
export function withSamplesPlaced<T extends { text: string; updatedAt: number }>(
  existing: ReadonlyMap<string, T>,
  samples: readonly { id: string; files: readonly SampleFile[] }[],
  writingFolder: string,
  asStored: (file: SampleFile) => T,
): Map<string, T> {
  const files = new Map(existing);

  for (const { id, files: placing } of samples) {
    const under = versionsFolderFor(writingFolder, id);
    for (const path of [...files.keys()]) {
      if (path.startsWith(under)) files.delete(path);
    }
    for (const file of placing) files.set(file.path, asStored(file));
  }
  return files;
}
