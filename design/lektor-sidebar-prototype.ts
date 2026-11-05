import { describeWhen, strings } from '../src/language/wording.ts';
import { titleFrom } from '../src/notes/note-title.ts';
import { countWords } from '../src/notes/word-count.ts';
import { titleOf } from '../src/ui/dialogs/dialog-heading.ts';
import { showAsModal } from '../src/ui/dialogs/modal.ts';
import { icon } from '../src/ui/icons.ts';
import { openLektorDialog } from '../src/ui/lektor/lektor-dialog.ts';
import {
  BEHAVIOUR_KEY,
  FakeServiceError,
  type PresetId,
  fakeConnectionCheck,
  fakeCorrections,
  fakeFeedback,
  fakeKeyCheck,
  fakeSecondLook,
} from './lektor-fake-ai.ts';

/*
  The Lektor beside the real app, loaded into it by the his-screens harness. Not
  part of the app: nothing in src/ knows about this file, and it is built into
  dist-browser/ only. It reaches the app through the page, as a mock-up in the
  harness does, because we are still finding out what this should be.
*/

type Screen = 'connecting' | 'offline' | 'start' | 'key' | 'reading' | 'failed' | 'response' | 'corrections';

/** What has become of the key in the box. */
type KeyNote = 'checking' | 'refused' | 'offline' | 'unavailable' | null;

interface Preset {
  id: PresetId;
  name: string;
  /** What he reads, and what the service is told, but for the technical rules the app adds. */
  prompt: string;
}

const PRESETS: readonly Preset[] = [
  {
    id: 'letters',
    name: 'Slova, zarezi i razmaci',
    prompt:
      'Ispravi slova kojima nedostaju kukice, slovne greške, zareze, razmake i prelome redova. Reči ne menjaj. Autor piše namerno baš ovako, čak i kad rečenica deluje neobično. Zadrži narečje kojim je tekst pisan.',
  },
  {
    id: 'grammar',
    name: 'Uz to gramatika',
    prompt:
      'Ispravi slova, zareze i razmake, kao i gramatiku. Gde rečenica očigledno zapinje, malo je popravi. Ne preformuliši ono što je u redu. Zadrži autorov glas i narečje kojim je tekst pisan.',
  },
  {
    id: 'wording',
    name: 'Uz to predlozi da teče lakše',
    prompt:
      'Ispravi greške i gramatiku, a gde tekst ne teče lako, predloži kako bi mogao lakše da teče. Ne menjaj ono što već dobro zvuči. Zadrži autorov glas i narečje kojim je tekst pisan.',
  },
];

interface TextState {
  isOpen: boolean;
  screen: Screen;
  failure: FakeServiceError['failure'] | null;
  feedback: string;
  /** Whether the response has finished appearing, so it isn't played again on coming back. */
  isRevealed: boolean;
  /** The text as the Lektor last read it. */
  readText: string;
  readAt: number;
  preset: PresetId;
  note: string;
}

/** Past this share of its words changed, the response is more about the old text than this one. */
const MUCH_CHANGED = 0.2;
const REVEAL_MS = 10_000;
const TAKE_OVER_GRACE_MS = 1_500;
const KEY_STORE = 'lektor-fake-key';
/** Under this there is nothing for a reader to respond to: a title or a stray line, though not a short poem. */
const FEWEST_WORDS = 10;
const TOO_SHORT = 'Tekst je prekratak za AI Lektora.';

function required<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`The app has no ${kind.name} #${id}`);
  return found;
}

const editor = required('editor', HTMLTextAreaElement);
const main = required('main', HTMLDivElement);
const list = required('list', HTMLDivElement);

const side = document.createElement('aside');
side.id = 'lektor-side';
main.append(side);

const opener = document.createElement('button');
opener.id = 'lektor-open';
opener.type = 'button';
opener.className = 'status-action';
opener.append(icon('lektor'), document.createTextNode('Lektor'));
// Last of the buttons about this text; Premesti u Resoph and Izgled stay at the far right.
required('delete-note', HTMLButtonElement).after(opener);

// Shorter, to try the strip in one row: at 1280 wide the full words leave no room for the status line.
required('copy-all-label', HTMLSpanElement).textContent = 'Kopiraj sve';

const dialog = document.createElement('dialog');
dialog.id = 'lektor-dialog';
document.body.append(dialog);

const states = new Map<string, TextState>();
let openKey = currentKey();
let lastTyped = 0;
let lastListClick = 0;
// The key belongs to the machine rather than to any one text.
let keyDraft = '';
let keyNote: KeyNote = null;
let isKeyJustSaved = false;
let working: AbortController | null = null;
let revealTimer: ReturnType<typeof setInterval> | null = null;

function currentKey(): string {
  const row = list.querySelector('[aria-current]');
  return row instanceof HTMLElement ? (row.dataset['id'] ?? '') : '';
}

function stateNow(): TextState {
  const existing = states.get(openKey);
  if (existing !== undefined) return existing;
  const fresh: TextState = {
    isOpen: false,
    screen: 'start',
    failure: null,
    feedback: '',
    isRevealed: false,
    readText: '',
    readAt: 0,
    preset: 'letters',
    note: '',
  };
  states.set(openKey, fresh);
  return fresh;
}

const wordsInText = (): number => countWords(editor.value);

function hasKey(): boolean {
  return window.sessionStorage.getItem(KEY_STORE) !== null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  made.textContent = text;
  return made;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const made = el('button', className, label);
  made.type = 'button';
  made.addEventListener('click', onClick);
  return made;
}

/** How much of the text differs from what was read, by words and ignoring their order. */
function shareChanged(before: string, after: string): number {
  const counts = new Map<string, number>();
  const wordsBefore = before.split(/\s+/);
  for (const word of wordsBefore) counts.set(word, (counts.get(word) ?? 0) + 1);
  for (const word of after.split(/\s+/)) counts.set(word, (counts.get(word) ?? 0) - 1);
  const differing = [...counts.values()].reduce((sum, count) => sum + Math.abs(count), 0);
  return differing / Math.max(wordsBefore.length, 1);
}

function stopWorking(): void {
  working?.abort();
  working = null;
}

function stopRevealing(): void {
  if (revealTimer !== null) clearInterval(revealTimer);
  revealTimer = null;
}

function failedWith(error: unknown): FakeServiceError['failure'] | null {
  if (error instanceof DOMException && error.name === 'AbortError') return null;
  if (error instanceof FakeServiceError) return error.failure;
  console.error('The Lektor prototype failed', error);
  return 'overloaded';
}

async function read(ask: (text: string, signal: AbortSignal) => Promise<string>): Promise<void> {
  const state = stateNow();
  const text = editor.value;
  stopWorking();
  const controller = new AbortController();
  working = controller;
  isKeyJustSaved = false;
  state.screen = 'reading';
  render();
  try {
    const answer = await ask(text, controller.signal);
    state.feedback = answer;
    state.readText = text;
    state.readAt = Date.now();
    state.isRevealed = false;
    state.screen = 'response';
  } catch (error) {
    const failure = failedWith(error);
    if (failure === null) return;
    state.failure = failure;
    state.screen = failure === 'bad-key' ? 'key' : 'failed';
    if (failure === 'bad-key') keyNote = 'refused';
  }
  if (working === controller) working = null;
  render();
}

/** Before anything else on opening: there is no point in his choosing anything he can't send. */
async function checkConnection(): Promise<void> {
  const state = stateNow();
  stopWorking();
  const controller = new AbortController();
  working = controller;
  state.screen = 'connecting';
  render();
  try {
    await fakeConnectionCheck(controller.signal);
    state.screen = 'start';
  } catch (error) {
    if (failedWith(error) === null) return;
    state.screen = 'offline';
  }
  if (working === controller) working = null;
  render();
}

function offlineScreen(): HTMLElement[] {
  return [
    problem(FAILURES.offline),
    footer([], button('Pokušaj ponovo', () => void checkConnection(), 'status-action')),
  ];
}

function connectingScreen(): HTMLElement[] {
  return [el('p', 'lektor-reading', 'Proveravam vezu sa internetom…')];
}

function keyNoteOf(failure: FakeServiceError['failure'] | null): KeyNote {
  if (failure === 'bad-key') return 'refused';
  return failure === 'offline' ? 'offline' : 'unavailable';
}

/** The key only counts once the service has taken it, and what was pasted stays in the box until then. */
async function checkKey(): Promise<void> {
  const state = stateNow();
  stopWorking();
  const controller = new AbortController();
  working = controller;
  keyNote = 'checking';
  render();
  try {
    await fakeKeyCheck(controller.signal);
    window.sessionStorage.setItem(KEY_STORE, keyDraft);
    keyDraft = '';
    keyNote = null;
    isKeyJustSaved = true;
    state.failure = null;
    state.screen = 'start';
  } catch (error) {
    const failure = failedWith(error);
    if (failure === null) return;
    keyNote = keyNoteOf(failure);
  }
  if (working === controller) working = null;
  render();
}

const FAILURES: Readonly<Record<FakeServiceError['failure'], string>> = {
  overloaded: 'AI Lektor sada ne radi. Probaj kasnije.',
  limit: 'AI Lektor je potrošio pokušaje. Probaj kasnije.',
  'bad-key': 'API ključ ne radi.',
  'cut-off': 'AI Lektor nije završio. Probaj ponovo.',
  offline: 'Internet ne radi, a AI Lektoru je potreban.',
};

const KEY_NOTES: Readonly<Record<Exclude<KeyNote, 'checking' | null>, string>> = {
  refused: 'API ključ ne radi. Da li je zalepljen ceo?',
  offline: 'Internet ne radi, pa ključ ne može da se proveri.',
  unavailable: 'Ključ sada ne može da se proveri. Probaj kasnije.',
};

/** Something didn't work: recognisable by its icon and edge before a word of it is read. */
function problem(sentence: string): HTMLElement {
  const box = el('div', 'lektor-problem');
  box.setAttribute('role', 'alert');
  box.append(icon('problem'), el('p', 'lektor-line', sentence));
  return box;
}

/**
 * What a screen ends with: what to do here. Right after the content rather than at
 * the sidebar's foot, so a sentence about a button stays against that button on a
 * tall screen too. Where the content runs long, he scrolls down to it.
 */
function footer(lines: HTMLElement[], main: HTMLButtonElement): HTMLElement {
  const buttons = el('div', 'lektor-side-buttons');
  buttons.append(main);
  const made = el('div', 'lektor-side-foot');
  made.append(...lines, buttons);
  return made;
}

function privacyWarning(): HTMLElement {
  const heading = el('p', 'lektor-warning-heading');
  heading.append(icon('privacy'), document.createTextNode('Upozorenje o privatnosti'));
  const warning = el('div', 'lektor-warning');
  warning.setAttribute('role', 'note');
  warning.append(
    heading,
    el('p', 'lektor-line', `Ceo tekst (${strings('sr').wordCount(wordsInText())}) se šalje Guglu. Ne objavljuje se javno, ali je moguće da ga neko vidi.`),
    el('p', 'lektor-line', 'Ne šalji ništa što ne bi pokazao drugima: lične misli, tajne, lozinke i slično.'),
  );
  return warning;
}

function startScreen(): HTMLElement[] {
  const key = button('Promeni API ključ', () => {
    stateNow().screen = 'key';
    render();
  }, 'lektor-link');
  const saved = isKeyJustSaved ? [el('p', 'lektor-key-saved', 'API ključ radi i sačuvan je.')] : [];
  const send = button('Pošalji ceo tekst Guglu', () => void read(fakeFeedback), 'status-action');
  send.disabled = wordsInText() < FEWEST_WORDS;
  if (send.disabled) send.title = TOO_SHORT;
  // Having come here to send again, he may think better of it: the comment he has is still there.
  const back = stateNow().feedback === '' ? [] : [button('Nazad na komentar', () => {
    stateNow().screen = 'response';
    render();
  }, 'lektor-link')];
  return [
    ...saved,
    el('p', 'lektor-line', 'AI Lektor čita tvoj tekst, kaže šta misli i, ako želiš, predlaže ispravke.'),
    key,
    ...back,
    footer([privacyWarning()], send),
  ];
}

function keyNoteElement(): HTMLElement[] {
  if (keyNote === null) return [];
  if (keyNote === 'checking') return [el('p', 'lektor-reading', 'Proveravam API ključ…')];
  return [problem(KEY_NOTES[keyNote])];
}

function keyScreen(): HTMLElement[] {
  const isChecking = keyNote === 'checking';
  const box = el('input', 'lektor-key');
  box.type = 'text';
  box.autocomplete = 'off';
  box.spellcheck = false;
  box.value = keyDraft;
  box.disabled = isChecking;
  box.addEventListener('input', () => {
    keyDraft = box.value;
  });
  const save = (): void => {
    const pasted = box.value.replace(/\s/g, '');
    if (pasted === '') return;
    keyDraft = pasted;
    void checkKey();
  };
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save();
  });
  const saveButton = button('Sačuvaj', save, 'status-action');
  saveButton.disabled = isChecking;
  return [
    el('p', 'lektor-line', 'Za rad AI Lektora potreban je API ključ. Ako ti ga je neko poslao, zalepi ga ovde.'),
    el('label', 'lektor-label', 'API ključ'),
    box,
    ...keyNoteElement(),
    footer([], saveButton),
  ];
}

function readingScreen(): HTMLElement[] {
  return [
    el('p', 'lektor-reading', 'AI Lektor čita tekst…'),
    footer(
      [],
      button('Prekini', () => {
        stopWorking();
        stateNow().screen = 'start';
        render();
      }, 'status-action'),
    ),
  ];
}

function failedScreen(): HTMLElement[] {
  const failure = stateNow().failure ?? 'overloaded';
  return [
    problem(FAILURES[failure]),
    footer([], button('Pokušaj ponovo', () => void read(fakeFeedback), 'status-action')),
  ];
}

/** The response word by word; a click anywhere on it shows the rest. */
function revealed(state: TextState): HTMLElement {
  const box = el('div', 'lektor-response');
  if (state.isRevealed) {
    box.textContent = state.feedback;
    return box;
  }
  const parts = state.feedback.split(/(\s+)/);
  let shown = 0;
  const finish = (): void => {
    stopRevealing();
    state.isRevealed = true;
    render();
  };
  box.addEventListener('click', finish);
  revealTimer = setInterval(() => {
    shown += 2;
    box.textContent = parts.slice(0, shown).join('');
    if (shown >= parts.length) finish();
  }, (REVEAL_MS / parts.length) * 2);
  return box;
}

function staleNote(state: TextState): HTMLElement | null {
  if (editor.value === state.readText) return null;
  const isMuchChanged = shareChanged(state.readText, editor.value) > MUCH_CHANGED;
  const note = el('div', isMuchChanged ? 'lektor-stale lektor-stale-much' : 'lektor-stale');
  note.append(
    el('span', '', isMuchChanged ? 'Tekst se dosta promenio otkad ga je AI Lektor čitao.' : 'AI Lektor je čitao raniju verziju.'),
    button('Neka pogleda šta sam promenio', () => void read(fakeSecondLook), 'lektor-link'),
  );
  return note;
}

function presetChoice(state: TextState): HTMLElement[] {
  const heading = el('p', 'lektor-heading', 'Šta da ispravim?');
  const options = PRESETS.map((preset) => {
    const label = el('label', 'lektor-preset');
    const radio = el('input', '');
    radio.type = 'radio';
    radio.name = 'lektor-preset';
    radio.checked = state.preset === preset.id;
    radio.addEventListener('change', () => {
      state.preset = preset.id;
      prompt.textContent = preset.prompt;
    });
    label.append(radio, document.createTextNode(preset.name));
    return label;
  });
  const chosen = PRESETS.find((preset) => preset.id === state.preset);
  const promptLabel = el('p', 'lektor-label', 'Uputstvo koje dobija AI Lektor');
  const prompt = el('p', 'lektor-prompt', chosen?.prompt ?? '');
  const noteLabel = el('label', 'lektor-label', 'Još nešto da kažeš AI Lektoru? (nije obavezno)');
  const note = el('textarea', 'lektor-note');
  note.rows = 2;
  note.value = state.note;
  note.addEventListener('input', () => {
    state.note = note.value;
  });
  return [heading, ...options, promptLabel, prompt, noteLabel, note];
}

/** Says what this is before he reads it, quietly. Ours rather than the AI's, like everything around its words. */
function commentHeading(state: TextState): HTMLElement {
  return el('p', 'lektor-comment-heading', `AI komentar · ${describeWhen(state.readAt, 'sr')} · AI može da pogreši`);
}

function goTo(screen: Screen): void {
  stateNow().screen = screen;
  render();
}

/** One thing at a time: the comment is all there is to read here, and what comes next is his to choose. */
function responseScreen(): HTMLElement[] {
  const state = stateNow();
  const heading = commentHeading(state);
  const response = revealed(state);
  if (!state.isRevealed) return [heading, response];
  return [
    heading,
    response,
    ...[staleNote(state)].flatMap((note) => (note === null ? [] : [note])),
    footer([], button('Pređi na ispravke', () => goTo('corrections'), 'status-action')),
    button('Pošalji tekst ponovo', () => goTo('start'), 'lektor-link'),
  ];
}

function correctionsScreen(): HTMLElement[] {
  return [
    ...presetChoice(stateNow()),
    footer(
      [el('p', 'lektor-line', 'Prvo ćeš videti predloge. Tekst se ne menja dok ih ne uneseš.')],
      button('Predloži ispravke', () => void correct(), 'status-action'),
    ),
    button('Nazad na komentar', () => goTo('response'), 'lektor-link'),
  ];
}

/* Nothing added on failure: the fault is the service's, not his, and the message below says what happened. */
const TITLES: Readonly<Record<Screen, string>> = {
  connecting: 'AI Lektor',
  offline: 'AI Lektor',
  start: 'AI Lektor',
  key: 'AI Lektor: podešavanje',
  reading: 'AI Lektor: čita tekst',
  failed: 'AI Lektor',
  response: 'AI Lektor',
  corrections: 'AI Lektor: ispravke',
};

const SCREENS: Readonly<Record<Screen, () => HTMLElement[]>> = {
  connecting: connectingScreen,
  offline: offlineScreen,
  start: startScreen,
  key: keyScreen,
  reading: readingScreen,
  failed: failedScreen,
  response: responseScreen,
  corrections: correctionsScreen,
};

function render(): void {
  stopRevealing();
  const state = stateNow();
  document.body.classList.toggle('lektor-open', state.isOpen);
  opener.setAttribute('aria-pressed', String(state.isOpen));
  // Never while open: he may have emptied the text with the Lektor still beside it, and this is a way to close it.
  const isTooShort = wordsInText() < FEWEST_WORDS;
  opener.disabled = isTooShort && !state.isOpen;
  opener.title = opener.disabled ? TOO_SHORT : '';
  if (!state.isOpen) {
    side.replaceChildren();
    return;
  }
  if (state.screen === 'start' && !hasKey()) state.screen = 'key';
  const body = el('div', 'lektor-side-body');
  body.append(...SCREENS[state.screen]());
  const title = el('div', 'lektor-side-title');
  const close = button('Zatvori', goAway, 'lektor-side-close');
  close.append(icon('fold-down'));
  title.append(icon('lektor'), document.createTextNode(TITLES[state.screen]), close);
  side.replaceChildren(title, body);
}

/** He wants it gone: whatever it was doing stops, and nothing brings it back but him. */
function goAway(): void {
  const state = stateNow();
  settleWhatWasUnderway(state);
  isKeyJustSaved = false;
  state.isOpen = false;
  render();
}

/** Whatever was underway stops, and what is left to come back to is a screen that doesn't depend on it. */
function settleWhatWasUnderway(state: TextState): void {
  if (state.screen === 'reading' || state.screen === 'connecting') {
    stopWorking();
    state.screen = state.feedback === '' ? 'start' : 'response';
  }
  if (state.screen === 'key') {
    stopWorking();
    if (keyNote === 'checking') keyNote = null;
    if (hasKey()) state.screen = 'start';
  }
}

function textInDialog(): string {
  return titleFrom(editor.value);
}

/** A dialog panel with only a sentence and a way out, for while there is nothing to review yet. */
function plainPanel(content: string | HTMLElement, buttons: HTMLButtonElement[]): HTMLElement {
  const panel = el('div', 'panel review-panel lektor-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const top = document.createElement('header');
  top.append(titleOf({ mark: 'lektor', label: 'AI Lektor', name: textInDialog() }));
  const middle = el('div', 'review-panes');
  const words = el('div', 'review-text review-text-empty');
  words.append(content);
  middle.append(words);
  const bottom = document.createElement('footer');
  bottom.append(...buttons);
  panel.append(top, middle, bottom);
  return panel;
}

/** Opened at once, because the dialog is what keeps the text still while the corrections are made. */
async function correct(): Promise<void> {
  const state = stateNow();
  const text = editor.value;
  const controller = new AbortController();
  const leave = (): void => controller.abort();
  const waiting = showAsModal(dialog, plainPanel('AI Lektor ispravlja tekst…',[button('Prekini', leave)]), leave);
  try {
    const proposed = await fakeCorrections(text, state.preset, controller.signal);
    waiting.close();
    review(text, proposed);
  } catch (error) {
    waiting.close();
    const failure = failedWith(error);
    if (failure === null) return;
    const retry = (): void => {
      failed.close();
      void correct();
    };
    const failed = showAsModal(
      dialog,
      plainPanel(problem(FAILURES[failure]), [
        button('Pokušaj ponovo', retry, 'keep'),
        button('Zatvori', () => failed.close()),
      ]),
      () => failed.close(),
    );
  }
}

function review(text: string, proposed: string): void {
  const state = stateNow();
  const close = openLektorDialog(dialog, { title: titleFrom(text), current: text, proposed }, 'sr', {
    onApply: (result) => {
      close();
      editor.value = result;
      // How the app learns of any edit, so it is saved like one.
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      state.readText = result;
      render();
    },
    onClose: () => close(),
  });
}

function follow(): void {
  const key = currentKey();
  if (key === '' || key === openKey) return;
  // A text in Resoph gets a new id on the first edit: the same text, still.
  const isTakenOverByTyping = Date.now() - lastTyped < TAKE_OVER_GRACE_MS && Date.now() - lastListClick > TAKE_OVER_GRACE_MS;
  if (isTakenOverByTyping) {
    const carried = states.get(openKey);
    if (carried !== undefined) states.set(key, carried);
    states.delete(openKey);
    openKey = key;
    return;
  }
  settleWhatWasUnderway(stateNow());
  openKey = key;
  render();
}

opener.addEventListener('click', () => {
  const state = stateNow();
  if (state.isOpen) {
    goAway();
    return;
  }
  state.isOpen = true;
  // A response he already has needs no internet to read.
  if (state.feedback === '') void checkConnection();
  else render();
});

/* Back online while he is looking at the message, whether for real or in the harness's fake AI. */
function retryIfOffline(): void {
  if (stateNow().isOpen && stateNow().screen === 'offline') void checkConnection();
}

window.addEventListener('online', retryIfOffline);
window.addEventListener('storage', (event) => {
  if (event.key === BEHAVIOUR_KEY) retryIfOffline();
});

let waitingToRedraw: ReturnType<typeof setTimeout> | null = null;

editor.addEventListener('input', () => {
  lastTyped = Date.now();
  if (waitingToRedraw !== null) clearTimeout(waitingToRedraw);
  // A beat after he stops, and never while the response is still appearing.
  waitingToRedraw = setTimeout(() => {
    if (revealTimer === null) render();
  }, 500);
});

list.addEventListener('click', () => {
  lastListClick = Date.now();
}, true);

new MutationObserver(follow).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });

const styles = document.createElement('link');
styles.rel = 'stylesheet';
styles.href = `/lektor-sidebar-prototype.css?${Date.now()}`;
document.head.append(styles);

render();
