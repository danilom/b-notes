/*
  The Lektor's panel as it could be once paid goes through OpenRouter: the free or paid choice,
  with the balance, on the first step, then the comment, and from there "Pređi na ispravke" into
  the window where all of the corrections happen (lektor-corrections-window-prototype.ts).

  The panel is for reading about his text, the window for changing it. The switches above set
  each case; the panel's own controls work as they would in the app. Drawn with the app's own
  classes and icons, piece for piece as lektor-sidebar.ts builds its screens.
*/
import { icon } from '../src/ui/icons.ts';
import { type WindowCase, corrections, openCorrectionsWindow, openCorrectionsWindowAt, redrawWindowIfOpen } from './lektor-corrections-window-prototype.ts';
import { type KeyCheck, keys, keysScreen } from './lektor-keys-prototype.ts';
import { lektorChoice } from './lektor-choice-radios.ts';
import { commentFailure, commentShortcut, commentWaiting, startCommentRun, stopCommentRun } from './lektor-comment-run-prototype.ts';
import { ISPRAVKE_PICTURES, UTISAK_PICTURES, drawPicture } from './lektor-menu-icons-prototype.ts';
import { type Choice, type GoogleDay, TEXT_PARAGRAPHS, TEXT_TITLE, button, dollars, el, element, sendButton, serviceLine, spend, state } from './lektor-prototype-pieces.ts';

/** The menu, then the utisak's own step ('start': who writes it), its wait or failure, the utisak; and the keys. */
type Screen = 'menu' | 'start' | 'waiting' | 'failed' | 'response' | 'keys';

/** Said once on the menu after a key was saved and works, as the app does. */
let isKeyJustSaved = false;

let screen: Screen = 'menu';

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
  // Both named, as on the menu nothing yet says which; but not which Lektor is which (Danilo,
  // 2026-11-10): too early for that, and the warning's point is only that the text leaves his hands.
  warning.append(
    heading,
    el('p', 'lektor-line', `Ceo tekst (${words} reči) se šalje Guglu ili firmi OpenRouter. Ne objavljuje se javno, ali je moguće da ga neko vidi.`),
    el('p', 'lektor-line', 'Ne šalji ništa što ne bi pokazao drugima: lične misli, tajne, lozinke i slično.'),
  );
  return warning;
}

function privacyFoot(): HTMLElement {
  const foot = el('div', 'lektor-side-foot');
  foot.append(privacyWarning());
  return foot;
}

/**
 * What a step shows: what scrolls, and the main button, which stays in a strip at the panel's foot.
 * New: in the app the button comes right after the content, so a long comment pushed it out of
 * sight and he had to scroll to find the way on. Here it is always in the same place, in view.
 */
interface Step {
  content: HTMLElement[];
  /** The way on, at the strip's right; none on the menu, whose two choices are its ways on. */
  main?: HTMLButtonElement;
  /** A step back, at the strip's left, where there is one. */
  back?: HTMLButtonElement;
}

/*
  The menu's two pictures (Danilo, 2026-11-10), chosen on the pictures page (lektor-menu-pictures),
  in full colour: a bit playful, the AI as someone with a character. The corrections' one again on
  "Pređi na ispravke…" ties the two together.
*/
function utisakIcon(className: string): SVGSVGElement[] {
  return [drawPicture(UTISAK_PICTURES['owl-fluffy'], className)];
}

function ispravkeIcon(className: string): SVGSVGElement[] {
  return [drawPicture(ISPRAVKE_PICTURES['page-z-caron'], className)];
}

/** One of the menu's two choices: a big target, its name and a sentence on what it does, and its icon if on. */
function menuOption(name: string, does: string, onPick: () => void, icon: SVGSVGElement[]): HTMLButtonElement {
  const option = button('', onPick, 'lektor-menu-option');
  option.append(...icon, el('span', 'lektor-menu-name', name), el('span', 'lektor-menu-does', does));
  return option;
}

/**
 * The first step (Danilo, 2026-11-10): what he wants before who does it, as the window asks the kind
 * before the Lektor. Nothing to set here, so nothing can be set wrongly before he knows what for. The
 * privacy warning is here, before either, since both send the whole text; and the keys, since the
 * corrections have no other way to them.
 */
function menuScreen(): Step {
  const saved = isKeyJustSaved ? [el('p', 'lektor-key-saved', 'API ključ radi i sačuvan je.')] : [];
  isKeyJustSaved = false;
  const heading = el('p', 'lektor-heading', 'Šta želiš?');
  // At the very bottom, quiet (Danilo, 2026-11-10): a step the panel needs, but set up once, and
  // after everything he does need; beside the warning, as the keys decide who the text goes to.
  // Made as "AI može da pogreši" is (Danilo, 2026-11-10): the app's one small link-like button, its words in a span for the dotted line.
  const keysButton = button('', openKeys, 'lektor-fallible');
  keysButton.append(el('span', '', 'API ključevi'));
  const keysLink = el('div', 'lektor-menu-keys');
  keysLink.append(keysButton);
  const options = el('div', 'lektor-menu');
  options.append(
    menuOption('Utisak o tekstu', 'Kratak osvrt na tekst, kao od pažljivog čitaoca.', () => {
      // A new start of the step, so Besplatni again: nothing is chosen for him from how he left it.
      state.choice = 'free';
      screen = 'start';
      render();
    }, utisakIcon('lektor-menu-icon')),
    // No "Ti biraš šta ulazi u tekst" (Danilo, 2026-11-10): "predlozi" says it, and the window says it by its send button.
    menuOption('Ispravke', 'Predlozi ispravki, od zareza do stila.', () => openCorrectionsWindow(), ispravkeIcon('lektor-menu-icon')),
  );
  return {
    content: [...saved, el('p', 'lektor-line', 'AI Lektor čita tvoj tekst, kaže šta misli i predlaže ispravke.'), heading, options, privacyFoot(), keysLink],
  };
}

/** Step 2, the utisak's own: who writes it, and sending it; "← Nazad" to the menu. */
function startScreen(): Step {
  const send = sendButton(`Pošalji ceo tekst ${state.choice === 'free' ? 'Guglu' : 'OpenRouteru'}`, 'comment', () => askForComment(state.choice), 'status-action lektor-main-action');
  return {
    content: [
      ...lektorChoice({ group: 'lektor-level', choose }),
      // What paying gives for the comment, as measured (2026-11-09): a draw blind (Opus 3, Flash 2), but
      // about 18 s against 3–5 minutes. So speed, not quality. The corrections choose their own Lektor in the window.
      el('p', 'lektor-where', 'Oba pišu utisak sličnog kvaliteta; plaćeni je mnogo brži.'),
    ],
    main: send,
    back: backButton('Nazad', toMenu),
  };
}

function toMenu(): void {
  screen = 'menu';
  render();
}

/** Made up, as the app's comment would read on the made-up text: three short paragraphs, to him, in his dialect. */
const COMMENT = [
  'Ostala mi je ona rečenica djeda Marka: „Vidi kako se bonaca smirila, a juče je jugo lomilo grane.” U njoj je cijela promjena vremena, a nijesi je morao opisivati: on je samo kaže, i čitalac vidi i jučerašnji vjetar i današnju tišinu. Tu tekst najbolje radi, kad prepusti riječ čovjeku koga opisuje.',
  'Zastao sam kod „Dugo smo ćutali; ponekad je tišina bolja od priče.” Prva polovina je dovoljna. Druga objašnjava ono što je prizor već pokazao, i malo ga razvodnjava. Poželio sam i nešto više o pripovjedaču: ko je on djedu, i zašto ostaje na obali kad djed ode.',
  'U cjelini, ovo je miran, tačan zapis jednog jutra, sa dobrim osjećajem za mjesto i za ljude koji u njemu žive. Kraj, sa vodom koja mijenja boju, lijepo zaokružuje ono što je počelo mirisom soli i kafe.',
].join('\n\n');

/** Who wrote the comment shown. */
let commentBy: Choice = state.choice;

/** What a paid comment costs here: Opus wrote five for $0.25 in the measurement (2026-11-09). */
const COMMENT_COST_USD = 0.05;

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
    // Opened at the panel's foot, the words fell below its edge and he saw nothing happen: brought
    // into view, gently unless Windows is set to spare him animation.
    if (!isAboutAiOpen) return;
    const isStill = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('.lektor-about-ai')?.scrollIntoView({ block: 'nearest', behavior: isStill ? 'auto' : 'smooth' });
  });
  const about =
    'AI je program koji je učio iz ogromne količine tekstova i piše ono što zvuči verovatno. Ne razume tekst kao čovek i nema sopstveno iskustvo. Zato ponekad sa sigurnošću kaže nešto netačno: navod, činjenicu, ime. Ovaj komentar je utisak AI programa, a ne stručna kritika.';
  return isAboutAiOpen ? [toggle, el('p', 'lektor-about-ai', about)] : [toggle];
}

/**
 * The text's title as he gave it, for the comment's opening line; a His screens switch sets an odd one,
 * since his titles are whatever he typed or pasted (see the memory on hostile names).
 */
let commentTextTitle = TEXT_TITLE;

/** Past this, the name is cut at a word: a pasted paragraph as a title would otherwise bury the comment. */
const LONGEST_NAME_IN_HEADING = 60;

/** Quote marks he may have put round his own title, which the heading's own „…” would double. */
const OUTER_QUOTES = /^["'„“”«»‚‘’]+|["'„“”«»‚‘’]+$/g;

/**
 * His title made fit to quote in one line: control characters and runs of spaces, tabs or line breaks
 * become one space, the ends are trimmed, his own outer quotes come off, and a long one is cut at a
 * word with "…". Null when nothing is left, so the line can say "bez naslova" in words.
 */
export function nameForHeading(title: string): string | null {
  // \p{Cc} rather than spelling out the ranges: a pasted tab, line break or stray control character alike.
  const flat = title.replace(/[\p{Cc}\s]+/gu, ' ').trim().replace(OUTER_QUOTES, '').trim();
  if (flat === '') return null;
  if (flat.length <= LONGEST_NAME_IN_HEADING) return flat;
  const cut = flat.slice(0, LONGEST_NAME_IN_HEADING);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > LONGEST_NAME_IN_HEADING / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * What the comment is and what about, before its first word, so it doesn't start mid-thought; and it
 * travels with the comment when he copies it out. Its first paragraph, in its font (Danilo, 2026-11-10):
 * context, not a heading or a piece of the panel, which in the panel's own type it looked like.
 */
function commentOpening(): string {
  return `Utisak AI Lektora o tekstu ${textInWords()}:`;
}

/** The request's text named for a sentence: quoted, or "bez naslova" in words. */
function textInWords(): string {
  const name = nameForHeading(textTitleOf(requestSlot));
  return name === null ? 'bez naslova' : `„${name}”`;
}

/**
 * The comment as the app draws it: the comment with its end mark, a signature under it, and in the
 * strip "← Traži novi utisak" where the other steps have "← Nazad": the same place and arrow, but
 * words that say this one is replaced, since there is no coming forward to it again.
 */
function responseScreen(): Step {
  const ask = backButton('Traži novi utisak', () => {
    screen = 'start';
    // A new start of the step, so Besplatni again, whatever wrote the comment: nothing is chosen for him from how he left it.
    state.choice = 'free';
    render();
  });
  const head = el('div', 'lektor-comment-head');
  head.append(...staleNote());
  const comment = el('div', 'lektor-response', `${commentOpening()}\n\n${COMMENT}`);
  comment.append(el('span', 'lektor-response-end'));
  // Signed by who wrote it, which stays so when the Lektor is changed afterwards, here or in the window.
  const signed = serviceLine(commentBy);
  // A paid one's cost after when, as the corrections' cards have it: a fact once spent.
  const cost = commentBy === 'paid' ? ` · ${dollars(COMMENT_COST_USD)}` : '';
  signed.append(el('span', 'lektor-comment-when', ` · upravo sad${cost}`));
  const signature = el('div', 'lektor-comment-notes');
  signature.append(signed, ...aboutAi());
  // No arrow: like every button in the app that opens a window. The ellipsis is Windows' own sign, as on
  // "Print…", that a window will ask more before anything happens: the window is a step, not a send.
  const toCorrections = button('Pređi na ispravke…', () => openCorrectionsWindow(), 'status-action lektor-main-action');
  // The menu's corrections mark before the words, where the icons are on: the same way in, the same shape.
  toCorrections.prepend(...ispravkeIcon('lektor-to-corrections-icon'));
  return { content: [head, comment, signature], main: toCorrections, back: ask };
}

/*
  Two texts, as the app keeps the Lektor's state for each: the one the made-up utisak is about, and
  any other in the list, which the mockup treats as one. Clicking the list switches between them.
  While a request runs, or its failure or finished utisak waits to be seen, the panel stays with it
  whichever text is open: nothing runs where he can't see it.
*/
type TextSlot = 'own' | 'other';
const OTHER_TEXT = 'Pismo prijatelju';
const textTitleOf = (slot: TextSlot): string => (slot === 'own' ? commentTextTitle : OTHER_TEXT);

let openSlot: TextSlot = 'own';
/** The screen of the text not open, to come back to; the open one's is `screen`. */
const savedScreens: Record<TextSlot, Screen> = { own: 'menu', other: 'menu' };
/** Which text the request running, or last made, is for. */
let requestSlot: TextSlot = 'own';
/** A utisak came back while another text was open, and he hasn't yet opened it or gone back. */
let isReadyElsewhere = false;

const isRequestElsewhere = (): boolean => requestSlot !== openSlot;

/** Sets the screen of the text the request is for, open or not. */
function setRequestScreen(next: Screen): void {
  if (isRequestElsewhere()) savedScreens[requestSlot] = next;
  else screen = next;
}

/** What the panel shows for a request on another text: its wait, its failure, or that it is ready; otherwise nothing. */
function pinnedStep(): Step | null {
  if (!isRequestElsewhere()) return null;
  const its = savedScreens[requestSlot];
  if (its === 'waiting') return waitingScreen();
  if (its === 'failed') return failedScreen();
  return isReadyElsewhere ? elsewhereScreen() : null;
}

/**
 * Sends a text for a comment and waits for it in the panel, as the switches set the day: the open one,
 * or, sent again from a failure shown while another is open, the one that failed.
 */
function askForComment(to: Choice, slot: TextSlot = openSlot): void {
  requestSlot = slot;
  isReadyElsewhere = false;
  setRequestScreen('waiting');
  render();
  startCommentRun(to, {
    done: (by) => {
      setRequestScreen('response');
      commentBy = by;
      if (by === 'paid') spend(COMMENT_COST_USD);
      isAboutAiOpen = false;
      isReadyElsewhere = isRequestElsewhere();
      render();
    },
    failed: () => {
      setRequestScreen('failed');
      render();
    },
  });
}

/** Giving up on the request, or back from its failure: its text to step 2 as he left it, where sending again is the retry. */
function backFromComment(): void {
  stopCommentRun();
  setRequestScreen('start');
  render();
}

/** The mockup's list: another text clicked, as he would; the panel follows it unless a request holds it. */
function openTextInPrototype(title: string): void {
  const next: TextSlot = title === TEXT_TITLE ? 'own' : 'other';
  if (next !== openSlot) {
    savedScreens[openSlot] = screen;
    screen = savedScreens[next];
    openSlot = next;
  }
  if (!isRequestElsewhere()) isReadyElsewhere = false;
  for (const item of document.querySelectorAll('.prototype-list p')) item.classList.toggle('prototype-open', item.textContent === title);
  const shown = next === 'own' ? TEXT_PARAGRAPHS : ['Drugi tekst iz liste, izmišljen za ovaj prototip.'];
  element('prototype-text', HTMLElement).replaceChildren(el('p', '', title), ...shown.map((paragraph) => el('p', '', paragraph)));
  render();
}

/** A way back at the strip's left, made as the keys screen's is: its arrow and its words. */
function backButton(label: string, onBack: () => void): HTMLButtonElement {
  const back = button('', onBack, 'status-action lektor-side-back');
  back.append(icon('back'), el('span', '', label));
  return back;
}

/**
 * The wait: the app's "čita tekst…" with who and which text, and nothing more, his text beside it to
 * look at meanwhile. Giving up where the send button was, not solid blue: it isn't the next step of his work.
 */
function waitingScreen(): Step {
  return { content: [commentWaiting(textInWords())], main: button('Odustani od zahteva', backFromComment, 'status-action') };
}

/**
 * A failure, as in the window: the problem, "← Nazad", and the other Lektor where it can help. Named
 * by its text when another is open, since the panel then speaks of a text not in front of him.
 */
function failedScreen(): Step {
  const which = isRequestElsewhere() ? [el('p', 'lektor-line', `Utisak o tekstu ${textInWords()} nije stigao.`)] : [];
  const content = [...which, commentFailure()];
  // With another text open, back leaves the panel to that text; the failed one is back at step 2 for when he returns.
  const back = backButton('Nazad', backFromComment);
  const shortcut = commentShortcut((to) => askForComment(to, requestSlot));
  return shortcut === null ? { content, back } : { content, main: shortcut, back };
}

/**
 * Done while another text is open: said, and the way to that text, plain; not the utisak itself,
 * which quotes a text he can't see and leads to corrections of the wrong one. Plain, not solid blue
 * (Danilo, 2026-11-10): going to another text isn't the next step of his work. "← Nazad" leaves it
 * kept with its text, to be there when he opens it, as any utisak is.
 */
function elsewhereScreen(): Step {
  const open = button('Otvori tekst i utisak', () => {
    isReadyElsewhere = false;
    openTextInPrototype(TEXT_TITLE);
  }, 'status-action');
  const back = backButton('Nazad', () => {
    isReadyElsewhere = false;
    render();
  });
  return {
    content: [el('p', 'lektor-line', `Utisak o tekstu ${textInWords()} je gotov.`), el('p', 'lektor-where', 'Videćeš ga i kad otvoriš taj tekst.')],
    main: open,
    back,
  };
}

const TITLES: Readonly<Record<Screen, string>> = {
  menu: 'AI Lektor',
  start: 'AI Lektor: utisak',
  waiting: 'AI Lektor: utisak',
  failed: 'AI Lektor: utisak',
  response: 'AI Lektor: utisak',
  keys: 'AI Lektor: podešavanje',
};

function backToStart(): void {
  screen = 'menu';
  render();
}

function savedAndBack(): void {
  isKeyJustSaved = true;
  backToStart();
}

function screenNow(): Step {
  if (screen === 'keys') return keysScreen(render, backToStart, savedAndBack);
  if (screen === 'menu') return menuScreen();
  if (screen === 'waiting') return waitingScreen();
  if (screen === 'failed') return failedScreen();
  return screen === 'start' ? startScreen() : responseScreen();
}

function render(): void {
  settleOnChoiceWithKey();
  const side = element('lektor-side', HTMLElement);
  const close = button('Zatvori', () => undefined, 'lektor-side-close');
  close.append(icon('fold-down'));
  const pinned = pinnedStep();
  const title = el('div', 'lektor-side-title');
  title.append(icon('lektor'), el('span', '', pinned === null ? TITLES[screen] : 'AI Lektor: utisak'), close);
  // Redrawn in place on the same screen (opening "AI može da pogreši"), it keeps where he had scrolled to;
  // a new screen starts at its top.
  const keptScroll = screen === lastDrawnScreen ? (side.querySelector('.lektor-side-body')?.scrollTop ?? 0) : 0;
  lastDrawnScreen = screen;
  const { content, main, back } = pinned ?? screenNow();
  const body = el('div', 'lektor-side-body');
  body.append(...content);
  const buttons = el('div', 'lektor-side-buttons');
  buttons.append(...[back, main].filter((one) => one !== undefined));
  const dock = el('div', 'lektor-side-dock');
  dock.append(buttons);
  side.replaceChildren(title, body, ...(buttons.childElementCount > 0 ? [dock] : []));
  body.scrollTop = keptScroll;
}

let lastDrawnScreen: Screen | null = null;

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
      { value: 'menu', label: '1. Izbor: utisak ili ispravke' },
      { value: 'start', label: '2. Utisak: izbor lektora' },
      { value: 'response', label: '3. AI utisak (pa Pređi na ispravke)' },
      { value: 'window', label: '4. Prozor za ispravke' },
      { value: 'waiting', label: '4a. Prozor: piše (Stilska, plaćeni)' },
      { value: 'queued', label: '4a2. Prozor: u redu kod Gugla (Slova i zarezi)' },
      { value: 'busy', label: '4b. Prozor: Gugl zauzet (Slova i zarezi)' },
      { value: 'no-credit', label: '4c. Prozor: nema novca (Dubinska)' },
      { value: 'offline', label: '4d. Prozor: nema interneta (Slova i zarezi)' },
      { value: 'keys', label: 'API ključevi' },
    ],
    // Where the work is now: the panel's new first step.
    value: 'menu',
  },
  { id: 'stale', label: 'Tekst promenjen posle utiska', value: false },
  {
    id: 'comment-title',
    label: 'Naslov teksta (uvod utiska)',
    options: [
      { value: 'plain', label: 'Probni tekst' },
      { value: 'empty', label: 'prazan' },
      { value: 'spaces', label: 'razmaci, tab i prelom' },
      { value: 'quoted', label: 'sa svojim navodnicima' },
      { value: 'long', label: 'predugačak (nalepljen pasus)' },
      { value: 'control', label: 'sa kontrolnim znakom' },
    ],
    value: 'plain',
  },
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
      { value: '7.47', label: '$7,47' },
      { value: '0.9', label: '$0,90 (ispod $1: malo)' },
      { value: 'unknown', label: 'ne može da se pročita' },
    ],
    value: '7.47',
  },
  {
    id: 'letters-kept',
    label: 'Gotovi predlozi',
    options: [
      { value: 'none', label: 'nema' },
      { value: 'paid', label: 'Slova i zarezi, od plaćenog' },
      { value: 'both', label: 'Slova i zarezi, od oba' },
      { value: 'all', label: 'sve četiri vrste, od oba' },
    ],
    value: 'none',
  },
  {
    id: 'google-38',
    label: 'Gugl, 3.8',
    options: [
      { value: 'ok', label: 'radi' },
      { value: 'slow', label: 'dug red (preko 1 min)' },
      { value: 'busy', label: 'zauzet' },
    ],
    value: 'ok',
  },
  {
    id: 'google-36',
    label: 'Gugl, 3.6',
    options: [
      { value: 'ok', label: 'radi' },
      { value: 'slow', label: 'dug red (preko 1 min)' },
      { value: 'busy', label: 'zauzet' },
    ],
    value: 'ok',
  },
  {
    id: 'pace',
    label: 'Brzina čekanja',
    options: [
      { value: 'double', label: '×2 (da se oseti)' },
      { value: 'quadruple', label: '×4' },
      { value: 'short', label: 'skraćeno' },
      { value: 'real', label: 'stvarno vreme' },
    ],
    value: 'double',
  },
  { id: 'money-out', label: 'Plaćeni nema novca', value: false },
  { id: 'offline', label: 'Nema interneta', value: false },
  { id: 'dark', label: 'Tamna pozadina', value: false },
];

/** Every kind with both Lektors' corrections, of various ages, to see the window at its fullest. */
const ALL_KEPT: typeof corrections.kept = {
  letters: { free: { at: 'pre 10 min', cost: null }, paid: { at: 'juče u 18:40', cost: 0.09 } },
  grammar: { free: { at: 'pre 2 sata', cost: null }, paid: { at: 'juče u 18:52', cost: 0.11 } },
  wording: { free: { at: 'pre 3 dana', cost: null }, paid: { at: 'pre 3 dana', cost: 0.48 } },
  rewrite: { free: { at: 'prošle nedelje', cost: null }, paid: { at: 'prošle nedelje', cost: 0.61 } },
};

/** Ready corrections: none, Slova i zarezi from the paid Lektor or from both, or every kind from both. */
function setKept(value: string | boolean): void {
  if (value === 'all') {
    corrections.kept = structuredClone(ALL_KEPT);
    return;
  }
  corrections.kept = {};
  const letters = structuredClone(ALL_KEPT.letters);
  if (value === 'paid' && letters !== undefined) corrections.kept.letters = { paid: letters.paid };
  if (value === 'both') corrections.kept.letters = letters;
}

const WINDOW_CASES: readonly WindowCase[] = ['waiting', 'queued', 'busy', 'no-credit', 'offline'];

function isWindowCase(value: string | boolean): value is WindowCase {
  return WINDOW_CASES.some((one) => one === value);
}

/**
 * "4. Prozor za ispravke" is the comment step with the window opened on it, as "Pređi na
 * ispravke…" does; 4a–4d open it straight on the wait or a failure.
 */
function setScreen(value: string | boolean): void {
  stopCommentRun();
  // A screen picked here is the open text's, from a clean start: no request pinning the panel.
  requestSlot = openSlot;
  isReadyElsewhere = false;
  const isWindow = value === 'window' || isWindowCase(value);
  const named: Screen = value === 'keys' ? 'keys' : value === 'start' ? 'start' : 'menu';
  screen = value === 'response' || isWindow ? 'response' : named;
  // Opening the first step afresh, as he would: on Besplatni.
  if (value === 'start') state.choice = 'free';
  if (!isWindow) return;
  render();
  if (isWindowCase(value)) openCorrectionsWindowAt(value);
  else openCorrectionsWindow();
}

const googleDayOf = (value: string | boolean): GoogleDay => (value === 'slow' || value === 'busy' ? value : 'ok');

/** Titles he could have, typed or pasted, for the comment's opening line to cope with. */
const ODD_TITLES: Readonly<Record<string, string>> = {
  plain: TEXT_TITLE,
  empty: '   ',
  spaces: '  Jutro\tna   obali\n',
  quoted: '„Jutro na obali”',
  long: 'Ujutru sam sisao do obale, gdje ribari vec slazu mreze, i mirisalo je na so i na kafu iz obliznje kafane',
  control: 'Jutro\u0007 na obali',
};

function setControl(id: string, value: string | boolean): void {
  if (id === 'screen') setScreen(value);
  if (id === 'stale') isCommentStale = value === true;
  if (id === 'comment-title' && typeof value === 'string') commentTextTitle = ODD_TITLES[value] ?? TEXT_TITLE;
  if (id === 'free-key') keys.saved.free = value === true;
  if (id === 'paid-key') keys.saved.paid = value === true;
  if (id === 'key-check') keys.check = value === 'refused' || value === 'offline' ? value : ('works' satisfies KeyCheck);
  if (id === 'balance') state.balance = value === 'unknown' ? null : Number(value);
  if (id === 'google-38') state.google['gemini-3.8-flash'] = googleDayOf(value);
  if (id === 'google-36') state.google['gemini-3.6-flash'] = googleDayOf(value);
  if (id === 'pace') state.pace = value === 'short' || value === 'quadruple' || value === 'real' ? value : 'double';
  if (id === 'money-out') state.isMoneyOut = value === true;
  if (id === 'offline') state.isOffline = value === true;
  if (id === 'letters-kept') setKept(value);
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

// His list, clickable: another text opened, as he would, to see the panel stay with a request.
for (const item of document.querySelectorAll('.prototype-list p')) {
  item.addEventListener('click', () => openTextInPrototype(item.textContent ?? TEXT_TITLE));
}
// On the Panel switch's default, so the page and the switch agree.
openTextInPrototype(TEXT_TITLE);
setScreen('menu');
render();
