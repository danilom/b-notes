import { type Language, strings } from '../language/wording.ts';
import { textToCopy } from './copied-text.ts';
import { NO_NOTE, type NoNote, type NoteHandle } from '../notes/note-handle.ts';
import { type LengthBands, bandsFrom } from '../notes/text-length.ts';
import { countWords } from '../notes/word-count.ts';
import {
  type LiveNote,
  SPEAK_AFTER_FAILURES,
  type Writing,
  createWriting,
} from '../notes/writing.ts';
import { BUILD_STAMP } from '../platform/build-info.ts';
import type { Host } from '../platform/host.ts';
import { type Log, describeError } from '../platform/logging.ts';
import { DEFAULT_CTRL_CARD_AFTER_MS, readAdvanced } from './settings/advanced-settings.ts';
import { readSession, writeSession } from './settings/app-session.ts';
import {
  type Settings,
  type SettingsFolders,
  createSettingsWriter,
  readSettings,
} from './settings/app-settings.ts';
import {
  type Appearance,
  DEFAULT_APPEARANCE,
  MAX_ZOOM,
  applyAppearance,
  stepScale,
} from './settings/appearance.ts';
import { type ArchivedTexts, createArchivedTexts } from './deleted-and-archived/archived-texts.ts';
import { openConfirmDialog } from './dialogs/confirm-dialog.ts';
import { createCtrlCard } from './ctrl-card.ts';
import { type FindInText, createFindInText } from './find-in-text.ts';
import { icon } from './icons.ts';
import { type KeptCopiesView, createKeptCopies } from './versions/kept-copies.ts';
import { showLostTexts } from './lost-texts.ts';
import { confirmationForDeleting } from './deleted-and-archived/note-confirmations.ts';
import { type Draft, renderList } from './note-list.ts';
import { type PutAwayTexts, createPutAwayTexts } from './deleted-and-archived/put-away-texts.ts';
import { type SettingsPanels, createSettingsPanels } from './settings/settings-panels.ts';
import {
  type WhatIsHappening,
  canDelete,
  emptyHintShows,
  statusFor,
} from './status-line.ts';
import { flashToast } from './toast.ts';

let language: Language;
let words: ReturnType<typeof strings>;
/**
 * Writes down which text is open and where he is in it.
 *
 * Returns the write rather than firing it, so the one caller that must not be
 * beaten by the closing window can wait for it. Everywhere else drops it on
 * purpose: remembering where he was is worth nothing next to what he is
 * typing, and a failure is logged and otherwise ignored.
 */
let remember: (openNoteId: string | null) => Promise<void>;

/** Both come from the host, and nothing here reaches past it for them. */
let log: Log;

/**
 * Kept whole for the advanced panel, which needs the folders and the two things
 * only a host can do with them. Nothing else here reaches for it.
 */
let host: Host;

function reportUncaught(): void {
  window.addEventListener('error', (event) => {
    log.error('Uncaught error while he was working', {
      message: event.message,
      at: `${event.filename}:${event.lineno}:${event.colno}`,
      error: describeError(event.error),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    log.error('Unhandled rejection while he was working', describeError(event.reason));
  });
}

function element<T extends Element>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`Missing element: #${id}`);
  return found;
}

const listPane = element('list', HTMLDivElement);
const editor = element('editor', HTMLTextAreaElement);
const editorMarks = element('editor-marks', HTMLDivElement);
const writingBox = element('writing', HTMLDivElement);
const foundPane = element('found', HTMLDivElement);
const statusText = element('status-text', HTMLSpanElement);
const search = element('search', HTMLInputElement);
const newNote = element('new-note', HTMLButtonElement);
const newNoteLabel = element('new-note-label', HTMLSpanElement);
const appearanceButton = element('appearance-button', HTMLButtonElement);
const appearanceLabel = element('appearance-label', HTMLSpanElement);
const appearancePane = element('appearance', HTMLDialogElement);
const copyAll = element('copy-all', HTMLButtonElement);
const copyAllLabel = element('copy-all-label', HTMLSpanElement);
const toast = element('toast', HTMLDivElement);
const deleteNote = element('delete-note', HTMLButtonElement);
const emptyHint = element('empty-hint', HTMLDivElement);
const deleteNoteLabel = element('delete-note-label', HTMLSpanElement);
const deletedBlock = element('deleted-block', HTMLDivElement);
const deletedSee = element('deleted-see', HTMLButtonElement);
const deletedBlockLabel = element('deleted-block-label', HTMLSpanElement);
const archiveBlock = element('archive-block', HTMLDivElement);
const archiveBlockLabel = element('archive-block-label', HTMLSpanElement);
const archivePane = element('archive', HTMLDialogElement);
const confirmPane = element('confirm', HTMLDialogElement);
const deletedPane = element('deleted', HTMLDialogElement);
const versionsPane = element('versions', HTMLDialogElement);
const advancedPane = element('advanced', HTMLDialogElement);
const seeVersions = element('see-versions', HTMLButtonElement);
const seeVersionsLabel = element('see-versions-label', HTMLSpanElement);

/** Built here from whatever filesystem the host provides. */
let writing: Writing;

let settings: Settings;
let saveSettings: (settings: Settings) => void;

/**
 * Puts an appearance on screen, both halves of it.
 *
 * The stylesheet's half and the window's zoom move together here so that the
 * panel, the keyboard and startup can't drift apart on which is in charge.
 */
let showAppearanceOf: (appearance: Appearance) => void;



/**
 * His whole corpus, each text carrying the name it keeps for this run.
 *
 * `LiveNote` and not `Note`: a row he clicks already knows which text it is,
 * so opening one never has to ask by filename — the one question that can be
 * answered with "there is no such text" about a text that is right there.
 */
let notes: LiveNote[] = [];

/**
 * Where one length band becomes the next, over everything he has written.
 *
 * Worked out when the list is read and not again: the boundaries are quartiles
 * of six hundred texts, and one more text moves them by nothing anybody could
 * see. A band that shifted while he watched would be the list rearranging
 * itself under him, which is the thing it most carefully never does.
 */
let lengths: LengthBands = bandsFrom([]);





/**
 * Which text is open, as a thing and not as a filename.
 *
 * It was the filename, and a filename here is built from his opening line — so
 * it changed under everything holding it the moment he rewrote his first
 * sentence, and again when another text of the same name arrived and took the
 * bare one. `openName()` asks where it lives at this moment.
 *
 * `NO_NOTE` for nothing open, where a name is `null` for the same. The
 * mismatch is the point: both being null let the compiler see an overlap
 * between a handle and a filename, so `asking !== openName()` compiled — a
 * number against a string, always unequal, which quietly shut the way to his
 * kept copies. See `NO_NOTE` for why it is not `undefined` either.
 */
let openHandle: NoteHandle | NoNote = NO_NOTE;

/** Where the open text lives now, or null before it has a file. */
function openName(): string | null {
  return openHandle === NO_NOTE ? null : writing.tokenOf(openHandle);
}

/**
 * Something to tell him once, which outranks the saved state for one painting.
 *
 * Only ever set just before the status line is redrawn, and cleared by being
 * shown: it reports a thing that just happened, and a thing that happened a
 * minute ago is no longer news.
 */
let notice: string | null = null;

/**
 * The text he has started but which isn't on disk yet. It exists only so the
 * list has something to show him immediately; `openName()` being null is what
 * actually means "the new one is what's open".
 */
let draft: Draft | null = null;
let savedAt: number | null = null;
/**
 * How many words were in the open text when it last reached disk.
 *
 * Taken at the save rather than as he types: counting a long essay on every
 * keystroke is work nobody asked for, and the line it appears on is blank
 * while a save is waiting anyway.
 */
let savedWords = 0;



function draw(): void {
  renderList(listPane, { notes, lengths, query: search.value, openId: openName(), draft, language });
  putAway.drawStrip();
  archived.drawStrip();
}

let findInText: FindInText;
let keptCopies: KeptCopiesView;
let putAway: PutAwayTexts;
let archived: ArchivedTexts;
let panels: SettingsPanels;


/**
 * Aims the bubble's tail at the middle of the button it is talking about.
 *
 * Measured rather than written into the stylesheet: the button sits at a
 * different place at every zoom, and at a different place again in a language
 * whose word for "delete" is a different length.
 */
function pointHintAtDeleteButton(): void {
  if (emptyHint.offsetParent === null) return;
  const button = deleteNote.getBoundingClientRect();
  // Measured from the bubble's own right edge, which is where the tail's `right`
  // is measured from too. The tail is shifted by half its width in CSS, so this
  // is the distance to its point rather than to its corner.
  const bubble = emptyHint.getBoundingClientRect();
  emptyHint.style.setProperty(
    '--tail-right',
    `${Math.round(bubble.right - (button.left + button.width / 2))}px`,
  );
}

window.addEventListener('resize', () => {
  if (!emptyHint.hidden) pointHintAtDeleteButton();
});

/** Everything the strip along the bottom is decided from. */
function whatIsHappening(): WhatIsHappening {
  return {
    openId: openName(),
    text: editor.value,
    savedAt,
    savedWords,
    // Another attempt at a save that failed is a save still on its way, and
    // the line stays silent for it the same way. Without this, the one failure
    // that Dropbox causes weekly left the report of the *previous* save on
    // screen — true about the file, false about what he had just typed.
    saving: openHandle !== NO_NOTE && writing.stateOf(openHandle).waiting,
    /*
      About the text in front of him, and only that one. A failure belongs to
      the words it could not write; saying it over another text tells him his
      writing is at risk where it is not, and there is nothing he could do
      about the one he has left anyway — it goes on being attempted, silently,
      for as long as the app is open.
    */
    couldNotSave:
      openHandle !== NO_NOTE &&
      writing.stateOf(openHandle).failures >= SPEAK_AFTER_FAILURES,
    notice,
  };
}

/**
 * He typed, or something put words in front of him that count as typing.
 *
 * A text he has begun has no file and so no name; it gets a handle the moment
 * there is anything to write, and keeps it through every rename after.
 */
function typedSomething(): void {
  if (openHandle === NO_NOTE) openHandle = writing.begin();
  writing.save(openHandle, editor.value);
  showStatus();
}

/**
 * Words reached disk. Reload rather than patch: a save can rename a text,
 * which moves it in the list, and a stale row is exactly what reads as loss.
 */
function afterWriting(written: NoteHandle[]): void {
  if (openHandle !== NO_NOTE && written.includes(openHandle)) {
    savedAt = Date.now();
    savedWords = countWords(editor.value);
    draft = null;
    /*
      Written down again, because the save may have renamed it.
 
      The session file is the one place a name outlives the run, and it was
      only ever written when he opened a text — so rewriting his first line
      left it pointing at a name that had moved, and the text he was last in
      came back as nothing the next morning.
    */
    void remember(writing.tokenOf(openHandle));
  }
  // Always, even when nothing was written: a failure is the other thing the
  // strip has to hear about, and it says so on the second one in a row.
  showStatus();
  if (written.length > 0) void reloadAfterWriting();
}

async function reloadAfterWriting(): Promise<void> {
  try {
    notes = await writing.list();
    lengths = bandsFrom(notes.map((note) => note.bytes));
  } catch (error: unknown) {
    log.error('Could not read his texts after saving', describeError(error));
    return;
  }
  draw();
  showStatus();
  // A save may have kept a copy before it landed, which is when the way to
  // them first appears.
  void keptCopies.count();
}

function showStatus(): void {
  const now = whatIsHappening();

  deleteNote.disabled = !canDelete(now);
  // Nothing to put on the clipboard, which he reaches regularly: emptying a
  // text is how he deletes, and the copies he keeps are what recover it.
  copyAll.disabled = editor.value.trim().length === 0;
  keptCopies.showButton();
  emptyHint.textContent = words.emptiedHint;
  emptyHint.hidden = !emptyHintShows(now);
  if (!emptyHint.hidden) pointHintAtDeleteButton();

  statusText.textContent = statusFor(now, language);
  // Shown is said: a thing that has just happened stops being news once he has
  // been told it.
  notice = null;
}












/** Where the caret sits in a text, and how far down the box is. */
interface Place {
  caret: number;
  scrollTop: number;
}

/** The top of a text, which is where one he has never been into starts. */
const START: Place = { caret: 0, scrollTop: 0 };

/**
 * Where he was in each text he has been in this sitting.
 *
 * By handle and not by name, so a text that renames itself under him — which
 * his do, every time he rewrites a first line — keeps the place he had in it.
 * That is what handles are for, and this is the cheapest thing ever asked of
 * them.
 *
 * This sitting only. What survives a restart is the one text he was last in,
 * which `session.json` holds; the rest is worth a map in memory and not a file
 * on disk, a rule for pruning it, and a second set of names to keep in step.
 */
const placeInText = new Map<NoteHandle, Place>();

/**
 * Where he is in the open text: the caret, and how far down the box is.
 *
 * `selectionStart` rather than `selectionEnd`, so a run of selected text comes
 * back with the caret at its head. Read from the editor at the moment it is
 * wanted rather than tracked as he moves, which would be a listener on every
 * scroll and every arrow key to hold a number nothing reads in between.
 */
function placeInEditor(): Place {
  return { caret: editor.selectionStart, scrollTop: Math.round(editor.scrollTop) };
}

/**
 * Puts him back where he was in a text.
 *
 * Held to what is actually there. The session file describes a text in Dropbox
 * that another machine may have rewritten since, so an offset from last night
 * can point past the end of this morning's text — which reads as the caret
 * simply being at the end, and is the kind of wrong that never gets reported.
 * The box clamps its own scroll, so nothing has to be done about that.
 */
function goBackTo(place: Place): void {
  const caret = Math.min(place.caret, editor.value.length);
  editor.focus();
  editor.setSelectionRange(caret, caret);
  // Last of the three. Focusing scrolls the caret into view and so does moving
  // it, so a scroll set before either of them is a scroll they undo.
  editor.scrollTop = place.scrollTop;
}

async function open(handle: NoteHandle): Promise<void> {
  await writing.flush();

  const note = notes.find((candidate) => candidate.handle === handle);
  if (note === undefined) return;

  /*
    Off the row he clicked, not looked up by name.
 
    Every row already carries the name its text keeps for the run, so asking
    for it again by filename is both a second lookup and a second chance to be
    told there is no such text — which is exactly what happened when the list
    was read without minting handles at all, and every text opened as nothing.
  */
  // Where he was in the one he is leaving, before its text goes out of the box.
  if (openHandle !== NO_NOTE) placeInText.set(openHandle, placeInEditor());

  openHandle = handle;
  editor.value = note.text;
  savedAt = note.updatedAt;
  savedWords = countWords(note.text);
  draft = null;
  /*
    Back where he was in this one, or its top the first time he opens it.
    Resoph does the same, and he has used Resoph for years — a text he left in
    the middle coming back at the top is the odd behaviour, not this.

    Focused, so the caret is really there and he can carry on typing. Resoph
    does that too and he has used it for years.

    It was nearly made conditional — focus only where there was a place worth
    returning to, so that a text opened at its top never has a live caret on the
    first line, which is the filename, where one absent-minded keystroke renames
    the text and moves it in the list. That was overruled deliberately: he knows
    the first line is the title, and a caret that sometimes appears is a worse
    thing to live with than the risk it avoids. Do not quietly reintroduce the
    condition.
  */
  goBackTo(placeInText.get(handle) ?? START);
  // After the box has been put where it belongs, and not before: assigning
  // `value` leaves the caret and the scroll wherever the browser decides, so
  // written down any earlier this records the place he just left.
  void remember(writing.tokenOf(handle));
  findInText.fromTheTop();
  findInText.again(search.value);
  findInText.scrollToCurrent();
  draw();
  showStatus();
  void keptCopies.count();
  log.info('Opened a text', { id: note.id });
}

listPane.addEventListener('click', (event) => {
  const row = (event.target as Element | null)?.closest('.note');
  const id = row instanceof HTMLElement ? row.dataset['id'] : undefined;
  const note = id === undefined ? undefined : notes.find((each) => each.id === id);
  if (note === undefined) return;
  // Said rather than dropped. `flush` does not reject and neither should this,
  // but a rejection nobody is holding leaves him looking at the text he was in
  // with no sign that the one he asked for did not arrive.
  open(note.handle).catch((error: unknown) => {
    log.error('Could not open the text he asked for', describeError(error));
  });
});


/**
 * Enter in the search box goes to the next one.
 *
 * The key everyone tries, and his hand is already there — so he never has to
 * find the buttons in the margin to get through a long text.
 */
search.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  findInText.step(event.shiftKey ? -1 : 1);
});

editor.addEventListener('scroll', () => {
  editorMarks.scrollTop = editor.scrollTop;
});

editor.addEventListener('input', () => {
  // He can also start a new text simply by typing, without going near the
  // button. Either way it belongs in the list from the first keystroke.
  if (openName() === null && draft === null) {
    draft = { startedAt: Date.now() };
    draw();
  }
  findInText.again(search.value);
  typedSomething();
});

/**
 * Everything that has to follow a change to what he is looking for.
 *
 * Shared by the search box and by the way out beside his text, so the two can't
 * come to mean different things.
 */
function searchChanged(): void {
  // A fresh search starts at the top of the text again.
  findInText.fromTheTop();
  draw();

  // And at the top of the list. What he found goes above everything else, so
  // searching from five thousand pixels down would put the answer off-screen
  // above him with nothing on screen having changed — which reads as the search
  // having done nothing, or the word not being there. Nothing else moves the
  // list: opening a text and saving one both leave him where he was.
  listPane.scrollTop = 0;
  findInText.again(search.value);
  // Only on a fresh search: once he is reading, moving the page under him would
  // be the app taking the text away from where he had put it.
  findInText.scrollToCurrent();
}

search.addEventListener('input', searchChanged);



newNote.addEventListener('click', () => {
  openHandle = NO_NOTE;
  savedAt = null;
  editor.value = '';
  editorMarks.replaceChildren();
  findInText.nothing();

  // The search belonged to whatever he was looking for before, and a new text
  // is not that. There is a precedent: a search isn't restored on startup
  // either, because a filtered list looks exactly like texts having gone
  // missing. Clearing it also errs in the safe direction — texts reappear.
  search.value = '';
  // Listed straight away, empty and untitled. Waiting for the first autosave
  // would leave him a second of having clicked and nothing having happened,
  // which is the second in which he clicks again.
  draft = { startedAt: Date.now() };
  void remember(null);
  draw();
  showStatus();
  editor.focus();
  log.info('Started a new text');
});

/**
 * Asks before putting a text away, and says what putting it away means.
 *
 * The question is not "are you sure" — he has no way to be surer than he was
 * when he pressed the button. It is a statement of what is about to happen and
 * of the fact that it can be undone, which is the part he cannot know.
 */
function askToDelete(): void {
  const id = openName();
  const handle = openHandle;
  if (id === null || handle === NO_NOTE) return;
  const note = notes.find((candidate) => candidate.id === id);
  if (note === undefined) return;

  const close = openConfirmDialog(
    confirmPane,
    {
      ...confirmationForDeleting(note, language),
      onConfirm: () => {
        close();
        void deleteOpenNote(id, handle);
      },
      onCancel: () => {
        close();
        deleteNote.focus();
      },
    },
    language,
  );
}

/**
 * Puts everything he has written onto the clipboard.
 *
 * What he does now is select it all by hand and copy, which on a 145KB essay
 * is a drag he has to get exactly right, and a stray keystroke during it
 * replaces the lot.
 *
 * The editor rather than the file: what is in front of him is what he means,
 * and it may be a second or two ahead of the last save.
 */
async function copyWholeText(): Promise<void> {
  const text = editor.value;
  if (text.trim().length === 0) return;

  try {
    await host.copyToClipboard(textToCopy(text, savedAt, language));
  } catch (error: unknown) {
    /*
      Said in the status line and not in the toast. A failed copy leaves the
      clipboard holding whatever it held before, so he would go to Gmail and
      paste something else entirely — and a warning that floats away is one he
      may never have been looking at.
    */
    notice = words.notCopied;
    showStatus();
    log.error('Could not copy the text to the clipboard', describeError(error));
    return;
  }

  log.info('Copied the whole text to the clipboard', { id: openName(), bytes: text.length });
  flashToast(toast, words.copied, words.copiedHow);
}

async function deleteOpenNote(id: string, handle: NoteHandle): Promise<void> {
  try {
    // `discard` writes anything still on its way first, and attempts nothing
    // for the text afterwards: a save landing later would put back the file he
    // has just put away.
    await writing.discard(handle);
  } catch (error: unknown) {
    /*
      Dropbox holds a file open while it uploads it, and Windows refuses to move
      one that is held. Nothing has happened, so his text is still in front of
      him — but he pressed a button and watched nothing occur, which is when he
      presses it again. The line that reports saving reports this too.
    */
    notice = words.notDeleted;
    showStatus();
    log.error('Could not put a text away', describeError(error));
    return;
  }

  openHandle = NO_NOTE;
  editor.value = '';
  savedAt = null;
  draft = null;
  void remember(null);
  await reload();
  findInText.again(search.value);
  // Said out loud for the same reason the restore is: the text left the editor
  // and left the list, and an empty screen on its own does not tell him whether
  // that was the thing he asked for.
  notice = words.noteDeleted;
  showStatus();
  // Where he is most likely to be going next, and somewhere for the keyboard to
  // land: the button he pressed has just gone inert under his finger.
  search.focus();
  log.info('Put a text away', { id });
}











/** Both lists, after anything that can move a text between them. */
async function reload(): Promise<void> {
  [notes] = await Promise.all([writing.list(), putAway.read()]);
  lengths = bandsFrom(notes.map((note) => note.bytes));
  // How many there are, every time it changes. A count in the log is what tells
  // a folder that emptied itself from a man who deleted one text, days later,
  // over the telephone — and it costs one line per delete or restore.
  log.info('The list now holds', { texts: notes.length, deleted: putAway.countNow() });
  draw();
}





appearanceButton.addEventListener('click', () => panels.showAppearance());
copyAll.addEventListener('click', () => {
  void copyWholeText();
});
deleteNote.addEventListener('click', askToDelete);
// On the strip, not the button: a press on the button bubbles up to here, so
// there is one way in rather than two that have to agree.
deletedBlock.addEventListener('click', () => {
  if (!deletedSee.disabled) putAway.show();
});
archiveBlock.addEventListener('click', () => {
  void archived.show();
});
// A real button answers both of these on its own. This one is a strip wearing
// the role, so it has to answer them itself or the archive is mouse-only.
archiveBlock.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  void archived.show();
});
seeVersions.addEventListener('click', () => keptCopies.show());

/**
 * The shortcut every browser has taught him, pointed at our own setting.
 *
 * Chromium's own Ctrl+ is gone with the menu it lived on, deliberately: this
 * way one thing changes the size, it is bounded, it is written down, and it can
 * be named over the telephone. It works without opening the panel at all, on
 * the text he is actually reading.
 */
window.addEventListener('keydown', (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey) return;

  // Stepped from whatever is on screen, which is the panel's working copy while
  // it is open and the saved settings otherwise. Reading the wrong one leaves
  // the panel showing a size the app is no longer at.
  const showing = panels.working() ?? settings;
  const zoom =
    event.key === '+' || event.key === '=' ? stepScale(showing.zoom, 1, MAX_ZOOM)
    : event.key === '-' ? stepScale(showing.zoom, -1, MAX_ZOOM)
    : event.key === '0' ? DEFAULT_APPEARANCE.zoom
    : null;
  if (zoom === null) return;

  event.preventDefault();

  // With the panel open this is one more thing he is trying out, undone by
  // Otkaži like any other. With it closed there is nothing to undo it later,
  // so it is kept there and then.
  if (panels.change({ ...showing, zoom })) return;
  settings = { ...settings, zoom };
  showAppearanceOf(settings);
  saveSettings(settings);
});

/**
 * Starts the interface on whatever host it's given.
 *
 * A host supplies capabilities — somewhere to keep files, somewhere to log —
 * and nothing more. What a note is, and how one is named, saved or put away, is
 * decided here and in `notes/`, so every host behaves identically.
 */
export async function startApp(runningOn: Host): Promise<void> {
  host = runningOn;
  log = host.log;
  reportUncaught();

  /*
    Everything still on its way to disk lands before the window goes. The host
    decides what closing means and whether it can be waited for.

    Registered here rather than beside the other listeners, because those run
    when this module is first evaluated and there is no host until now.
  */
  host.onBeforeClose(async () => {
    try {
      // Everything waiting, not only what is in front of him: an attempt due
      // in thirty seconds is one that will never run.
      await writing.flush();
    } catch (error: unknown) {
      // Said here and nowhere else: the status line he would read it in is
      // leaving with the window. There is nowhere else for it to go — a folder
      // that has gone at the moment of closing is the one failure this app
      // cannot report, and it is rare enough to be left that way.
      log.error('Could not save before closing', describeError(error));
    }

    /*
      And where he was reading, which is written here rather than as he moves.
      Scrolling and moving the caret are the two things he does constantly and
      neither is worth a write, so the place goes down whenever the session file
      is being written anyway — and this is the last moment there is.

      Awaited, unlike every other call to it. The window is held open until this
      callback settles, so a write merely started here is a write racing a
      closing window — which is how the first version of this shipped, and it
      would have lost that race nearly every time.
    */
    await remember(openName());
  });

  const folders: SettingsFolders = {
    writingFolder: host.writingFolder,
    appFolder: host.appFolder,
  };
  settings = await readSettings(host.files, folders);
  language = settings.language;
  words = strings(language);

  showAppearanceOf = (appearance) => {
    applyAppearance(document.documentElement, appearance);
    host.setZoom(appearance.zoom);
  };

  // Before the first paint, so he never sees the app in someone else's colours
  // and then watches it change under him.
  showAppearanceOf(settings);

  saveSettings = createSettingsWriter(host.files, folders, (error: unknown) => {
    log.error('Could not keep how he likes the app set up', describeError(error));
  });

  // Written as he moves between texts, and never waited on: remembering where
  // he was is worth nothing next to what he's typing, so a failure here is
  // logged and otherwise ignored.
  remember = async (openNoteId) => {
    const { caret, scrollTop } = openNoteId === null ? START : placeInEditor();
    try {
      await writeSession(host.files, host.appFolder, { openNoteId, caret, scrollTop });
    } catch (error: unknown) {
      log.warn('Could not remember which text is open', describeError(error));
    }
  };

  writing = createWriting(host.files, host.writingFolder, log, afterWriting);
  newNoteLabel.textContent = words.newNote;
  // Read at startup, like everything else in that file. Editing it takes
  // effect next time the app opens, which is when whoever edited it is there.
  const advanced = await readAdvanced(host.files, host.appFolder);
  createCtrlCard({
    within: writingBox,
    editor,
    languageNow: () => language,
    // The file's answer, or the app's own when it has none.
    waitNow: () => advanced.ctrlCardAfterMs ?? DEFAULT_CTRL_CARD_AFTER_MS,
  });

  panels = createSettingsPanels({
    appearancePane,
    advancedPane,
    confirmPane,
    button: appearanceButton,
    host,
    log,
    languageNow: () => language,
    settingsNow: () => settings,
    advancedNow: () => advanced,
    preview: (appearance) => showAppearanceOf(appearance),
    keep: (appearance) => {
      settings = { ...settings, ...appearance };
      saveSettings(settings);
    },
    say: (said) => {
      notice = said;
      showStatus();
    },
  });

  archived = createArchivedTexts({
    pane: archivePane,
    strip: archiveBlock,
    stripLabel: archiveBlockLabel,
    writing,
    log,
    languageNow: () => language,
    /*
      The titles he already has, handed over rather than read again. The whole
      corpus is in memory here, and reading six hundred files a second time to
      learn their first lines would double what this costs to answer a question
      that is already answered.
    */
    liveTitlesNow: () => new Set(notes.map((note) => note.title)),
    queryNow: () => search.value,
    lengthsNow: () => lengths,
    refresh: reload,
    openText: open,
    say: (said) => {
      notice = said;
      showStatus();
    },
  });

  putAway = createPutAwayTexts({
    pane: deletedPane,
    confirmPane,
    strip: deletedBlock,
    stripLabel: deletedBlockLabel,
    see: deletedSee,
    writing,
    log,
    languageNow: () => language,
    queryNow: () => search.value,
    lengthsNow: () => lengths,
    refresh: reload,
    // Straight into it. He asked for this text; leaving him looking at the
    // list to find it again would be answering a question with a question.
    openText: open,
    say: (said) => {
      notice = said;
      showStatus();
    },
  });

  keptCopies = createKeptCopies({
    pane: versionsPane,
    button: seeVersions,
    label: seeVersionsLabel,
    editor,
    writing,
    log,
    languageNow: () => language,
    lengthsNow: () => lengths,
    openTextNow: () => ({
      handle: openHandle,
      name: openName(),
      title: notes.find((note) => note.id === openName())?.title ?? words.untitled,
    }),
    say: (said) => {
      notice = said;
      showStatus();
    },
    /*
      What replacing his text means, which is more than putting it in the box:
      the caret goes to the top, the marks behind it are repainted for what is
      there now, and the save that follows is an ordinary one.
    */
    putInEditor: (text) => {
      editor.value = text;
      editor.setSelectionRange(0, 0);
      editor.scrollTop = 0;
      findInText.fromTheTop();
      findInText.again(search.value);
      typedSomething();
      editor.focus();
    },
  });

  findInText = createFindInText({
    editor,
    marks: editorMarks,
    panel: foundPane,
    words: { previous: words.foundPrevious, next: words.foundNext, close: words.clearSearch },
    languageNow: () => language,
    // The whole search, not merely these marks. Stopping the highlighting
    // while the list stayed filtered would leave two thirds of his texts
    // missing with nothing on screen left to explain why.
    onClear: () => {
      search.value = '';
      searchChanged();
    },
  });

  /*
    Registered here rather than beside the others at the top of the file.

    The box changes with the window and the marks have to be re-fitted to it —
    but re-fitting them draws the stepper, and the stepper cannot exist until
    the language is known, which is a setting read off disk. Listening from the
    moment this file loads meant a resize arriving first, which in a pane that
    sizes itself as it opens is every single start: an uncaught TypeError before
    the app had finished assembling, logged as an error on a machine where
    nothing was wrong.
  */
  window.addEventListener('resize', () => {
    findInText.again(search.value);
  });
  newNote.prepend(icon('new-text'));
  appearanceLabel.textContent = words.appearance;
  copyAllLabel.textContent = words.copyAll;
  copyAll.prepend(icon('copy'));
  deleteNoteLabel.textContent = words.deleteNote;
  deletedSee.textContent = words.deletedSee;
  // The same box as on the strip's own dialog, for the same reason the bin is
  // on both: one mark for one place.
  archiveBlock.prepend(icon('archive'));
  // The same bin as on the button he pressed to put a text here. One mark for
  // one idea is the only thing tying the action to the place it sends things.
  deletedBlock.prepend(icon('delete'));
  deleteNote.prepend(icon('delete'));
  // A clock turning back, beside the bin: both mark what the button does to the
  // text in front of him.
  seeVersions.prepend(icon('versions'));
  appearanceButton.prepend(icon('appearance'));
  search.placeholder = words.searchPlaceholder;
  search.setAttribute('aria-label', words.searchLabel);

  /**
   * Everything the app cannot start without, or what stopped it.
   *
   * A folder that is not there answers every question with nothing, which is
   * handled below. A folder that cannot be *read* — gone to a file, a
   * permission Windows changed, a drive that answers but will not open — throws
   * instead, and used to take the whole startup down as an unhandled rejection:
   * he was left looking at the frame of an app that never filled in.
   */
  async function readEverything(): Promise<{ notes: LiveNote[] }> {
    // Before anything is listed: a note still in another format is one he can't
    // open without this app, which is the guarantee .txt was chosen for.
    const { notes: live, converted } = await writing.load();
    if (converted.converted > 0) {
      log.info('Put texts into plain text', { count: converted.converted });
    }
    if (converted.refused.length > 0) {
      // One line each, with the reason. A list of names told us a file was not
      // in his list and left us guessing at why, which is the whole of what a
      // log is for.
      for (const { name, failure } of converted.refused) {
        log.warn('Could not put a text into plain text, so it is not in the list', {
          name,
          failure,
        });
      }
    }
    /*
      The archives are counted, not read. What is in them is six hundred texts
      he mostly already has, and reading that at startup would spend the second
      before his writing appears on the one thing he did not ask for.

      Counted at all because the strip under his list is there or is not, and
      that answer has to be right from the first paint rather than arriving a
      moment later and pushing the list up under him.
    */
    await Promise.all([putAway.read(), archived.read()]);
    return { notes: live };
  }

  function cannotReachHisWriting(because?: string): void {
    showLostTexts(document.body, { folder: host.writingFolder, because }, language, {
      // Straight in, with no word to type. The guard is there to stop idle
      // curiosity, and a man staring at this screen is not idly curious.
      onAdvanced: () => panels.showAdvanced(),
    });
  }

  /*
    Asked before anything is read, because the answer to "is it there" was the
    one thing a read could not give us.

    A folder that is not there lists as empty by design — rightly, for the ones
    made on demand — so the app used to greet him with "Jos nema tekstova" over
    six hundred missing essays. It knows better now by asking directly, which
    needs nothing remembered from a previous run: a count kept in a folder the
    design calls safe to delete was a safety net that could vanish without
    anyone noticing, and it only ever fired at exactly zero anyway.

    What this gives up is the folder that is still there and has been emptied.
    That looks exactly like a first run and the app genuinely cannot tell.
  */
  if (!(await host.files.folderExists(host.writingFolder))) {
    log.error('There is no folder where his writing should be', { folder: host.writingFolder });
    cannotReachHisWriting();
    return;
  }

  try {
    ({ notes } = await readEverything());
    lengths = bandsFrom(notes.map((note) => note.bytes));
  } catch (error: unknown) {
    log.error('Could not read his writing at all', describeError(error));
    // Verbatim. It is the only thing that tells a disconnected drive from a
    // permission that changed, and he is going to read it down a telephone.
    cannotReachHisWriting(error instanceof Error ? error.message : String(error));
    return;
  }

  // Emptied texts used to be swept away here, on the reading that clearing one
  // was how he deleted. His old archive says otherwise — 95 texts deliberately
  // put in the trash against 8 emptied ones left sitting in the list — so an
  // empty text now stays where he left it, and the status line points him at
  // the button for getting rid of it.
  // Reopen what he was last in. The search is deliberately not restored — a
  // filtered list on startup looks exactly like texts having gone missing.
  const wasIn = await readSession(host.files, host.appFolder);
  const { openNoteId } = wasIn;
  /*
    The one place a name is written down and read back. Everything else holds
    a handle, which means nothing between one run and the next — so this is
    where a name becomes a text again, and where a name that no longer finds
    one simply opens nothing rather than guessing at the nearest.
  */
  const wasOpen = openNoteId === null ? NO_NOTE : writing.handleFor(openNoteId);
  if (wasOpen !== NO_NOTE) {
    /*
      Put where he left it before it is opened, so the morning after runs down
      the same path as switching back to a text during the day. `open` reads
      this map, so seeding it is the whole of restoring him.
    */
    placeInText.set(wasOpen, { caret: wasIn.caret, scrollTop: wasIn.scrollTop });
    await open(wasOpen);
  } else {
    draw();
    showStatus();
  }

  const body = document.body.getBoundingClientRect();
  log.info('Ready', {
    build: BUILD_STAMP,
    notes: notes.length,
    deleted: putAway.countNow(),
    host: host.runMode,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    body: { width: Math.round(body.width), height: Math.round(body.height) },
    devicePixelRatio: window.devicePixelRatio,
  });
}
