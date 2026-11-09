/*
  The Lektor's panel as it could be once paid goes through OpenRouter: the free or paid choice,
  with the balance, on the first step, then the comment, and from there "Pređi na ispravke" into
  the window where all of the corrections happen (lektor-corrections-window-prototype.ts).

  The panel is for reading about his text, the window for changing it. The switches above set
  each case; the panel's own controls work as they would in the app. Drawn with the app's own
  classes and icons, piece for piece as lektor-sidebar.ts builds its screens.
*/
import { icon } from '../src/ui/icons.ts';
import { corrections, openCorrectionsWindow, redrawWindowIfOpen } from './lektor-corrections-window-prototype.ts';
import { type KeyCheck, keys, keysScreen } from './lektor-keys-prototype.ts';
import { lektorChoice } from './lektor-choice-radios.ts';
import { type Choice, TEXT_PARAGRAPHS, button, el, element, recipient, sendButton, serviceLine, state } from './lektor-prototype-pieces.ts';

type Screen = 'start' | 'response' | 'keys';

/** Said once on the first step after a key was saved and works, as the app does. */
let isKeyJustSaved = false;

let screen: Screen = 'start';

function choose(choice: 'free' | 'paid'): void {
  state.choice = choice;
  render();
}

function openKeys(): void {
  screen = 'keys';
  render();
}

/** One key is enough: on a choice without one he moves to the other, as the app does. */
function settleOnChoiceWithKey(): void {
  const other = state.choice === 'free' ? 'paid' : 'free';
  if (!keys.saved[state.choice] && keys.saved[other]) state.choice = other;
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

/**
 * What a step shows: what scrolls, and the main button, which stays in a strip at the panel's foot.
 * New: in the app the button comes right after the content, so a long comment pushed it out of
 * sight and he had to scroll to find the way on. Here it is always in the same place, in view.
 */
interface Step {
  content: HTMLElement[];
  main: HTMLButtonElement;
  /** A step back, at the strip's left, where there is one: the keys screen's Nazad. */
  back?: HTMLButtonElement;
}

function startScreen(): Step {
  const send = sendButton(`Pošalji ceo tekst ${state.choice === 'free' ? 'Guglu' : 'OpenRouteru'}`, 'comment', () => {
    screen = 'response';
    commentBy = state.choice;
    isAboutAiOpen = false;
    render();
  }, 'status-action lektor-main-action');
  const saved = isKeyJustSaved ? [el('p', 'lektor-key-saved', 'API ključ radi i sačuvan je.')] : [];
  isKeyJustSaved = false;
  return {
    content: [
      ...saved,
      el('p', 'lektor-line', 'AI Lektor čita tvoj tekst, kaže šta misli i, ako želiš, predlaže ispravke.'),
      ...lektorChoice({ group: 'lektor-level', choose, openKeys }),
      // Small: it explains the choice, it isn't what he came for.
      el('p', 'lektor-where', 'Za slova, zareze i gramatiku oba su ista. Plaćeni je bolji za stil i dubinsku preradu, a radi i kad besplatni ne može.'),
      // Last above the strip, so it is next to the button it is about.
      privacyWarning(),
    ],
    main: send,
  };
}

/** Made up, as the app's comment would read on the made-up text: three short paragraphs, to him, in his dialect. */
const COMMENT = [
  'Ostala mi je ona rečenica djeda Marka: „Vidi kako se bonaca smirila, a juče je jugo lomilo grane.” U njoj je cijela promjena vremena, a nijesi je morao opisivati: on je samo kaže, i čitalac vidi i jučerašnji vjetar i današnju tišinu. Tu tekst najbolje radi, kad prepusti riječ čovjeku koga opisuje.',
  'Zastao sam kod „Dugo smo ćutali; ponekad je tišina bolja od priče.” Prva polovina je dovoljna. Druga objašnjava ono što je prizor već pokazao, i malo ga razvodnjava. Poželio sam i nešto više o pripovjedaču: ko je on djedu, i zašto ostaje na obali kad djed ode.',
  'U cjelini, ovo je miran, tačan zapis jednog jutra, sa dobrim osjećajem za mjesto i za ljude koji u njemu žive. Kraj, sa vodom koja mijenja boju, lijepo zaokružuje ono što je počelo mirisom soli i kafe.',
].join('\n\n');

/** Who wrote the comment shown. */
let commentBy: Choice = state.choice;

/** Whether "AI može da pogreši" is opened to say what that means, as in the app. */
let isAboutAiOpen = false;

/** Whether his text has changed enough since the comment for the app to say so above it. */
let isCommentStale = false;

/** The app's note above an outdated comment, with the way to a new one under it. */
function staleNote(): HTMLElement[] {
  if (!isCommentStale) return [];
  const note = el('p', 'lektor-stale');
  note.append(icon('info'), el('span', '', 'Utisak je napisan pre tvojih poslednjih izmena (oko 120 reči).'));
  return [note];
}

/** "AI može da pogreši", which opens to a few plain sentences on what an AI is; the app's own. */
function aboutAi(): HTMLElement[] {
  const toggle = el('button', 'lektor-fallible');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(isAboutAiOpen));
  toggle.append(el('span', '', 'AI može da pogreši'), icon('info'));
  toggle.addEventListener('click', () => {
    isAboutAiOpen = !isAboutAiOpen;
    render();
  });
  const about =
    'AI je program koji je učio iz ogromne količine tekstova i piše ono što zvuči verovatno. Ne razume tekst kao čovek i nema sopstveno iskustvo. Zato ponekad sa sigurnošću kaže nešto netačno: navod, činjenicu, ime. Ovaj komentar je utisak AI programa, a ne stručna kritika.';
  return isAboutAiOpen ? [toggle, el('p', 'lektor-about-ai', about)] : [toggle];
}

/** The comment as the app draws it: the way to a new one above, the comment with its end mark, and a signature under it. */
function responseScreen(): Step {
  const head = el('div', 'lektor-comment-head');
  const again = el('div', 'lektor-back-row');
  const ask = button('', () => {
    screen = 'start';
    render();
  }, 'lektor-again');
  ask.append(icon('back'), el('span', '', 'Traži novi utisak'));
  again.append(ask);
  head.append(...staleNote(), again);
  const comment = el('div', 'lektor-response', COMMENT);
  comment.append(el('span', 'lektor-response-end'));
  // Signed by who wrote it, which stays so when the Lektor is changed afterwards, here or in the window.
  const signed = serviceLine(commentBy);
  signed.append(el('span', 'lektor-comment-when', ' · upravo sad'));
  const signature = el('div', 'lektor-comment-notes');
  signature.append(signed, ...aboutAi());
  // No arrow: like every button in the app that opens a window. The ellipsis is Windows' own sign, as on
  // "Print…", that a window will ask more before anything happens: the window is a step, not a send.
  const toCorrections = button('Pređi na ispravke…', () => openCorrectionsWindow(choose), 'status-action lektor-main-action');
  return { content: [head, comment, signature], main: toCorrections };
}

const TITLES: Readonly<Record<Screen, string>> = { start: 'AI Lektor: slanje teksta', response: 'AI utisak', keys: 'AI Lektor: podešavanje' };

function backToStart(): void {
  screen = 'start';
  render();
}

function savedAndBack(): void {
  isKeyJustSaved = true;
  backToStart();
}

function screenNow(): Step {
  if (screen === 'keys') return keysScreen(render, backToStart, savedAndBack);
  return screen === 'start' ? startScreen() : responseScreen();
}

function render(): void {
  settleOnChoiceWithKey();
  const side = element('lektor-side', HTMLElement);
  const close = button('Zatvori', () => undefined, 'lektor-side-close');
  close.append(icon('fold-down'));
  const title = el('div', 'lektor-side-title');
  title.append(icon('lektor'), el('span', '', TITLES[screen]), close);
  const { content, main, back } = screenNow();
  const body = el('div', 'lektor-side-body');
  body.append(...content);
  const buttons = el('div', 'lektor-side-buttons');
  buttons.append(...(back === undefined ? [] : [back]), main);
  const dock = el('div', 'lektor-side-dock');
  dock.append(buttons);
  side.replaceChildren(title, body, dock);
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
      { value: 'response', label: '2. AI utisak (pa Pređi na ispravke)' },
      { value: 'keys', label: 'API ključevi' },
    ],
    value: 'start',
  },
  { id: 'stale', label: 'Tekst promenjen posle utiska', value: false },
  { id: 'free-key', label: 'Ključ za besplatni sačuvan', value: true },
  { id: 'paid-key', label: 'Ključ za plaćeni sačuvan', value: true },
  {
    id: 'key-check',
    label: 'Provera zalepljenog ključa',
    options: [
      { value: 'works', label: 'radi' },
      { value: 'refused', label: 'ne radi' },
      { value: 'offline', label: 'nema interneta' },
    ],
    value: 'works',
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
  { id: 'letters-kept', label: 'Slova i zarezi spremni (od juče)', value: false },
  { id: 'busy', label: 'Besplatni je zauzet', value: false },
  { id: 'money-out', label: 'Plaćeni nema novca', value: false },
  { id: 'dark', label: 'Tamna pozadina', value: false },
];

function setControl(id: string, value: string | boolean): void {
  if (id === 'screen') screen = value === 'response' || value === 'keys' ? value : 'start';
  if (id === 'stale') isCommentStale = value === true;
  if (id === 'free-key') keys.saved.free = value === true;
  if (id === 'paid-key') keys.saved.paid = value === true;
  if (id === 'key-check') keys.check = value === 'refused' || value === 'offline' ? value : ('works' satisfies KeyCheck);
  if (id === 'balance') state.balance = value === 'unknown' ? null : Number(value);
  if (id === 'busy') state.isFreeBusy = value === true;
  if (id === 'money-out') state.isMoneyOut = value === true;
  if (id === 'letters-kept' && value === true) corrections.kept.letters = { by: 'paid', at: 'juče u 18:40', cost: 0.09 };
  if (id === 'letters-kept' && value !== true) delete corrections.kept.letters;
  // The app's own switch, as the diff prototype sets it.
  if (id === 'dark') document.documentElement.dataset['mode'] = value === true ? 'dark' : 'light';
  render();
  redrawWindowIfOpen();
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
