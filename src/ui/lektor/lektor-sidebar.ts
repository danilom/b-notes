import { describeWhen, type Language, strings } from '../../language/wording.ts';
import type { NoNote, NoteHandle } from '../../notes/note-handle.ts';
import { NO_NOTE } from '../../notes/note-handle.ts';
import { titleFrom } from '../../notes/note-title.ts';
import { countWords } from '../../notes/word-count.ts';
import type { FileSystem } from '../../platform/file-system.ts';
import type { LektorProgress } from '../../platform/lektor-progress.ts';
import type { LektorRequest, LektorResponse } from '../../platform/lektor-remote.ts';
import { describeError, type Log } from '../../platform/logging.ts';
import { icon } from '../icons.ts';
import { paidIfSlowByDefault } from './lektor-balance.ts';
import { lektorChoice, type PaidIfSlow } from './lektor-choice.ts';
import { standingOf } from './lektor-comment-standing.ts';
import { createLektorConnection, type Opening } from './lektor-connection.ts';
import { openCorrectionsWindow } from './lektor-corrections-window.ts';
import { freeResetTime } from './lektor-daily-reset.ts';
import { failureView } from './lektor-failures.ts';
import { nameForHeading } from './lektor-heading-name.ts';
import { FEEDBACK_INSTRUCTION } from './lektor-instructions.ts';
import { type KeptResults, readKeptResults, writeKeptResults } from './lektor-kept-results.ts';
import { type KeyNote, keysScreen } from './lektor-keys-screen.ts';
import { ispravkePicture, utisakPicture } from './lektor-menu-pictures.ts';
import { ChainError, type ChainFailure, isStopped } from './lektor-model-chain.ts';
import { backButton, button, deadKeyNoticeOf, el, elapsedWords, type LektorWords, MAIN_ACTION, type ProblemParts, problemBox, sendButton, sendTooltip, serviceLineOf, tierFor } from './lektor-pieces.ts';
import { type Choice, LektorServiceError } from './lektor-service.ts';
import { tierOfModel } from './lektor-tiers.ts';

/*
  The AI Lektor beside his text (spec §6). Nothing else in the app depends on it: it is handed what
  it needs, and anything that goes wrong in here stays in here. Its screens are the mockup's
  (design/lektor-choice-prototype.ts), which is the source for their words and look; the
  corrections are in a window of their own (lektor-corrections-window.ts).

  One request at a time, and nothing runs out of sight: closing the panel cancels a utisak being
  read. A utisak being read goes on while he opens another text, and the panel stays with it.
*/

type TextKey = NoteHandle | NoNote;

/** A text's own steps: the menu, the utisak's Lektor, its wait, its failure, the utisak. */
type TextScreen = 'menu' | 'start' | 'reading' | 'failed' | 'response';

/** Steps of the panel's own, which come before any text's: looking, offline, a dead key, the keys. */
type PanelScreen = 'connecting' | 'offline' | 'dead-key' | 'no-keys' | 'keys' | null;

interface Failed {
  failure: ChainFailure;
  side: Choice;
  serviceSaid: string;
  /** Who it was sent to, for "Pokušaj ponovo". */
  sentTo: Choice;
}

interface TextState extends KeptResults {
  screen: TextScreen;
  failed: Failed | null;
  /** Whether the utisak has finished appearing, so it isn't played again on coming back. */
  isRevealed: boolean;
  isKeptRead: boolean;
  /** Whether the comment was written while the app has been open, rather than read back from an earlier run. */
  isCommentFromThisRun: boolean;
  /** Whether he has put corrections in since the comment, which ends what it was for. */
  hasTakenCorrections: boolean;
  /** What he added for the corrections, kept while the app is open. */
  note: string;
}

/** A utisak being read, or just read or failed for a text no longer open. */
interface Request {
  key: TextKey;
  title: string;
  /** Its file's name, for keeping what comes back. */
  name: string | null;
  input: string;
  controller: AbortController | null;
  startedAt: number;
  sentTo: Choice;
  mayHandOver: boolean;
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
  askService: (request: LektorRequest, stop: AbortSignal, onProgress: (progress: LektorProgress) => void) => Promise<LektorResponse>;
  copyToClipboard: (text: string) => Promise<void>;
  languageNow: () => Language;
  /** Which text is open, as something that stays the same while it is. */
  textNow: () => TextKey;
  /** Where it lives now, or null before it has a file. */
  textNameNow: () => string | null;
  /** Opens a text in the list, for "Otvori tekst i utisak". */
  openText: (key: NoteHandle) => void;
  /** Gets the text ready to be sent: on disk with his last words, and brought over from Resoph. False if that couldn't be done. */
  prepareToSend: () => Promise<boolean>;
  /** Makes these corrections his text, a version kept first. False if that couldn't be done, and then nothing changed. */
  applyCorrections: (text: string) => Promise<boolean>;
}

export interface Lektor {
  /** Another text is in front of him. */
  openTextChanged(): void;
  /** Nothing has been said about what is in front of him: a new text, or none. */
  startedNewText(): void;
  /** The list was read again: a text being read that is no longer in it was deleted or archived. */
  listChanged(isListed: (key: NoteHandle) => boolean): void;
}

const REVEAL_MS = 5_000;
const FOLLOWING_SLACK_PX = 40;
/** Under this there is nothing for a reader to respond to: a title or a stray line, though not a short poem. */
const FEWEST_WORDS = 10;

export function createLektor(parts: LektorParts): Lektor {
  const { side, opener, editor, log } = parts;
  const words = (): LektorWords => strings(parts.languageNow()).lektor;
  const problemParts: ProblemParts = { words, copyToClipboard: parts.copyToClipboard, toast: parts.toast, log };
  const connection = createLektorConnection({ askService: parts.askService, files: parts.files, notesFolder: parts.notesFolder, log });

  const states = new Map<TextKey, TextState>();
  let openKey: TextKey = parts.textNow();
  let isOpen = false;
  let panelScreen: PanelScreen = null;
  /** Where the keys screen goes back to. */
  let keysCameFrom: PanelScreen = null;
  let choice: Choice = 'free';
  let isTicked = false;
  let request: Request | null = null;
  let isReadyElsewhere = false;
  let isFailedElsewhere = false;
  /** A text deleted while its utisak was being read: said, until he goes back. */
  let goneTitle: string | null = null;
  let isKeyJustSaved = false;
  let isAboutAiOpen = false;
  let checking: AbortController | null = null;
  const keyState = { drafts: { free: '', paid: '' }, notes: { free: null, paid: null } as Record<Choice, KeyNote>, serviceSaid: { free: '', paid: '' } };
  let revealTimer: ReturnType<typeof setInterval> | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  let waitingToRedraw: ReturnType<typeof setTimeout> | null = null;
  let lastDrawn = '';

  const wordsInText = (): number => countWords(editor.value);

  function stateOf(key: TextKey): TextState {
    const existing = states.get(key);
    if (existing !== undefined) return existing;
    const fresh: TextState = {
      screen: 'menu',
      failed: null,
      feedback: '',
      readText: '',
      readAt: 0,
      readBy: '',
      commentCost: null,
      proposals: [],
      proposalsFor: '',
      paidCosts: {},
      isRevealed: false,
      isKeptRead: false,
      isCommentFromThisRun: false,
      hasTakenCorrections: false,
      note: '',
    };
    states.set(key, fresh);
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

  function keepResults(name: string | null, { feedback, readText, readAt, readBy, commentCost, proposals, proposalsFor, paidCosts }: TextState): void {
    if (name === null) return;
    void writeKeptResults(parts.files, parts.appFolder, name, { feedback, readText, readAt, readBy, commentCost, proposals, proposalsFor, paidCosts }, log);
  }

  function stopRevealing(): void {
    if (revealTimer !== null) clearInterval(revealTimer);
    revealTimer = null;
  }

  function stopClock(): void {
    if (clockTimer !== null) clearInterval(clockTimer);
    clockTimer = null;
  }

  /** The text named for a sentence: quoted, or "bez naslova" in words. */
  const textInWords = (title: string): string => {
    const name = nameForHeading(title);
    return name === null ? words().untitled : words().quoted(name);
  };

  /* Opening: the internet, the keys, the balance (spec §4). */

  async function checkOpening(): Promise<void> {
    checking?.abort();
    const controller = new AbortController();
    checking = controller;
    panelScreen = 'connecting';
    render();
    let opening: Opening;
    try {
      opening = await connection.checkOpening(controller.signal);
    } catch (error) {
      if (isStopped(error)) return;
      log.error('The Lektor could not look at the connection', describeError(error));
      opening = 'offline';
    }
    if (checking !== controller) return;
    checking = null;
    log.info('Opened the Lektor', { opening });
    panelScreen = opening === 'ready' ? null : opening;
    render();
  }

  function offlineScreen(): Step {
    return { content: [problemBox(problemParts, words().offline)], main: button(words().tryAgain, () => void checkOpening(), MAIN_ACTION) };
  }

  /* Keys. */

  function openKeys(): void {
    isKeyJustSaved = false;
    keysCameFrom = panelScreen;
    panelScreen = 'keys';
    log.info('Opened the Lektor keys');
    render();
  }

  function keysGoBack(): void {
    for (const which of ['free', 'paid'] as const) keyState.notes[which] = null;
    panelScreen = connection.isAnyDead() ? 'dead-key' : keysCameFrom === 'dead-key' ? null : keysCameFrom;
    render();
  }

  async function checkOneKey(which: Choice, signal: AbortSignal): Promise<void> {
    try {
      await connection.takeKey(which, keyState.drafts[which], signal);
      keyState.drafts[which] = '';
      keyState.notes[which] = null;
    } catch (error) {
      if (!(error instanceof LektorServiceError)) throw error;
      keyState.notes[which] = error.failure === 'bad-key' ? 'refused' : error.failure === 'offline' ? 'offline' : 'unavailable';
      keyState.serviceSaid[which] = error.serviceSaid;
    }
  }

  /** A key only counts once its service has taken it, and what was pasted stays in the box until then. */
  async function saveKeys(): Promise<void> {
    const pasted = (['free', 'paid'] as const).filter((which) => {
      keyState.drafts[which] = keyState.drafts[which].replace(/\s/g, '');
      return keyState.drafts[which] !== '';
    });
    // With nothing pasted there is nothing to check, and saving is simply going back.
    if (pasted.length === 0) {
      if (panelScreen === 'keys') keysGoBack();
      return;
    }
    for (const which of pasted) keyState.notes[which] = 'checking';
    render();
    const signal = new AbortController().signal;
    try {
      await Promise.all(pasted.map((which) => checkOneKey(which, signal)));
    } catch (error) {
      log.error('A Lektor key could not be checked', describeError(error));
      for (const which of pasted) keyState.notes[which] = 'unavailable';
    }
    if (pasted.every((which) => keyState.notes[which] === null)) {
      isKeyJustSaved = true;
      void connection.rereadBalance().then(render);
      panelScreen = connection.isAnyDead() ? 'dead-key' : null;
    }
    render();
  }

  /* The menu (spec §6). */

  function menuOption(name: string, does: string, picture: SVGSVGElement, onPick: () => void): HTMLButtonElement {
    const option = button('', onPick, 'lektor-menu-option');
    option.append(picture, el('span', 'lektor-menu-name', name), el('span', 'lektor-menu-does', does));
    return option;
  }

  function privacyFoot(): HTMLElement {
    const heading = el('p', 'lektor-warning-heading');
    heading.append(icon('privacy'), document.createTextNode(words().privacyHeading));
    const warning = el('div', 'lektor-warning');
    warning.setAttribute('role', 'note');
    warning.append(heading, el('p', 'lektor-line', words().privacyWhole(strings(parts.languageNow()).wordCount(wordsInText()))), el('p', 'lektor-line', words().privacyWhat));
    const foot = el('div', 'lektor-side-foot');
    foot.append(warning);
    return foot;
  }

  function toStepTwo(): void {
    isKeyJustSaved = false;
    // A new start of the step, so Besplatni again: nothing is chosen for him from how he left it.
    choice = 'free';
    isTicked = paidIfSlowByDefault(connection.hasKey().paid, connection.balance());
    stateOf(openKey).screen = 'start';
    log.info('Chose the utisak');
    render();
    // The balance is read again whenever step 2 shows (spec §9); the tick box follows it if it moves.
    void connection.rereadBalance().then(() => {
      isTicked = paidIfSlowByDefault(connection.hasKey().paid, connection.balance());
      render();
    });
  }

  function menuScreen(): Step {
    // Said until he moves on from the menu, however often it is redrawn meanwhile.
    const saved = isKeyJustSaved ? [el('p', 'lektor-key-saved', words().keyWorksSaved)] : [];
    const keys = button('', openKeys, 'lektor-fallible');
    keys.append(el('span', '', words().keysLink));
    const keysLink = el('div', 'lektor-menu-keys');
    keysLink.append(keys);
    const options = el('div', 'lektor-menu');
    options.append(
      menuOption(words().utisak, words().utisakDoes, utisakPicture(), toStepTwo),
      menuOption(words().ispravke, words().ispravkeDoes, ispravkePicture(), openWindow),
    );
    return { content: [...saved, el('p', 'lektor-line', words().blurb), el('p', 'lektor-heading', words().whatDoYouWant), options, privacyFoot(), keysLink] };
  }

  /* Step 2: the utisak's Lektor. */

  const tickBox: PaidIfSlow = {
    get isTicked() {
      return isTicked;
    },
    tick: (ticked) => {
      isTicked = ticked;
      render();
    },
  };

  const mayHandOver = (to: Choice): boolean => to === 'free' && isTicked && connection.hasKey().paid;

  /** One key is enough: on a choice without one he moves to the other. */
  function settleOnChoiceWithKey(): void {
    const has = connection.hasKey();
    const other = choice === 'free' ? 'paid' : 'free';
    if (!has[choice] && has[other]) choice = other;
  }

  function startScreen(): Step {
    settleOnChoiceWithKey();
    const what = el('div', 'lektor-step-what');
    what.append(utisakPicture(), el('span', 'lektor-menu-name', words().utisak), el('span', 'lektor-menu-does', words().utisakDoes));
    const [heading, ...choices] = lektorChoice({
      words: words(),
      group: 'lektor-level',
      work: 'comment',
      chosen: choice,
      choose: (chosen) => {
        choice = chosen;
        log.info('Chose a Lektor', { choice: chosen });
        render();
      },
      why: { free: words().why.commentFree, paid: words().why.commentPaid },
      hasKey: connection.hasKey(),
      paidIfSlow: tickBox,
      balance: connection.balance(),
      isLocked: false,
    });
    const send = sendButton(words().sendToLektor, tierFor(choice, 'comment'), () => void readComment(choice), MAIN_ACTION, sendTooltip(words(), choice, 'comment', mayHandOver(choice)));
    send.disabled = wordsInText() < FEWEST_WORDS;
    if (send.disabled) send.title = words().tooShort;
    return {
      content: [what, ...(heading === undefined ? [] : [heading]), el('p', 'lektor-where lektor-choice-lead', words().bothAlike), ...choices],
      main: send,
      back: backButton(words().back, () => {
        stateOf(openKey).screen = 'menu';
        render();
      }),
    };
  }

  /* Reading. */

  async function readComment(to: Choice, asked: TextKey = openKey, again: Request | null = null): Promise<void> {
    if (request?.controller !== null && request !== null) return;
    let key = asked;
    let state = stateOf(key);
    const controller = new AbortController();
    const isOpenText = key === openKey;
    request = {
      key,
      title: again?.title ?? titleFrom(editor.value),
      name: again?.name ?? parts.textNameNow(),
      input: again?.input ?? editor.value,
      controller,
      startedAt: performance.now(),
      sentTo: to,
      mayHandOver: mayHandOver(to),
    };
    const sent = request;
    isReadyElsewhere = false;
    isFailedElsewhere = false;
    state.failed = null;
    state.screen = 'reading';
    render();
    try {
      if (isOpenText && again === null && !(await parts.prepareToSend())) throw new LektorServiceError('not-brought-over', 'not on disk');
      if (isOpenText && again === null) {
        // The name it has once brought over from Resoph, and the text it is now: a new one has no file, and so
        // no handle of its own, until this first save. The request belongs to that text from here on.
        sent.name = parts.textNameNow();
        const settled = parts.textNow();
        if (settled !== key && settled !== NO_NOTE) {
          states.delete(key);
          states.set(settled, state);
          if (openKey === key) openKey = settled;
          key = settled;
          sent.key = settled;
          state = stateOf(key);
        }
      }
      log.info('The Lektor was asked to read a text', { choice: to, mayHandOver: sent.mayHandOver });
      const reply = await connection.run({ work: 'comment', choice: to, mayHandOver: sent.mayHandOver, system: FEEDBACK_INSTRUCTION, input: sent.input }, () => {}, controller.signal);
      Object.assign(state, {
        feedback: reply.words.trim(),
        readText: sent.input,
        readAt: Date.now(),
        readBy: reply.model,
        commentCost: reply.cost,
        isCommentFromThisRun: true,
        hasTakenCorrections: false,
        isRevealed: false,
        screen: 'response',
      });
      isAboutAiOpen = false;
      keepResults(sent.name, state);
      void connection.rereadBalance();
      isReadyElsewhere = key !== openKey;
    } catch (error) {
      if (isStopped(error) || request !== sent) return;
      void connection.rereadBalance();
      state.failed = failedFrom(error, to);
      state.screen = 'failed';
      if (state.failed.failure === 'bad-key') connection.dead[state.failed.side] = true;
      isFailedElsewhere = key !== openKey;
    }
    sent.controller = null;
    if (!isReadyElsewhere && !isFailedElsewhere) request = null;
    stopClock();
    render();
  }

  function failedFrom(error: unknown, to: Choice): Failed {
    if (error instanceof ChainError) {
      log.warn('The Lektor did not get an answer', { failure: error.failure, side: error.side, detail: error.detail });
      return { failure: error.failure, side: error.side, serviceSaid: error.serviceSaid, sentTo: to };
    }
    if (error instanceof LektorServiceError) {
      log.warn('The Lektor did not get an answer', { failure: error.failure, detail: error.detail });
      return { failure: error.failure, side: to, serviceSaid: error.serviceSaid, sentTo: to };
    }
    log.error('The Lektor failed', describeError(error));
    return { failure: 'busy', side: to, serviceSaid: '', sentTo: to };
  }

  /** Giving up on the request, or closing on it: its text back to step 2 as he left it. */
  function giveUp(): void {
    if (request === null) return;
    request.controller?.abort();
    stateOf(request.key).screen = 'start';
    request = null;
    stopClock();
    log.info('Gave up a utisak being read');
    // A paid request may be charged for work begun.
    void connection.rereadBalance();
    render();
  }

  function waitingScreen(sent: Request): Step {
    const expect = sent.sentTo === 'free' ? `${words().expectFree}${sent.mayHandOver ? ` ${words().expectHandOver}` : ''}` : words().expectPaid;
    const waiting = el('div', 'lektor-waiting');
    waiting.append(el('p', 'lektor-reading', words().reading(textInWords(sent.title))), el('p', '', expect), el('p', 'lektor-comment-clock', elapsedWords(sent.startedAt, performance.now(), words().elapsed)));
    const stop = button('', giveUp, 'lektor-again');
    // The app's ✕: under the wait, beside its words, it can't be taken for closing the panel.
    stop.append(icon('close'), el('span', '', words().giveUp));
    const row = el('div', 'lektor-back-row lektor-stop-row');
    row.append(stop);
    if (clockTimer === null) {
      clockTimer = setInterval(() => {
        const clock = side.querySelector('.lektor-comment-clock');
        if (clock !== null) clock.textContent = elapsedWords(sent.startedAt, performance.now(), words().elapsed);
      }, 1000);
    }
    return { content: [waiting, row] };
  }

  /* Failures (spec §10). */

  function failedScreen(key: TextKey, failed: Failed, title: string): Step {
    const back = backButton(words().back, () => {
      stateOf(key).screen = 'start';
      stateOf(key).failed = null;
      isFailedElsewhere = false;
      request = null;
      render();
    });
    // Found only on sending: the dead-key screen, with the way back as well.
    if (failed.failure === 'bad-key') return { content: [deadKeyNoticeOf(words())], main: button(words().keysLink, openKeys, MAIN_ACTION), back };
    const viewed = failureView({ failure: failed.failure, side: failed.side, hasKey: connection.hasKey(), resetTime: freeResetTime(new Date()) }, words());
    const whose = failed.side === 'free' ? words().whoseWords.google : words().whoseWords.openrouter;
    const which = key !== openKey ? [el('p', 'lektor-line', words().failedElsewhere(textInWords(title)))] : [];
    const content = [...which, problemBox(problemParts, viewed.sentence, viewed.wayOn, failed.serviceSaid === '' ? '' : `${whose}: ${failed.serviceSaid}`)];
    // Its shortcut resends that text, not the open one.
    const resend = (to: Choice): void => void readComment(to, key, key === openKey ? null : request);
    if (viewed.shortcut !== null) {
      const to = viewed.shortcut;
      const shortcut = sendButton(to === 'free' ? words().sendToFree : words().sendToPaid, tierFor(to, 'comment'), () => resend(to), MAIN_ACTION, sendTooltip(words(), to, 'comment', false));
      return { content, main: shortcut, back };
    }
    if (viewed.isRetried) return { content, main: button(words().tryAgain, () => resend(failed.sentTo), MAIN_ACTION), back };
    return { content, back };
  }

  /* The utisak. */

  /** The utisak word by word; a click anywhere on it shows the rest. */
  function revealed(state: TextState, opening: string): HTMLElement {
    const box = el('div', 'lektor-response');
    const showAll = (): void => {
      box.textContent = `${opening}\n\n${state.feedback}`;
      box.append(el('span', 'lektor-response-end'));
    };
    if (state.isRevealed) {
      showAll();
      return box;
    }
    const pieces = state.feedback.split(/(\s+)/);
    let shown = 0;
    const finish = (): void => {
      stopRevealing();
      state.isRevealed = true;
      showAll();
    };
    box.addEventListener('click', finish);
    box.textContent = opening;
    revealTimer = setInterval(() => {
      const scroller = box.closest('.lektor-side-body');
      // Only if he was at the bottom: having scrolled up to read, he stays there.
      const isFollowing = scroller !== null && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < FOLLOWING_SLACK_PX;
      shown += 2;
      box.textContent = `${opening}\n\n${pieces.slice(0, shown).join('')}`;
      if (isFollowing) scroller.scrollTop = scroller.scrollHeight;
      if (shown >= pieces.length) finish();
    }, (REVEAL_MS / Math.max(1, pieces.length)) * 2);
    return box;
  }

  /** Only after a big change, with how many words changed (spec §6). */
  function staleNote(state: TextState): HTMLElement[] {
    const standing = standingOf({ readText: state.readText, text: editor.value, isFromThisRun: state.isCommentFromThisRun, hasTakenCorrections: state.hasTakenCorrections, readAt: state.readAt, now: Date.now() });
    if (standing.kind === 'current') return [];
    const note = el('p', 'lektor-stale');
    note.append(icon('info'), el('span', '', words().changedSince(strings(parts.languageNow()).wordCount(standing.wordsChanged))));
    return [note];
  }

  /** "AI može da pogreši", which opens to a few plain sentences on what an AI is, brought into view. */
  function aboutAi(): HTMLElement[] {
    const toggle = el('button', 'lektor-fallible');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(isAboutAiOpen));
    toggle.append(el('span', '', words().mayBeWrong), icon('info'));
    toggle.addEventListener('click', () => {
      isAboutAiOpen = !isAboutAiOpen;
      render();
      // Opened at the panel's foot, the words fell below its edge and he saw nothing happen (v1's bug).
      if (!isAboutAiOpen) return;
      const isStill = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      side.querySelector('.lektor-about-ai')?.scrollIntoView({ block: 'nearest', behavior: isStill ? 'auto' : 'smooth' });
    });
    return isAboutAiOpen ? [toggle, el('p', 'lektor-about-ai', words().aboutAi)] : [toggle];
  }

  /** Signed by who wrote it, by the model that ran, when, and on paid what it cost. */
  function signature(state: TextState): HTMLElement {
    const when = describeWhen(state.readAt, parts.languageNow());
    const tier = tierOfModel(state.readBy);
    const cost = state.commentCost === null ? '' : ` · ${words().dollars(state.commentCost)}`;
    const signed = tier === null ? el('p', 'lektor-service-line') : serviceLineOf(words(), tier);
    signed.append(el('span', 'lektor-comment-when', `${tier === null ? '' : ' · '}${when}${cost}`));
    const notes = el('div', 'lektor-comment-notes');
    notes.append(signed, ...aboutAi());
    return notes;
  }

  function responseScreen(state: TextState): Step {
    const ask = button('', toStepTwo, 'lektor-again');
    ask.append(icon('back'), el('span', '', words().askForNewComment));
    const again = el('div', 'lektor-back-row');
    again.append(ask);
    const head = el('div', 'lektor-comment-head');
    head.append(...staleNote(state), again);
    const opening = words().commentOpening(textInWords(titleFrom(state.readText)));
    const toCorrections = button(words().toCorrections, () => {
      state.isRevealed = true;
      openWindow();
    }, 'status-action lektor-to-corrections');
    return { content: [head, revealed(state, opening), signature(state)], main: toCorrections };
  }

  /* Another text. */

  /** Done while another text is open: said, and the way to that text, right under it. */
  function elsewhereScreen(done: Request): Step {
    const open = button(words().openTextAndComment, () => {
      isReadyElsewhere = false;
      request = null;
      if (done.key !== NO_NOTE) parts.openText(done.key);
    }, `${MAIN_ACTION} lektor-elsewhere-open`);
    return {
      content: [el('p', 'lektor-line', words().readyElsewhere(textInWords(done.title))), open],
      back: backButton(words().back, () => {
        isReadyElsewhere = false;
        request = null;
        render();
      }),
    };
  }

  function goneScreen(title: string): Step {
    const said = el('div', 'lektor-text-gone');
    said.append(el('p', 'lektor-line', words().textGone(textInWords(title))), el('p', 'lektor-where', words().textGoneWhy));
    return {
      content: [said],
      back: backButton(words().back, () => {
        goneTitle = null;
        stateOf(openKey).screen = 'menu';
        render();
      }),
    };
  }

  /** What the panel shows for a request on another text: its wait, its failure, or that it is ready. */
  function pinnedStep(): Step | null {
    if (goneTitle !== null) return goneScreen(goneTitle);
    if (request === null || request.key === openKey) return null;
    const its = stateOf(request.key);
    if (its.screen === 'reading') return waitingScreen(request);
    if (isFailedElsewhere && its.failed !== null) return failedScreen(request.key, its.failed, request.title);
    return isReadyElsewhere ? elsewhereScreen(request) : null;
  }

  /* The window. */

  function openWindow(): void {
    isKeyJustSaved = false;
    const state = stateOf(openKey);
    const name = parts.textNameNow();
    openCorrectionsWindow(
      {
        ...problemParts,
        dialog: parts.dialog,
        confirmPane: parts.confirmPane,
        connection,
        languageNow: parts.languageNow,
        log,
        prepareToSend: parts.prepareToSend,
        applyCorrections: async (text) => {
          const isApplied = await parts.applyCorrections(text);
          if (isApplied) state.hasTakenCorrections = true;
          return isApplied;
        },
        openKeysInPanel: openKeys,
        // The panel stays open, on the screen the window was opened from (spec §8).
        onClosed: render,
        savedNoteFor: (model) => (model.startsWith('saved/') ? words().review.savedReplyNote : null),
      },
      {
        text: editor.value,
        title: titleFrom(editor.value),
        proposals: () => state,
        keep: (next) => {
          Object.assign(state, next);
          keepResults(parts.textNameNow() ?? name, state);
        },
        note: () => state.note,
        setNote: (note) => {
          state.note = note;
        },
      },
    );
  }

  /* Drawing. */

  interface Step {
    content: HTMLElement[];
    main?: HTMLButtonElement;
    back?: HTMLButtonElement | null;
  }

  function panelStep(): Step | null {
    switch (panelScreen) {
      case 'connecting':
        return { content: [el('p', 'lektor-reading', words().connecting)] };
      case 'offline':
        return offlineScreen();
      case 'dead-key':
        return { content: [deadKeyNoticeOf(words())], main: button(words().keysLink, openKeys, MAIN_ACTION) };
      case 'no-keys':
      case 'keys': {
        // With no keys at all, no Nazad: there is nothing to go back to.
        const goBack = panelScreen === 'no-keys' ? null : keysGoBack;
        const shown = keysScreen(words(), problemParts, { ...keyState, hasKey: connection.hasKey(), dead: connection.dead, balance: connection.balance() }, () => void saveKeys(), goBack);
        return { content: shown.content, main: shown.main, back: shown.back };
      }
      default:
        return null;
    }
  }

  function textStep(): Step {
    const state = stateOf(openKey);
    if (state.screen === 'reading' && request !== null && request.key === openKey) return waitingScreen(request);
    if (state.screen === 'failed' && state.failed !== null) return failedScreen(openKey, state.failed, titleFrom(editor.value));
    if (state.screen === 'response' && state.feedback !== '') return responseScreen(state);
    if (state.screen === 'start') return startScreen();
    return menuScreen();
  }

  function titleNow(): string {
    if (panelScreen === 'keys' || panelScreen === 'no-keys') return words().titles.keys;
    const screen = stateOf(openKey).screen;
    if (pinnedStep() !== null || (panelScreen === null && screen !== 'menu')) return words().titles.comment;
    return words().titles.plain;
  }

  function render(): void {
    stopRevealing();
    document.body.classList.toggle('lektor-open', isOpen);
    opener.setAttribute('aria-pressed', String(isOpen));
    // Never while open: he may have emptied the text with the Lektor still beside it, and this is a way to close it.
    opener.disabled = wordsInText() < FEWEST_WORDS && !isOpen;
    opener.title = opener.disabled ? words().tooShort : '';
    if (!isOpen) {
      stopClock();
      side.replaceChildren();
      return;
    }
    const step = pinnedStep() ?? panelStep() ?? textStep();
    if (request === null || request.controller === null) stopClock();
    const drawnAs = `${panelScreen ?? ''}/${stateOf(openKey).screen}/${String(openKey)}`;
    const keptScroll = drawnAs === lastDrawn ? (side.querySelector('.lektor-side-body')?.scrollTop ?? 0) : 0;
    lastDrawn = drawnAs;
    const title = el('div', 'lektor-side-title');
    const close = button(words().close, goAway, 'lektor-side-close');
    close.append(icon('fold-down'));
    title.append(icon('lektor'), el('span', '', titleNow()), close);
    const body = el('div', 'lektor-side-body');
    body.append(...step.content);
    const buttons = el('div', 'lektor-side-buttons');
    buttons.append(...[step.back, step.main].filter((one): one is HTMLButtonElement => one !== undefined && one !== null));
    const dock = el('div', 'lektor-side-dock');
    dock.append(buttons);
    side.replaceChildren(title, body, ...(buttons.childElementCount > 0 ? [dock] : []));
    body.scrollTop = keptScroll;
  }

  /** He wants it gone: a utisak being read stops (spec §7), and the screen to come back to is step 2. */
  function goAway(): void {
    if (request?.controller !== null && request !== null) giveUp();
    checking?.abort();
    checking = null;
    isOpen = false;
    isAboutAiOpen = false;
    isKeyJustSaved = false;
    log.info('Closed the Lektor');
    render();
  }

  /**
   * What it opens on (spec §6): the utisak whenever this text has one, however much the text has
   * changed since; otherwise the menu, or step 2 for a text whose utisak was cancelled by closing.
   */
  async function openSidebar(): Promise<void> {
    await connection.readSettingsOnce();
    const state = stateOf(openKey);
    await readKeptOnce(state);
    if (state.feedback !== '') state.screen = 'response';
    else if (state.screen !== 'start') state.screen = 'menu';
    isOpen = true;
    if (request !== null) {
      render();
      return;
    }
    await checkOpening();
  }

  opener.addEventListener('click', () => {
    if (isOpen) {
      goAway();
      return;
    }
    openSidebar().catch((error: unknown) => log.error('The Lektor could not open', describeError(error)));
  });

  /* Back online while he is looking at the message. */
  window.addEventListener('online', () => {
    if (isOpen && panelScreen === 'offline') void checkOpening();
  });

  editor.addEventListener('input', () => {
    if (waitingToRedraw !== null) clearTimeout(waitingToRedraw);
    // A beat after he stops, and never while the utisak is still appearing.
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
      openKey = now;
      isAboutAiOpen = false;
      // Back on the text whose utisak was pinned: it is shown in its own place now.
      if (request !== null && request.key === openKey) {
        isReadyElsewhere = false;
        isFailedElsewhere = false;
        if (request.controller === null) request = null;
      }
      const state = stateOf(openKey);
      if (isOpen) {
        void readKeptOnce(state).then(() => {
          if (state.feedback !== '' && state.screen === 'menu') state.screen = 'response';
          render();
        });
      }
      render();
    },
    startedNewText(): void {
      states.delete(NO_NOTE);
      openKey = NO_NOTE;
      // An empty text has nothing for the Lektor, so the panel goes; unless it is showing a utisak for another text.
      if (request === null) isOpen = false;
      render();
    },
    listChanged(isListed): void {
      if (request === null || request.key === NO_NOTE || isListed(request.key)) return;
      // The text was deleted or archived while its utisak was being read: stopped at once, and said so.
      const wasReading = request.controller !== null;
      request.controller?.abort();
      if (wasReading) goneTitle = request.title;
      states.delete(request.key);
      request = null;
      isReadyElsewhere = false;
      isFailedElsewhere = false;
      log.info('A text being read by the Lektor was put away', { wasReading });
      render();
    },
  };
}
