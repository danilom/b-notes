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
import { strings } from '../src/language/wording.ts';
import { createDiffLegend } from '../src/ui/diff-legend.ts';
import { icon } from '../src/ui/icons.ts';
import { keys } from './lektor-keys-prototype.ts';
import {
  type Choice,
  FALLS_BACK,
  MODELS,
  PAID_IF_SLOW_MODEL,
  PRESET_NAMES,
  PRESET_PROMPTS,
  PRESETS,
  type Pace,
  type FreeModel,
  type Preset,
  type Tier,
  TEXT_PARAGRAPHS,
  TEXT_TITLE,
  button,
  choiceMark,
  dollars,
  el,
  familyOf,
  element,
  markOf,
  nameOf,
  paidWords,
  problem,
  radio,
  sendButton,
  serviceLine,
  serviceLineOf,
  spend,
  state,
  tierOf,
  tierOfModel,
} from './lektor-prototype-pieces.ts';
import { FREE_LIMIT_WORDS, type PaidIfSlow, lektorChoice, paidBalance, paidIfSlowBox, paidIfSlowByDefault } from './lektor-choice-radios.ts';

type View = 'choosing' | 'waiting' | 'failed' | 'review';
type Failure = 'busy' | 'no-credit' | 'offline';

/**
 * Corrections ready to look at. Only while his text is as it was when they were made (trailing
 * whitespace aside): on a changed text they can't be offered, since the review would offer to undo
 * his own edits. They are then said to be no longer valid, in one grey line, rather than vanishing.
 */
export interface Kept {
  at: string;
  /** His text has changed since they were made: no longer offered, only said to be void. */
  isStale?: boolean;
  /** What the run cost, from OpenRouter's reply; null on free. */
  cost: number | null;
  /** The model that did the work, which on free may be the older one standing in; the usual one when not said. */
  model?: string;
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
   * so it can go ahead without asking him minutes in. Set afresh each time the window opens (paidIfSlowByDefault).
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
  real: { queueMs: 30_000, longQueueMs: 300_000, queueLimitMs: 60_000, thinkingMs: 3000, writingStepMs: 12_000 },
};

/** The pretended waits at the harness's pace; the utisak's wait in the panel borrows them too. */
export const times = (): WaitTimes => WAIT_TIMES[state.pace];

/** When corrections just made were made, Danilo's word; a card from just now leaves the time out, since "od upravo sad" reads badly. */
const JUST_NOW = 'upravo sad';

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

function keptFor(preset: Preset, isStale = false): [Choice, Kept][] {
  const kept = corrections.kept[preset] ?? {};
  return (['free', 'paid'] as const).flatMap((by) => {
    const one = kept[by];
    return one === undefined || (one.isStale === true) !== isStale ? [] : [[by, one] as [Choice, Kept]];
  });
}

/** The prototype's "text changed": every set kept so far goes void, or back to valid when unticked. */
export function setCorrectionsStale(isStale: boolean): void {
  for (const both of Object.values(corrections.kept)) {
    for (const one of Object.values(both)) one.isStale = isStale;
  }
  redrawWindowIfOpen();
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
/**
 * Whose they are by name, then when, then what they cost as "plaćeno" (Danilo, 2026-11-10): a bare
 * sum after "Predlozi" meant nothing. The mark says free or paid; a free one has no sum.
 */
function readyCard(preset: Preset, by: Choice, kept: Kept): HTMLElement {
  const card = el('div', 'lektor-ready-card');
  const tier = tierOfModel(by, kept.model ?? MODELS[by][preset]);
  const when = kept.at === JUST_NOW ? '' : ` od ${kept.at}`;
  const words = el('span', 'lektor-ready-words', `Predlozi lektora\u00a0${familyOf(tier)}${when}${paidWords(kept.cost)}`);
  words.title = `Napravio AI Lektor ${nameOf(tier)}.`;
  card.append(markOf(tier), words, button('Pogledaj', () => openReview(preset, by), 'lektor-main-action'));
  return card;
}

/**
 * Where a card was, once his text has changed: what they were, and that they no longer hold, so
 * suggestions he may have paid for don't simply vanish (Danilo, 2026-11-10). Nothing to click.
 */
function staleLine(preset: Preset, by: Choice, kept: Kept): HTMLElement {
  const tier = tierOfModel(by, kept.model ?? MODELS[by][preset]);
  const when = kept.at === JUST_NOW ? '' : ` od ${kept.at}`;
  return el('p', 'lektor-where lektor-stale-kept', `Predlozi lektora\u00a0${familyOf(tier)}${when} više ne važe: tekst je promenjen.`);
}

const staleLines = (preset: Preset): HTMLElement[] => keptFor(preset, true).map(([by, kept]) => staleLine(preset, by, kept));

function readyDetail(preset: Preset): HTMLElement[] {
  const again = button('Novi zahtev za ispravke…', () => {
    corrections.isAskingAgain = true;
    show('choosing');
  }, 'lektor-ask-again');
  return [
    el('p', 'lektor-window-kind-title', PRESET_NAMES[preset]),
    ...keptFor(preset).map(([by, kept]) => readyCard(preset, by, kept)),
    ...staleLines(preset),
    again,
  ];
}

/** The window's tick box for a slow free one, the same on every kind; set afresh each time the window opens. */
const windowPaidIfSlow: PaidIfSlow = {
  get isTicked() {
    return corrections.isPaidIfSlow;
  },
  tick: (isTicked) => {
    corrections.isPaidIfSlow = isTicked;
  },
};

/** Whether a free request may be handed to paid Flash, as he ticked: on every kind (Danilo, 2026-11-10). */
function mayGoToPaid(): boolean {
  return corrections.isPaidIfSlow && keys.saved.paid;
}

/**
 * For the first two kinds, said rather than asked, with the tick for a slow free one under it and the
 * balance it spends from; for rework, the choice, with the same tick under Besplatni.
 */
function lektorPart(preset: Preset): HTMLElement[] {
  if (FALLS_BACK.has(preset)) {
    const canSwitch = lektorFor(preset) === 'free' && keys.saved.paid;
    if (!canSwitch) return [serviceLine(lektorFor(preset), preset)];
    // In a row of the choices' own make, so it is as big a target, with the same hover.
    const row = el('div', 'lektor-choice-options');
    row.append(paidIfSlowBox(windowPaidIfSlow, false));
    return [serviceLine('free', preset), row, ...paidBalance()];
  }
  return lektorChoice({
    paidIfSlow: windowPaidIfSlow,
    group: 'lektor-window-level',
    chosen: lektorFor(preset),
    // Not "thorough": on these kinds the free one changed several times more of his words, and lost in the blind picks.
    why: { paid: 'bolje piše i čuva tvoj glas' },
    what: preset,
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

/** His own, under the fold's heading: "uputstva" is said there, so here only whose they are. */
function noteField(): HTMLElement[] {
  const label = el('label', 'lektor-prompt-sub', 'Tvoja, dodatna ');
  label.append(el('span', 'lektor-label-aside', '(nije obavezno)'));
  const box = el('textarea', 'lektor-note');
  // Three lines: room to say something, and the column still fits on his Asus with the Lektor choice in it.
  box.rows = 3;
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
  send.querySelector('.lektor-choice-mark')?.replaceWith(choiceMark(to, preset));
  send.title = [`Šalje se ${to === 'free' ? 'Guglu' : 'firmi OpenRouter'}`, `Model: ${MODELS[to][preset]}`].join('\n');
  // What sending does, next to the button that does it, rather than by Zatvori in the footer; and,
  // while the instructions are folded, the way to them at its left: one line of small print over the buttons.
  const line = el('div', 'lektor-send-line');
  line.append(...(isPromptOpen ? [] : [promptToggle()]), el('span', 'lektor-wait-small lektor-send-note', 'Videćeš predloge. Tekst se ne menja dok ih ne uneseš.'));
  row.append(line, send);
  return row;
}

/**
 * Whether the instruction sent to the AI, and his own added to it, are shown. Folded each time the
 * window opens: the instruction is in English and addressed to a machine, the kind's description
 * already says the same to him in Serbian, and adding his own is rare. Open, though, whenever he has
 * written one: a note that goes with the request is never sent out of his sight.
 */
let isPromptOpen = false;

/** "▸ Uputstva za AI", the usual sign: pointing right while folded, down while open. */
function promptToggle(): HTMLButtonElement {
  const toggle = el('button', 'lektor-prompt-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(isPromptOpen));
  toggle.append(el('span', 'lektor-prompt-arrow', isPromptOpen ? '▾' : '▸'), el('span', '', 'Uputstva za AI'));
  toggle.addEventListener('click', () => {
    isPromptOpen = !isPromptOpen;
    draw();
  });
  return toggle;
}

/**
 * The instructions, open: the opener over them, heading what it opened, since ▾ points down at its
 * contents. Folded, the opener sits on the send line instead (sendRow) and this is nothing.
 */
function promptPart(preset: Preset): HTMLElement[] {
  if (!isPromptOpen) return [];
  const toggle = promptToggle();
  // One heading for both, and what it opens held together by a line down its side, so the two
  // small labels inside read as parts of it rather than as headings of the column.
  const group = el('div', 'lektor-prompt-group');
  group.append(el('p', 'lektor-prompt-sub', 'Za ovu vrstu ispravke'), el('p', 'lektor-prompt', PRESET_PROMPTS[preset]), ...noteField());
  return [toggle, group];
}

/** The request; with nothing valid kept, any void sets said above it, where their cards would be. */
function requestDetail(preset: Preset): HTMLElement[] {
  return [
    el('p', 'lektor-window-kind-title', PRESET_NAMES[preset]),
    ...(keptFor(preset).length === 0 ? staleLines(preset) : []),
    ...lektorPart(preset),
    ...lastCost(preset),
    ...promptPart(preset),
    sendRow(preset),
  ];
}

/* The right column, running and failed. */

/**
 * His whole wait so far, from when he sent it, in minutes once it passes one. Timed by performance.now()
 * throughout, never Date.now(): the wall clock can step back (Danilo's machine's does), which showed
 * "Prošlo je -1 s". The app should do the same.
 */
function waitedWords(): string {
  const seconds = Math.floor((performance.now() - corrections.runStartedAt) / 1000);
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

/**
 * What a stage is, said as going on while it does and as done after: the free door sends only "still
 * here" while the request waits its turn, then the thinking and the words; paid has no queue. Said of
 * "Lektor", the one named above the list (Danilo, 2026-11-10): "Google AI" and "Claude AI" here were
 * the only place he met companies and models, and he'd wonder what Google was doing in it.
 */
const STAGE_WORDS: Readonly<Record<Phase, [string, string]>> = {
  queue: ['Zahtev čeka u redu…', 'Zahtev je čekao u redu'],
  refused: ['Lektor je zauzet i nije primio zahtev', 'Lektor je zauzet i nije primio zahtev'],
  thinking: ['Lektor razmišlja…', 'Lektor je razmislio'],
  writing: ['Lektor ispravlja tekst…', 'Lektor je ispravio tekst'],
};

const stageWords = (stage: Stage, isCurrent: boolean): string => STAGE_WORDS[stage.phase][isCurrent ? 0 : 1];

/** Which of the three a stage is by, by the model that ran it. */
const stageTier = (stage: Stage): Tier => tierOfModel(stage.by, stage.model);

/**
 * A finished stage ticked, the current one turning, and one given up or refused a soft "!": not a
 * cross, since the request is still on its way and nothing is asked of him; a cross reads as failure.
 */
function stageMark(stage: Stage, isCurrent: boolean): HTMLElement {
  if (isCurrent) return el('span', 'lektor-stage-mark lektor-reading');
  if (stage.isGivenUp || stage.phase === 'refused') return el('span', 'lektor-stage-mark lektor-stage-mark-moved', '!');
  return el('span', 'lektor-stage-mark', '✓');
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

/**
 * Under the queue while it lasts: that free requests wait (not that something is wrong), and, if he
 * ticked, when it goes to the paid one, counted from sending, as the box says. Not the older model
 * standing in: free Flash to free Flash, nothing he would act on.
 */
function queueNote(): HTMLElement {
  const next = mayGoToPaid() ? ` Ako ne krene za ${FREE_LIMIT_WORDS}, šalje se plaćenom lektoru „Flash”.` : '';
  return el('p', 'lektor-wait-small lektor-stage-note', `Besplatni zahtevi čekaju na red, pa traju duže, obično nekoliko minuta.${next}`);
}

/** What belongs to the stage going on, under it: the queue's note, the writing's bar. */
function underStage(stage: Stage): HTMLElement[] {
  if (stage.endedAt !== null) return [];
  if (stage.phase === 'queue') return [queueNote()];
  if (stage.phase === 'writing') return [progressRow()];
  return [];
}

/**
 * A finished stage's words and how long it took: the time at the right, in a column with the
 * others, and a dotted leader carrying the eye from the words to it (Danilo's pick over a middle dot).
 */
function stageText(words: string, took: string): HTMLElement[] {
  if (took === '') return [el('span', 'lektor-stage-words', words)];
  return [el('span', 'lektor-stage-words', words), el('span', 'lektor-stage-leader'), el('span', 'lektor-stage-time', took)];
}

/**
 * The stages, and where it was handed to another Lektor (a slow free one to paid Flash, as he
 * ticked), that one's own "AI Lektor:" line with its mark before its stages: the one change on this
 * screen he should notice, since it costs.
 */
function stagesList(): HTMLElement {
  const list = el('div', 'lektor-stages');
  corrections.stages.forEach((stage, index) => {
    const before = corrections.stages[index - 1];
    if (before !== undefined && stageTier(before) !== stageTier(stage)) list.append(serviceLineOf(stageTier(stage)));
    const isCurrent = stage.endedAt === null;
    const row = el('div', 'lektor-stage');
    const took = stage.endedAt === null || stage.phase === 'refused' ? '' : durationWords(stage.endedAt - stage.startedAt);
    row.append(stageMark(stage, isCurrent), ...stageText(stageWords(stage, isCurrent), took));
    list.append(row, ...underStage(stage));
  });
  return list;
}

/** The Lektor it was sent to, with its mark, as the request screen's "AI Lektor:" line has it. */
function sentToLine(preset: Preset): HTMLElement {
  const first = corrections.stages[0];
  return serviceLineOf(first === undefined ? tierOf(corrections.sentTo, preset) : stageTier(first));
}

/**
 * The model working now, in small grey under the clock: the one place it is shown outright (Danilo,
 * 2026-11-10), for whoever wants it; the Lektor's name is above. 3.6 said to be standing in.
 */
function modelLine(): HTMLElement[] {
  const now = corrections.stages.at(-1);
  if (now === undefined) return [];
  return [el('p', 'lektor-wait-small', `${now.model}${now.model === FREE_STAND_IN ? ' (rezervni)' : ''}`)];
}

/**
 * The wait, in four styles: the text's name in bold, the kind and the stages as words, the clock
 * big as the one thing to glance at, the model and notes in small grey.
 */
function waitingDetail(preset: Preset): HTMLElement[] {
  // One column with one left edge, in the middle of the right side, read top to bottom like a list.
  const column = el('div', 'lektor-wait-column');
  column.append(
    // The text's name in the colour the window's title gives it, as everywhere it names his text.
    el('p', 'lektor-heading lektor-wait-name', TEXT_TITLE),
    el('p', '', `Vrsta ispravke: ${PRESET_NAMES[preset]}`),
    sentToLine(preset),
    stagesList(),
    el('p', 'lektor-window-clock', waitedWords()),
    ...modelLine(),
  );
  const big = el('div', 'lektor-window-big lektor-window-wait');
  big.append(column);
  // Where the send button was, apart from what he is watching: the hand that sent it finds the way to stop it.
  const stop = el('div', 'lektor-window-actions');
  // Giving up on it, which is what it is, even though paid may already be charging for the work begun.
  stop.append(button('Odustani od zahteva', () => {
    stopTimers();
    show('choosing');
  }, ''));
  return [big, stop];
}

function sendToButton(preset: Preset, to: Choice): HTMLButtonElement {
  const made = button(to === 'free' ? 'Pošalji besplatnom lektoru' : 'Pošalji plaćenom lektoru', () => run(to), 'lektor-main-action lektor-sends');
  made.append(choiceMark(to, preset), icon('move-out'));
  made.title = `Model: ${MODELS[to][preset]}`;
  return made;
}

/**
 * Whether the other Lektor can help: only where the trouble was the company's (busy, its money),
 * not his internet or his text; and only where he has its key.
 */
function shortcutAfter(preset: Preset): HTMLButtonElement[] {
  const to = other(corrections.sentTo);
  const isCompanys = corrections.failure === 'busy' || corrections.failure === 'no-credit';
  return isCompanys && keys.saved[to] ? [sendToButton(preset, to)] : [];
}

/** What went wrong, in the app's own words, and a line on what can be done. */
function failureWords(): HTMLElement {
  if (corrections.failure === 'no-credit') return problem('Plaćeni iznos je potrošen.', keys.saved.free ? 'Možeš da pošalješ besplatnom lektoru, ili neka se uplati još.' : 'Neka se uplati još.');
  if (corrections.failure === 'offline') return problem('Internet ne radi, a AI Lektoru je potreban.', 'Kad internet proradi, pošalji ponovo.');
  return problem('Gugl je sada zauzet.', keys.saved.paid ? 'Probaj malo kasnije, ili pošalji plaćenom lektoru.' : 'Probaj malo kasnije.');
}

/**
 * Every failure the same shape: what went wrong, big; "← Nazad" back to the request just as he left
 * it, where sending again is the retry; and at most one shortcut, the other Lektor, where it can help.
 */
function failedDetail(preset: Preset): HTMLElement[] {
  const big = el('div', 'lektor-window-big');
  big.append(failureWords());
  const back = button('', () => {
    corrections.failure = null;
    show('choosing');
  }, 'lektor-back-to-ready');
  back.append(icon('back'), el('span', '', 'Nazad'));
  const row = el('div', 'lektor-window-actions');
  row.append(back, ...shortcutAfter(preset));
  return [big, row];
}

function detailColumn(): HTMLElement {
  const column = el('div', 'lektor-window-detail');
  const preset = corrections.preset;
  if (preset === null) column.append(emptyDetail());
  else if (corrections.view === 'waiting') column.append(...waitingDetail(preset));
  else if (corrections.view === 'failed') column.append(...failedDetail(preset));
  else if (keptFor(preset).length > 0 && !corrections.isAskingAgain) column.append(...readyDetail(preset));
  else column.append(...requestDetail(preset));
  return column;
}

/* Running, pretended. */

/** What a run on paid costs here, made up: in the app it is read off OpenRouter's reply. Flash writes more on rework. */
function pretendCost(preset: Preset, to: Choice, model: string): number | null {
  if (to === 'free') return null;
  if (tierOfModel(to, model) === 'opus') return 0.52;
  return FALLS_BACK.has(preset) ? 0.09 : 0.14;
}

const FREE_FIRST: FreeModel = 'gemini-3.8-flash';
const FREE_STAND_IN: FreeModel = 'gemini-3.6-flash';


function endStage(): void {
  const current = corrections.stages.at(-1);
  if (current !== undefined && current.endedAt === null) current.endedAt = performance.now();
}

/**
 * A new stage; but a free queue going on with the other free model (3.8 to 3.6) stays the one queue,
 * only its model changing: free Flash to free Flash, which he would not act on, so not shown.
 */
function startStage(phase: Phase, by: Choice, model: string): void {
  const current = corrections.stages.at(-1);
  if (phase === 'queue' && current?.phase === 'queue' && current.endedAt === null && current.by === by) {
    current.model = model;
    return;
  }
  endStage();
  corrections.stages.push({ phase, by, model, startedAt: performance.now(), endedAt: null, isGivenUp: false });
}


function finishRun(preset: Preset, to: Choice): void {
  stopTimers();
  endStage();
  const model = corrections.stages.at(-1)?.model ?? MODELS[to][preset];
  const cost = pretendCost(preset, to, model);
  spend(cost);
  corrections.kept[preset] = { ...corrections.kept[preset], [to]: { at: JUST_NOW, cost, model } };
  corrections.isAskingAgain = false;
  openReview(preset, to);
}

function writingStep(preset: Preset, to: Choice, model: string, step: number): void {
  if (step > 10) {
    finishRun(preset, to);
    return;
  }
  if (step === 0) startStage('writing', to, model);
  corrections.progress = step * 10;
  show('waiting');
  timers.push(window.setTimeout(() => writingStep(preset, to, model, step + 1), times().writingStepMs));
}

function thinking(preset: Preset, to: Choice, model: string): void {
  startStage('thinking', to, model);
  show('waiting');
  timers.push(window.setTimeout(() => writingStep(preset, to, model, 0), times().thinkingMs));
}

function fail(failure: Failure): void {
  corrections.failure = failure;
  stopTimers();
  show('failed');
}

/** Paid: the kind's own paid model, or paid Flash where a slow free one is handed on. */
function askPaid(preset: Preset, model: string = MODELS.paid[preset]): void {
  corrections.sentTo = 'paid';
  if (state.isOffline) {
    fail('offline');
    return;
  }
  if (state.isMoneyOut) {
    fail('no-credit');
    return;
  }
  thinking(preset, 'paid', model);
}

/**
 * Where a free request goes when the model it asked won't start: from 3.8 to free 3.6 where the
 * kind allows it, from there to paid 3.8 if he ticked for that; otherwise it has failed as busy.
 */
function nextAfter(preset: Preset, model: FreeModel): void {
  if (model === FREE_FIRST && FALLS_BACK.has(preset)) askFree(preset, FREE_STAND_IN);
  else if (mayGoToPaid()) askPaid(preset, PAID_IF_SLOW_MODEL);
  else fail('busy');
}

/** Whether a model still waiting at the limit may be given up for the next: 3.8 for 3.6 where the kind allows it; else only if he ticked. */
function mayMoveOn(preset: Preset, model: FreeModel): boolean {
  return (model === FREE_FIRST && FALLS_BACK.has(preset)) || mayGoToPaid();
}

/**
 * How long a free model may queue before it is given up: a minute a step, so two minutes before a
 * ticked one reaches paid Flash, as the box says; rework has no 3.6 between, so 3.8 has both minutes.
 */
function queueLimitFor(preset: Preset, model: FreeModel): number {
  return model === FREE_FIRST && !FALLS_BACK.has(preset) ? 2 * times().queueLimitMs : times().queueLimitMs;
}

/** Whether the next step is only the other free model: then nothing is noted, the queue simply goes on. */
const staysFree = (preset: Preset, model: FreeModel): boolean => model === FREE_FIRST && FALLS_BACK.has(preset);

/** Refused outright, without a turn in the queue: on to the next, noted only where it leaves the free one. */
function refusedBy(preset: Preset, model: FreeModel): void {
  if (staysFree(preset, model)) {
    askFree(preset, FREE_STAND_IN);
    return;
  }
  // A queue already waited (3.8's, then 3.6 refused) was given up, not finished.
  const current = corrections.stages.at(-1);
  if (current !== undefined && current.endedAt === null) current.isGivenUp = true;
  endStage();
  const now = performance.now();
  corrections.stages.push({ phase: 'refused', by: 'free', model, startedAt: now, endedAt: now, isGivenUp: true });
  nextAfter(preset, model);
}

/** Still waiting at the limit: given up, on to the next, and nothing of its work is lost since none began. */
function givenUp(preset: Preset, model: FreeModel): void {
  if (staysFree(preset, model)) {
    askFree(preset, FREE_STAND_IN);
    return;
  }
  const current = corrections.stages.at(-1);
  if (current !== undefined) current.isGivenUp = true;
  endStage();
  nextAfter(preset, model);
}

/**
 * A free model waits its turn at Google; at a minute's wait it is given up for the next where that
 * is allowed, or else waits on. Google's stream says when the work begins, so only a request still
 * queued is ever given up.
 */
function askFree(preset: Preset, model: FreeModel): void {
  corrections.sentTo = 'free';
  if (state.isOffline) {
    fail('offline');
    return;
  }
  const day = state.google[model];
  if (day === 'busy') {
    refusedBy(preset, model);
    return;
  }
  startStage('queue', 'free', model);
  show('waiting');
  const queueMs = day === 'slow' ? times().longQueueMs : times().queueMs;
  const limitMs = queueLimitFor(preset, model);
  if (queueMs > limitMs && mayMoveOn(preset, model)) {
    timers.push(window.setTimeout(() => givenUp(preset, model), limitMs));
    return;
  }
  timers.push(window.setTimeout(() => thinking(preset, 'free', model), queueMs));
}

function run(to: Choice): void {
  const preset = corrections.preset;
  if (preset === null) return;
  stopTimers();
  corrections.failure = null;
  corrections.stages = [];
  corrections.progress = 0;
  corrections.runStartedAt = performance.now();
  startClock();
  if (to === 'paid') askPaid(preset);
  else askFree(preset, FREE_FIRST);
}

/* The window. */

function footer(buttons: HTMLButtonElement[], note: string): HTMLElement {
  const bottom = document.createElement('footer');
  if (note !== '') bottom.append(el('p', 'footer-note', note));
  bottom.append(...buttons);
  return bottom;
}

function header(note = ''): HTMLElement {
  const top = document.createElement('header');
  const heading = el('div', 'review-heading');
  heading.append(titleOf({ mark: 'lektor', label: 'AI ispravke', name: TEXT_TITLE }));
  if (note !== '') heading.append(el('p', 'review-note', note));
  const dismiss = button('', close, 'close');
  dismiss.setAttribute('aria-label', 'Zatvori');
  dismiss.append(icon('close'));
  top.append(heading, dismiss);
  return top;
}

function choosingPanel(): HTMLElement {
  const panes = el('div', 'review-panes');
  panes.append(choicesColumn(), detailColumn());
  // The footer has only what is the window's: what sending does is said beside the send button.
  return framed(header('Tvoj tekst se ne menja dok je ovaj prozor otvoren.'), panes, footer([button('Zatvori', close)], ''));
}

/**
 * The first of two lines, what came back: the kind, who made it, when, on paid what it cost, as
 * OpenRouter's reply stated it, and how much it changed (the numbers made up). The model only in the
 * tooltip on who made it (Danilo, 2026-11-10): on this line it was cryptic and crowded it, and the
 * wait, where it does least harm, has already shown it.
 */
function reviewWhoLine(preset: Preset, by: Choice, kept: Kept | undefined): HTMLElement {
  const said = strings('sr').lektor.review;
  const model = kept?.model ?? MODELS[by][preset];
  const lektor = el('span', 'lektor-review-who');
  // Who made it, by the model that ran: a slow free rework handed on was paid Flash, not Opus.
  const tier = tierOfModel(by, model);
  lektor.append(markOf(tier), el('span', '', nameOf(tier)));
  lektor.title = `Model: ${model}${model === FREE_STAND_IN ? ' (stariji, rezervni)' : ''}`;
  const who = el('p', 'lektor-service-line');
  // Named as the wait names it, so the kind reads as what was asked rather than as a heading.
  who.append(
    el('span', 'lektor-review-kind', `Vrsta ispravke: ${PRESET_NAMES[preset]}`),
    ' · ',
    lektor,
    el('span', '', ` · ${kept?.at ?? JUST_NOW}${paidWords(kept?.cost)} · ${said.counts(12, 31)}`),
  );
  const line = el('div', 'lektor-review-row');
  line.append(who);
  return line;
}

/** The second line, how the text below is shown: what its marks mean, and the box that changes the view. */
function reviewViewLine(legend: HTMLElement): HTMLElement {
  const only = el('label', 'lektor-only-new');
  const box = el('input');
  box.type = 'checkbox';
  only.append(box, strings('sr').lektor.review.onlyNew);
  const line = el('div', 'lektor-review-row');
  line.append(legend, only);
  return line;
}

/** His text in the review's own read-only box, without the marks: the real review draws the changes here. */
function reviewTextBox(): HTMLElement {
  const box = el('div', 'review-text');
  box.append(el('p', '', TEXT_TITLE), ...TEXT_PARAGRAPHS.map((paragraph) => el('p', '', paragraph)));
  return box;
}

/**
 * A stand-in for the app's review, drawn with its own pieces: who made it, the legend, the counts,
 * and the text in its read-only box, without the changes marked. New: the model that wrote it and,
 * on paid, what it cost, as OpenRouter's reply stated it, known only now, after the run.
 */
function reviewPanel(preset: Preset): HTMLElement {
  const by = corrections.reviewBy;
  const kept = corrections.kept[preset]?.[by];
  const said = strings('sr').lektor.review;
  const legend = createDiffLegend(
    [
      { sample: 'old', said: said.legend.old },
      { sample: 'proposed', said: said.legend.proposed },
      { sample: 'own', said: said.legend.own },
      { sample: 'goes-in', said: said.legend.goesIn },
      { sample: 'small', said: said.legend.small },
    ],
    strings('sr').legendSample,
  );
  const body = el('div', 'review-body lektor-body');
  body.append(
    reviewWhoLine(preset, by, kept),
    reviewViewLine(legend),
    reviewTextBox(),
  );
  const panes = el('div', 'review-panes');
  panes.append(body);
  // No note beside it: "Unesi sve izmene u tekst" says what it does. Solid blue, the next step, as on every screen of the window.
  const bottom = footer([button(said.apply, close, 'lektor-main-action'), button('Zatvori', close)], '');
  // A step back, at the footer's left, apart from the two that finish or leave: as Nazad on the keys screen.
  const back = button('', () => show('choosing'), 'lektor-footer-back');
  back.append(icon('back'), el('span', '', 'Nazad'));
  bottom.prepend(back);
  // No guide under the title (Danilo, 2026-11-10): "review them, click to change" floated there before
  // any mark was in sight, and changing one is rare; a change shows it can be clicked when hovered.
  return framed(header(), panes, bottom);
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
 * reopening, the wait included: its clock counts from when he sent it, so a redraw doesn't reset it.
 */
export function redrawWindowIfOpen(): void {
  if (shown !== null) draw();
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
  corrections.isPaidIfSlow = paidIfSlowByDefault();
  isPromptOpen = corrections.note.trim() !== '';
  draw();
}

/** A state of the window the harness can open straight away, without sending and waiting for it. */
export type WindowCase = 'waiting' | 'queued' | 'busy' | 'no-credit' | 'offline';

/** A wait held still at one stage, until "Odustani od zahteva", so it can be looked at. */
function holdWait(preset: Preset, to: Choice, phase: Phase): void {
  const now = performance.now();
  const model = MODELS[to][preset];
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
 * queue, each held there until "Odustani od zahteva"; Google busy on Slova i zarezi; the paid account empty on
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
  corrections.preset = windowCase === 'no-credit' ? 'rewrite' : 'letters';
  corrections.sentTo = windowCase === 'no-credit' ? 'paid' : 'free';
  corrections.failure = windowCase;
  show('failed');
}
