/*
  What the Lektor last said about a text, kept so that closing the app doesn't throw away what
  took minutes and may have cost money. On this computer only. A text with something he hasn't
  seen yet is worth more than the space, and nothing here is ever sent anywhere.
*/

export interface KeptResults {
  feedback: string;
  /** The text as the Lektor last read it. */
  readText: string;
  readAt: number;
  /** The last corrections he neither took nor replaced. */
  proposal: string;
  /** The text they were made from: they apply to that and to nothing else. */
  proposalFor: string;
}

const STORE_PREFIX = 'lektor-kept:';

/** Whatever was stored is checked before it is believed: it may be from an older version, or damaged. */
export function keptResultsFrom(stored: unknown): KeptResults | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { feedback, readText, readAt, proposal, proposalFor } = stored as Record<string, unknown>;
  if (typeof feedback !== 'string' || typeof readText !== 'string' || typeof readAt !== 'number') return null;
  if (typeof proposal !== 'string' || typeof proposalFor !== 'string') return null;
  return { feedback, readText, readAt, proposal, proposalFor };
}

export function readKeptResults(textKey: string): KeptResults | null {
  const raw = window.localStorage.getItem(STORE_PREFIX + textKey);
  if (raw === null) return null;
  try {
    return keptResultsFrom(JSON.parse(raw));
  } catch (error) {
    console.error('The kept Lektor results could not be read', error);
    return null;
  }
}

/** A failure costs only the convenience, since the results on screen are still there: logged, and the Lektor carries on. */
export function writeKeptResults(textKey: string, results: KeptResults): void {
  try {
    window.localStorage.setItem(STORE_PREFIX + textKey, JSON.stringify(results));
  } catch (error) {
    console.error('The Lektor results could not be kept', error);
  }
}
