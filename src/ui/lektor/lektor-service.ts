/*
  What the Lektor asks of an AI, whichever one is behind it: the one seam between the
  sidebar and the services. Google's and Anthropic's ways of saying things stop here.
*/

export type PresetId = 'letters' | 'grammar' | 'wording' | 'rewrite';

export type LektorFailure = 'offline' | 'overloaded' | 'limit' | 'bad-key' | 'cut-off' | 'too-long' | 'declined' | 'no-credit' | 'not-brought-over';

export class LektorServiceError extends Error {
  readonly failure: LektorFailure;
  /** What the service actually said, for the log. Not for him to have to read. */
  readonly detail: string;
  /** The remote service's own words, if it gave any: shown to him, small, to pass on to whoever helps him. */
  readonly serviceSaid: string;
  /** What to tell him where trying again can't help for now; empty where it might. */
  readonly finalSentence: string;

  constructor(failure: LektorFailure, detail = '', serviceSaid = '', finalSentence = '') {
    super(`The service answered: ${failure}`);
    this.failure = failure;
    this.detail = detail;
    this.serviceSaid = serviceSaid;
    this.finalSentence = finalSentence;
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

export interface LektorService {
  /** Who his text goes to. */
  company: 'google' | 'anthropic' | 'nobody';
  /** The model that will write the comment. */
  commentModel: string;
  /** The model that will first be asked for corrections of this kind. */
  correctionModel: (preset: PresetId) => string;
  /** Whether the internet can be reached at all. */
  connectionCheck: (signal: AbortSignal) => Promise<void>;
  keyCheck: (key: string, signal: AbortSignal) => Promise<void>;
  feedback: (text: string, signal: AbortSignal) => Promise<string>;
  /** Carries on from an earlier comment, on a text he has changed since. */
  corrections: (request: CorrectionRequest, signal: AbortSignal) => Promise<string>;
}
