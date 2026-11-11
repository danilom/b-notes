import type { LektorProgress } from '../../platform/lektor-progress.ts';

/*
  What the Lektor asks of an AI, whichever one is behind it: the one seam between the panel
  and the services. Google's and OpenRouter's ways of saying things stop here.
*/

export type PresetId = 'letters' | 'grammar' | 'wording' | 'rewrite';

/** What a request is for: the utisak, or one kind of correction. Which models it may use follows from it. */
export type Work = 'comment' | PresetId;

/** What he chooses: only ever free or paid. Which paid model runs follows from the work (spec §2). */
export type Choice = 'free' | 'paid';

/**
 * Why a request came to nothing, told apart as he must hear them differently (spec §10).
 * `busy` covers a refusal for load, a per-minute limit and running out of time; `daily-limit` is
 * Google's day's free quota spent, and only that.
 */
export type LektorFailure = 'offline' | 'busy' | 'daily-limit' | 'bad-key' | 'no-credit' | 'cut-off' | 'too-long' | 'declined' | 'not-brought-over';

export class LektorServiceError extends Error {
  readonly failure: LektorFailure;
  /** What the service actually said, for the log. Not for him to have to read. */
  readonly detail: string;
  /** The remote service's own words, if it gave any: shown to him, small, to pass on to whoever helps him. */
  readonly serviceSaid: string;

  constructor(failure: LektorFailure, detail = '', serviceSaid = '') {
    super(`The service answered: ${failure}`);
    this.failure = failure;
    this.detail = detail;
    this.serviceSaid = serviceSaid;
  }
}

/** What came back: the words, the model that wrote them as the reply names it, and on paid what it cost. */
export interface LektorReply {
  words: string;
  model: string;
  /** In dollars, as the reply stated it; null on free. */
  cost: number | null;
}

/** One request to one model. */
export interface Asking {
  model: string;
  system: string;
  input: string;
  /** Told as it moves on: begun, thinking, writing. */
  onProgress?: (progress: LektorProgress) => void;
}

export interface CorrectionRequest {
  text: string;
  preset: PresetId;
  /** What he reads on the screen as the instruction. */
  instruction: string;
  /** What he added himself; empty if nothing. */
  note: string;
}

export interface LektorService {
  /** Who his text goes to. */
  company: 'google' | 'openrouter';
  /** Whether this key is taken. Refused as `bad-key`. */
  keyCheck: (key: string, signal: AbortSignal) => Promise<void>;
  /** One model, once. Throws a `LektorServiceError` for anything but a whole reply. */
  ask: (asking: Asking, signal: AbortSignal) => Promise<LektorReply>;
}
