import { describeWhen, type Language, strings } from '../../language/wording.ts';
import type { NoNote, NoteHandle } from '../../notes/note-handle.ts';
import { NO_NOTE } from '../../notes/note-handle.ts';
import { titleFrom } from '../../notes/note-title.ts';
import { countWords } from '../../notes/word-count.ts';
import type { FileSystem } from '../../platform/file-system.ts';
import type { LektorRequest, LektorResponse } from '../../platform/lektor-remote.ts';
import { describeError, type Log } from '../../platform/logging.ts';
import { titleOf } from '../dialogs/dialog-heading.ts';
import { showAsModal } from '../dialogs/modal.ts';
import { icon } from '../icons.ts';
import { flashToast } from '../toast.ts';
import { createClaudeAi } from './lektor-claude-ai.ts';
import { dailyCapSentence } from './lektor-daily-cap.ts';
import { openLektorDialog } from './lektor-dialog.ts';
import { elapsedLine } from './lektor-elapsed-time.ts';
import { createFakeAi } from './lektor-fake-ai.ts';
import type { FakeBehaviour } from './lektor-fake-setting.ts';
import { createGeminiAi } from './lektor-gemini-ai.ts';
import { withHisFilingMarks } from './lektor-instructions.ts';
import { isSameText, type KeptProposal, readKeptResults, savedCorrections, withCorrections, withEndingOf, writeKeptResults } from './lektor-kept-results.ts';
import { PRESET_ORDER, PRESET_PROMPTS } from './lektor-presets.ts';
import { type LektorFailure, type LektorService, LektorServiceError, type PresetId } from './lektor-service.ts';
import type { LektorServiceParts } from './lektor-service-call.ts';
import { isSmallEdit } from './lektor-small-edit.ts';
import { type LektorSettings, NO_LEKTOR_SETTINGS, readLektorSettings, type RealLevel, writeLektorSettings } from './lektor-settings.ts';

/*
  The AI Lektor beside his text. Nothing else in the app depends on it: it is handed what it
  needs, and anything that goes wrong in here stays in here. See "AI Lektor" in DESIGN.md.
*/

/** Which Lektor he has chosen, in words about what it means for him rather than whose it is. */
type Level = RealLevel | 'fake';

type Screen = 'connecting' | 'offline' | 'start' | 'key' | 'reading' | 'failed' | 'response' | 'corrections';

/** What has become of a key in its box. */
type KeyNote = 'checking' | 'refused' | 'offline' | 'unavailable' | null;

type TextKey = NoteHandle | NoNote;

interface TextState {
  isOpen: boolean;
  screen: Screen;
  failure: LektorFailure | null;
  /** Said when it happened, and kept: another text's failure must not change what this one's says. */
  finalSentence: string;
  serviceSaid: string;
  feedback: string;
  /** Whether the response has finished appearing, so it isn't played again on coming back. */
  isRevealed: boolean;
  /** The text as the Lektor last read it. */
  readText: string;
  readAt: number;
  /** The corrections he hasn't taken, one for each kind and Lektor. */
  proposals: KeptProposal[];
  /** The text they were made from: against any other, the review would offer to undo his edits. */
  proposalsFor: string;
  /** Whether what was kept from an earlier day has been looked for. */
  isKeptRead: boolean;
  preset: PresetId;
  note: string;
}

/** What the Lektor is handed, which is all it can reach. */
export interface LektorParts {
  side: HTMLElement;
  opener: HTMLButtonElement;
  openerLabel: HTMLElement;
  dialog: HTMLDialogElement;
  confirmPane: HTMLDialogElement;
  toast: HTMLDivElement;
  editor: HTMLTextAreaElement;
  files: FileSystem;
  notesFolder: string;
  appFolder: string;
  log: Log;
  askService: (request: LektorRequest, stop: AbortSignal) => Promise<LektorResponse>;
  copyToClipboard: (text: string) => Promise<void>;
  languageNow: () => Language;
  /** Which text is open, as something that stays the same while it is. */
  textNow: () => TextKey;
  /** Where it lives now, or null before it has a file. */
  textNameNow: () => string | null;
  /**
   * Gets the text ready to be sent: on disk with his last words, and brought over from Resoph
   * if it was still there. False if that couldn't be done, and then nothing is sent.
   */
  prepareToSend: () => Promise<boolean>;
  /** Makes these corrections his text, a version kept first. False if that couldn't be done, and then nothing changed. */
  applyCorrections: (text: string) => Promise<boolean>;
  /** How the test Lektor behaves, or null where it isn't on offer, as on his machines. */
  fakeBehaviour: FakeBehaviour | null;
}

export interface Lektor {
  /** Another text is in front of him. */
  openTextChanged(): void;
  /** Nothing has been said about what is in front of him: a new text, or none. */
  startedNewText(): void;
}

const REVEAL_MS = 10_000;
const FOLLOWING_SLACK_PX = 40;
/** When to say a wait has gone on. The thorough one writes for minutes on end when all is well. */
const WAITS: Readonly<Record<Level, { readingLongS: number; correctingLongS: number; veryLongS: number }>> = {
  free: { readingLongS: 30, correctingLongS: 90, veryLongS: 120 },
  thorough: { readingLongS: 300, correctingLongS: 300, veryLongS: 480 },
  fake: { readingLongS: 30, correctingLongS: 90, veryLongS: 120 },
};
/** Under this there is nothing for a reader to respond to: a title or a stray line, though not a short poem. */
const FEWEST_WORDS = 10;
/** Past this it is no longer something to read out over the telephone. */
const LONGEST_SERVICE_WORDS = 300;
const REAL_LEVELS: readonly RealLevel[] = ['free', 'thorough'];

/** The one button that takes him on to the next step. Never trying again after a failure: by then he may rather be leaving. */
const MAIN_ACTION = 'status-action lektor-main-action';

const KEY_FIELD: Readonly<Record<RealLevel, 'googleKey' | 'anthropicKey'>> = { free: 'googleKey', thorough: 'anthropicKey' };

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

/** The arrow is a shape as well as the colour, for a washed-out or warm screen. Not on saving, which goes nowhere new. */
function nextStepButton(label: string, onClick: () => void, tooltip = ''): HTMLButtonElement {
  const made = button(label, onClick, MAIN_ACTION);
  made.append(icon('move-out'));
  made.title = tooltip;
  return made;
}

export function createLektor(parts: LektorParts): Lektor {
  const { side, opener, dialog, editor, log } = parts;

  const words = (): ReturnType<typeof strings>['lektor'] => strings(parts.languageNow()).lektor;

  const states = new Map<TextKey, TextState>();
  let openKey: TextKey = parts.textNow();
  // Read when he first opens the Lektor, so that a man who never does pays nothing for it.
  let settings: LektorSettings = NO_LEKTOR_SETTINGS;
  let isSettingsRead = false;
  // Remembered only while the app is open: the free one each time it starts, so the paid one is never spent on by habit.
  let level: Level = parts.fakeBehaviour === null ? 'free' : 'fake';
  const keyDrafts: Record<RealLevel, string> = { free: '', thorough: '' };
  const keyNotes: Record<RealLevel, KeyNote> = { free: null, thorough: null };
  /** What each service said about its key. */
  const keyServiceSaid: Record<RealLevel, string> = { free: '', thorough: '' };
  let isKeyJustSaved = false;
  let isAboutAiOpen = false;
  let lastFailureDetail = '';
  let lastServiceSaid = '';
  let lastFinalSentence = '';
  let readingSince = 0;
  let waitNoteTimer: ReturnType<typeof setInterval> | null = null;
  let working: AbortController | null = null;
  let revealTimer: ReturnType<typeof setInterval> | null = null;
  let waitingToRedraw: ReturnType<typeof setTimeout> | null = null;

  const serviceParts = (key: () => string): LektorServiceParts => ({
    ask: parts.askService,
    keyNow: key,
    noCreditSentence: () => words().noCredit,
    warn: (message, detail) => log.warn(message, detail),
  });
  const services: Readonly<Record<Level, LektorService>> = {
    free: createGeminiAi({ ...serviceParts(() => settings.googleKey), dailyCapWords: () => words() }),
    thorough: createClaudeAi(serviceParts(() => settings.anthropicKey)),
    fake: createFakeAi(parts.fakeBehaviour ?? 'ok', {
      noCredit: () => words().noCredit,
      dailyCap: (said) => dailyCapSentence(said, new Date(), words()),
    }),
  };

  const ai = (): LektorService => services[level];
  const recipient = (service = ai()): string => words().recipient[service.company];
  const wordsInText = (): number => countWords(editor.value);

  function stateNow(): TextState {
    const existing = states.get(openKey);
    if (existing !== undefined) return existing;
    const fresh: TextState = {
      isOpen: false,
      screen: 'start',
      failure: null,
      finalSentence: '',
      serviceSaid: '',
      feedback: '',
      isRevealed: false,
      readText: '',
      readAt: 0,
      proposals: [],
      proposalsFor: '',
      isKeptRead: false,
      preset: 'letters',
      note: '',
    };
    states.set(openKey, fresh);
    return fresh;
  }

  /** Read once per text and only on opening the Lektor: a man who never does pays nothing for it. */
  async function readKeptOnce(state: TextState): Promise<void> {
    const name = parts.textNameNow();
    if (state.isKeptRead || name === null) return;
    state.isKeptRead = true;
    const kept = await readKeptResults(parts.files, parts.appFolder, name, log);
    if (kept === null) return;
    Object.assign(state, kept);
    // Already read, on an earlier day: it isn't played to him again.
    state.isRevealed = true;
  }

  /** Under the name it has after being brought over, so asked for only once it has been. */
  function keepResults(name: string | null, { feedback, readText, readAt, proposals, proposalsFor }: TextState): void {
    if (name === null) return;
    void writeKeptResults(parts.files, parts.appFolder, name, { feedback, readText, readAt, proposals, proposalsFor }, log);
  }

  async function readSettingsOnce(): Promise<void> {
    if (isSettingsRead) return;
    isSettingsRead = true;
    settings = await readLektorSettings(parts.files, parts.notesFolder, log);
  }

  /** A failure is logged and costs only having to paste it on another day: it works for now, from memory. */
  function saveSettings(): void {
    writeLektorSettings(parts.files, parts.notesFolder, settings, log).catch((error: unknown) => {
      log.warn('The Lektor settings could not be saved', describeError(error));
    });
  }

  /** For whoever is looking into what ran, which he needn't be: only on hovering, where it is out of his way. */
  const modelTooltip = (model: string): string => `${words().model(model)}${words().modelPrice[level]}`;
  const hasKeyFor = (option: Level): boolean => option === 'fake' || settings[KEY_FIELD[option]] !== '';
  const hasKey = (): boolean => hasKeyFor(level);

  /**
   * One key is enough. Without a key for the level he is on, he moves to one he has one for, which
   * can only mean the paid one when Google's is missing, and the choice on screen says so. Asking
   * for the missing key instead left him on a screen where saving led straight back to it.
   */
  function settleOnLevelWithKey(): void {
    if (hasKey()) return;
    level = REAL_LEVELS.find(hasKeyFor) ?? level;
  }

  function stopWorking(): void {
    working?.abort();
    working = null;
  }

  function stopWaitNote(): void {
    if (waitNoteTimer !== null) clearInterval(waitNoteTimer);
    waitNoteTimer = null;
  }

  function stopRevealing(): void {
    if (revealTimer !== null) clearInterval(revealTimer);
    revealTimer = null;
  }

  /**
   * What he is told while waiting, in words that change with time: it isn't stuck, it
   * isn't his doing, and he needn't decide anything. By what has passed rather than a
   * forecast, because the wait hardly depends on the text and varies threefold regardless.
   */
  function waitingLine(doing: string, firstNote: string, since: number, longS: number): HTMLElement {
    stopWaitNote();
    const note = el('p', 'lektor-wait-note', firstNote);
    const clock = el('p', 'lektor-wait-clock');
    const { veryLongS } = WAITS[level];
    const update = (): void => {
      const seconds = (Date.now() - since) / 1000;
      clock.textContent = elapsedLine(seconds, words().elapsed);
      if (seconds >= veryLongS) note.textContent = words().waitVeryLong;
      else if (seconds >= longS) note.textContent = words().waitLong;
    };
    update();
    waitNoteTimer = setInterval(update, 1000);
    const line = el('div', 'lektor-waiting');
    line.append(el('p', 'lektor-reading', doing), clock, note);
    return line;
  }

  function failedWith(error: unknown, service = ai()): LektorFailure | null {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    if (error instanceof LektorServiceError) {
      log.warn('The Lektor did not get an answer', { failure: error.failure, detail: error.detail });
      lastFailureDetail = error.detail;
      // Named now: he may choose the other Lektor before coming back to read this.
      lastServiceSaid = error.serviceSaid === '' ? '' : `${words().whoseWords[service.company]}: ${error.serviceSaid}`;
      lastFinalSentence = error.finalSentence;
      return error.failure;
    }
    log.error('The Lektor failed', describeError(error));
    lastFailureDetail = String(error);
    lastServiceSaid = '';
    lastFinalSentence = '';
    return 'overloaded';
  }

  function showReadFailure(state: TextState, failure: LektorFailure): void {
    state.failure = failure;
    state.finalSentence = lastFinalSentence;
    state.serviceSaid = lastServiceSaid;
    state.screen = failure === 'bad-key' ? 'key' : 'failed';
    if (failure === 'bad-key') {
      // The test Lektor has no key of its own, and acts this out on the first box.
      const which = level === 'fake' ? 'free' : level;
      keyNotes[which] = 'refused';
      keyServiceSaid[which] = lastServiceSaid;
    }
  }

  async function read(): Promise<void> {
    const state = stateNow();
    const service = ai();
    stopWorking();
    const controller = new AbortController();
    working = controller;
    isKeyJustSaved = false;
    readingSince = Date.now();
    state.screen = 'reading';
    render();
    try {
      if (!(await parts.prepareToSend())) throw new LektorServiceError('not-brought-over', 'not on disk');
      const name = parts.textNameNow();
      const text = editor.value;
      log.info('The Lektor was asked to read a text', { level, model: service.commentModel });
      const answer = await service.feedback(text, controller.signal);
      state.feedback = answer;
      state.readText = text;
      state.readAt = Date.now();
      state.isRevealed = false;
      state.screen = 'response';
      keepResults(name, state);
    } catch (error) {
      const failure = failedWith(error, service);
      if (failure === null) return;
      showReadFailure(state, failure);
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
    return [problem(words().failures.offline), footer([], button(words().tryAgain, () => void checkConnection(), 'status-action'))];
  }

  function connectingScreen(): HTMLElement[] {
    return [el('p', 'lektor-reading', words().connecting)];
  }

  function keyNoteOf(failure: LektorFailure): KeyNote {
    if (failure === 'bad-key') return 'refused';
    return failure === 'offline' ? 'offline' : 'unavailable';
  }

  /** One key, with its own answer: a refused one must not stop the other being saved. Returns false if he stopped it all. */
  async function checkOneKey(which: RealLevel, signal: AbortSignal): Promise<boolean> {
    const service = services[which];
    try {
      await service.keyCheck(keyDrafts[which], signal);
      settings = { ...settings, [KEY_FIELD[which]]: keyDrafts[which] };
      keyDrafts[which] = '';
      keyNotes[which] = null;
      saveSettings();
      log.info('A Lektor key was saved', { service: service.company });
    } catch (error) {
      const failure = failedWith(error, service);
      if (failure === null) return false;
      keyNotes[which] = keyNoteOf(failure);
      keyServiceSaid[which] = lastServiceSaid;
    }
    return true;
  }

  /** A key only counts once its service has taken it, and what was pasted stays in the box until then. */
  async function checkPastedKeys(): Promise<void> {
    const state = stateNow();
    stopWorking();
    const controller = new AbortController();
    working = controller;
    const pasted = REAL_LEVELS.filter((which) => keyDrafts[which] !== '');
    for (const which of pasted) keyNotes[which] = 'checking';
    render();
    const finished = await Promise.all(pasted.map((which) => checkOneKey(which, controller.signal)));
    if (finished.includes(false)) return;
    if (pasted.every((which) => keyNotes[which] === null)) {
      isKeyJustSaved = true;
      state.failure = null;
      state.screen = 'start';
    }
    if (working === controller) working = null;
    render();
  }

  /** For sending on to whoever helps him. The whole of it, however much of it is shown. */
  function copyMessageButton(message: string): HTMLButtonElement {
    const copy = button(words().copyMessage, () => {
      parts.copyToClipboard(message).then(
        () => {
          // A toast can't be seen over a dialog, which sits above everything else on the page; the button says so there.
          if (copy.closest('dialog') === null) flashToast(parts.toast, words().copied, words().copiedHow);
          else copy.textContent = words().copiedInDialog;
        },
        (error: unknown) => {
          log.warn('The Lektor message could not be copied', describeError(error));
          copy.textContent = words().notCopied;
        },
      );
    }, 'lektor-copy-message');
    return copy;
  }

  /**
   * Something didn't work: recognisable by its icon before a word of it is read. A remote
   * service's own words go beneath, small and grey, with no need for him to follow them: he can
   * read them to whoever helps him, who has no other way of knowing what a stranger's server said.
   * Our own details stay under the pointer: those are ours to fix, and are in the log.
   */
  function problem(sentence: string, serviceSaid = ''): HTMLElement {
    const box = el('div', 'lektor-problem');
    box.setAttribute('role', 'alert');
    const lines = el('div', 'lektor-problem-words');
    lines.append(el('p', 'lektor-line', sentence));
    if (serviceSaid === '') {
      box.title = lastFailureDetail;
    } else {
      const said = el('p', 'lektor-service-said', serviceSaid.slice(0, LONGEST_SERVICE_WORDS));
      said.lang = 'en';
      lines.append(said, copyMessageButton(`${sentence}\n${serviceSaid}`));
    }
    box.append(icon('problem'), lines);
    return box;
  }

  /**
   * What a screen ends with: what to do here. Right after the content rather than at
   * the sidebar's foot, so a sentence about a button stays against that button on a
   * tall screen too. Where the content runs long, he scrolls down to it.
   */
  function footer(lines: HTMLElement[], main: HTMLButtonElement, afterMain: HTMLElement[] = []): HTMLElement {
    const buttons = el('div', 'lektor-side-buttons');
    buttons.append(main);
    const made = el('div', 'lektor-side-foot');
    made.append(...lines, buttons, ...afterMain);
    return made;
  }

  function privacyWarning(): HTMLElement {
    const heading = el('p', 'lektor-warning-heading');
    heading.append(icon('privacy'), document.createTextNode(words().privacyHeading));
    const warning = el('div', 'lektor-warning');
    warning.setAttribute('role', 'note');
    warning.append(
      heading,
      el('p', 'lektor-line', words().privacyWhole(strings(parts.languageNow()).wordCount(wordsInText()), recipient())),
      el('p', 'lektor-line', words().privacyWhat),
    );
    return warning;
  }

  /** The other choice, under the main button where he is deciding. No arrow: that means the next step, and this is the way out of taking it. */
  function plainButtonRow(label: string, onClick: () => void, tooltip = ''): HTMLElement {
    const row = el('div', 'lektor-side-buttons');
    const made = button(label, onClick, 'status-action');
    made.title = tooltip;
    row.append(made);
    return row;
  }

  function chooseLevel(chosen: Level): void {
    level = chosen;
    log.info('Chose a Lektor', { level: chosen });
    render();
  }

  function levelOption(option: Level): HTMLElement {
    const label = el('label', 'lektor-preset');
    const radio = el('input', '');
    radio.type = 'radio';
    radio.name = 'lektor-level';
    radio.checked = level === option;
    radio.disabled = !hasKeyFor(option);
    label.classList.toggle('lektor-preset-unavailable', radio.disabled);
    label.title = radio.disabled ? words().levelWithoutKey : '';
    radio.addEventListener('change', () => chooseLevel(option));
    label.append(radio, el('span', '', words().levels[option]));
    return label;
  }

  /** On the first step only: he won't be changing his mind midway, and every other screen is simpler for it. */
  function levelChoice(): HTMLElement[] {
    const test = parts.fakeBehaviour === null ? [] : [levelOption('fake')];
    return [el('p', 'lektor-heading', words().whichLektor), levelOption('free'), levelOption('thorough'), ...test];
  }

  function startScreen(): HTMLElement[] {
    const key = button(words().keysLink, () => goTo('key'), 'lektor-link');
    const saved = isKeyJustSaved ? [el('p', 'lektor-key-saved', words().keyWorks)] : [];
    const send = nextStepButton(words().send(recipient()), () => void read());
    send.disabled = wordsInText() < FEWEST_WORDS;
    send.title = send.disabled ? words().tooShort : modelTooltip(ai().commentModel);
    // Having come here to send again, he may think better of it: the comment he has is still there.
    const existing = stateNow().feedback === '' ? [] : [plainButtonRow(words().existingComment, () => goTo('response'))];
    return [
      ...saved,
      el('p', 'lektor-line', words().blurb),
      ...levelChoice(),
      el('p', 'lektor-model', words().model(ai().commentModel)),
      key,
      footer([privacyWarning()], send, existing),
    ];
  }

  function keyNoteElement(which: RealLevel): HTMLElement[] {
    const note = keyNotes[which];
    if (note === null) return [];
    if (note === 'checking') return [el('p', 'lektor-reading', words().keyChecking)];
    return [problem(words().keyNotes[note], keyServiceSaid[which])];
  }

  /** With nothing pasted there is nothing to check, and saving is simply going back. */
  function saveKeys(): void {
    for (const which of REAL_LEVELS) keyDrafts[which] = keyDrafts[which].replace(/\s/g, '');
    if (REAL_LEVELS.some((which) => keyDrafts[which] !== '')) {
      void checkPastedKeys();
      return;
    }
    for (const which of REAL_LEVELS) keyNotes[which] = null;
    goTo('start');
  }

  function keyField(which: RealLevel, name: string, isChecking: boolean): HTMLElement[] {
    const box = el('input', 'lektor-key');
    box.type = 'text';
    box.autocomplete = 'off';
    box.spellcheck = false;
    box.value = keyDrafts[which];
    box.disabled = isChecking;
    // Not the key: it is never shown again. Pasting over this replaces it.
    box.placeholder = settings[KEY_FIELD[which]] === '' ? '' : words().keySaved;
    box.addEventListener('input', () => {
      keyDrafts[which] = box.value;
    });
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveKeys();
    });
    return [el('label', 'lektor-label', name), box, ...keyNoteElement(which)];
  }

  function keyScreen(): HTMLElement[] {
    const isChecking = REAL_LEVELS.some((which) => keyNotes[which] === 'checking');
    const saveButton = button(words().save, saveKeys, MAIN_ACTION);
    saveButton.disabled = isChecking;
    return [
      el('p', 'lektor-line', words().keyIntro),
      ...keyField('free', words().keyGoogle, isChecking),
      ...keyField('thorough', words().keyAnthropic, isChecking),
      footer([], saveButton),
    ];
  }

  function readingScreen(): HTMLElement[] {
    return [
      waitingLine(words().reading(words().companyName[ai().company]), words().waits[level].reading, readingSince, WAITS[level].readingLongS),
      footer(
        [],
        button(words().stop, () => {
          stopWorking();
          stateNow().screen = 'start';
          render();
        }, 'status-action'),
      ),
    ];
  }

  function failedScreen(): HTMLElement[] {
    const { failure, finalSentence, serviceSaid } = stateNow();
    const top = el('div', 'lektor-back-row');
    top.append(backButton(words().back, 'start'));
    // Once the day's tries or the money are gone, trying again can only fail again.
    if (finalSentence !== '') return [top, problem(finalSentence, serviceSaid)];
    return [
      top,
      problem(words().failures[failure ?? 'overloaded'], serviceSaid),
      footer([], button(words().tryAgain, () => void read(), 'status-action')),
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
    const pieces = state.feedback.split(/(\s+)/);
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
      box.textContent = pieces.slice(0, shown).join('');
      // Holds the button under it still on the screen once the comment has reached it.
      if (isFollowing) scroller.scrollTop = scroller.scrollHeight;
      if (shown >= pieces.length) finish();
    }, (REVEAL_MS / pieces.length) * 2);
    return box;
  }

  function staleNote(state: TextState): HTMLElement | null {
    if (isSameText(editor.value, state.readText)) return null;
    // Only says what the comment is about. Offering to do something here would invite sending the text again just to clear it.
    const note = el('div', 'lektor-stale');
    const said = el('span', 'lektor-stale-said');
    said.append(icon('info'), el('span', '', words().stale));
    note.append(said);
    return note;
  }

  function presetChoice(state: TextState, onChange: () => void): HTMLElement[] {
    const prompt = el('p', 'lektor-prompt', PRESET_PROMPTS[state.preset]);
    const options = PRESET_ORDER.map((preset) => {
      const label = el('label', 'lektor-preset');
      const radio = el('input', '');
      radio.type = 'radio';
      radio.name = 'lektor-preset';
      radio.checked = state.preset === preset;
      radio.addEventListener('change', () => {
        state.preset = preset;
        prompt.textContent = PRESET_PROMPTS[preset];
        onChange();
      });
      label.append(radio, document.createTextNode(words().presets[preset]));
      return label;
    });
    const note = el('textarea', 'lektor-note');
    note.rows = 2;
    note.placeholder = words().notePlaceholder;
    note.value = state.note;
    note.addEventListener('input', () => {
      state.note = note.value;
      onChange();
    });
    const noteLabel = el('label', 'lektor-label', `${words().noteLabel} `);
    noteLabel.append(el('span', 'lektor-label-aside', words().noteOptional));
    return [
      el('p', 'lektor-heading', words().whatToCorrect),
      ...options,
      el('p', 'lektor-prompt-label', words().promptLabel),
      prompt,
      noteLabel,
      note,
    ];
  }

  /** Closed until he asks: an explanation repeated every time is one nobody reads. */
  function aboutAi(): HTMLElement[] {
    const toggle = el('button', 'lektor-fallible');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(isAboutAiOpen));
    toggle.append(el('span', '', words().mayBeWrong), icon('info'));
    toggle.addEventListener('click', () => {
      isAboutAiOpen = !isAboutAiOpen;
      render();
    });
    return isAboutAiOpen ? [toggle, el('p', 'lektor-about-ai', words().aboutAi)] : [toggle];
  }

  /** Ours rather than the AI's, like everything around its words: how old this is, the way to a newer one, and what to make of it. */
  function commentNotes(state: TextState): HTMLElement {
    const age = el('div', 'lektor-comment-age');
    age.append(el('span', '', words().writtenWhen(describeWhen(state.readAt, parts.languageNow()))), backButton(words().askForNewComment, 'start'));
    const notes = el('div', 'lektor-comment-notes');
    const stale = staleNote(state);
    notes.append(age, ...(stale === null ? [] : [stale]), ...aboutAi());
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
    const onward = nextStepButton(words().toCorrections, () => {
      state.isRevealed = true;
      goTo('corrections');
    });
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

  /**
   * What the buttons offer follows from what he has chosen. With corrections already made for just
   * this, looking at them is the step on, and costs nothing. Sending again stays possible, because
   * the same request can come back much better, but it is no longer what happens by habit.
   */
  function correctionsFoot(state: TextState): HTMLElement {
    const choice = { preset: state.preset, level, note: state.note };
    const saved = savedCorrections(state, editor.value, choice);
    // True either way, so it stays still when the buttons change. Where the text goes was said on the first step, the only place he can change that.
    const reassurance = [el('p', 'lektor-line', words().correctionsFoot)];
    const sendsNow = modelTooltip(ai().correctionModel(state.preset));
    if (saved === null) return footer(reassurance, nextStepButton(words().sendForCorrections, () => void correct(), sendsNow));
    const see = nextStepButton(words().seeCorrections, () => review(editor.value, withEndingOf(editor.value, saved.proposed)), modelTooltip(saved.model));
    return footer(reassurance, see, [plainButtonRow(words().newRequest, () => void correct(), sendsNow)]);
  }

  function correctionsScreen(): HTMLElement[] {
    const state = stateNow();
    const top = el('div', 'lektor-back-row');
    top.append(backButton(words().backToComment, 'response'));
    let foot = correctionsFoot(state);
    const refreshFoot = (): void => {
      const fresh = correctionsFoot(state);
      foot.replaceWith(fresh);
      foot = fresh;
    };
    return [top, ...presetChoice(state, refreshFoot), foot];
  }

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

  /* Nothing added on failure: the fault is the service's, not his, and the message below says what happened. */
  function titleOfScreen(screen: Screen): string {
    const { titles } = words();
    switch (screen) {
      case 'start':
        return titles.start;
      case 'key':
        return titles.key;
      case 'reading':
        return titles.reading;
      // Whose impression and whose corrections, as much as what they are.
      case 'response':
        return titles.response;
      case 'corrections':
        return titles.corrections;
      default:
        return titles.plain;
    }
  }

  function render(): void {
    stopRevealing();
    stopWaitNote();
    const state = stateNow();
    document.body.classList.toggle('lektor-open', state.isOpen);
    opener.setAttribute('aria-pressed', String(state.isOpen));
    // Never while open: he may have emptied the text with the Lektor still beside it, and this is a way to close it.
    const isTooShort = wordsInText() < FEWEST_WORDS;
    opener.disabled = isTooShort && !state.isOpen;
    opener.title = opener.disabled ? words().tooShort : '';
    if (!state.isOpen) {
      side.replaceChildren();
      return;
    }
    settleOnLevelWithKey();
    if (state.screen === 'start' && !hasKey()) state.screen = 'key';
    const body = el('div', 'lektor-side-body');
    body.append(...SCREENS[state.screen]());
    const title = el('div', 'lektor-side-title');
    const close = button(words().close, goAway, 'lektor-side-close');
    close.append(icon('fold-down'));
    title.append(icon('lektor'), el('span', '', titleOfScreen(state.screen)), close);
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
      for (const which of REAL_LEVELS) {
        if (keyNotes[which] === 'checking') keyNotes[which] = null;
      }
      settleOnLevelWithKey();
      if (hasKey()) state.screen = 'start';
    }
  }

  /** A dialog panel with only a sentence and a way out, for while there is nothing to review yet. */
  function plainPanel(content: HTMLElement, buttons: HTMLButtonElement[]): HTMLElement {
    const panel = el('div', 'panel review-panel lektor-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const top = document.createElement('header');
    top.append(titleOf({ mark: 'lektor', label: words().review.title, name: titleFrom(editor.value) }));
    const middle = el('div', 'review-panes');
    const body = el('div', 'review-text review-text-empty');
    body.append(content);
    middle.append(body);
    const bottom = document.createElement('footer');
    bottom.append(...buttons);
    panel.append(top, middle, bottom);
    return panel;
  }

  function showCorrectionFailure(failure: LektorFailure): void {
    const finalSentence = lastFinalSentence;
    const retry = (): void => {
      failed.close();
      void correct();
    };
    const failed = showAsModal(
      dialog,
      plainPanel(problem(finalSentence === '' ? words().failures[failure] : finalSentence, lastServiceSaid), [
        ...(finalSentence === '' ? [button(words().tryAgain, retry, 'keep')] : []),
        button(words().close, () => failed.close()),
      ]),
      () => failed.close(),
    );
  }

  /** Opened at once, because the dialog is what keeps the text still while the corrections are made. */
  async function correct(): Promise<void> {
    const state = stateNow();
    const service = ai();
    const chosenLevel = level;
    const controller = new AbortController();
    const leave = (): void => controller.abort();
    const doing = words().correcting(words().companyName[service.company]);
    const waitingPanel = plainPanel(waitingLine(doing, words().waits[level].correcting, Date.now(), WAITS[level].correctingLongS), [button(words().stop, leave)]);
    const waiting = showAsModal(dialog, waitingPanel, leave);
    try {
      if (!(await parts.prepareToSend())) throw new LektorServiceError('not-brought-over', 'not on disk');
      const name = parts.textNameNow();
      const text = editor.value;
      const model = service.correctionModel(state.preset);
      log.info('The Lektor was asked for corrections', { level, preset: state.preset, model });
      const { preset, note } = state;
      const asked = { text, preset, instruction: PRESET_PROMPTS[preset], note };
      const proposed = withHisFilingMarks(text, await service.corrections(asked, controller.signal));
      Object.assign(state, withCorrections(state, text, { preset, level: chosenLevel, note, proposed, model }));
      keepResults(name, state);
      stopWaitNote();
      waiting.close();
      review(text, proposed);
    } catch (error) {
      stopWaitNote();
      waiting.close();
      const failure = failedWith(error, service);
      if (failure !== null) showCorrectionFailure(failure);
    }
  }

  /** What he took goes in with a version kept first; if that can't be done nothing changes, and the proposal is still there. */
  async function apply(result: string, state: TextState): Promise<void> {
    if (!(await parts.applyCorrections(result))) {
      render();
      return;
    }
    // Taken, so nothing is left to come back to. The comment was about the text before them, and says so when he next looks.
    state.proposals = [];
    state.proposalsFor = '';
    keepResults(parts.textNameNow(), state);
    log.info('Corrections from the Lektor were put in the text');
    finishWithReview(state);
    flashToast(parts.toast, words().applied, words().appliedHow);
  }

  /**
   * The job he came for is over either way, and his text is what is in front of him. A sidebar left
   * asking him to send it again would look like one more thing he has to do. Opened again, it shows
   * the comment if the text is still what was read, and otherwise starts from the beginning.
   */
  function finishWithReview(state: TextState): void {
    state.screen = 'start';
    state.isOpen = false;
    render();
  }

  function review(text: string, proposed: string): void {
    const state = stateNow();
    const proposal = { title: titleFrom(text), current: text, proposed, testNote: level === 'fake' ? words().review.testNote : null };
    const close = openLektorDialog(dialog, parts.confirmPane, proposal, parts.languageNow(), {
      onApply: (result) => {
        close();
        void apply(result, state);
      },
      onClose: () => {
        close();
        finishWithReview(state);
      },
    });
  }

  async function openSidebar(): Promise<void> {
    const state = stateNow();
    await readSettingsOnce();
    await readKeptOnce(state);
    // What he already has is what he came back to, a few changed words later too: asking again is the choice he makes from there.
    const isStillAboutThis = isSameText(editor.value, state.readText) || isSmallEdit(state.readText, editor.value);
    if (state.screen === 'start' && state.feedback !== '' && isStillAboutThis) state.screen = 'response';
    state.isOpen = true;
    log.info('Opened the Lektor', { level });
    // A response he already has needs no internet to read.
    if (state.feedback === '') void checkConnection();
    else render();
  }

  opener.addEventListener('click', () => {
    if (stateNow().isOpen) {
      goAway();
      return;
    }
    openSidebar().catch((error: unknown) => log.error('The Lektor could not open', describeError(error)));
  });

  /* Back online while he is looking at the message. */
  window.addEventListener('online', () => {
    if (stateNow().isOpen && stateNow().screen === 'offline') void checkConnection();
  });

  editor.addEventListener('input', () => {
    if (waitingToRedraw !== null) clearTimeout(waitingToRedraw);
    // A beat after he stops, and never while the response is still appearing.
    waitingToRedraw = setTimeout(() => {
      if (revealTimer === null) render();
    }, 500);
  });

  opener.prepend(icon('lektor'));
  parts.openerLabel.textContent = words().button;
  render();

  return {
    openTextChanged(): void {
      const now = parts.textNow();
      if (now === NO_NOTE || now === openKey) {
        render();
        return;
      }
      settleWhatWasUnderway(stateNow());
      openKey = now;
      render();
    },
    startedNewText(): void {
      settleWhatWasUnderway(stateNow());
      states.delete(NO_NOTE);
      openKey = NO_NOTE;
      render();
    },
  };
}
