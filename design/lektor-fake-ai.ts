import { fetchRealSamples } from './diff-prototype-samples.ts';

/** How the pretend service behaves, chosen in the his-screens harness. */
export type FakeBehaviour = 'ok' | 'slow' | 'offline' | 'overloaded' | 'limit' | 'bad-key' | 'cut-off';

export type FakeFailure = Exclude<FakeBehaviour, 'ok' | 'slow'>;

export type PresetId = 'letters' | 'grammar' | 'wording';

export const BEHAVIOUR_KEY = 'lektor-fake-behaviour';

const READING_MS = 2_500;
const CORRECTING_MS = 3_000;
const CONNECTING_MS = 700;
const CHECKING_KEY_MS = 1_500;
const SLOW_FACTOR = 8;

export class FakeServiceError extends Error {
  readonly failure: FakeFailure;

  constructor(failure: FakeFailure) {
    super(`The pretend service answered: ${failure}`);
    this.failure = failure;
  }
}

function behaviourNow(): FakeBehaviour {
  const chosen = window.localStorage.getItem(BEHAVIOUR_KEY);
  const known: readonly FakeBehaviour[] = ['ok', 'slow', 'offline', 'overloaded', 'limit', 'bad-key', 'cut-off'];
  return known.find((behaviour) => behaviour === chosen) ?? 'ok';
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, behaviourNow() === 'slow' ? ms * SLOW_FACTOR : ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Stopped', 'AbortError'));
    });
  });
}

/** Waits as the real service would, and answers as the harness says to. */
async function pretendToWork(ms: number, signal: AbortSignal): Promise<void> {
  await wait(ms, signal);
  const behaviour = behaviourNow();
  if (behaviour !== 'ok' && behaviour !== 'slow') throw new FakeServiceError(behaviour);
}

/**
 * Whether the internet can be reached at all. Only being offline counts as failing
 * here: a service having a bad moment is for the request that meets it to report.
 */
export async function fakeConnectionCheck(signal: AbortSignal): Promise<void> {
  await wait(CONNECTING_MS, signal);
  if (behaviourNow() === 'offline') throw new FakeServiceError('offline');
}

/** Asks the service whether it takes this key. */
export async function fakeKeyCheck(signal: AbortSignal): Promise<void> {
  await pretendToWork(CHECKING_KEY_MS, signal);
}

const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 5);

const quoted = (sentence: string): string => {
  const words = sentence.split(/\s+/);
  return words.length <= 14 ? sentence : `${words.slice(0, 12).join(' ')}…`;
};

/** A stand-in for a reader's response: canned, but it does quote the text in front of him. */
export async function fakeFeedback(text: string, signal: AbortSignal): Promise<string> {
  await pretendToWork(READING_MS, signal);
  const sentences = sentencesOf(text);
  const kept = sentences.at(Math.floor(sentences.length / 3)) ?? text.trim();
  const unsure = sentences.at(Math.floor((sentences.length * 2) / 3)) ?? kept;
  return [
    `Najduže mi je ostala rečenica: „${quoted(kept)}” Tu se tekst smiri i kaže ono zbog čega je i pisan.`,
    `Zastao sam kod mjesta „${quoted(unsure)}” Nisam siguran da li je tu kraj jedne misli ili početak druge, pa bih to rado pročitao još jednom.`,
  ].join('\n\n');
}

/** A second look that carries on from the first, rather than starting over. */
export async function fakeSecondLook(text: string, signal: AbortSignal): Promise<string> {
  await pretendToWork(READING_MS, signal);
  const sentence = sentencesOf(text).at(0) ?? text.trim();
  return [
    'Pogledao sam šta si promijenio. Ono što sam ranije rekao uglavnom i dalje stoji.',
    `Sad bolje teče od početka, od rečenice „${quoted(sentence)}” Ne bih tu više ništa dirao.`,
  ].join('\n\n');
}

const SPELLING = new Map([
  ['sto', 'što'], ['kuca', 'kuća'], ['cak', 'čak'], ['vec', 'već'], ['kao sto', 'kao što'],
  ['zasto', 'zašto'], ['moze', 'može'], ['nista', 'ništa'], ['covjek', 'čovjek'], ['coek', 'čoek'],
  ['sta', 'šta'], ['vise', 'više'], ['zivot', 'život'], ['dusa', 'duša'], ['rijec', 'riječ'],
]);

const REWORDING = new Map([
  ['veoma', 'vrlo'], ['kada', 'kad'], ['onda', 'tada'], ['mnogo', 'puno'], ['zato', 'stoga'],
  ['ali', 'no'], ['uvijek', 'stalno'], ['takođe', 'isto tako'],
]);

const replacingWords = (text: string, words: ReadonlyMap<string, string>): string =>
  text.replace(/\p{L}+/gu, (word) => {
    const found = words.get(word.toLowerCase());
    if (found === undefined) return word;
    return word.startsWith(word.charAt(0).toUpperCase()) && word.charAt(0) !== word.charAt(0).toLowerCase()
      ? found.charAt(0).toUpperCase() + found.slice(1)
      : found;
  });

const tidied = (text: string): string => text.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:!?])/g, '$1');

const withCommas = (text: string): string => text.replace(/(\p{L}) (ali|a|nego) /gu, '$1, $2 ');

/** What a preset would come back with on a text no sample covers. Plainly fake, but it gives the review something to show. */
function madeUpProposal(text: string, preset: PresetId): string {
  const letters = tidied(replacingWords(text, SPELLING));
  if (preset === 'letters') return letters;
  const grammar = withCommas(letters);
  return preset === 'grammar' ? grammar : replacingWords(grammar, REWORDING);
}

/** The saved proposal where the text is one of the local samples; otherwise a made-up one. */
export async function fakeCorrections(text: string, preset: PresetId, signal: AbortSignal): Promise<string> {
  await pretendToWork(CORRECTING_MS, signal);
  const samples = await fetchRealSamples();
  return samples.find((sample) => sample.current === text)?.proposed ?? madeUpProposal(text, preset);
}
