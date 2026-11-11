import { FileMissing, type FileSystem } from '../../platform/file-system.ts';
import { describeError, type Log } from '../../platform/logging.ts';

/*
  What the Lektor last said about a text, kept so that closing the app doesn't throw away what
  took minutes and may have cost money. In `userData`, so on this computer only and safe to
  delete. A file per text, named by a hash: his names are hostile, and this needn't be readable.
*/

/** A set of corrections he hasn't taken: the latest of its kind, whichever Lektor made it. */
export interface KeptProposal {
  preset: string;
  proposed: string;
  /** What made them, by the model that ran, which may not be what would make them today. */
  model: string;
  /** When they were made, for "od pre 3 dana"; 0 when that isn't known, as from an older version. */
  madeAt: number;
  /** What they cost on paid, as the reply stated it; null on free or when not known. */
  cost: number | null;
}

export interface KeptResults {
  feedback: string;
  /** The text as the Lektor last read it. */
  readText: string;
  readAt: number;
  /**
   * Who wrote the comment, by the model that ran. An older version kept the Lektor's level
   * instead (`free`, `thorough`); empty when that isn't known.
   */
  readBy: string;
  /** What the comment cost on paid; null on free or when not known. */
  commentCost: number | null;
  /** The corrections he hasn't taken: one set per kind, the latest. */
  proposals: KeptProposal[];
  /** The text they were all made from: they apply to that and to nothing else. */
  proposalsFor: string;
  /**
   * What each kind last cost when it was paid for on this text, for "Prošli put za ovaj tekst".
   * Kept apart from the sets, so it outlives a newer set, a changed text and the sets being taken.
   */
  paidCosts: Partial<Record<string, number>>;
}

const FOLDER = 'lektor-kept';

/** A stray Enter at the very end doesn't make it another text: nothing of his could be undone by treating it as the same. */
export const isSameText = (one: string, other: string): boolean => one.trimEnd() === other.trimEnd();

/** Corrections with the text's own ending, so that the review doesn't offer to change it back. */
export const withEndingOf = (text: string, proposed: string): string => proposed.trimEnd() + text.slice(text.trimEnd().length);

type Proposals = Pick<KeptResults, 'proposals' | 'proposalsFor' | 'paidCosts'>;

/** The set of this kind he can look at now: none on a text that has changed since, where the review would offer to undo his edits. */
export function keptSet({ proposals, proposalsFor }: Pick<KeptResults, 'proposals' | 'proposalsFor'>, text: string, preset: string): KeptProposal | null {
  if (!isSameText(text, proposalsFor)) return null;
  return proposals.find((kept) => kept.preset === preset) ?? null;
}

/** Whether there were sets, now void because his text has changed: said in one line, however many. */
export const areSetsVoid = ({ proposals, proposalsFor }: Pick<KeptResults, 'proposals' | 'proposalsFor'>, text: string): boolean =>
  proposals.length > 0 && !isSameText(text, proposalsFor);

/**
 * With a new set added: it replaces the one of the same kind, whoever made either, even a free one
 * after a paid one (spec §8). A changed text leaves none of the others standing. A paid set's cost
 * is remembered for its kind.
 */
export function withCorrections({ proposals, proposalsFor, paidCosts }: Proposals, text: string, kept: KeptProposal): Proposals {
  const stillFitting = isSameText(text, proposalsFor) ? proposals : [];
  return {
    proposals: [...stillFitting.filter((other) => other.preset !== kept.preset), kept],
    proposalsFor: text,
    paidCosts: kept.cost === null ? paidCosts : { ...paidCosts, [kept.preset]: kept.cost },
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

const numberOr = <T>(value: unknown, otherwise: T): number | T => (typeof value === 'number' && Number.isFinite(value) ? value : otherwise);

/** A set as stored, checked; an older version's has no time or cost, and its level and note are no longer read. */
function keptProposalFrom(stored: unknown): KeptProposal | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { preset, proposed, model, madeAt, cost } = stored as Record<string, unknown>;
  if (typeof preset !== 'string' || typeof proposed !== 'string' || typeof model !== 'string') return null;
  return { preset, proposed, model, madeAt: numberOr(madeAt, 0), cost: numberOr(cost, null) };
}

/** One set per kind: of an older version's two of one kind (one from each Lektor), the later stored stands. */
function onePerKind(proposals: readonly KeptProposal[]): KeptProposal[] {
  return [...new Map(proposals.map((kept) => [kept.preset, kept])).values()];
}

function paidCostsFrom(stored: unknown): Partial<Record<string, number>> {
  if (typeof stored !== 'object' || stored === null) return {};
  return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
}

/**
 * Whatever was stored is checked before it is believed: it may be from an older version, or damaged,
 * or another text's. Corrections that can't be believed cost only asking again, so the comment,
 * which he may want to read and may have cost money, is not given up along with them.
 */
export function keptResultsFrom(stored: unknown, textName: string): KeptResults | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { name, feedback, readText, readAt, readBy: storedBy, commentCost, proposals, proposalsFor, paidCosts } = stored as Record<string, unknown>;
  if (name !== textName) return null;
  if (typeof feedback !== 'string' || typeof readText !== 'string' || typeof readAt !== 'number') return null;
  const comment = { feedback, readText, readAt, readBy: typeof storedBy === 'string' ? storedBy : '', commentCost: numberOr(commentCost, null), paidCosts: paidCostsFrom(paidCosts) };
  if (!Array.isArray(proposals) || typeof proposalsFor !== 'string') return { ...comment, proposals: [], proposalsFor: '' };
  const believed = proposals.map(keptProposalFrom).filter((kept): kept is KeptProposal => kept !== null);
  return { ...comment, proposals: onePerKind(believed), proposalsFor };
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
