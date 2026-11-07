import type { FakeBehaviour } from './lektor-fake-setting.ts';
import { type LektorService, LektorServiceError, type PresetId } from './lektor-service.ts';

/*
  The test Lektor: no AI and no network. It lets the whole flow be used and tested without
  spending anything, and it can act out each failure on demand. Everything it says is plainly
  marked as a test, and the same text always gets the same answer, so a bug can be found again.
*/

const READING_MS = 1_500;
const CORRECTING_MS = 2_000;
const CONNECTING_MS = 300;
const CHECKING_KEY_MS = 800;
/** Long enough to see the messages he gets as a wait goes on. */
const SLOW_FACTOR = 30;

/** Google's real words for most of these, so the screens look as they will. */
const SERVICE_SAID: Partial<Record<FakeBehaviour, string>> = {
  overloaded: 'gemini-3.6-flash is currently experiencing high demand, spikes in demand are usually temporary. Please try again later.',
  limit: 'Rate limit exceeded for model gemini-3.6-flash (limit: 20 requests per day on Free Tier). Please retry in 9h30m0s or upgrade your tier at https://ai.dev/rate-limit.',
  'bad-key': 'API key not valid. Please pass a valid API key.',
  'no-credit': 'Your credit balance is too low to access the Anthropic API.',
  declined: 'This request was declined.',
};

const LETTERS_GAINING_MARKS: Readonly<Record<string, string>> = { c: 'č', s: 'š', z: 'ž', C: 'Č', S: 'Š', Z: 'Ž' };

/** How often a word changes, by how much the preset is meant to change. */
const WORDS_BETWEEN_TIDY_FIXES: Readonly<Record<PresetId, number>> = { letters: 6, grammar: 5, wording: 5, rewrite: 4 };
const WORDS_BETWEEN_LARGER_CHANGES: Readonly<Record<PresetId, number>> = { letters: 0, grammar: 90, wording: 45, rewrite: 15 };

/** A small generator seeded from the text, so the same text always gets the same changes. */
function seededFrom(text: string): () => number {
  let state = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) state = Math.imul(state ^ text.charCodeAt(at), 0x01000193);
  return () => {
    state = Math.imul(state ^ (state >>> 13), 0x5bd1e995);
    return ((state ^ (state >>> 15)) >>> 0) / 0x100000000;
  };
}

function withMissingMark(word: string, random: () => number): string {
  const places = [...word].flatMap((letter, at) => (letter in LETTERS_GAINING_MARKS ? [at] : []));
  const place = places[Math.floor(random() * places.length)];
  if (place === undefined) return word;
  const letters = [...word];
  letters[place] = LETTERS_GAINING_MARKS[letters[place] ?? ''] ?? letters[place] ?? '';
  return letters.join('');
}

/**
 * A proposal with nothing real in it: some missing marks and, for the stronger presets, a few
 * larger changes, so the review has both kinds to show. Words only: his lines and spacing stay.
 */
export function fakeProposal(text: string, preset: PresetId): string {
  const random = seededFrom(text);
  const tidyEvery = WORDS_BETWEEN_TIDY_FIXES[preset];
  const largerEvery = WORDS_BETWEEN_LARGER_CHANGES[preset];
  let wordsSeen = 0;
  return text.replace(/\p{L}+/gu, (word) => {
    wordsSeen += 1;
    if (largerEvery > 0 && wordsSeen % largerEvery === 0) return '[probna izmena]';
    return wordsSeen % tidyEvery === 0 ? withMissingMark(word, random) : word;
  });
}

function fakeComment(text: string): string {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const quote = (from: number): string => words.slice(from, from + 8).join(' ');
  return [
    `[PROBNI UTISAK, bez pravog AI] Ostala mi je rečenica: „${quote(Math.floor(words.length / 3))}…”`,
    `Zastao sam kod „${quote(Math.floor((words.length * 2) / 3))}…”`,
    'U celini, ovo je samo tekst za isprobavanje, i niko ga nije pročitao.',
  ].join('\n\n');
}

/** @param noCreditSentence What running out of money says, in his language. */
export function createFakeAi(behaviour: FakeBehaviour, finalSentences: { noCredit: () => string; dailyCap: (said: string) => string | null }): LektorService {
  async function wait(ms: number, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, behaviour === 'slow' ? ms * SLOW_FACTOR : ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Stopped', 'AbortError'));
      });
    });
  }

  /** Waits as a real service would, then answers as it was set to. */
  async function pretendToWork(ms: number, signal: AbortSignal): Promise<void> {
    await wait(ms, signal);
    if (behaviour === 'ok' || behaviour === 'slow') return;
    const said = SERVICE_SAID[behaviour] ?? '';
    const final = behaviour === 'no-credit' ? finalSentences.noCredit() : behaviour === 'limit' ? (finalSentences.dailyCap(said) ?? '') : '';
    throw new LektorServiceError(behaviour, 'test Lektor', said, final);
  }

  return {
    company: 'nobody',
    commentModel: 'probni, bez pravog AI',
    correctionModel: () => 'probni, bez pravog AI',
    connectionCheck: async (signal) => {
      await wait(CONNECTING_MS, signal);
      // Only being offline fails here: a service having a bad moment is for the request that meets it to report.
      if (behaviour === 'offline') throw new LektorServiceError('offline', 'test Lektor');
    },
    keyCheck: (_key, signal) => pretendToWork(CHECKING_KEY_MS, signal),
    feedback: async (text, signal) => {
      await pretendToWork(READING_MS, signal);
      return fakeComment(text);
    },
    corrections: async ({ text, preset }, signal) => {
      await pretendToWork(CORRECTING_MS, signal);
      return fakeProposal(text, preset);
    },
  };
}
