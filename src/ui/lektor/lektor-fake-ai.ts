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

interface ChangeRates {
  /** One word in this many gains a missing mark, if it has a letter that can take one, which about half do. */
  marksEvery: number;
  /** One word in this many gains a comma after it. */
  commasEvery: number;
  /** One word in this many becomes a two-word placeholder; 0 for never. */
  swapsEvery: number;
  /** The share of sentences replaced whole. */
  sentencesRedone: number;
  /** The share of sentences with a run of words replaced inside them. */
  runsRedone: number;
}

/*
  How much each preset changes, matched to what Opus medium and Gemini actually did with two of
  his essays (measured 2026-11-07 with the app's own diff). Of the words, small fixes touch about
  one in nine in every preset; Stilska touches 16 to 26 per cent in all, with a few runs of six
  words or more; Dubinska 35 to 42 per cent, about a fifth of it in runs of six to forty words.
  The review has to carry the strongest of these, so the test one has to give it them.
*/
const RATES: Readonly<Record<PresetId, ChangeRates>> = {
  letters: { marksEvery: 4, commasEvery: 25, swapsEvery: 0, sentencesRedone: 0, runsRedone: 0 },
  grammar: { marksEvery: 4, commasEvery: 18, swapsEvery: 50, sentencesRedone: 0, runsRedone: 0.02 },
  wording: { marksEvery: 4, commasEvery: 25, swapsEvery: 16, sentencesRedone: 0.03, runsRedone: 0.07 },
  rewrite: { marksEvery: 4, commasEvery: 25, swapsEvery: 10, sentencesRedone: 0.18, runsRedone: 0.18 },
};

/** What a reworked passage says instead, in brackets, so it can't be taken for a real suggestion. */
const STAND_IN_WORDS =
  'ovde bi stajala ista misao rečena drugačije kako bi je lektor preradio ali ovo je samo probni tekst bez pravog AI napisan da se vidi kako izgleda veća izmena'.split(' ');

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

/** About as many bracketed stand-in words as it replaces, starting anywhere in the list. */
function standIn(wordCount: number, random: () => number): string {
  const length = Math.max(3, Math.round(wordCount * (0.7 + random() * 0.6)));
  const from = Math.floor(random() * STAND_IN_WORDS.length);
  const words = Array.from({ length }, (_, at) => STAND_IN_WORDS[(from + at) % STAND_IN_WORDS.length]);
  return `[${words.join(' ')}]`;
}

/** A run of six to twelve words in the middle of a sentence replaced, the rest of it kept. */
function withRunRedone(sentence: string, random: () => number): string {
  const words = [...sentence.matchAll(/\p{L}+/gu)];
  if (words.length < 10) return sentence;
  const length = 6 + Math.floor(random() * Math.min(7, words.length - 8));
  const first = 1 + Math.floor(random() * (words.length - length - 1));
  const [start, end] = [words[first], words[first + length - 1]];
  if (start?.index === undefined || end?.index === undefined) return sentence;
  return sentence.slice(0, start.index) + standIn(length, random) + sentence.slice(end.index + end[0].length);
}

/** Each word as the preset's small changes leave it: a mark restored, a comma added, or a placeholder. */
function wordFixer(rates: ChangeRates, random: () => number): (word: string, next: string) => string {
  let wordsSeen = 0;
  return (word, next) => {
    wordsSeen += 1;
    if (rates.swapsEvery > 0 && wordsSeen % rates.swapsEvery === 0) return '[probna izmena]';
    const marked = wordsSeen % rates.marksEvery === 0 ? withMissingMark(word, random) : word;
    return wordsSeen % rates.commasEvery === 0 && next === ' ' ? `${marked},` : marked;
  };
}

/**
 * A proposal with nothing real in it, but as much of it as a real one: small fixes for every
 * preset, and for the stronger ones sentences and runs reworked at the rates the real services
 * showed. Within lines only: his lines and spacing stay.
 */
export function fakeProposal(text: string, preset: PresetId): string {
  const random = seededFrom(text);
  const rates = RATES[preset];
  const fixWord = wordFixer(rates, random);
  const sentence = /[^\n.!?…]*\p{L}[^\n.!?…]*/gu;
  return text.replace(sentence, (found) => {
    const roll = random();
    if (roll < rates.sentencesRedone) {
      const [lead, trail] = [/^\s*/u.exec(found)?.[0] ?? '', /\s*$/u.exec(found)?.[0] ?? ''];
      return lead + standIn((found.match(/\p{L}+/gu) ?? []).length, random) + trail;
    }
    if (roll < rates.sentencesRedone + rates.runsRedone) return withRunRedone(found, random);
    return found.replace(/\p{L}+/gu, (word, at: number) => fixWord(word, found.charAt(at + word.length)));
  });
}

/** Said in the reply itself, on a line of its own under the title, so a saved reply is never taken for the test one's or a fresh one. */
export const SAVED_REPLY_MARK = '[SAVED OPUS CORRECTIONS]';

function withSavedMark(reply: string): string {
  const titleEnd = reply.indexOf('\n');
  return titleEnd === -1 ? `${SAVED_REPLY_MARK}\n${reply}` : `${reply.slice(0, titleEnd)}\n${SAVED_REPLY_MARK}${reply.slice(titleEnd)}`;
}

function fakeComment(text: string): string {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const quote = (from: number): string => words.slice(from, from + 8).join(' ');
  return [
    `[PROBNI UTISAK, bez pravog AI] Ostala mi je rečenica: „${quote(Math.floor(words.length / 3))}…”`,
    `Zastao sam kod „${quote(Math.floor((words.length * 2) / 3))}…”`,
    'Ovaj deo je tu da utisak bude duži od ekrana, kao što pravi ume da bude, pa da se vidi kako se čita kad mora da se pomera. Pravi utisak bi ovde rekao nešto o tome kako tekst teče, gde se zgušnjava, a gde mu ponestane daha.',
    'Možda bi primetio da prvi deo više objašnjava nego što pokazuje, i da je najjači onde gde pisac samo opisuje šta vidi. Možda bi pomenuo neku reč koja se ponavlja, ili rečenicu koja je duža nego što treba da bude.',
    'Ništa od ovoga nije pročitano: rečenice gore su uzete iz tvog teksta po broju reči, ne po smislu, a ove ovde su napisane unapred, za svaki tekst iste.',
    'Pravi utisak ima najviše tri kratka pasusa. Ovaj ih ima više, namerno, da bi se videlo kako izgleda kad ne stane na ekran, i gde je kraj kad se do njega stigne.',
    'U celini, ovo je samo tekst za isprobavanje, i niko ga nije pročitao.',
  ].join('\n\n');
}

interface FakeAiParts {
  /** What running out of money says, in his language. */
  noCredit: () => string;
  /** What running out of the day's tries says, if `said` is that. */
  dailyCap: (said: string) => string | null;
  /** A real service's saved corrections of this text, returned in place of made-up ones when there are some. */
  realReply?: ((text: string, preset: PresetId) => Promise<string | null>) | undefined;
}

export function createFakeAi(behaviour: FakeBehaviour, finalSentences: FakeAiParts): LektorService {
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
      const real = (await finalSentences.realReply?.(text, preset)) ?? null;
      return real === null ? fakeProposal(text, preset) : withSavedMark(real);
    },
  };
}
