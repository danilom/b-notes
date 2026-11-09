/*
  The corrections, all in one modal window: choosing the kind, waiting, a failure and its way on,
  and the review. Opened from the panel's "Pređi na ispravke". From the moment he opens it his
  text is held still, which is what thinking of corrections means anyway: the line between the
  panel and the window falls where the text stops being his to change, not midway through.

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
  balanceLine,
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
import { keys } from './lektor-keys-prototype.ts';

type View = 'choosing' | 'waiting' | 'failed' | 'review';
type Failure = 'busy' | 'no-credit';

interface Kept {
  by: Choice;
  at: string;
}

interface WindowState {
  view: View;
  preset: Preset;
  note: string;
  failure: Failure | null;
  /** Corrections kept per kind, each from the Lektor that made it. */
  kept: Partial<Record<Preset, Kept>>;
  /** Whether the review open is a kept one rather than just made. */
  isReviewKept: boolean;
}

export const corrections: WindowState = { view: 'choosing', preset: 'letters', note: '', failure: null, kept: {}, isReviewKept: false };

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

/** Free or paid, as in the panel: greyed without a key, the balance under it, locked while it works. */
function lektorOption(choice: Choice, isLocked: boolean): HTMLElement {
  const option = radio('lektor-window-level', lektorName(choice), state.choice === choice, () => {
    chooseInPanel(choice);
    corrections.failure = null;
    corrections.view = 'choosing';
    draw();
  }, choice);
  const hasKey = keys.saved[choice];
  if (!hasKey) {
    option.classList.add('lektor-preset-unavailable');
    option.title = 'Nije unet API ključ.';
  }
  const input = option.querySelector('input');
  if (input !== null) input.disabled = isLocked || !hasKey;
  return option;
}

function lektorChoice(isLocked: boolean): HTMLElement[] {
  const row = el('div', 'lektor-choice-row');
  row.append(lektorOption('free', isLocked), lektorOption('paid', isLocked));
  return [el('p', 'lektor-heading', 'AI Lektor:'), row, ...balanceLine()];
}

/** A kind, with "sačuvano" after it where corrections of it are kept, so trying another loses nothing. */
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
  if (kept !== undefined) {
    const badge = el('span', 'lektor-kept-badge');
    badge.append(choiceMark(kept.by), document.createTextNode('sačuvano'));
    badge.title = `${lektorName(kept.by)}, ${kept.at}`;
    option.append(badge);
  }
  return option;
}

function noteField(isLocked: boolean): HTMLElement[] {
  const label = el('label', 'lektor-label', 'Tvoja dodatna uputstva ');
  label.append(el('span', 'lektor-label-aside', '(nije obavezno)'));
  const box = el('textarea', 'lektor-note');
  box.rows = 2;
  box.placeholder = 'Example: simplify overly long sentences';
  box.value = corrections.note;
  box.disabled = isLocked;
  box.addEventListener('input', () => {
    corrections.note = box.value;
  });
  return [label, box];
}

function waitingBlock(): HTMLElement {
  const clock = el('p', 'lektor-wait-clock', 'Radi već 0 s');
  const started = Date.now();
  const tick = (): void => {
    clock.textContent = `Radi već ${Math.floor((Date.now() - started) / 1000)} s`;
    timers.push(window.setTimeout(tick, 1000));
  };
  timers.push(window.setTimeout(tick, 1000));
  const fellBack = state.choice === 'free' && state.isFreeBusy ? [el('p', 'lektor-fallback', 'Gugl je bio zauzet, pa ovo radi njegov brži model.')] : [];
  const waiting = el('div', 'lektor-waiting');
  waiting.append(
    el('p', 'lektor-reading', 'Ispravlja tekst…'),
    clock,
    ...fellBack,
    el('p', 'lektor-wait-note', state.choice === 'free' ? 'Obično traje oko minut.' : 'Može da potraje nekoliko minuta.'),
  );
  return waiting;
}

function failureBlock(): HTMLElement {
  if (corrections.failure === 'no-credit') {
    return problem('Plaćeni iznos je potrošen.', 'Možeš da pošalješ besplatnom, ili neka se uplati još. Tvoj izbor i uputstva su ostali.');
  }
  return problem('AI Lektor sada ne radi. Probaj kasnije.', 'Gugl je zauzet. Za slova i gramatiku bi uzeo svoj brži model, ali za stil i dubinsku preradu on nije dovoljno dobar.');
}

/** The left column: who, what kind, the instruction, his note, and what is happening now. */
function choicesColumn(): HTMLElement {
  const isLocked = corrections.view === 'waiting';
  const column = el('div', 'lektor-window-side');
  const status = corrections.view === 'waiting' ? [waitingBlock()] : corrections.view === 'failed' ? [failureBlock()] : [];
  column.append(
    ...lektorChoice(isLocked),
    el('p', 'lektor-heading', 'Izaberi vrstu ispravke:'),
    ...PRESETS.map((preset) => kindOption(preset, isLocked)),
    el('p', 'lektor-prompt-label', 'Uputstvo za AI Lektora:'),
    el('p', 'lektor-prompt', PRESET_PROMPTS[corrections.preset]),
    ...noteField(isLocked),
    ...status,
  );
  return column;
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
      corrections.kept[corrections.preset] = { by: state.choice, at: 'upravo sad' };
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

/** The buttons for choosing: show what is kept, or send; and the way out. */
function choosingButtons(): HTMLButtonElement[] {
  const kept = corrections.kept[corrections.preset];
  const leave = button('Zatvori', close);
  if (corrections.view === 'waiting') return [button('Prekini', () => {
    stopTimers();
    corrections.view = 'choosing';
    draw();
  })];
  if (corrections.view === 'failed') {
    const onward = corrections.failure === 'no-credit' ? freeSendButton() : button('Pokušaj ponovo', run, 'keep');
    return [onward, leave];
  }
  if (kept === undefined) return [sendButton('Pošalji zahtev za ispravke', corrections.preset, run, 'keep'), leave];
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

function freeSendButton(): HTMLButtonElement {
  const made = button('Pošalji besplatnom', sendFree, 'keep lektor-sends');
  made.append(choiceMark('free'), icon('move-out'));
  return made;
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
  panes.append(choicesColumn());
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
  const cost = by === 'free' ? 'besplatno' : `koštalo ${dollars(FALLS_BACK.has(corrections.preset) ? 0.09 : 0.52)}`;
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
