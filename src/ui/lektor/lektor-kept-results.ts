import { FileMissing, type FileSystem } from '../../platform/file-system.ts';
import { describeError, type Log } from '../../platform/logging.ts';

/*
  What the Lektor last said about a text, kept so that closing the app doesn't throw away what
  took minutes and may have cost money. In `userData`, so on this computer only and safe to
  delete. A file per text, named by a hash: his names are hostile, and this needn't be readable.
*/

/** What a set of corrections was asked for: the same again needn't be sent again. */
export interface CorrectionChoice {
  preset: string;
  /** The Lektor that made them: a free reply must not take the place of a paid one. */
  level: string;
  note: string;
}

export interface KeptProposal extends CorrectionChoice {
  proposed: string;
  /** What made them, which may not be what would make them today. */
  model: string;
}

export interface KeptResults {
  feedback: string;
  /** The text as the Lektor last read it. */
  readText: string;
  readAt: number;
  /** Which Lektor wrote the comment. Empty when that isn't known, as from an older version. */
  readBy: string;
  /** The corrections he hasn't taken, one for each kind and Lektor. */
  proposals: KeptProposal[];
  /** The text they were all made from: they apply to that and to nothing else. */
  proposalsFor: string;
}

const FOLDER = 'lektor-kept';

/** A stray Enter at the very end doesn't make it another text: nothing of his could be undone by treating it as the same. */
export const isSameText = (one: string, other: string): boolean => one.trimEnd() === other.trimEnd();

/** Corrections with the text's own ending, so that the review doesn't offer to change it back. */
export const withEndingOf = (text: string, proposed: string): string => proposed.trimEnd() + text.slice(text.trimEnd().length);

const isSameChoice = (one: CorrectionChoice, other: CorrectionChoice): boolean =>
  one.preset === other.preset && one.level === other.level && one.note.trim() === other.note.trim();

/** The corrections already made for just this, if any: against any other text, the review would offer to undo his edits. */
export function savedCorrections({ proposals, proposalsFor }: Pick<KeptResults, 'proposals' | 'proposalsFor'>, text: string, choice: CorrectionChoice): KeptProposal | null {
  if (!isSameText(text, proposalsFor)) return null;
  return proposals.find((kept) => isSameChoice(kept, choice)) ?? null;
}

/** With a new set added: it replaces the same kind from the same Lektor, and a changed text leaves none of the others standing. */
export function withCorrections({ proposals, proposalsFor }: Pick<KeptResults, 'proposals' | 'proposalsFor'>, text: string, kept: KeptProposal): Pick<KeptResults, 'proposals' | 'proposalsFor'> {
  const stillFitting = isSameText(text, proposalsFor) ? proposals : [];
  return {
    proposals: [...stillFitting.filter((other) => other.preset !== kept.preset || other.level !== kept.level), kept],
    proposalsFor: text,
  };
}

/** FNV-1a, which is enough here: the file also says which text it is about, and that is checked. */
function hashOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const fileFor = (appFolder: string, textName: string): string => `${appFolder}/${FOLDER}/${hashOf(textName)}.json`;

function isKeptProposal(stored: unknown): stored is KeptProposal {
  if (typeof stored !== 'object' || stored === null) return false;
  const { preset, level, note, proposed, model } = stored as Record<string, unknown>;
  return typeof preset === 'string' && typeof level === 'string' && typeof note === 'string' && typeof proposed === 'string' && typeof model === 'string';
}

/**
 * Whatever was stored is checked before it is believed: it may be from an older version, or damaged,
 * or another text's. Corrections that can't be believed cost only asking again, so the comment,
 * which he may want to read and may have cost money, is not given up along with them.
 */
export function keptResultsFrom(stored: unknown, textName: string): KeptResults | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { name, feedback, readText, readAt, readBy: storedBy, proposals, proposalsFor } = stored as Record<string, unknown>;
  if (name !== textName) return null;
  if (typeof feedback !== 'string' || typeof readText !== 'string' || typeof readAt !== 'number') return null;
  const readBy = typeof storedBy === 'string' ? storedBy : '';
  if (!Array.isArray(proposals) || typeof proposalsFor !== 'string') return { feedback, readText, readAt, readBy, proposals: [], proposalsFor: '' };
  return { feedback, readText, readAt, readBy, proposals: proposals.filter(isKeptProposal), proposalsFor };
}

export async function readKeptResults(files: FileSystem, appFolder: string, textName: string, log: Log): Promise<KeptResults | null> {
  try {
    return keptResultsFrom(JSON.parse(await files.read(fileFor(appFolder, textName))), textName);
  } catch (error) {
    // Absent is the answer for every text the Lektor hasn't read, so only anything else is worth a line.
    if (!(error instanceof FileMissing)) log.warn('The kept Lektor results could not be read', describeError(error));
    return null;
  }
}

/** A failure costs only the convenience, since the results on screen are still there: logged, and the Lektor carries on. */
export async function writeKeptResults(files: FileSystem, appFolder: string, textName: string, results: KeptResults, log: Log): Promise<void> {
  try {
    await files.write(fileFor(appFolder, textName), JSON.stringify({ name: textName, ...results }));
  } catch (error) {
    log.warn('The Lektor results could not be kept', describeError(error));
  }
}
