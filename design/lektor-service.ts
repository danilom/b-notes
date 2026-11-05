/*
  What the Lektor sidebar asks of an AI, whichever one is behind it. The one seam
  between the screens and the service: the fake answers instantly with canned words,
  the real one goes to Gemini.
*/

export type PresetId = 'letters' | 'grammar' | 'wording' | 'rewrite';

export type LektorFailure = 'offline' | 'overloaded' | 'limit' | 'bad-key' | 'cut-off' | 'too-long';

export class LektorServiceError extends Error {
  readonly failure: LektorFailure;
  /** What the service actually said, for whoever is looking into it. Not for him to have to read. */
  readonly detail: string;

  constructor(failure: LektorFailure, detail = '') {
    super(`The service answered: ${failure}`);
    this.failure = failure;
    this.detail = detail;
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
  /** The model that will write the comment. */
  commentModel: string;
  /** Whether the service has a key, or needs one from him. */
  hasKey: () => boolean;
  /** Each service its own, so that a key typed for one never reaches the other. */
  rememberKey: (key: string) => void;
  /** Whether the internet can be reached at all. */
  connectionCheck: (signal: AbortSignal) => Promise<void>;
  keyCheck: (key: string, signal: AbortSignal) => Promise<void>;
  feedback: (text: string, signal: AbortSignal) => Promise<string>;
  /** Carries on from an earlier comment, on a text he has changed since. */
  secondLook: (text: string, earlier: EarlierReading, signal: AbortSignal) => Promise<string>;
  corrections: (request: CorrectionRequest, signal: AbortSignal) => Promise<string>;
}
