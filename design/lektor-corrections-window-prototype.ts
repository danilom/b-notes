/*
  The corrections, all in one modal window: choosing the kind, waiting, a failure and its way on,
  and the review. Opened from the panel's "Pređi na ispravke". From the moment he opens it his
  text is held still, which is what thinking of corrections means anyway: the line between the
  panel and the window falls where the text stops being his to change, not midway through.

  Two columns. On the left his two decisions, the Lektor and the kind, each kind saying whether
  corrections of it are ready. On the right whatever belongs to the kind picked: what it does,
  its instruction and his note; while it runs, the wait, big, since nothing else matters then;
  and a failure, as big, with its way on as the main button.

  His text is not shown: read-only beside the choices it looked like the review, as if his
  corrections were already there. Free or paid can be changed here too, but it is the panel's one
  choice, not a second one: a failure here can offer the other Lektor, and he should see where
  that changed.
*/
import { titleOf } from '../src/ui/dialogs/dialog-heading.ts';
import { type Shown, showAsModal } from '../src/ui/dialogs/modal.ts';
import { icon } from '../src/ui/icons.ts';
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
  sendTooltip,
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
  by: Choice;
  at: string;
  /** What the run cost, from OpenRouter's reply; null on free. */
  cost: number | null;
}

interface WindowState {
  view: View;
  preset: Preset;
  note: string;
  failure: Failure | null;
  kept: Partial<Record<Preset, Kept>>;
  /** Whether the review open is a kept one rather than just made. */
  isReviewKept: boolean;
}

export const corrections: WindowState = { view: 'choosing', preset: 'letters', note: '', failure: null, kept: {}, isReviewKept: false };

/** Placeholders, one line each on how far a kind goes, for Danilo to word. */
const KIND_SUMMARIES: Readonly<Record<Preset, string>> = {
  letters: 'Slova bez kvačica, greške u kucanju, razmaci i zarezi. Reči ostaju tvoje.',
  grammar: 'Uz to i gramatika: padeži, slaganje, reč koja nedostaje.',
  wording: 'Uz to i stil: rečenice koje teku bolje, manje ponavljanja.',
  rewrite: 'Slobodna prerada celog teksta, kao da ga drugi pisac prepričava.',
};

/** Long enough to see the wait, short enough not to wait for. */
const PRETEND_RUN_MS = 4000;

let shown: Shown | null = null;
let timers: number[] = [];
/** The panel's own way of choosing, so the panel and the window stay one choice. */
let chooseInPanel: (choice: Choice) => void = () => undefined;

function stopTimers(): void {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

function close(): void {
  stopTimers();
  shown?.close();
  shown = null;
}

/** A different Lektor starts afresh: whatever failed was the other one's. */
function chooseHere(choice: Choice): void {
  chooseInPanel(choice);
  corrections.failure = null;
  corrections.view = 'choosing';
  draw();
}

/** Under a kind with corrections ready: who made them, when, and on paid what they cost. */
function readyLine(kept: Kept): HTMLElement {
  const line = el('p', 'lektor-kind-state');
  const cost = kept.cost === null ? '' : ` · ${dollars(kept.cost)}`;
  line.append(el('span', 'lektor-kind-ready', 'Spremno'), ' · ', choiceMark(kept.by), el('span', '', `${kept.at}${cost}`));
  line.title = `Ispravke koje je napravio ${lektorName(kept.by)} Lektor čekaju da ih pogledaš.`;
  return line;
}

function kindOption(preset: Preset, isLocked: boolean): HTMLElement {
  const option = radio('lektor-window-kind', PRESET_NAMES[preset], corrections.preset === preset, () => {
    corrections.preset = preset;
    corrections.failure = null;
    corrections.view = 'choosing';
    draw();
  });
  const input = option.querySelector('input');
  if (input !== null) input.disabled = isLocked;
  const kept = corrections.kept[preset];
  const kind = el('div', 'lektor-kind');
  kind.append(option, ...(kept === undefined ? [] : [readyLine(kept)]));
  return kind;
}

/** The left column: his two decisions, locked while a request runs. */
function choicesColumn(): HTMLElement {
  const isLocked = corrections.view === 'waiting';
  const column = el('div', 'lektor-window-side');
  column.append(
    ...lektorChoice({ group: 'lektor-window-level', choose: chooseHere, isLocked }),
    el('p', 'lektor-heading', 'Izaberi vrstu ispravke:'),
    ...PRESETS.map((preset) => kindOption(preset, isLocked)),
  );
  return column;
}

function noteField(): HTMLElement[] {
  const label = el('label', 'lektor-label', 'Tvoja dodatna uputstva ');
  label.append(el('span', 'lektor-label-aside', '(nije obavezno)'));
  const box = el('textarea', 'lektor-note');
  box.rows = 2;
  box.placeholder = 'Example: simplify overly long sentences';
  box.value = corrections.note;
  box.addEventListener('input', () => {
    corrections.note = box.value;
  });
  return [label, box];
}

/** The right column while choosing: what the kind picked does, its instruction and his note. */
function kindDetail(): HTMLElement[] {
  return [
    el('p', 'lektor-window-kind-title', PRESET_NAMES[corrections.preset]),
    el('p', 'lektor-line', KIND_SUMMARIES[corrections.preset]),
    el('p', 'lektor-prompt-label', 'Uputstvo za AI Lektora:'),
    el('p', 'lektor-prompt', PRESET_PROMPTS[corrections.preset]),
    ...noteField(),
  ];
}

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

/** The right column while it runs, all of it: the one thing happening, said big. */
function waitingDetail(): HTMLElement {
  const fellBack = state.choice === 'free' && state.isFreeBusy ? [el('p', 'lektor-fallback', 'Gugl je bio zauzet, pa ovo radi njegov brži model.')] : [];
  const big = el('div', 'lektor-window-big');
  big.append(
    el('p', 'lektor-reading lektor-window-big-title', 'Ispravlja tekst…'),
    el('p', 'lektor-window-big-kind', PRESET_NAMES[corrections.preset]),
    runningClock(),
    el('p', 'lektor-wait-note', state.choice === 'free' ? 'Obično traje oko minut.' : 'Može da potraje nekoliko minuta.'),
    ...fellBack,
  );
  return big;
}

/** The right column after a failure, as big: what happened, and the way on is the main button. */
function failedDetail(): HTMLElement {
  const big = el('div', 'lektor-window-big');
  big.append(
    corrections.failure === 'no-credit'
      ? problem('Plaćeni iznos je potrošen.', 'Možeš da pošalješ besplatnom, ili neka se uplati još. Tvoj izbor i uputstva su ostali.')
      : problem('AI Lektor sada ne radi. Probaj kasnije.', 'Gugl je zauzet. Za slova i gramatiku bi uzeo svoj brži model, ali za stil i dubinsku preradu on nije dovoljno dobar.'),
  );
  return big;
}

function detailColumn(): HTMLElement {
  const column = el('div', 'lektor-window-detail');
  if (corrections.view === 'waiting') column.append(waitingDetail());
  else if (corrections.view === 'failed') column.append(failedDetail());
  else column.append(...kindDetail());
  return column;
}

/** What a run on paid costs here, made up: in the app it is read off OpenRouter's reply. */
function pretendCost(): number | null {
  if (state.choice === 'free') return null;
  return FALLS_BACK.has(corrections.preset) ? 0.09 : 0.52;
}

function run(): void {
  stopTimers();
  corrections.failure = null;
  const cantFallBack = state.choice === 'free' && state.isFreeBusy && !FALLS_BACK.has(corrections.preset);
  if (cantFallBack || (state.choice === 'paid' && state.isMoneyOut)) {
    corrections.failure = cantFallBack ? 'busy' : 'no-credit';
    corrections.view = 'failed';
    draw();
    return;
  }
  corrections.view = 'waiting';
  draw();
  timers.push(
    window.setTimeout(() => {
      corrections.kept[corrections.preset] = { by: state.choice, at: 'upravo sad', cost: pretendCost() };
      corrections.isReviewKept = false;
      corrections.view = 'review';
      draw();
    }, PRETEND_RUN_MS),
  );
}

function sendFree(): void {
  chooseInPanel('free');
  run();
}

function freeSendButton(): HTMLButtonElement {
  const made = button('Pošalji besplatnom', sendFree, 'keep lektor-sends');
  made.append(choiceMark('free'), icon('move-out'));
  return made;
}

/** The buttons for choosing: show what is ready, or send; and the way out. */
function choosingButtons(): HTMLButtonElement[] {
  const leave = button('Zatvori', close);
  if (corrections.view === 'waiting') {
    return [button('Prekini', () => {
      stopTimers();
      corrections.view = 'choosing';
      draw();
    })];
  }
  if (corrections.view === 'failed') {
    return [corrections.failure === 'no-credit' ? freeSendButton() : button('Pokušaj ponovo', run, 'keep'), leave];
  }
  if (corrections.kept[corrections.preset] === undefined) return [sendButton('Pošalji zahtev za ispravke', corrections.preset, run, 'keep'), leave];
  const again = button('Pošalji nov zahtev', run, 'lektor-sends');
  again.title = sendTooltip(corrections.preset);
  again.append(choiceMark());
  const showKept = button('Pogledaj ispravke', () => {
    corrections.isReviewKept = true;
    corrections.view = 'review';
    draw();
  }, 'keep');
  return [showKept, again, leave];
}

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
  return framed(header('Tvoj tekst se ne menja dok je ovaj prozor otvoren.'), panes, footer(choosingButtons(), footNote));
}

/**
 * A stand-in for the app's review. New: under the kind and the Lektor, the model that wrote it and,
 * on paid, what it cost, as OpenRouter's reply stated it: known only now, after the run.
 */
function reviewPanel(): HTMLElement {
  const kept = corrections.kept[corrections.preset];
  const by = kept?.by ?? state.choice;
  const cost = kept?.cost == null ? 'besplatno' : `koštalo ${dollars(kept.cost)}`;
  const ran = el('div', 'lektor-review-ran');
  const line = el('p', 'lektor-service-line');
  line.append(el('span', 'lektor-review-kind', PRESET_NAMES[corrections.preset]), ' · ', choiceMark(by), el('span', '', `${lektorName(by)} · ${kept?.at ?? 'upravo sad'}`));
  ran.append(line, el('p', 'lektor-where', `Model: ${MODELS[by][corrections.preset]} · ${cost}`));
  const stand = el('div', 'review-text review-text-empty');
  stand.textContent = '(Ovde je pregled ispravki, kao sada.)';
  const body = el('div', 'review-body lektor-body');
  body.append(ran, stand);
  const panes = el('div', 'review-panes');
  panes.append(body);
  const back = button('Nazad na izbor', () => {
    corrections.view = 'choosing';
    draw();
  });
  const buttons = [button('Unesi sve izmene u tekst', close, 'keep'), back, button('Zatvori', close)];
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
  const panel = corrections.view === 'review' ? reviewPanel() : choosingPanel();
  const dialog = element('lektor-dialog', HTMLDialogElement);
  if (shown === null) shown = showAsModal(dialog, panel, close);
  else dialog.replaceChildren(panel);
}

/** Opens the window on choosing, as the app would from the panel's "Pređi na ispravke". */
export function openCorrectionsWindow(onChoose: (choice: Choice) => void): void {
  chooseInPanel = onChoose;
  corrections.view = 'choosing';
  corrections.failure = null;
  draw();
}
