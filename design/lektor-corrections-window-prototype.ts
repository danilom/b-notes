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

/** Long enough to see the wait, short enough not to wait for. */
const PRETEND_RUN_MS = 4000;

/** When corrections just made were made: reads after "od" as well as on its own, which "upravo sad" doesn't. */
const JUST_NOW = 'maločas';

let shown: Shown | null = null;
let timers: number[] = [];

function stopTimers(): void {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
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

/** For the first two kinds, said rather than asked; for rework, the choice, with why paid is better. */
function lektorPart(preset: Preset): HTMLElement[] {
  if (FALLS_BACK.has(preset)) return [serviceLine(lektorFor(preset))];
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

function runningClock(): HTMLElement {
  const clock = el('p', 'lektor-window-clock', 'Radi već 0 s');
  const started = Date.now();
  const tick = (): void => {
    clock.textContent = `Radi već ${Math.floor((Date.now() - started) / 1000)} s`;
    timers.push(window.setTimeout(tick, 1000));
  };
  timers.push(window.setTimeout(tick, 1000));
  return clock;
}

function waitingDetail(preset: Preset): HTMLElement {
  const isFree = corrections.sentTo === 'free';
  const fellBack = isFree && state.isFreeBusy ? [el('p', 'lektor-fallback', 'Gugl je bio zauzet, pa ovo radi njegov brži model.')] : [];
  const big = el('div', 'lektor-window-big');
  big.append(
    el('p', 'lektor-reading lektor-window-big-title', 'Ispravlja tekst…'),
    el('p', 'lektor-window-big-kind', PRESET_NAMES[preset]),
    runningClock(),
    el('p', 'lektor-wait-note', isFree ? 'Obično traje oko minut.' : 'Može da potraje nekoliko minuta.'),
    ...fellBack,
    button('Prekini', () => {
      stopTimers();
      show('choosing');
    }, ''),
  );
  return big;
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
  else if (corrections.view === 'waiting') column.append(waitingDetail(preset));
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

function finishRun(preset: Preset, to: Choice): void {
  corrections.kept[preset] = { ...corrections.kept[preset], [to]: { at: JUST_NOW, cost: pretendCost(preset, to) } };
  corrections.isAskingAgain = false;
  openReview(preset, to);
}

function run(to: Choice): void {
  const preset = corrections.preset;
  if (preset === null) return;
  stopTimers();
  corrections.sentTo = to;
  corrections.failure = pretendFailure(preset, to);
  if (corrections.failure !== null) {
    show('failed');
    return;
  }
  show('waiting');
  timers.push(window.setTimeout(() => finishRun(preset, to), PRETEND_RUN_MS));
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
  draw();
}

/** A state of the window the harness can open straight away, without sending and waiting for it. */
export type WindowCase = 'waiting' | 'busy' | 'no-credit';

/**
 * For the harness: the wait (Stilska dorada on paid, left running until Prekini), Google busy on
 * Slova i zarezi, or the paid account empty on Dubinska prerada.
 */
export function openCorrectionsWindowAt(windowCase: WindowCase): void {
  openCorrectionsWindow();
  stopTimers();
  if (windowCase === 'waiting') {
    corrections.preset = 'wording';
    corrections.sentTo = 'paid';
    show('waiting');
    return;
  }
  corrections.preset = windowCase === 'busy' ? 'letters' : 'rewrite';
  corrections.sentTo = windowCase === 'busy' ? 'free' : 'paid';
  corrections.failure = windowCase;
  show('failed');
}
