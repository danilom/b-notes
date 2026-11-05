/*
  What the Lektor sidebar asks of an AI, whichever one is behind it. The one seam
  between the screens and the service: the fake answers instantly with canned words,
  the real one goes to Gemini.
*/

export type PresetId = 'letters' | 'grammar' | 'wording';

export type LektorFailure = 'offline' | 'overloaded' | 'limit' | 'bad-key' | 'cut-off' | 'too-long';

export class LektorServiceError extends Error {
  readonly failure: LektorFailure;

  constructor(failure: LektorFailure) {
    super(`The service answered: ${failure}`);
    this.failure = failure;
  }
}

export interface CorrectionRequest {
  text: string;
  preset: PresetId;
  /** What he reads on the screen as the instruction. */
  instruction: string;
  /** What he added himself; empty if nothing. */
  note: string;
}

/** What was read before, and what was said about it. Without the old text it can only guess what changed, and it does. */
export interface EarlierReading {
  text: string;
  comment: string;
}

export interface LektorService {
  /** Whether a key is needed from him, or the service has one already. */
  needsKey: () => boolean;
  /** Whether the internet can be reached at all. */
  connectionCheck: (signal: AbortSignal) => Promise<void>;
  keyCheck: (key: string, signal: AbortSignal) => Promise<void>;
  feedback: (text: string, signal: AbortSignal) => Promise<string>;
  /** Carries on from an earlier comment, on a text he has changed since. */
  secondLook: (text: string, earlier: EarlierReading, signal: AbortSignal) => Promise<string>;
  corrections: (request: CorrectionRequest, signal: AbortSignal) => Promise<string>;
}
