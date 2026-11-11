import type { LektorProgress } from '../../platform/lektor-progress.ts';
import { type Choice, type LektorFailure, type LektorReply, type LektorService, LektorServiceError, type Work } from './lektor-service.ts';
import { freeModelsFor, PAID_FLASH, paidModelFor, type Tier, tierOfModel } from './lektor-tiers.ts';

/*
  Which model a request goes to, and when it moves on (spec §2, §5):

  - Paid: the work's own paid model, once.
  - Free: 3.8 first. Where the work allows it (utisak, Slova, Pravopis), 3.6 stands in, silently,
    when 3.8 is refused as busy, has its day's limit spent, or is still queued at one minute.
  - Ticked ("Ako čeka duže od 2 minuta…"): a free request still queued two minutes after sending,
    counted across both free models, goes to paid Flash, never Opus. So does one refused as busy or
    spent on the last free model, at once.
  - Only a request still queued is ever moved: once the service says work began, it waits.

  Nothing here knows about screens. It reports its stages as they change, for the wait to draw,
  and takes its clock from outside so its minutes can be tested in no time.
*/

/** One free model's turn before 3.6 stands in for it. */
export const FALLBACK_AFTER_MS = 60_000;
/** From sending, before a ticked free request still queued goes to paid Flash. */
export const HAND_OVER_AFTER_MS = 120_000;

export type StagePhase = 'queue' | 'refused' | 'spent' | 'thinking' | 'writing';

/** A line of the wait: what the request was doing, on which model, and for how long. */
export interface Stage {
  phase: StagePhase;
  tier: Tier;
  /** The model asked: on a free queue it changes, 3.8 to 3.6, and the line stays one. */
  model: string;
  startedAt: number;
  endedAt: number | null;
  /** Left for the next, never finished: a queue given up, a refusal, a day's limit. */
  isGivenUp: boolean;
}

export interface Clock {
  now: () => number;
  /** Calls `then` after `ms`; the function it returns calls that off. */
  after: (ms: number, then: () => void) => () => void;
}

export interface ChainParts {
  free: LektorService;
  paid: LektorService;
  clock: Clock;
  /** Told whenever a stage starts, ends or changes model, and as the writing grows (0 to 1). */
  onChange: (stages: readonly Stage[], writtenShare: number) => void;
  /** One line per model asked, and how it went. Never the text. */
  log: (message: string, detail: Record<string, unknown>) => void;
}

export interface ChainRequest {
  work: Work;
  choice: Choice;
  /** He ticked the box, and there is a paid key to hand on with. */
  mayHandOver: boolean;
  system: string;
  input: string;
}

/** A failure as he must hear it: the kind, and whose it was, which decides the shortcut offered. */
export type ChainFailure = LektorFailure | 'broke-after-hand-over';

export class ChainError extends Error {
  readonly failure: ChainFailure;
  /** Free or paid: whose trouble it was. The shortcut offered is to the other. */
  readonly side: Choice;
  readonly detail: string;
  readonly serviceSaid: string;

  constructor(failure: ChainFailure, side: Choice, from: LektorServiceError) {
    super(`The Lektor's request failed: ${failure} (${side})`);
    this.failure = failure;
    this.side = side;
    this.detail = from.detail;
    this.serviceSaid = from.serviceSaid;
  }
}

export interface ChainReply extends LektorReply {
  /** Who made it, by the model that ran. */
  tier: Tier;
  /** A free request that went to paid Flash. */
  isHandedOver: boolean;
}

type Attempt = { kind: 'answered'; reply: LektorReply } | { kind: 'given-up' } | { kind: 'refused'; error: LektorServiceError };

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

/**
 * Runs one request to the end along the chain.
 *
 * @param signal Aborted when he gives up or closes: rejects with an `AbortError`, and nothing is moved on.
 * @throws {ChainError} When it came to nothing.
 */
export async function runModelChain(request: ChainRequest, parts: ChainParts, signal: AbortSignal): Promise<ChainReply> {
  const { clock } = parts;
  const sentAt = clock.now();
  const stages: Stage[] = [];
  let writtenShare = 0;
  const changed = (): void => parts.onChange(stages.map((stage) => ({ ...stage })), writtenShare);

  const endStage = (isGivenUp = false): void => {
    const current = stages.at(-1);
    if (current === undefined || current.endedAt !== null) return;
    current.endedAt = clock.now();
    current.isGivenUp = isGivenUp;
  };

  /** A new line; but a free queue going on with the other free model stays the one line, only its model changing. */
  const startStage = (phase: StagePhase, tier: Tier, model: string): void => {
    const current = stages.at(-1);
    if (phase === 'queue' && current?.phase === 'queue' && current.endedAt === null) {
      current.model = model;
      changed();
      return;
    }
    if (current?.phase === phase && current.endedAt === null) return;
    endStage();
    stages.push({ phase, tier, model, startedAt: clock.now(), endedAt: null, isGivenUp: false });
    changed();
  };

  /** A refusal or a spent day noted as a line of its own, where it sends the request to paid. */
  const noteTurnedAway = (phase: 'refused' | 'spent', model: string): void => {
    endStage(true);
    const now = clock.now();
    stages.push({ phase, tier: 'free', model, startedAt: now, endedAt: now, isGivenUp: true });
    changed();
  };

  const progressFor = (tier: Tier, model: string, onStarted: () => void) => (progress: LektorProgress): void => {
    if (progress.kind === 'started') {
      onStarted();
      return;
    }
    if (progress.kind === 'thinking') {
      startStage('thinking', tier, model);
      return;
    }
    // Measured against his text: a correction comes back about as long; a utisak only shows as begun.
    writtenShare = Math.min(1, progress.characters / Math.max(1, request.input.length));
    startStage('writing', tier, model);
    changed();
  };

  /** One free model, given up if it is still queued at `deadline`. */
  async function freeAttempt(model: string, deadline: number | null): Promise<Attempt> {
    startStage('queue', 'free', model);
    const controller = new AbortController();
    let hasStarted = false;
    let isGivenUp = false;
    const forward = (): void => controller.abort();
    signal.addEventListener('abort', forward);
    const cancelTimer =
      deadline === null
        ? () => {}
        : clock.after(Math.max(0, deadline - clock.now()), () => {
            if (hasStarted) return;
            isGivenUp = true;
            controller.abort();
          });
    const onProgress = progressFor('free', model, () => {
      hasStarted = true;
      endStage();
      changed();
    });
    try {
      const reply = await parts.free.ask({ model, system: request.system, input: request.input, onProgress }, controller.signal);
      return { kind: 'answered', reply };
    } catch (error) {
      if (isGivenUp && !signal.aborted) return { kind: 'given-up' };
      if (error instanceof LektorServiceError) return { kind: 'refused', error };
      throw error;
    } finally {
      cancelTimer();
      signal.removeEventListener('abort', forward);
    }
  }

  async function paidAttempt(model: string, isHandedOver: boolean): Promise<ChainReply> {
    const tier = tierOfModel(model) ?? 'paid-opus';
    startStage('thinking', tier, model);
    const onProgress = progressFor(tier, model, () => {});
    try {
      const reply = await parts.paid.ask({ model, system: request.system, input: request.input, onProgress }, signal);
      endStage();
      changed();
      parts.log('A Lektor model answered', { model, answeredBy: reply.model, cost: reply.cost, isHandedOver });
      return { ...reply, tier, isHandedOver };
    } catch (error) {
      if (!(error instanceof LektorServiceError)) throw error;
      parts.log('A Lektor model failed', { model, failure: error.failure, isHandedOver });
      const failure = isHandedOver && error.failure === 'no-credit' ? 'broke-after-hand-over' : error.failure;
      throw new ChainError(failure, 'paid', error);
    }
  }

  if (request.choice === 'paid') return paidAttempt(paidModelFor(request.work), false);

  const models = freeModelsFor(request.work);
  for (const [at, model] of models.entries()) {
    const isLast = at === models.length - 1;
    // A minute a model where another free one follows; on the last, the two minutes from sending, if ticked.
    const deadline = !isLast ? clock.now() + FALLBACK_AFTER_MS : request.mayHandOver ? sentAt + HAND_OVER_AFTER_MS : null;
    const attempt = await freeAttempt(model, deadline);
    if (attempt.kind === 'answered') {
      endStage();
      changed();
      parts.log('A Lektor model answered', { model, answeredBy: attempt.reply.model });
      return { ...attempt.reply, tier: 'free', isHandedOver: false };
    }
    const failure = attempt.kind === 'given-up' ? 'still queued' : attempt.error.failure;
    parts.log('A Lektor model was given up', { model, failure });
    const isTurnedAway = attempt.kind === 'refused' && (attempt.error.failure === 'busy' || attempt.error.failure === 'daily-limit');
    if (attempt.kind === 'refused' && !isTurnedAway) throw new ChainError(attempt.error.failure, 'free', attempt.error);
    if (!isLast) continue;
    if (!request.mayHandOver) {
      if (attempt.kind === 'refused') throw new ChainError(attempt.error.failure, 'free', attempt.error);
      // Not reachable: without the tick the last free model has no deadline to be given up at.
      throw new ChainError('busy', 'free', new LektorServiceError('busy', 'given up'));
    }
    if (attempt.kind === 'refused') noteTurnedAway(attempt.error.failure === 'daily-limit' ? 'spent' : 'refused', model);
    else {
      endStage(true);
      changed();
    }
    return paidAttempt(PAID_FLASH, true);
  }
  throw new ChainError('busy', 'free', new LektorServiceError('busy', 'no free model to ask'));
}

/** The real clock: `performance.now()`, which never steps back as the wall clock can. */
export const REAL_CLOCK: Clock = {
  now: () => performance.now(),
  after: (ms, then) => {
    const timer = setTimeout(then, ms);
    return () => clearTimeout(timer);
  },
};

export function isStopped(error: unknown): boolean {
  return isAbort(error);
}
