/*
  The corrections, all in one modal window: choosing the kind, waiting, a failure and its way on,
  and the review. Opened from the panel's "Pređi na ispravke". From the moment he opens it his
  text is held still, which is what thinking of corrections means anyway: the line between the
  panel and the window falls where the text stops being his to change, not midway through.

  The kind first, since it is what he wants done; the rest follows from it. On the left the four
  kinds, each with a line on how far it goes, none chosen when the window opens, so he reads before
  he picks. On the right whatever belongs to the kind picked: corrections already made for it,
  led to first, with asking again a quiet way past them; or the request, with the Lektor the kind
  needs. While it runs, the wait, big; a failure, as big, with its way on.

  Which Lektor follows from the kind. For Slova i zarezi and Pravopis i gramatika both run the same
  model, so paying buys only being answered when Google is busy, which he can't judge in advance:
  no choice, the free one, and the paid one offered when the free one fails. For Stilska dorada and
  Dubinska prerada the paid one is clearly better: both offered, it saying why. The panel's choice is
  the comment's, not shared with this one.

  Every opening starts on Besplatni. Plaćeni only when he picks it, and then for both rework kinds
  until the window closes, never longer: what a window opens on must not depend on how he left it,
  and nothing should spend his money for a choice he made earlier and has forgotten.

  His text is not shown: read-only beside the choices it looked like the review, as if his
  corrections were already there.
*/
import { titleOf } from '../src/ui/dialogs/dialog-heading.ts';
import { type Shown, showAsModal } from '../src/ui/dialogs/modal.ts';
import { icon } from '../src/ui/icons.ts';
import { keys } from './lektor-keys-prototype.ts';
import {
  type Choice,
  FALLS_BACK,
  MODELS,
  PRESET_NAMES,
  PRESET_PROMPTS,
  PRESETS,
  type Pace,
  type Preset,
  TEXT_TITLE,
  button,
  choiceMark,
  dollars,
  el,
  element,
  lektorName,
  problem,
  radio,
  sendButton,
  serviceLine,
  state,
} from './lektor-prototype-pieces.ts';
import { lektorChoice } from './lektor-choice-radios.ts';

type View = 'choosing' | 'waiting' | 'failed' | 'review';
type Failure = 'busy' | 'no-credit';

/**
 * Corrections ready to look at. Only while his text is as it was when they were made: on a changed
 * text the app doesn't offer them at all, since the review would offer to undo his own edits.
 */
export interface Kept {
  at: string;
  /** What the run cost, from OpenRouter's reply; null on free. */
  cost: number | null;
}

/** As the app keeps them: one for each kind and each Lektor. */
type KeptByKind = Partial<Record<Preset, Partial<Record<Choice, Kept>>>>;

interface WindowState {
  view: View;
  /** None when the window opens, so he reads the kinds before picking one. */
  preset: Preset | null;
  note: string;
  failure: Failure | null;
  kept: KeptByKind;
  /** Whose corrections the review open shows. */
  reviewBy: Choice;
  /** Asking again where corrections are already there: he opened the form past them. */
  isAskingAgain: boolean;
  /** The Lektor for Stilska and Dubinska: Besplatni each time the window opens, Plaćeni only once he picks it. */
  reworkChoice: Choice;
  /** Who the request running or failed went to. */
  sentTo: Choice;
  /**
   * Slova i zarezi and Pravopis: his tick for "if the free one is slow, send it to the paid one",
   * so it can go ahead without asking him minutes in. Off each time the window opens.
   */
  isPaidIfSlow: boolean;
  /** The stages of the request running, as the services' streams tell them, the last one the current one. */
  stages: Stage[];
  /** How far the writing has got, by its length against his text's. */
  progress: number;
  /** When he sent it, so the clock counts his whole wait, across a switch to the paid one. */
  runStartedAt: number;
}

/**
 * A stage of the wait: queued at Google (free only), refused by a busy Google, thinking, writing.
 * Each says how long it took once over, so a long queue reads as the queue's, not as the work's.
 */
type Phase = 'queue' | 'refused' | 'thinking' | 'writing';

interface Stage {
  phase: Phase;
  by: Choice;
  /** The model doing it: on free, 3.6 when Google turned 3.8 away as busy. */
  model: string;
  startedAt: number;
  endedAt: number | null;
  /** Left for the paid one, as he had ticked. */
  isGivenUp: boolean;
}

export const corrections: WindowState = {
  view: 'choosing',
  preset: null,
  note: '',
  failure: null,
  kept: {},
  reviewBy: 'free',
  isAskingAgain: false,
  reworkChoice: 'free',
  sentTo: 'free',
  isPaidIfSlow: false,
  stages: [],
  progress: 0,
  runStartedAt: 0,
};

/**
 * Danilo's wording: what a kind does, then what of his text stays his. Read down the list, the
 * second lines are the scale he is choosing on, from his words kept to his words gone.
 */
const KIND_SUMMARIES: Readonly<Record<Preset, { does: string; keeps: string }>> = {
  letters: { does: 'Dodaje kvačice (čćšžđ), ispravlja greške u kucanju, razmake i zareze.', keeps: 'Tvoje reči ostaju iste.' },
  grammar: { does: 'Pored slova i zareza, ispravlja gramatiku: padeže, slaganje reči, reč koja nedostaje.', keeps: 'Rečenice ostaju tvoje.' },
  wording: { does: 'Ispravlja greške i doteruje rečenice da teku glatko: skraćuje preduge, uklanja ponavljanja.', keeps: 'Smisao i redosled ostaju tvoji.' },
  rewrite: { does: 'Piše tekst iznova, slobodno, kao što bi ga prepričao drugi pisac.', keeps: 'Ostaje smisao, ali ne i tvoje reči.' },
};

/*
  The wait, pretended: a short queue at Google, a long one (longer than the limit), thinking, then
  writing in ten steps. The limit stands for the 2 minutes in the queue after which a ticked request
  goes to the paid one. At the harness's pace: shortened to watch, twice that to feel some of it, or
  as measured on 2026-11-09 (queues up to 3–5 min, thinking seconds, a correction's writing 1–3 min).
*/
interface WaitTimes {
  queueMs: number;
  longQueueMs: number;
  queueLimitMs: number;
  thinkingMs: number;
  writingStepMs: number;
}

const SHORTENED: WaitTimes = { queueMs: 2500, longQueueMs: 20_000, queueLimitMs: 6000, thinkingMs: 1500, writingStepMs: 400 };
const WAIT_TIMES: Readonly<Record<Pace, WaitTimes>> = {
  short: SHORTENED,
  double: { queueMs: 5000, longQueueMs: 40_000, queueLimitMs: 12_000, thinkingMs: 3000, writingStepMs: 800 },
  quadruple: { queueMs: 10_000, longQueueMs: 80_000, queueLimitMs: 24_000, thinkingMs: 6000, writingStepMs: 1600 },
  real: { queueMs: 30_000, longQueueMs: 300_000, queueLimitMs: 120_000, thinkingMs: 3000, writingStepMs: 12_000 },
};

const times = (): WaitTimes => WAIT_TIMES[state.pace];
/** What the limit stands for in the app, said to him. */
const QUEUE_LIMIT_WORDS = '2 minuta';

/** When corrections just made were made: reads after "od" as well as on its own, which "upravo sad" doesn't. */
const JUST_NOW = 'maločas';

let shown: Shown | null = null;
let timers: number[] = [];

function stopTimers(): void {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
  window.clearInterval(clockTimer);
}

/** Closing while it runs stops it: the wait is the window's, and nothing is kept from it. */
function close(): void {
  stopTimers();
  if (corrections.view === 'waiting') corrections.view = 'choosing';
  shown?.close();
  shown = null;
}

function show(view: View): void {
  corrections.view = view;
  draw();
}

const other = (choice: Choice): Choice => (choice === 'free' ? 'paid' : 'free');

/** Who a kind goes to: the free one for the first two, his choice for rework; whichever has a key if one hasn't. */
function lektorFor(preset: Preset): Choice {
  const wanted = FALLS_BACK.has(preset) ? 'free' : corrections.reworkChoice;
  return keys.saved[wanted] ? wanted : other(wanted);
}

function keptFor(preset: Preset): [Choice, Kept][] {
  const kept = corrections.kept[preset] ?? {};
  return (['free', 'paid'] as const).flatMap((by) => {
    const one = kept[by];
    return one === undefined ? [] : [[by, one] as [Choice, Kept]];
  });
}

function pick(preset: Preset): void {
  corrections.preset = preset;
  corrections.failure = null;
  corrections.isAskingAgain = false;
  show('choosing');
}

function openReview(preset: Preset, by: Choice): void {
  corrections.preset = preset;
  corrections.reviewBy = by;
  corrections.failure = null;
  show('review');
}

/* The left column: the four kinds, each with how far it goes. */

function kindOption(preset: Preset, isLocked: boolean): HTMLElement {
  const option = radio('lektor-window-kind', PRESET_NAMES[preset], corrections.preset === preset, () => pick(preset));
  const input = option.querySelector('input');
  if (input !== null) input.disabled = isLocked;
  // Part of the row, so reading it and clicking it are the same target.
  const about = el('span', 'lektor-kind-about');
  about.append(el('span', '', KIND_SUMMARIES[preset].does), el('span', 'lektor-kind-keeps', KIND_SUMMARIES[preset].keeps));
  option.append(about);
  const kind = el('div', 'lektor-kind');
  kind.append(option);
  return kind;
}

function choicesColumn(): HTMLElement {
  const isLocked = corrections.view === 'waiting';
  const kinds = el('div', 'lektor-kind-list');
  for (const preset of PRESETS) {
    // The first three fix his text; Dubinska replaces it, so a line sets it apart rather than letting it read as the most of the same.
    if (preset === 'rewrite') kinds.append(el('hr', 'lektor-kind-divider'));
    kinds.append(kindOption(preset, isLocked));
  }
  const column = el('div', 'lektor-window-side');
  column.append(el('p', 'lektor-heading', 'Izaberi vrstu ispravke:'), kinds);
  return column;
}

/* The right column, choosing: nothing yet, what is ready, or the request. */

function emptyDetail(): HTMLElement {
  const empty = el('div', 'lektor-window-big lektor-window-empty');
  empty.append(el('p', '', 'Izaberi vrstu ispravke sa leve strane.'));
  return empty;
}

/** One kept set of corrections: whose, from when, what it cost, and the way into it. */
function readyCard(preset: Preset, by: Choice, kept: Kept): HTMLElement {
  const card = el('div', 'lektor-ready-card');
  const cost = kept.cost === null ? '' : ` · ${dollars(kept.cost)}`;
  const words = el('span', 'lektor-ready-words', `Predlozi od ${kept.at}${cost}`);
  words.title = `Napravio ${lektorName(by)} Lektor.`;
  card.append(choiceMark(by), words, button('Pogledaj', () => openReview(preset, by), 'lektor-main-action'));
  return card;
}

function readyDetail(preset: Preset): HTMLElement[] {
  const again = button('Novi zahtev za ispravke…', () => {
    corrections.isAskingAgain = true;
    show('choosing');
  }, 'lektor-ask-again');
  return [
    el('p', 'lektor-window-kind-title', PRESET_NAMES[preset]),
    ...keptFor(preset).map(([by, kept]) => readyCard(preset, by, kept)),
    again,
  ];
}

/**
 * Asked before sending, so a slow or busy free one can be handed to the paid one without a question
 * minutes in. Ticking it is his own choice to pay, which is what makes acting on it later fair; and
 * it is off each time the window opens, like every choice to pay.
 */
function paidIfSlowBox(): HTMLElement {
  const box = el('label', 'lektor-preset');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = corrections.isPaidIfSlow;
  input.addEventListener('change', () => {
    corrections.isPaidIfSlow = input.checked;
  });
  // The limit named, as the wait names it: a busy Google is covered too, as one that won't start in time.
  box.append(input, choiceMark('paid'), el('span', '', `Ako besplatni ne krene za ${QUEUE_LIMIT_WORDS}, pošalji plaćenom`));
  // In a row of the choices' own make, so it is as big a target, with the same hover.
  const row = el('div', 'lektor-choice-options');
  row.append(box);
  return row;
}

/** Whether a free request of this kind may be handed to the paid one, as he ticked. */
function mayGoToPaid(preset: Preset): boolean {
  return corrections.isPaidIfSlow && FALLS_BACK.has(preset) && keys.saved.paid;
}

/** For the first two kinds, said rather than asked, with the tick for a slow free one; for rework, the choice. */
function lektorPart(preset: Preset): HTMLElement[] {
  if (FALLS_BACK.has(preset)) {
    const canSwitch = lektorFor(preset) === 'free' && keys.saved.paid;
    return [serviceLine(lektorFor(preset)), ...(canSwitch ? [paidIfSlowBox()] : [])];
  }
  return lektorChoice({
    group: 'lektor-window-level',
    chosen: lektorFor(preset),
    // Not "thorough": on these kinds the free one changed several times more of his words, and lost in the blind picks.
    better: { choice: 'paid', why: 'bolje piše i čuva tvoj glas' },
    choose: (choice) => {
      corrections.reworkChoice = choice;
      draw();
    },
  });
}

/** What this kind cost last time on this text: a fact, where a guess would be confidently wrong. */
function lastCost(preset: Preset): HTMLElement[] {
  const paid = corrections.kept[preset]?.paid;
  if (lektorFor(preset) !== 'paid' || paid?.cost == null) return [];
  return [el('p', 'lektor-where', `Prošli put za ovaj tekst: ${dollars(paid.cost)}`)];
}

function noteField(): HTMLElement[] {
  const label = el('label', 'lektor-label', 'Tvoja dodatna uputstva ');
  label.append(el('span', 'lektor-label-aside', '(nije obavezno)'));
  const box = el('textarea', 'lektor-note');
  // Four lines: room to say something, now the window has it.
  box.rows = 4;
  box.placeholder = 'Example: simplify overly long sentences';
  box.value = corrections.note;
  box.addEventListener('input', () => {
    corrections.note = box.value;
  });
  return [label, box];
}

function sendRow(preset: Preset): HTMLElement {
  const row = el('div', 'lektor-window-actions');
  if (corrections.isAskingAgain) {
    row.append(button('Nazad na predloge', () => {
      corrections.isAskingAgain = false;
      show('choosing');
    }, 'lektor-back-to-ready'));
  }
  const to = lektorFor(preset);
  const send = sendButton('Pošalji zahtev za ispravke', preset, () => run(to), 'lektor-main-action');
  // Who it goes to is this kind's Lektor here, not the panel's choice that sendButton reads.
  send.querySelector('.lektor-choice-mark')?.replaceWith(choiceMark(to));
  send.title = [`Šalje se ${to === 'free' ? 'Guglu' : 'firmi OpenRouter'}`, `Model: ${MODELS[to][preset]}`].join('\n');
  row.append(send);
  return row;
}

function requestDetail(preset: Preset): HTMLElement[] {
  return [
    el('p', 'lektor-window-kind-title', PRESET_NAMES[preset]),
    ...lektorPart(preset),
    ...lastCost(preset),
    el('p', 'lektor-prompt-label', 'Uputstvo za AI Lektora:'),
    el('p', 'lektor-prompt', PRESET_PROMPTS[preset]),
    ...noteField(),
    sendRow(preset),
  ];
}

/* The right column, running and failed. */

/** His whole wait so far, from when he sent it, in minutes once it passes one. */
function waitedWords(): string {
  const seconds = Math.floor((Date.now() - corrections.runStartedAt) / 1000);
  return seconds < 60 ? `Prošlo je ${seconds} s` : `Prošlo je ${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

let clockTimer: number | undefined;

/** One clock for the whole wait, kept apart from the steps, so a redraw at each step doesn't restart it. */
function startClock(): void {
  window.clearInterval(clockTimer);
  clockTimer = window.setInterval(() => {
    const clock = document.querySelector('.lektor-window-clock');
    if (clock !== null) clock.textContent = waitedWords();
  }, 1000);
}

/** How long a finished stage took, as he'd say it. */
function durationWords(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** Who is doing it, by the maker of the model: the company, not the Lektor, since that is who has his text. */
const aiName = (model: string): string => (model.startsWith('claude') ? 'Claude AI' : 'Google AI');

/**
 * What a stage is, said as going on while it does and as done after: the free door sends only "still
 * here" while the request waits its turn at Google, then the thinking and the words; paid has no queue.
 * The first stage of the other Lektor names it, so a switch shows.
 */
function stageWords(stage: Stage, isCurrent: boolean, before: Stage | undefined): string {
  const lektor = before !== undefined && before.by !== stage.by ? `${lektorName(stage.by)} lektor: ` : '';
  const ai = aiName(stage.model);
  const words: Readonly<Record<Phase, [string, string]>> = {
    queue: ['Zahtev čeka u redu kod Gugla…', 'Zahtev je čekao u redu kod Gugla'],
    refused: ['Gugl je zauzet i nije primio zahtev', 'Gugl je zauzet i nije primio zahtev'],
    thinking: [`${ai} razmišlja…`, `${ai} je razmislio`],
    writing: [`${ai} ispravlja tekst…`, `${ai} je ispravio tekst`],
  };
  return lektor + words[stage.phase][isCurrent ? 0 : 1];
}

/** A finished stage ticked, one given up or refused crossed, the current one turning. */
function stageMark(stage: Stage, isCurrent: boolean): HTMLElement {
  if (isCurrent) return el('span', 'lektor-stage-mark lektor-reading');
  return el('span', 'lektor-stage-mark', stage.isGivenUp || stage.phase === 'refused' ? '✗' : '✓');
}

/** How far the writing has got, under the stage it belongs to: the reply is about as long as his text, so its length says it. */
function progressRow(): HTMLElement {
  const bar = el('div', 'lektor-progress');
  const filled = el('div', 'lektor-progress-done');
  filled.style.width = `${corrections.progress}%`;
  bar.append(filled);
  const row = el('div', 'lektor-stage-progress');
  row.append(bar, el('span', 'lektor-stage-time', `${corrections.progress}%`));
  return row;
}

/** Under the queue while it lasts: why it waits, and what happens if it waits too long and he ticked for that. */
function queueNote(preset: Preset): HTMLElement {
  const after = mayGoToPaid(preset) ? ` Ako ne krene za ${QUEUE_LIMIT_WORDS}, šalje se plaćenom.` : '';
  return el('p', 'lektor-wait-small lektor-stage-note', `Čeka dok ne dođe na red. Ovo traje nekoliko minuta.${after}`);
}

/** What belongs to the stage going on, under it: the queue's note, the writing's bar. */
function underStage(stage: Stage, preset: Preset): HTMLElement[] {
  if (stage.endedAt !== null) return [];
  if (stage.phase === 'queue') return [queueNote(preset)];
  if (stage.phase === 'writing') return [progressRow()];
  return [];
}

function stagesList(preset: Preset): HTMLElement {
  const list = el('div', 'lektor-stages');
  corrections.stages.forEach((stage, index) => {
    const isCurrent = stage.endedAt === null;
    const row = el('div', 'lektor-stage');
    const took = stage.endedAt === null || stage.phase === 'refused' ? '' : durationWords(stage.endedAt - stage.startedAt);
    row.append(stageMark(stage, isCurrent), el('span', '', stageWords(stage, isCurrent, corrections.stages[index - 1])), el('span', 'lektor-stage-time', took));
    list.append(row, ...underStage(stage, preset));
  });
  return list;
}

/** Which Lektor and model is working now: 3.6 named as the older one standing in, so he isn't led to think it's the same. */
function modelLine(): HTMLElement[] {
  const now = corrections.stages.at(-1);
  if (now === undefined) return [];
  const standIn = now.model === 'gemini-3.6-flash' ? ' (stariji, rezervni: Gugl je bio zauzet)' : '';
  return [el('p', 'lektor-wait-small', `${lektorName(now.by)} lektor · ${now.model}${standIn}`)];
}

/**
 * The wait, in four styles: the text's name in bold, the kind and the stages as words, the clock
 * big as the one thing to glance at, the model and notes in small grey.
 */
function waitingDetail(preset: Preset): HTMLElement[] {
  // One column with one left edge, in the middle of the right side, read top to bottom like a list.
  const column = el('div', 'lektor-wait-column');
  column.append(
    el('p', 'lektor-heading', TEXT_TITLE),
    el('p', '', `Vrsta ispravke: ${PRESET_NAMES[preset]}`),
    stagesList(preset),
    el('p', 'lektor-window-clock', waitedWords()),
    ...modelLine(),
  );
  const big = el('div', 'lektor-window-big lektor-window-wait');
  big.append(column);
  // Where the send button was, apart from what he is watching: the hand that sent it finds the way to stop it.
  const stop = el('div', 'lektor-window-actions');
  stop.append(button('Prekini', () => {
    stopTimers();
    show('choosing');
  }, ''));
  return [big, stop];
}

function sendToButton(preset: Preset, to: Choice): HTMLButtonElement {
  const made = button(to === 'free' ? 'Pošalji besplatnom' : 'Pošalji plaćenom', () => run(to), 'lektor-main-action lektor-sends');
  made.append(choiceMark(to), icon('move-out'));
  made.title = `Model: ${MODELS[to][preset]}`;
  return made;
}

/** The way on: the other Lektor where it has a key, else trying again where that can help. */
function failureWays(preset: Preset): HTMLButtonElement[] {
  const to = other(corrections.sentTo);
  const switchTo = keys.saved[to] ? [sendToButton(preset, to)] : [];
  if (corrections.failure === 'no-credit') return switchTo;
  return [...switchTo, button('Pokušaj ponovo', () => run(corrections.sentTo), switchTo.length > 0 ? '' : 'keep')];
}

function failedDetail(preset: Preset): HTMLElement {
  const isNoCredit = corrections.failure === 'no-credit';
  const ways = el('div', 'lektor-window-ways');
  ways.append(...failureWays(preset));
  const big = el('div', 'lektor-window-big');
  big.append(
    isNoCredit
      ? problem('Plaćeni iznos je potrošen.', 'Možeš da pošalješ besplatnom, ili neka se uplati još. Tvoj izbor i uputstva su ostali.')
      : problem('Gugl je sada zauzet.', keys.saved.paid ? 'Probaj malo kasnije, ili pošalji plaćenom.' : 'Probaj malo kasnije.'),
    ways,
  );
  return big;
}

function detailColumn(): HTMLElement {
  const column = el('div', 'lektor-window-detail');
  const preset = corrections.preset;
  if (preset === null) column.append(emptyDetail());
  else if (corrections.view === 'waiting') column.append(...waitingDetail(preset));
  else if (corrections.view === 'failed') column.append(failedDetail(preset));
  else if (keptFor(preset).length > 0 && !corrections.isAskingAgain) column.append(...readyDetail(preset));
  else column.append(...requestDetail(preset));
  return column;
}

/* Running, pretended. */

/** What a run on paid costs here, made up: in the app it is read off OpenRouter's reply. */
function pretendCost(preset: Preset, to: Choice): number | null {
  if (to === 'free') return null;
  return FALLS_BACK.has(preset) ? 0.09 : 0.52;
}

/** Whether the pretend request fails, as the switches above say. */
function pretendFailure(preset: Preset, to: Choice): Failure | null {
  if (to === 'paid') return state.isMoneyOut ? 'no-credit' : null;
  if (!state.isFreeBusy) return null;
  return FALLS_BACK.has(preset) && !state.isFallbackBusy ? null : 'busy';
}

/** The model a request of this kind runs on: on free, 3.6 when Google turns 3.8 away as busy and the kind allows it. */
function modelFor(preset: Preset, to: Choice): string {
  if (to === 'free' && FALLS_BACK.has(preset) && state.isFreeBusy) return 'gemini-3.6-flash';
  return MODELS[to][preset];
}

function endStage(): void {
  const current = corrections.stages.at(-1);
  if (current !== undefined && current.endedAt === null) current.endedAt = Date.now();
}

function startStage(phase: Phase, by: Choice, model: string): void {
  endStage();
  corrections.stages.push({ phase, by, model, startedAt: Date.now(), endedAt: null, isGivenUp: false });
}

function finishRun(preset: Preset, to: Choice): void {
  stopTimers();
  endStage();
  corrections.kept[preset] = { ...corrections.kept[preset], [to]: { at: JUST_NOW, cost: pretendCost(preset, to) } };
  corrections.isAskingAgain = false;
  openReview(preset, to);
}

function writingStep(preset: Preset, to: Choice, step: number): void {
  if (step > 10) {
    finishRun(preset, to);
    return;
  }
  if (step === 0) startStage('writing', to, modelFor(preset, to));
  corrections.progress = step * 10;
  show('waiting');
  timers.push(window.setTimeout(() => writingStep(preset, to, step + 1), times().writingStepMs));
}

function thinking(preset: Preset, to: Choice): void {
  startStage('thinking', to, modelFor(preset, to));
  show('waiting');
  timers.push(window.setTimeout(() => writingStep(preset, to, 0), times().thinkingMs));
}

/** As he ticked: the same request to the paid one. Only from the queue, so no work is thrown away or paid twice. */
function handToPaid(preset: Preset, because: 'queue' | 'busy'): void {
  const now = Date.now();
  if (because === 'busy') corrections.stages.push({ phase: 'refused', by: 'free', model: MODELS.free[preset], startedAt: now, endedAt: now, isGivenUp: true });
  const current = corrections.stages.at(-1);
  if (because === 'queue' && current !== undefined) current.isGivenUp = true;
  endStage();
  ask(preset, 'paid');
}

/** Free waits its turn at Google first; past the limit, a ticked request goes to the paid one instead. */
function queued(preset: Preset): void {
  startStage('queue', 'free', modelFor(preset, 'free'));
  show('waiting');
  const queueMs = state.isFreeQueueLong ? times().longQueueMs : times().queueMs;
  if (mayGoToPaid(preset) && queueMs > times().queueLimitMs) {
    timers.push(window.setTimeout(() => handToPaid(preset, 'queue'), times().queueLimitMs));
    return;
  }
  timers.push(window.setTimeout(() => thinking(preset, 'free'), queueMs));
}

function ask(preset: Preset, to: Choice): void {
  corrections.sentTo = to;
  corrections.failure = pretendFailure(preset, to);
  if (corrections.failure === 'busy' && to === 'free' && mayGoToPaid(preset)) {
    handToPaid(preset, 'busy');
    return;
  }
  if (corrections.failure !== null) {
    stopTimers();
    show('failed');
    return;
  }
  if (to === 'free') queued(preset);
  else thinking(preset, to);
}

function run(to: Choice): void {
  const preset = corrections.preset;
  if (preset === null) return;
  stopTimers();
  corrections.stages = [];
  corrections.progress = 0;
  corrections.runStartedAt = Date.now();
  startClock();
  ask(preset, to);
}

/* The window. */

function footer(buttons: HTMLButtonElement[], note: string): HTMLElement {
  const bottom = document.createElement('footer');
  if (note !== '') bottom.append(el('p', 'footer-note', note));
  bottom.append(...buttons);
  return bottom;
}

function header(note: string): HTMLElement {
  const top = document.createElement('header');
  const heading = el('div', 'review-heading');
  heading.append(titleOf({ mark: 'lektor', label: 'AI ispravke', name: TEXT_TITLE }), el('p', 'review-note', note));
  const dismiss = button('', close, 'close');
  dismiss.setAttribute('aria-label', 'Zatvori');
  dismiss.append(icon('close'));
  top.append(heading, dismiss);
  return top;
}

function choosingPanel(): HTMLElement {
  const panes = el('div', 'review-panes');
  panes.append(choicesColumn(), detailColumn());
  const footNote = corrections.view === 'choosing' ? 'Videćeš predloge. Tekst se ne menja dok ih ne uneseš.' : '';
  return framed(header('Tvoj tekst se ne menja dok je ovaj prozor otvoren.'), panes, footer([button('Zatvori', close)], footNote));
}

/**
 * A stand-in for the app's review. New: under the kind and the Lektor, the model that wrote it and,
 * on paid, what it cost, as OpenRouter's reply stated it: known only now, after the run.
 */
function reviewPanel(preset: Preset): HTMLElement {
  const by = corrections.reviewBy;
  const kept = corrections.kept[preset]?.[by];
  const cost = kept?.cost == null ? 'besplatno' : `koštalo ${dollars(kept.cost)}`;
  const ran = el('div', 'lektor-review-ran');
  const line = el('p', 'lektor-service-line');
  line.append(el('span', 'lektor-review-kind', PRESET_NAMES[preset]), ' · ', choiceMark(by), el('span', '', `${lektorName(by)} · ${kept?.at ?? JUST_NOW}`));
  ran.append(line, el('p', 'lektor-where', `Model: ${MODELS[by][preset]} · ${cost}`));
  const stand = el('div', 'review-text review-text-empty');
  stand.textContent = '(Ovde je pregled ispravki, kao sada.)';
  const body = el('div', 'review-body lektor-body');
  body.append(ran, stand);
  const panes = el('div', 'review-panes');
  panes.append(body);
  const buttons = [button('Unesi sve izmene u tekst', close, 'keep'), button('Nazad na izbor', () => show('choosing')), button('Zatvori', close)];
  return framed(header('Pregledaj predloge ispravki u tekstu ispod. Ako ti nešto ne odgovara, klikni na to i promeni.'), panes, footer(buttons, 'Izmene ulaze u tvoj tekst.'));
}

function framed(top: HTMLElement, middle: HTMLElement, bottom: HTMLElement): HTMLElement {
  const panel = el('div', 'panel review-panel lektor-panel lektor-window');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.append(top, middle, bottom);
  return panel;
}

function draw(): void {
  const preset = corrections.preset;
  const panel = corrections.view === 'review' && preset !== null ? reviewPanel(preset) : choosingPanel();
  const dialog = element('lektor-dialog', HTMLDialogElement);
  if (shown === null) shown = showAsModal(dialog, panel, close);
  else dialog.replaceChildren(panel);
}

/**
 * For the harness's switches: a case set while the window is open shows at once, not only on
 * reopening. Not while it runs, where a redraw would start the clock again from nought.
 */
export function redrawWindowIfOpen(): void {
  if (shown !== null && corrections.view !== 'waiting') draw();
}

/**
 * Opens the window as the app would from the panel's "Pređi na ispravke": no kind chosen, and the
 * rework kinds' Lektor on Besplatni, whatever he picked last time.
 */
export function openCorrectionsWindow(): void {
  corrections.view = 'choosing';
  corrections.preset = null;
  corrections.failure = null;
  corrections.isAskingAgain = false;
  corrections.reworkChoice = 'free';
  corrections.isPaidIfSlow = false;
  draw();
}

/** A state of the window the harness can open straight away, without sending and waiting for it. */
export type WindowCase = 'waiting' | 'queued' | 'busy' | 'no-credit';

/** A wait held still at one stage, until Prekini, so it can be looked at. */
function holdWait(preset: Preset, to: Choice, phase: Phase): void {
  const now = Date.now();
  const model = modelFor(preset, to);
  corrections.preset = preset;
  corrections.sentTo = to;
  corrections.progress = 40;
  // Writing, held there: the thinking before it done some seconds ago, as it would have been.
  const before: Stage[] = phase === 'writing' ? [{ phase: 'thinking', by: to, model, startedAt: now - 47_000, endedAt: now - 44_000, isGivenUp: false }] : [];
  corrections.stages = [...before, { phase, by: to, model, startedAt: phase === 'writing' ? now - 44_000 : now, endedAt: null, isGivenUp: false }];
  corrections.runStartedAt = before[0]?.startedAt ?? now;
  startClock();
  show('waiting');
}

/**
 * For the harness: the paid one writing Stilska dorada, or Slova i zarezi waiting in Google's free
 * queue, each held there until Prekini; Google busy on Slova i zarezi; the paid account empty on
 * Dubinska prerada.
 */
export function openCorrectionsWindowAt(windowCase: WindowCase): void {
  openCorrectionsWindow();
  stopTimers();
  if (windowCase === 'waiting') {
    holdWait('wording', 'paid', 'writing');
    return;
  }
  if (windowCase === 'queued') {
    holdWait('letters', 'free', 'queue');
    return;
  }
  corrections.preset = windowCase === 'busy' ? 'letters' : 'rewrite';
  corrections.sentTo = windowCase === 'busy' ? 'free' : 'paid';
  corrections.failure = windowCase;
  show('failed');
}
