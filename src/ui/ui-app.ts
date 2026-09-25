import { type Language, describeWhen, strings } from '../language/wording.ts';
import { NO_NOTE, type NoNote, type NoteHandle } from '../notes/note-handle.ts';
import {
  SPEAK_AFTER_FAILURES,
  type LiveNote,
  type Writing,
  createWriting,
} from '../notes/writing.ts';
import {
  type Archive,
  type ArchivedNote,
  type DeletedNote,
  type Note,
  isEmptyText,
} from '../notes/note.ts';
import { BUILD_STAMP } from '../platform/build-info.ts';
import type { Host } from '../platform/host.ts';
import { type Log, describeError } from '../platform/logging.ts';
import {
  type Appearance,
  DEFAULT_APPEARANCE,
  MAX_ZOOM,
  applyAppearance,
  stepScale,
} from './appearance.ts';
import { type OpenPanel, openAppearancePanel } from './appearance-panel.ts';
import { openConfirmDialog } from './confirm-dialog.ts';
import { openAdvancedPanel } from './advanced-panel.ts';
import { showLostTexts } from './lost-texts.ts';
import { openDeletedDialog } from './deleted-dialog.ts';
import { openArchiveDialog } from './archive-dialog.ts';
import { openVersionsDialog } from './versions-dialog.ts';
import { versionsWorthShowing } from './version-row.ts';
import { confirmationForDeleting, confirmationForDestroying } from './note-confirmations.ts';
import { readSession, writeSession } from './app-session.ts';
import {
  type Settings,
  type SettingsFolders,
  createSettingsWriter,
  readSettings,
} from './app-settings.ts';
import { icon } from './icons.ts';
import { type Draft, renderList } from './note-list.ts';
import { deletedStripFor } from './deleted-strip.ts';
import { flashToast } from './toast.ts';
import { archiveStripFor } from './archive-strip.ts';
import {
  type KeptCopies,
  type WhatIsHappening,
  canDelete,
  emptyHintShows,
  keptOf,
  statusFor,
} from './status-line.ts';
import { type FindInText, createFindInText } from './find-in-text.ts';

/** Long enough that he isn't saved mid-word, short enough to never lose a thought. */
const AUTOSAVE_IDLE_MS = 800;

let language: Language;
let words: ReturnType<typeof strings>;
let remember: (openNoteId: string | null) => void;

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
let appearancePanel: OpenPanel | null = null;

/**
 * Puts an appearance on screen, both halves of it.
 *
 * The stylesheet's half and the window's zoom move together here so that the
 * panel, the keyboard and startup can't drift apart on which is in charge.
 */
let showAppearanceOf: (appearance: Appearance) => void;

/**
 * The copy a restore made of what he had, and which text it belongs to.
 *
 * Kept for as long as the app runs and no longer. It answers "where was I
 * before I pressed that", which is a question about this sitting rather than
 * about the file — so it lives here instead of on disk, where it would be one
 * more thing to write, read back, validate and keep true.
 */
let restored: { note: string; version: string } | null = null;

/**
 * His whole corpus, each text carrying the name it keeps for this run.
 *
 * `LiveNote` and not `Note`: a row he clicks already knows which text it is,
 * so opening one never has to ask by filename — the one question that can be
 * answered with "there is no such text" about a text that is right there.
 */
let notes: LiveNote[] = [];
/** Everything he has put away. Held like `notes`, and for the same reason. */
let deleted: DeletedNote[] = [];
/**
 * The archive folders and their counts — names and sizes, never their texts.
 *
 * Read at startup because it decides whether the strip exists at all, and it
 * costs one directory listing per folder. What is *in* them is read only when
 * he asks, which is what `listArchived` is for.
 */
let archives: Archive[] = [];
/**
 * Whether the archive is being read right now.
 *
 * A flag rather than a disabled button, because the strip has no button to
 * disable any more. Reading six hundred texts takes long enough that he can
 * press again before the dialog arrives, and twice would read them twice.
 */
let readingArchive = false;

/**
 * How many copies are kept, and which text they were counted for.
 *
 * Counted rather than read: it decides only what the way to them says and
 * whether it is live, and for most of his texts the answer is none.
 *
 * Carried with its text rather than on its own, so that a count taken for one
 * can never be shown against another. See `keptOf`.
 */
let kept: KeptCopies = { note: NO_NOTE, count: 0 };
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



function draw(): void {
  renderList(listPane, { notes, query: search.value, openId: openName(), draft, language });
  drawDeletedBlock();
  drawArchiveBlock();
}

let findInText: FindInText;


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
    draft = null;
    /*
      Written down again, because the save may have renamed it.
 
      The session file is the one place a name outlives the run, and it was
      only ever written when he opened a text — so rewriting his first line
      left it pointing at a name that had moved, and the text he was last in
      came back as nothing the next morning.
    */
    remember(writing.tokenOf(openHandle));
  }
  // Always, even when nothing was written: a failure is the other thing the
  // strip has to hear about, and it says so on the second one in a row.
  showStatus();
  if (written.length > 0) void reloadAfterWriting();
}

async function reloadAfterWriting(): Promise<void> {
  try {
    notes = await writing.list();
  } catch (error: unknown) {
    log.error('Could not read his texts after saving', describeError(error));
    return;
  }
  draw();
  showStatus();
  // A save may have kept a copy before it landed, which is when the way to
  // them first appears.
  void countKeptOfOpen();
}

function showStatus(): void {
  const now = whatIsHappening();

  deleteNote.disabled = !canDelete(now);
  // Nothing to put on the clipboard, which he reaches regularly: emptying a
  // text is how he deletes, and the copies he keeps are what recover it.
  copyAll.disabled = editor.value.trim().length === 0;
  showVersionsButton();
  emptyHint.textContent = words.emptiedHint;
  emptyHint.hidden = !emptyHintShows(now);
  if (!emptyHint.hidden) pointHintAtDeleteButton();

  statusText.textContent = statusFor(now, language);
  // Shown is said: a thing that has just happened stops being news once he has
  // been told it.
  notice = null;
}

function drawDeletedBlock(): void {
  const strip = deletedStripFor(deleted, search.value, language);
  deletedBlockLabel.textContent = strip.label;
  deletedSee.disabled = !strip.canOpen;
  // The whole strip is the target, so the whole strip has to go quiet with the
  // button: the cursor and the hover are what promise there is something here.
  deletedBlock.classList.toggle('dead', !strip.canOpen);
}

/**
 * The strip is there or it is not — there is no disabled state for it.
 *
 * Nothing he can do makes an archive, so an empty one is not a place he has
 * not been to yet. The label does not move when he searches either: these
 * texts are not in memory, and a count of matches here would be claiming to
 * have looked.
 */
function drawArchiveBlock(): void {
  const strip = archiveStripFor(archives, language);
  archiveBlockLabel.textContent = strip.label;
  archiveBlock.hidden = !strip.present;
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
  openHandle = handle;
  editor.value = note.text;
  savedAt = note.updatedAt;
  draft = null;
  remember(writing.tokenOf(handle));
  editor.setSelectionRange(0, 0);
  editor.scrollTop = 0;
  findInText.fromTheTop();
  findInText.again(search.value);
  findInText.scrollToCurrent();
  draw();
  showStatus();
  void countKeptOfOpen();
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
  remember(null);
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
    await host.copyToClipboard(text);
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
  remember(null);
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

/**
 * Puts the way to his copies within reach, or visibly out of it.
 *
 * Never taken off the strip. Set on its own rather than through the status
 * line, because the count arrives from the disk a moment after everything else
 * and redrawing the whole strip for it would swallow whatever the line had just
 * been given to tell him.
 */
function showVersionsButton(): void {
  /*
    The count, not merely the way in. Whether a text has copies kept of it is
    something he otherwise cannot find out without opening the thing that shows
    them, and the number belongs where that question gets asked.

    Zero is written out like any other. A figure that appears only once it is
    above zero is one he has to have seen before to know what its absence means
    — and the first thing he needs to learn here is that the app keeps copies
    at all.
  */
  const count = keptOf(openHandle, kept);
  seeVersionsLabel.textContent = `${words.versions} (${count})`;
  seeVersions.disabled = count === 0;
}

/** Asks the store how many copies the open text has, and shows the way to them. */
async function countKeptOfOpen(): Promise<void> {
  const asking = openHandle;
  let count = 0;
  if (asking !== NO_NOTE) {
    try {
      count = await writing.countVersions(asking);
    } catch (error: unknown) {
      // The number on a button is not worth failing a startup over, but it is
      // worth saying so: a text whose copies cannot be counted has something
      // wrong with it.
      log.warn('Could not count the copies kept of a text', {
        id: asking,
        failure: describeError(error),
      });
    }
  }
  /*
    He may have moved on while the disk was answering, in which case this
    answer is about a text he is no longer in and would displace a fresher one.

    Against the handle and not the name. Compared against `openName()` this was
    a number against a string: always unequal, so it always returned here and
    the count was never set. The compiler allowed it because both sides can be
    null, which is overlap enough for it and no use at all.
  */
  if (asking !== openHandle) return;
  kept = { note: asking, count };
  showVersionsButton();
}

function showVersions(): void {
  // Read once and narrowed: it is a question now, not a variable.
  const id = openName();
  const handle = openHandle;
  if (versionsPane.open || id === null || handle === NO_NOTE) return;

  void (async () => {
    // A copy that matches his text exactly is not worth offering, and the
    // count on the button cannot know that without reading every file, so the
    // button can be there with nothing behind it. Saying so is better than a
    // press that does nothing.
    const versions = versionsWorthShowing(await writing.versionsOf(handle), editor.value);
    if (versions.length === 0) {
      notice = words.versionsAllSame;
      showStatus();
      return;
    }

    log.info('Looked at the copies kept of a text', { id, copies: versions.length });
    const close = openVersionsDialog(
      versionsPane,
      {
        title: notes.find((note) => note.id === id)?.title ?? words.untitled,
        versions,
        current: editor.value,
        previouslyActive: restored?.note === id ? restored.version : null,
      },
      language,
      {
        onClose: () => {
          close();
          seeVersions.focus();
        },
        onRestore: (version) => {
          close();
          void bringBackVersion(version.text);
        },
      },
    );
  })();
}

/**
 * Puts an old copy back in front of him.
 *
 * Through the editor rather than straight to disk, so the ordinary save carries
 * it out.
 *
 * Not undoable with Ctrl+Z, and deliberately. Setting the value clears the
 * textarea's undo history, which this comment used to claim it did not — but
 * the behaviour is the one we want anyway: bringing a version back is a
 * deliberate act with its own way back, the copy kept below, and not an edit to
 * be reversed by a keystroke he may never have used.
 *
 * The copy of what he has now is taken here rather than left to that save. The
 * save applies the rule built for him editing, which declines when little
 * enough is going and declines again when the newest copy already holds most
 * of it — and measured against the samples it declined on five restores out of
 * eleven, twice on texts where two hundred characters were going. Neither
 * reading fits a whole text replaced on purpose, and the dialog has just
 * promised him in so many words that what is there now will be kept.
 *
 * Nothing is replaced if that copy cannot be written. A restore he was told is
 * safe, carried out unprotected, is the one outcome here worth refusing over.
 */
async function bringBackVersion(text: string): Promise<void> {
  const id = openName();
  const handle = openHandle;
  if (id === null || handle === NO_NOTE) return;

  try {
    restored = { note: id, version: await writing.keepCopy(handle, editor.value) };
  } catch (failure) {
    log.error('Could not keep a copy before bringing a version back', { id, failure });
    notice = words.notRestored;
    showStatus();
    return;
  }

  editor.value = text;
  editor.setSelectionRange(0, 0);
  editor.scrollTop = 0;
  findInText.fromTheTop();
  findInText.again(search.value);
  notice = words.restored;
  typedSomething();
  editor.focus();
  log.info('Brought an earlier version back', { id: openName() });
}

function showDeleted(): void {
  if (deletedPane.open) return;

  log.info('Looked at the texts he has put away', { count: deleted.length });
  const close = openDeletedDialog(deletedPane, { deleted, query: search.value }, language, {
    onClose: () => {
      close();
      deletedSee.focus();
    },
    onRestore: (id: string) => {
      close();
      void restoreNote(id);
    },
    onDestroy: (note: DeletedNote) => {
      askToDestroy(note, close);
    },
  });
}

/**
 * Opens the archive, reading it first.
 *
 * The one place in the app that goes to disk because he pressed something, so
 * it says so: an import can be six hundred texts, and a button that does
 * nothing for a second is a button he presses again.
 */
async function showArchive(): Promise<void> {
  if (archivePane.open || readingArchive) return;

  readingArchive = true;
  let found: ArchivedNote[];
  try {
    found = await writing.archived(new Set(notes.map((note) => note.title)));
  } catch (error: unknown) {
    // A folder that is there and will not open. He gets a line he can read
    // over the telephone; the reason goes where it can be looked at.
    notice = words.archiveUnreadable;
    showStatus();
    log.error('Could not read the archive', describeError(error));
    return;
  } finally {
    readingArchive = false;
  }

  log.info('Looked at the archive', { count: found.length, archives: archives.length });
  const close = openArchiveDialog(archivePane, { archived: found, query: search.value }, language, {
    onClose: () => {
      close();
      // Back to the strip he came in by, which is the control now.
      archiveBlock.focus();
    },
    onBringBack: (note: ArchivedNote) => {
      close();
      void bringBackNote(note);
    },
  });
}

/**
 * Moves one text out of an archive and into his list, then opens it.
 *
 * Opened rather than merely listed, for the same reason a restored text is: he
 * asked for this text, and leaving him to find it in six hundred others would
 * be answering a question with a question.
 */
async function bringBackNote(note: ArchivedNote): Promise<void> {
  // Anything still on its way to disk lands first. Bringing a text in can
  // rename the one he is in — it claims a name in his list — and a save
  // landing afterwards would write his open text back under the old name.
  await writing.flush();

  let back: NoteHandle;
  try {
    back = await writing.bringBack(note.archive, note.id);
    archives = await writing.archives();
    await reload();
  } catch (error: unknown) {
    notice = words.archiveNotBrought;
    showStatus();
    log.error('Could not bring a text in from the archive', {
      archive: note.archive,
      id: note.id,
      failure: describeError(error),
    });
    return;
  }

  log.info('Brought a text in from the archive', { archive: note.archive, from: note.id, id: back });
  notice = words.archiveBrought;
  await open(back);
}

/**
 * Asks before destroying, and asks harder the more there is to lose.
 *
 * The barrier is a word written out rather than a second button, because a
 * second button is still one press and the point is that this one should not be
 * reachable by pressing. Under the threshold it is a plain question: a pile of
 * empty ones has to be clearable, or he will live with the pile.
 */
function askToDestroy(note: DeletedNote, closeDeleted: () => void): void {
  const close = openConfirmDialog(
    confirmPane,
    {
      ...confirmationForDestroying(note, language),
      onConfirm: () => {
        close();
        void destroyNote(note.id, closeDeleted);
      },
      onCancel: () => {
        close();
      },
    },
    language,
  );
}

async function destroyNote(id: string, closeDeleted: () => void): Promise<void> {
  try {
    await writing.destroy(id);
    await reload();
  } catch (error: unknown) {
    // Out of the dialog first, or the line saying so would be behind it. What
    // he was destroying is still in the list, which is the safe way to fail.
    closeDeleted();
    notice = words.notDestroyed;
    showStatus();
    log.error('Could not destroy a text', describeError(error));
    return;
  }
  log.warn('Destroyed a text for good', { id });

  // Back among the rest of them, since he is probably clearing several — unless
  // that was the last one, in which case there is nothing left to come back to.
  closeDeleted();
  if (deleted.length > 0) showDeleted();
  else deletedSee.focus();
}

async function restoreNote(id: string): Promise<void> {
  /*
    Anything still on its way to disk lands first, exactly as putting a text
    away does. Bringing one back can rename the text he is *in* — it takes the
    bare name, so the one already holding it is numbered — and a save that
    fired afterwards would write his open text back under the name it no longer
    has, leaving two copies of it in his list.
  */
  await writing.flush();

  let back: NoteHandle;
  try {
    back = await writing.restore(id);
    await reload();
  } catch (error: unknown) {
    // The dialog has already closed, so the line is his to read.
    notice = words.notRestored;
    showStatus();
    log.error('Could not bring a text back', describeError(error));
    return;
  }

  // Straight into it, and said out loud. He asked for this text; leaving him
  // looking at the list to find it again would be answering a question with a
  // question.
  notice = words.restored;
  await open(back);
  log.info('Brought a text back', { id, back });
}

/** Both lists, after anything that can move a text between them. */
async function reload(): Promise<void> {
  [notes, deleted] = await Promise.all([writing.list(), writing.putAway()]);
  // How many there are, every time it changes. A count in the log is what tells
  // a folder that emptied itself from a man who deleted one text, days later,
  // over the telephone — and it costs one line per delete or restore.
  log.info('The list now holds', { texts: notes.length, deleted: deleted.length });
  draw();
}

function showAppearance(): void {
  if (appearancePanel !== null) return;

  log.info('Opened the appearance panel');
  appearancePanel = openAppearancePanel(appearancePane, settings, language, {
    // Shown, not kept. Nothing reaches the disk until he says so.
    onPreview: showAppearanceOf,

    onKeep: (appearance: Appearance) => {
      settings = { ...settings, ...appearance };
      saveSettings(settings);
      log.info('Changed how the app looks', appearance);
      hideAppearance();
    },

    onCancel: () => {
      // Whatever he was trying out goes back to what he walked in with. It was
      // never saved, so putting it back on screen is the whole of the undo.
      showAppearanceOf(settings);
      hideAppearance();
    },

    onAdvanced: askBeforeAdvanced,
  });
}

/**
 * The question in front of the settings that are not his.
 *
 * A word to type, the same barrier `Uništi zauvek` uses — the point is not
 * that it is hard but that it cannot be walked through. In English, like
 * everything behind it: it is addressed to whoever set the machine up.
 */
function askBeforeAdvanced(): void {
  const close = openConfirmDialog(
    confirmPane,
    {
      title: { mark: 'settings', label: 'Advanced settings' },
      body:
        'These decide where your writing is read from. Getting them wrong makes ' +
        'every text disappear from the list.',
      confirm: 'Continue',
      cancel: 'Cancel',
      phrase: { prompt: 'Type {} to continue.', words: ['advanced'] },
      danger: true,
      onConfirm: () => {
        close();
        showAdvanced();
      },
      onCancel: () => {
        close();
      },
    },
    language,
  );
}

function showAdvanced(): void {
  if (advancedPane.open) return;

  const close = openAdvancedPanel(advancedPane, host, {
    onClose: () => {
      close();
    },
    onKeep: (folders) => {
      close();
      /*
        Started again rather than applied in place. Everything the app is
        holding — which text is open, what it has listed, the copies it has
        counted — belongs to the folder it was read from, and in the packaged
        app the folders are settled before a window exists, so a reload alone
        would be handed the old ones anyway.
      */
      void host
        .rememberFolders(folders)
        .then(() => host.restart())
        .catch((error: unknown) => {
          // English, like the panel it came from: the only person who can have
          // pressed that button reads English.
          notice = 'Could not save the folders. See the log.';
          showStatus();
          log.error('Could not remember the folders', describeError(error));
        });
    },
  });
}

function hideAppearance(): void {
  appearancePanel?.close();
  appearancePanel = null;
  appearanceButton.focus();
}

appearanceButton.addEventListener('click', showAppearance);
copyAll.addEventListener('click', () => {
  void copyWholeText();
});
deleteNote.addEventListener('click', askToDelete);
// On the strip, not the button: a press on the button bubbles up to here, so
// there is one way in rather than two that have to agree.
deletedBlock.addEventListener('click', () => {
  if (!deletedSee.disabled) showDeleted();
});
archiveBlock.addEventListener('click', () => {
  void showArchive();
});
// A real button answers both of these on its own. This one is a strip wearing
// the role, so it has to answer them itself or the archive is mouse-only.
archiveBlock.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  void showArchive();
});
seeVersions.addEventListener('click', showVersions);

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
  const showing = appearancePanel?.current() ?? settings;
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
  if (appearancePanel !== null) {
    appearancePanel.change({ ...showing, zoom });
    return;
  }
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
      // leaving with the window. What should happen instead is the rescue
      // write, which does not exist yet.
      log.error('Could not save before closing', describeError(error));
    }
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
  remember = (openNoteId) => {
    writeSession(host.files, host.appFolder, { openNoteId }).catch((error: unknown) => {
      log.warn('Could not remember which text is open', describeError(error));
    });
  };

  writing = createWriting(host.files, host.writingFolder, log, afterWriting);
  newNoteLabel.textContent = words.newNote;
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
  async function readEverything(): Promise<{
    notes: LiveNote[];
    deleted: DeletedNote[];
    archives: Archive[];
  }> {
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
    const [away, kept] = await Promise.all([writing.putAway(), writing.archives()]);
    return { notes: live, deleted: away, archives: kept };
  }

  function cannotReachHisWriting(because?: string): void {
    showLostTexts(document.body, { folder: host.writingFolder, because }, language, {
      // Straight in, with no word to type. The guard is there to stop idle
      // curiosity, and a man staring at this screen is not idly curious.
      onAdvanced: showAdvanced,
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
    ({ notes, deleted, archives } = await readEverything());
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
  const { openNoteId } = await readSession(host.files, host.appFolder);
  /*
    The one place a name is written down and read back. Everything else holds
    a handle, which means nothing between one run and the next — so this is
    where a name becomes a text again, and where a name that no longer finds
    one simply opens nothing rather than guessing at the nearest.
  */
  const wasOpen = openNoteId === null ? NO_NOTE : writing.handleFor(openNoteId);
  if (wasOpen !== NO_NOTE) {
    await open(wasOpen);
  } else {
    draw();
    showStatus();
  }

  const body = document.body.getBoundingClientRect();
  log.info('Ready', {
    build: BUILD_STAMP,
    notes: notes.length,
    deleted: deleted.length,
    host: host.runMode,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    body: { width: Math.round(body.width), height: Math.round(body.height) },
    devicePixelRatio: window.devicePixelRatio,
  });
}
