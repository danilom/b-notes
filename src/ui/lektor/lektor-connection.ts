import type { FileSystem } from '../../platform/file-system.ts';
import type { LektorProgress } from '../../platform/lektor-progress.ts';
import type { LektorRequest, LektorResponse } from '../../platform/lektor-remote.ts';
import { describeError, type Log } from '../../platform/logging.ts';
import { balanceAfter, balanceFrom } from './lektor-balance.ts';
import { createGeminiAi } from './lektor-gemini-ai.ts';
import { type ChainReply, type ChainRequest, type Clock, REAL_CLOCK, runModelChain, type Stage } from './lektor-model-chain.ts';
import { createOpenRouterAi } from './lektor-openrouter-ai.ts';
import { type Choice, type LektorService, LektorServiceError } from './lektor-service.ts';
import { callService, connectionCheck, type LektorServiceParts } from './lektor-service-call.ts';
import { type LektorSettings, NO_LEKTOR_SETTINGS, readLektorSettings, writeLektorSettings } from './lektor-settings.ts';

/*
  What the Lektor's panel and its corrections window share about reaching the services: the keys
  he has saved, which of them still work, what is left on the paid account, and the one way a
  request is sent. The panel owns it and lends it to the window.
*/

/** What the panel opens on, once it has looked (spec §4). */
export type Opening = 'ready' | 'no-keys' | 'offline' | 'dead-key';

export interface ConnectionParts {
  askService: (request: LektorRequest, stop: AbortSignal, onProgress: (progress: LektorProgress) => void) => Promise<LektorResponse>;
  files: FileSystem;
  notesFolder: string;
  log: Log;
  clock?: Clock;
}

export interface LektorConnection {
  readSettingsOnce: () => Promise<void>;
  hasKey: () => Readonly<Record<Choice, boolean>>;
  /** Keys the services have refused, saved but no longer working. */
  dead: Record<Choice, boolean>;
  isAnyDead: () => boolean;
  /** Checks a pasted key and, if taken, saves it. Throws the service's refusal. */
  takeKey: (which: Choice, key: string, signal: AbortSignal) => Promise<void>;
  /** What is left on the paid account, as last read; null when unknown. */
  balance: () => number | null;
  /** Reads the balance again, logging what it read. Quiet on failure: a lookup that fails is no trouble with his money. */
  rereadBalance: () => Promise<void>;
  /** On opening: whether the internet is there, whether the keys still work, and the balance. */
  checkOpening: (signal: AbortSignal) => Promise<Opening>;
  /** Sends one request along the model chain; a paid run's stated cost comes off the balance at once. */
  run: (request: ChainRequest, onChange: (stages: readonly Stage[], writtenShare: number) => void, signal: AbortSignal) => Promise<ChainReply>;
}

export function createLektorConnection(parts: ConnectionParts): LektorConnection {
  const { log } = parts;
  // Read when he first opens the Lektor, so that a man who never does pays nothing for it.
  let settings: LektorSettings = NO_LEKTOR_SETTINGS;
  let isSettingsRead = false;
  let balance: number | null = null;
  const dead: Record<Choice, boolean> = { free: false, paid: false };

  const serviceParts = (key: () => string): LektorServiceParts => ({
    ask: parts.askService,
    keyNow: key,
    warn: (message, detail) => log.warn(message, detail),
    error: (message, detail) => log.error(message, detail),
  });
  const services: Readonly<Record<Choice, LektorService>> = {
    free: createGeminiAi(serviceParts(() => settings.googleKey)),
    paid: createOpenRouterAi(serviceParts(() => settings.openRouterKey)),
  };

  const hasKey = (): Record<Choice, boolean> => ({ free: settings.googleKey !== '', paid: settings.openRouterKey !== '' });

  /** Logged on every read, with the figure (spec §9). */
  async function readBalance(signal: AbortSignal): Promise<ReturnType<typeof balanceFrom>> {
    const request = { provider: 'openrouter', action: 'balance', key: settings.openRouterKey, model: '', system: '', input: '' } as const;
    const reading = balanceFrom(await callService(serviceParts(() => settings.openRouterKey), request, signal));
    if (reading.kind === 'read') balance = reading.dollars;
    if (reading.kind === 'unreadable') balance = null;
    if (reading.kind === 'dead-key') dead.paid = true;
    log.info('Read the paid Lektors’ balance', reading.kind === 'read' ? { dollars: Number(reading.dollars.toFixed(4)) } : { reading: reading.kind });
    return reading;
  }

  /** Google's key, by its free model list: dead, working, or not reached. */
  async function checkFreeKey(signal: AbortSignal): Promise<'works' | 'dead' | 'unreached'> {
    try {
      await services.free.keyCheck(settings.googleKey, signal);
      dead.free = false;
      return 'works';
    } catch (error) {
      if (!(error instanceof LektorServiceError)) throw error;
      if (error.failure === 'bad-key') {
        dead.free = true;
        log.warn('The free Lektor’s key no longer works', { detail: error.detail });
        return 'dead';
      }
      // Busy or out of time is no verdict on the key; only no answer at all says offline.
      return error.failure === 'offline' ? 'unreached' : 'works';
    }
  }

  async function checkPaidKey(signal: AbortSignal): Promise<'works' | 'dead' | 'unreached'> {
    const reading = await readBalance(signal);
    if (reading.kind === 'dead-key') return 'dead';
    if (reading.kind === 'offline') return 'unreached';
    dead.paid = false;
    return 'works';
  }

  /**
   * With keys, their own checks are the internet check too: neither getting an answer at all is
   * what being offline looks like. Without any, a keyless call, so he is never sent to paste keys
   * only to meet a cryptic error afterwards.
   */
  async function checkOpening(signal: AbortSignal): Promise<Opening> {
    const has = hasKey();
    if (!has.free && !has.paid) {
      try {
        await connectionCheck({ ask: parts.askService }, signal);
        return 'no-keys';
      } catch (error) {
        if (error instanceof LektorServiceError) return 'offline';
        throw error;
      }
    }
    const checks = await Promise.all([has.free ? checkFreeKey(signal) : null, has.paid ? checkPaidKey(signal) : null]);
    const asked = checks.filter((check) => check !== null);
    if (asked.includes('dead')) return 'dead-key';
    return asked.every((check) => check === 'unreached') ? 'offline' : 'ready';
  }

  return {
    readSettingsOnce: async () => {
      if (isSettingsRead) return;
      isSettingsRead = true;
      settings = await readLektorSettings(parts.files, parts.notesFolder, log);
    },
    hasKey,
    dead,
    isAnyDead: () => dead.free || dead.paid,
    takeKey: async (which, key, signal) => {
      await services[which].keyCheck(key, signal);
      settings = which === 'free' ? { ...settings, googleKey: key } : { ...settings, openRouterKey: key };
      dead[which] = false;
      log.info('A Lektor key was saved', { service: services[which].company });
      // A failure costs only having to paste it on another day: it works for now, from memory.
      writeLektorSettings(parts.files, parts.notesFolder, settings, log).catch((error: unknown) => {
        log.warn('The Lektor settings could not be saved', describeError(error));
      });
    },
    balance: () => balance,
    rereadBalance: async () => {
      if (settings.openRouterKey === '') return;
      try {
        await readBalance(new AbortController().signal);
      } catch (error) {
        log.warn('The paid Lektors’ balance could not be read', describeError(error));
      }
    },
    checkOpening,
    run: async (request, onChange, signal) => {
      const reply = await runModelChain(
        request,
        { free: services.free, paid: services.paid, clock: parts.clock ?? REAL_CLOCK, onChange, log: (message, detail) => log.info(message, detail) },
        signal,
      );
      balance = balanceAfter(balance, reply.cost);
      return reply;
    },
  };
}
