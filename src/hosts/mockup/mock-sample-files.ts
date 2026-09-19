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
