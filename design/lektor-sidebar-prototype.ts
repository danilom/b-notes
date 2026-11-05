import { describeWhen, strings } from '../src/language/wording.ts';
import { titleFrom } from '../src/notes/note-title.ts';
import { countWords } from '../src/notes/word-count.ts';
import { titleOf } from '../src/ui/dialogs/dialog-heading.ts';
import { showAsModal } from '../src/ui/dialogs/modal.ts';
import { icon } from '../src/ui/icons.ts';
import { openLektorDialog } from '../src/ui/lektor/lektor-dialog.ts';
import { flashToast } from '../src/ui/toast.ts';
import { BEHAVIOUR_KEY, fakeAi } from './lektor-fake-ai.ts';
import { KEY_STORE, realAi } from './lektor-real-ai.ts';
import { type LektorService, LektorServiceError, type PresetId } from './lektor-service.ts';

/** Chosen in the his-screens harness, at each request. */
const ai = (): LektorService => (window.localStorage.getItem(BEHAVIOUR_KEY) === 'real' ? realAi : fakeAi);

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
    name: 'Slova, zareze i razmake',
    prompt:
      'Ispravi slova kojima nedostaju kukice, slovne greške, zareze, razmake i prelome redova. Reči ne menjaj. Autor piše namerno baš ovako, čak i kad rečenica deluje neobično. Zadrži narečje kojim je tekst pisan.',
  },
  {
    id: 'grammar',
    name: 'Uz to gramatiku',
    prompt:
      'Ispravi slova, zareze i razmake, kao i gramatiku. Gde rečenica očigledno zapinje, malo je popravi. Ne preformuliši ono što je u redu. Zadrži autorov glas i narečje kojim je tekst pisan.',
  },
  {
    id: 'wording',
    name: 'Uz to stilske predloge',
    prompt:
      'Ispravi greške i gramatiku, a gde tekst ne teče lako, predloži kako bi mogao lakše da teče. Ne menjaj ono što već dobro zvuči. Zadrži autorov glas i narečje kojim je tekst pisan.',
  },
];

interface TextState {
  isOpen: boolean;
  screen: Screen;
  failure: LektorServiceError['failure'] | null;
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
const FOLLOWING_SLACK_PX = 40;
const TAKE_OVER_GRACE_MS = 1_500;
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
let isAboutAiOpen = false;
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
  return !ai().needsKey() || window.sessionStorage.getItem(KEY_STORE) !== null;
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

function failedWith(error: unknown): LektorServiceError['failure'] | null {
  if (error instanceof DOMException && error.name === 'AbortError') return null;
  if (error instanceof LektorServiceError) return error.failure;
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
    await ai().connectionCheck(controller.signal);
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

function keyNoteOf(failure: LektorServiceError['failure'] | null): KeyNote {
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
    await ai().keyCheck(keyDraft, controller.signal);
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

const FAILURES: Readonly<Record<LektorServiceError['failure'], string>> = {
  overloaded: 'AI Lektor sada ne radi. Probaj kasnije.',
  limit: 'AI Lektor je potrošio pokušaje. Probaj kasnije.',
  'bad-key': 'API ključ ne radi.',
  'cut-off': 'AI Lektor nije završio. Probaj ponovo.',
  offline: 'Internet ne radi, a AI Lektoru je potreban.',
  'too-long': 'Tekst je predugačak za AI Lektora.',
};

const askForFeedback = (text: string, signal: AbortSignal): Promise<string> => ai().feedback(text, signal);

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

/** Forward rather than back: he may have got here by reopening, and the comment is simply there to go to. */
function existingCommentRow(): HTMLElement {
  const toComment = el('button', 'lektor-again');
  toComment.type = 'button';
  toComment.append(el('span', '', 'Postojeći AI utisak'), icon('move-out'));
  toComment.addEventListener('click', () => goTo('response'));
  const row = el('div', 'lektor-back-row');
  row.append(toComment);
  return row;
}

function startScreen(): HTMLElement[] {
  const key = button('Promeni API ključ', () => {
    stateNow().screen = 'key';
    render();
  }, 'lektor-link');
  const saved = isKeyJustSaved ? [el('p', 'lektor-key-saved', 'API ključ radi i sačuvan je.')] : [];
  const send = button('Pošalji ceo tekst Guglu', () => void read(askForFeedback), 'status-action');
  send.disabled = wordsInText() < FEWEST_WORDS;
  if (send.disabled) send.title = TOO_SHORT;
  // Having come here to send again, he may think better of it: the comment he has is still there.
  const existing = stateNow().feedback === '' ? [] : [existingCommentRow()];
  return [
    ...existing,
    ...saved,
    el('p', 'lektor-line', 'AI Lektor čita tvoj tekst, kaže šta misli i, ako želiš, predlaže ispravke.'),
    key,
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
    footer([], button('Pokušaj ponovo', () => void read(askForFeedback), 'status-action')),
  ];
}

/** The response word by word; a click anywhere on it shows the rest. */
function revealed(state: TextState): HTMLElement {
  const box = el('div', 'lektor-response');
  // Without it there is a moment of wondering whether the AI has more to say.
  const showAll = (): void => {
    box.textContent = state.feedback;
    box.append(el('span', 'lektor-response-end'));
  };
  if (state.isRevealed) {
    showAll();
    return box;
  }
  const parts = state.feedback.split(/(\s+)/);
  let shown = 0;
  // Everything on the screen is already there, so no redraw: it would jump the scroll position.
  const finish = (): void => {
    stopRevealing();
    state.isRevealed = true;
    showAll();
  };
  box.addEventListener('click', finish);
  revealTimer = setInterval(() => {
    const scroller = box.closest('.lektor-side-body');
    // Only if he was at the bottom: having scrolled up to read, he stays there.
    const isFollowing = scroller !== null && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < FOLLOWING_SLACK_PX;
    shown += 2;
    box.textContent = parts.slice(0, shown).join('');
    // Holds the button under it still on the screen once the comment has reached it.
    if (isFollowing) scroller.scrollTop = scroller.scrollHeight;
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
    button('Neka pogleda šta sam promenio', () => void read((text, signal) => ai().secondLook(text, { text: state.readText, comment: state.feedback }, signal)), 'lektor-link'),
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
  const promptLabel = el('p', 'lektor-prompt-label', 'Uputstvo za AI Lektora:');
  const prompt = el('p', 'lektor-prompt', chosen?.prompt ?? '');
  const noteLabel = el('label', 'lektor-label', 'Tvoja dodatna uputstva (nije obavezno)');
  const note = el('textarea', 'lektor-note');
  note.rows = 2;
  note.value = state.note;
  note.addEventListener('input', () => {
    state.note = note.value;
  });
  return [heading, ...options, promptLabel, prompt, noteLabel, note];
}

/** He has never used AI, and this is the one place to say what it is, without saying it at him every time. */
const ABOUT_AI =
  'AI je program koji je učio iz ogromne količine tekstova i piše ono što zvuči verovatno. Ne razume tekst kao čovek i nema sopstveno iskustvo. Zato ponekad sa sigurnošću kaže nešto netačno: navod, činjenicu, ime. Ovaj komentar je utisak AI programa, a ne stručna kritika.';

/** Closed until he asks: an explanation repeated every time is one nobody reads. */
function aboutAi(): HTMLElement[] {
  const toggle = el('button', 'lektor-fallible');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(isAboutAiOpen));
  toggle.append(el('span', '', 'AI može da pogreši'), icon('info'));
  toggle.addEventListener('click', () => {
    isAboutAiOpen = !isAboutAiOpen;
    render();
  });
  return isAboutAiOpen ? [toggle, el('p', 'lektor-about-ai', ABOUT_AI)] : [toggle];
}

/** Ours rather than the AI's, like everything around its words: how old this is, the way to a newer one, and what to make of it. */
function commentNotes(state: TextState): HTMLElement {
  const age = el('div', 'lektor-comment-age');
  age.append(el('span', '', `Napisano ${describeWhen(state.readAt, 'sr')}`), backButton('Pošalji ponovo', 'start'));
  const notes = el('div', 'lektor-comment-notes');
  notes.append(age, ...[staleNote(state)].flatMap((note) => (note === null ? [] : [note])), ...aboutAi());
  return notes;
}

function goTo(screen: Screen): void {
  isAboutAiOpen = false;
  stateNow().screen = screen;
  render();
}

/** One thing at a time: the comment is all there is to read here, and what comes next is his to choose. */
function responseScreen(): HTMLElement[] {
  const state = stateNow();
  const notes = commentNotes(state);
  const response = revealed(state);
  // There from the start: he needn't sit through the comment appearing to move on.
  const onward = button('Pređi na ispravke', () => {
    state.isRevealed = true;
    goTo('corrections');
  }, 'status-action');
  return [notes, response, footer([], onward)];
}

/** The small grey button that goes back a step, in the one place on the screen it is ever found. */
function backButton(label: string, screen: Screen): HTMLButtonElement {
  const back = el('button', 'lektor-again');
  back.type = 'button';
  back.append(icon('back'), el('span', '', label));
  back.addEventListener('click', () => goTo(screen));
  return back;
}

function correctionsScreen(): HTMLElement[] {
  const top = el('div', 'lektor-back-row');
  top.append(backButton('Nazad na utisak', 'response'));
  return [
    top,
    ...presetChoice(stateNow()),
    footer(
      [el('p', 'lektor-line', 'Prvo ćeš videti predloge. Tekst se ne menja dok ih ne uneseš.')],
      button('Pošalji zahtev za ispravke', () => void correct(), 'status-action'),
    ),
  ];
}

/* Nothing added on failure: the fault is the service's, not his, and the message below says what happened. */
const TITLES: Readonly<Record<Screen, string>> = {
  connecting: 'AI Lektor',
  offline: 'AI Lektor',
  start: 'AI Lektor',
  key: 'AI Lektor: podešavanje',
  reading: 'AI čita tekst',
  failed: 'AI Lektor',
  // Whose impression and whose corrections, as much as what they are.
  response: 'AI utisak',
  corrections: 'AI ispravke',
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
  title.append(icon('lektor'), el('span', '', TITLES[state.screen]), close);
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
  isAboutAiOpen = false;
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
  top.append(titleOf({ mark: 'lektor', label: 'AI ispravke', name: textInDialog() }));
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
    const instruction = PRESETS.find((preset) => preset.id === state.preset)?.prompt ?? '';
    const proposed = await ai().corrections({ text, preset: state.preset, instruction, note: state.note }, controller.signal);
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
  const close = openLektorDialog(dialog, required('confirm', HTMLDialogElement), { title: titleFrom(text), current: text, proposed }, 'sr', {
    onApply: (result) => {
      close();
      editor.value = result;
      // How the app learns of any edit, so it is saved like one. The real thing keeps a version first, as Ranije verzije's bringBack does.
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      state.readText = result;
      // Back to the comment: this step is done, and the toast says what became of it.
      goTo('response');
      flashToast(required('toast', HTMLDivElement), 'Izmene su unete u tekst.', 'Stari tekst je u Ranijim verzijama.');
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
