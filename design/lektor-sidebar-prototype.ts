import { titleFrom } from '../src/notes/note-title.ts';
import { titleOf } from '../src/ui/dialogs/dialog-heading.ts';
import { showAsModal } from '../src/ui/dialogs/modal.ts';
import { icon } from '../src/ui/icons.ts';
import { openLektorDialog } from '../src/ui/lektor/lektor-dialog.ts';
import { FakeServiceError, type PresetId, fakeCorrections, fakeFeedback, fakeSecondLook } from './lektor-fake-ai.ts';

/*
  The Lektor beside the real app, loaded into it by the his-screens harness. Not
  part of the app: nothing in src/ knows about this file, and it is built into
  dist-browser/ only. It reaches the app through the page, as a mock-up in the
  harness does, because we are still finding out what this should be.
*/

type Screen = 'start' | 'key' | 'reading' | 'failed' | 'response';

interface Preset {
  id: PresetId;
  name: string;
  /** What he reads, and what the service is told, but for the technical rules the app adds. */
  prompt: string;
}

const PRESETS: readonly Preset[] = [
  {
    id: 'letters',
    name: 'Samo slova i razmake',
    prompt:
      'Ispravi slova kojima nedostaju kukice i slovne greške, i sredi razmake. Reči ne menjaj. Autor piše namerno baš ovako, čak i kad rečenica deluje neobično. Zadrži narečje kojim je tekst pisan.',
  },
  {
    id: 'grammar',
    name: 'I gramatiku i zareze',
    prompt:
      'Ispravi slova, slovne greške, razmake, gramatiku i zareze. Ne biraj bolje reči i ne preformuliši. Autor piše namerno baš ovako, čak i kad rečenica deluje neobično. Zadrži narečje kojim je tekst pisan.',
  },
  {
    id: 'wording',
    name: 'I predloži bolje rečenice',
    prompt:
      'Ispravi greške, a gde je rečenica nejasna ili predugačka, predloži jasniju. Ne menjaj ono što već dobro zvuči. Zadrži autorov glas i narečje kojim je tekst pisan.',
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
  preset: PresetId;
  note: string;
}

/** Past this share of its words changed, the response is more about the old text than this one. */
const MUCH_CHANGED = 0.2;
const REVEAL_MS = 10_000;
const TAKE_OVER_GRACE_MS = 1_500;
const KEY_STORE = 'lektor-fake-key';

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
    preset: 'letters',
    note: '',
  };
  states.set(openKey, fresh);
  return fresh;
}

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
  state.screen = 'reading';
  render();
  try {
    const answer = await ask(text, controller.signal);
    state.feedback = answer;
    state.readText = text;
    state.isRevealed = false;
    state.screen = 'response';
  } catch (error) {
    const failure = failedWith(error);
    if (failure === null) return;
    state.failure = failure;
    state.screen = failure === 'bad-key' ? 'key' : 'failed';
  }
  if (working === controller) working = null;
  render();
}

const FAILURES: Readonly<Record<FakeServiceError['failure'], string>> = {
  overloaded: 'AI Lektor trenutno nije dostupan. Probaj malo kasnije.',
  limit: 'AI Lektor je za sada iskoristio svoje pokušaje. Probaj kasnije.',
  'bad-key': 'Ovaj API ključ ne radi.',
  'cut-off': 'AI Lektor nije uspeo da završi.',
};

/**
 * What a screen ends with: what to do here. Right after the content, and held in
 * view when the content runs long, so a sentence about a button stays against that
 * button on a tall screen too.
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
    el('p', 'lektor-line', 'Ceo tekst se šalje Guglu na obradu, a neko iz Gugla može da pročita njegove delove. Zato ne šalji tekstove u kojima su lozinke, brojevi računa i slični osetljivi podaci.'),
  );
  return warning;
}

function startScreen(): HTMLElement[] {
  const key = button('Promeni API ključ', () => {
    stateNow().screen = 'key';
    render();
  }, 'lektor-link');
  return [
    el('p', 'lektor-line', 'AI Lektor je program koji čita tvoj tekst. Prvo ti kaže šta misli, a zatim, ako želiš, ispravlja greške. Bez tvoje potvrde ništa se ne menja.'),
    key,
    footer([privacyWarning()], button('Pošalji', () => void read(fakeFeedback), 'status-action')),
  ];
}

function keyScreen(): HTMLElement[] {
  const state = stateNow();
  const box = el('input', 'lektor-key');
  box.type = 'text';
  box.autocomplete = 'off';
  box.spellcheck = false;
  const save = (): void => {
    const pasted = box.value.replace(/\s/g, '');
    if (pasted === '') return;
    window.sessionStorage.setItem(KEY_STORE, pasted);
    state.failure = null;
    state.screen = 'start';
    render();
  };
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save();
  });
  const refused = state.failure === 'bad-key' ? [el('p', 'lektor-refused', FAILURES['bad-key'])] : [];
  return [
    el('p', 'lektor-line', 'Za rad AI Lektora potreban je API ključ. Ako ti ga je neko poslao, zalepi ga ovde.'),
    ...refused,
    el('label', 'lektor-label', 'API ključ'),
    box,
    footer([], button('Sačuvaj', save, 'status-action')),
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
    el('p', 'lektor-line', `${FAILURES[failure]} Tekst nije diran.`),
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
  const heading = el('p', 'lektor-heading', 'Koliko da ispravi?');
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
  const prompt = el('p', 'lektor-prompt', chosen?.prompt ?? '');
  const noteLabel = el('label', 'lektor-label', 'Još nešto da kažeš AI Lektoru? (nije obavezno)');
  const note = el('textarea', 'lektor-note');
  note.rows = 2;
  note.value = state.note;
  note.addEventListener('input', () => {
    state.note = note.value;
  });
  return [heading, ...options, prompt, noteLabel, note];
}

function responseScreen(): HTMLElement[] {
  const state = stateNow();
  const response = revealed(state);
  if (!state.isRevealed) return [response];
  return [
    response,
    ...[staleNote(state)].flatMap((note) => (note === null ? [] : [note])),
    ...presetChoice(state),
    footer(
      [el('p', 'lektor-line', 'Prvo ćeš videti predloge. Tekst se ne menja dok ih ne uneseš.')],
      button('Ispravi', () => void correct(), 'status-action'),
    ),
  ];
}

/* Nothing added on failure: the fault is the service's, not his, and the message below says what happened. */
const TITLES: Readonly<Record<Screen, string>> = {
  start: 'AI Lektor',
  key: 'AI Lektor: podešavanje',
  reading: 'AI Lektor: čita tekst',
  failed: 'AI Lektor',
  response: 'AI Lektor: utisak',
};

const SCREENS: Readonly<Record<Screen, () => HTMLElement[]>> = {
  start: startScreen,
  key: keyScreen,
  reading: readingScreen,
  failed: failedScreen,
  response: responseScreen,
};

function render(): void {
  stopRevealing();
  const state = stateNow();
  document.body.classList.toggle('lektor-open', state.isOpen);
  opener.setAttribute('aria-pressed', String(state.isOpen));
  opener.disabled = editor.value.trim() === '';
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
  if (state.screen === 'reading') {
    stopWorking();
    state.screen = state.feedback === '' ? 'start' : 'response';
  }
  state.isOpen = false;
  render();
}

function textInDialog(): string {
  return titleFrom(editor.value);
}

/** A dialog panel with only a sentence and a way out, for while there is nothing to review yet. */
function plainPanel(sentence: string, buttons: HTMLButtonElement[]): HTMLElement {
  const panel = el('div', 'panel review-panel lektor-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const top = document.createElement('header');
  top.append(titleOf({ mark: 'lektor', label: 'AI Lektor', name: textInDialog() }));
  const middle = el('div', 'review-panes');
  const words = el('div', 'review-text review-text-empty', sentence);
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
      plainPanel(`${FAILURES[failure]} Tekst nije diran.`, [
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
  const leaving = stateNow();
  if (leaving.screen === 'reading') {
    stopWorking();
    leaving.screen = leaving.feedback === '' ? 'start' : 'response';
  }
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
  render();
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
