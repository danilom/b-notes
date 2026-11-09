/*
  The Lektor's panel as it could be once paid goes through OpenRouter: the free or paid choice,
  with the balance, on the first step, then the comment, and from there "Pređi na ispravke" into
  the window where all of the corrections happen (lektor-corrections-window-prototype.ts).

  The panel is for reading about his text, the window for changing it. The switches above set
  each case; the panel's own controls work as they would in the app. Drawn with the app's own
  classes and icons, piece for piece as lektor-sidebar.ts builds its screens.
*/
import { icon } from '../src/ui/icons.ts';
import { corrections, openCorrectionsWindow } from './lektor-corrections-window-prototype.ts';
import { TEXT_PARAGRAPHS, button, dollars, el, element, radio, recipient, sendButton, serviceLine, state } from './lektor-prototype-pieces.ts';

type Screen = 'start' | 'response';

/**
 * Under this the balance line says "malo" and turns red: the only warning about money. No cost is
 * estimated in advance: it is mostly the model's thinking, which varies, at prices that can change,
 * so a warning built on a guess would cry wolf or stay quiet. Nothing is blocked either: if the
 * money runs out, OpenRouter refuses and the window says so, with the way to the free one.
 */
const LOW_BALANCE_USD = 1;

let screen: Screen = 'start';

function choose(choice: 'free' | 'paid'): void {
  state.choice = choice;
  render();
}

/**
 * Nothing when the balance can't be read: that is OpenRouter's balance lookup failing for a
 * moment while sending still works, and "unknown" would read as trouble with his money.
 */
function balanceLine(): HTMLElement[] {
  if (state.balance === null) return [];
  if (state.balance >= LOW_BALANCE_USD) return [el('p', 'lektor-balance', `Na računu: ${dollars(state.balance)}`)];
  return [el('p', 'lektor-balance lektor-balance-low', `Na računu: ${dollars(state.balance)} (malo)`)];
}

/** The two choices, and beside them on Besplatni's line the way to the keys, which decide which he can choose. */
function choicesWithKeys(): HTMLElement {
  const options = el('div', 'lektor-choice-options');
  options.append(
    radio('lektor-level', 'Besplatni', state.choice === 'free', () => choose('free'), 'free'),
    radio('lektor-level', 'Plaćeni', state.choice === 'paid', () => choose('paid'), 'paid'),
  );
  const row = el('div', 'lektor-choice-with-keys');
  row.append(options, button('API ključevi', () => undefined, 'lektor-again'));
  return row;
}

function privacyWarning(): HTMLElement {
  const heading = el('p', 'lektor-warning-heading');
  heading.append(icon('privacy'), document.createTextNode('Upozorenje o privatnosti'));
  const warning = el('div', 'lektor-warning');
  warning.setAttribute('role', 'note');
  const words = TEXT_PARAGRAPHS.join(' ').split(/\s+/).length;
  warning.append(
    heading,
    el('p', 'lektor-line', `Ceo tekst (${words} reči) se šalje ${recipient()}. Ne objavljuje se javno, ali je moguće da ga neko vidi.`),
    el('p', 'lektor-line', 'Ne šalji ništa što ne bi pokazao drugima: lične misli, tajne, lozinke i slično.'),
  );
  return warning;
}

function footer(lines: HTMLElement[], main: HTMLButtonElement): HTMLElement {
  const buttons = el('div', 'lektor-side-buttons');
  buttons.append(main);
  const made = el('div', 'lektor-side-foot');
  made.append(...lines, buttons);
  return made;
}

function startScreen(): HTMLElement[] {
  const send = sendButton(`Pošalji ceo tekst ${state.choice === 'free' ? 'Guglu' : 'OpenRouteru'}`, 'comment', () => {
    screen = 'response';
    render();
  }, 'status-action lektor-main-action');
  return [
    el('p', 'lektor-line', 'AI Lektor čita tvoj tekst, kaže šta misli i, ako želiš, predlaže ispravke.'),
    el('p', 'lektor-heading', 'Izaberi AI Lektora:'),
    choicesWithKeys(),
    ...balanceLine(),
    // Small: it explains the choice, it isn't what he came for.
    el('p', 'lektor-where', 'Za slova, zareze i gramatiku oba su ista. Plaćeni je bolji za stil i dubinsku preradu, a radi i kad besplatni ne može.'),
    footer([privacyWarning()], send),
  ];
}

/** The comment, as a stand-in, and the way on into the window. No arrow: like every button in the app that opens a window. */
function responseScreen(): HTMLElement[] {
  const again = el('div', 'lektor-back-row');
  const ask = button('', () => {
    screen = 'start';
    render();
  }, 'lektor-again');
  ask.append(icon('back'), el('span', '', 'Traži novi utisak'));
  again.append(ask);
  const comment = el('div', 'lektor-response');
  comment.append(el('p', '', '(Ovde je AI utisak, kao sada.)'));
  const toCorrections = button('Pređi na ispravke', () => openCorrectionsWindow(() => choose('free')), 'status-action lektor-main-action');
  return [again, comment, serviceLine(' · upravo sad'), footer([], toCorrections)];
}

const TITLES: Readonly<Record<Screen, string>> = { start: 'AI Lektor: slanje teksta', response: 'AI utisak' };

function render(): void {
  const side = element('lektor-side', HTMLElement);
  const close = button('Zatvori', () => undefined, 'lektor-side-close');
  close.append(icon('fold-down'));
  const title = el('div', 'lektor-side-title');
  title.append(icon('lektor'), el('span', '', TITLES[screen]), close);
  const body = el('div', 'lektor-side-body');
  body.append(...(screen === 'start' ? startScreen() : responseScreen()));
  side.replaceChildren(title, body);
}

/*
  The switches, for the harness to draw outside the screen: /his-screens?page=lektor-choice-prototype
  reads prototypeControls from this page once it has loaded, draws them in its column beside the
  screen, and calls prototypeSet when one changes. Kept out of the page, so the page is only what
  he would see, at his window's size.
*/

interface PrototypeControl {
  id: string;
  label: string;
  /** A list of choices, or one box to tick. */
  options?: readonly { value: string; label: string }[];
  value: string | boolean;
}

const CONTROLS: readonly PrototypeControl[] = [
  {
    id: 'screen',
    label: 'Panel',
    options: [
      { value: 'start', label: '1. Slanje teksta' },
      { value: 'response', label: '2. Utisak (pa Pređi na ispravke)' },
    ],
    value: 'start',
  },
  {
    id: 'balance',
    label: 'Stanje računa',
    options: [
      { value: '7.47', label: '7,47 $' },
      { value: '0.9', label: '0,90 $ (ispod 1 $: malo)' },
      { value: 'unknown', label: 'ne može da se pročita' },
    ],
    value: '7.47',
  },
  { id: 'letters-kept', label: 'Slova i zarezi već sačuvani', value: false },
  { id: 'busy', label: 'Besplatni je zauzet', value: false },
  { id: 'money-out', label: 'Plaćeni nema novca', value: false },
  { id: 'dark', label: 'Tamna pozadina', value: false },
];

function setControl(id: string, value: string | boolean): void {
  if (id === 'screen') screen = value === 'response' ? 'response' : 'start';
  if (id === 'balance') state.balance = value === 'unknown' ? null : Number(value);
  if (id === 'busy') state.isFreeBusy = value === true;
  if (id === 'money-out') state.isMoneyOut = value === true;
  if (id === 'letters-kept' && value === true) corrections.kept.letters = { by: 'free', at: 'juče u 18:40' };
  if (id === 'letters-kept' && value !== true) delete corrections.kept.letters;
  // The app's own switch, as the diff prototype sets it.
  if (id === 'dark') document.documentElement.dataset['mode'] = value === true ? 'dark' : 'light';
  render();
}

declare global {
  interface Window {
    prototypeControls?: readonly PrototypeControl[];
    prototypeSet?: (id: string, value: string | boolean) => void;
  }
}

window.prototypeControls = CONTROLS;
window.prototypeSet = setControl;

element('prototype-text', HTMLElement).append(el('p', '', 'Probni tekst'), ...TEXT_PARAGRAPHS.map((paragraph) => el('p', '', paragraph)));
render();
