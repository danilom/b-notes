import { type Language, describeWhen, strings } from '../language/wording.ts';
import { createNoteStore } from '../notes/note-store.ts';
import { type DeletedNote, type Note, isEmptyText } from '../notes/note.ts';
import { BUILD_STAMP } from '../platform/build-info.ts';
import type { Host } from '../platform/host.ts';
import type { Log } from '../platform/logging.ts';
import {
  type Appearance,
  DEFAULT_APPEARANCE,
  MAX_ZOOM,
  applyAppearance,
  stepScale,
} from './appearance.ts';
import { type OpenPanel, openAppearancePanel } from './appearance-panel.ts';
import { openConfirmDialog } from './confirm-dialog.ts';
import { openDeletedDialog } from './deleted-dialog.ts';
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
import { type WhatIsHappening, canDelete, emptyHintShows, statusFor } from './status-line.ts';
import { type Stepper, createStepper } from './stepper.ts';
import { type TextMatch, foundPanelFor, matchesIn } from './text-match.ts';

/** Long enough that he isn't saved mid-word, short enough to never lose a thought. */
const AUTOSAVE_IDLE_MS = 800;

let language: Language;
let words: ReturnType<typeof strings>;
let remember: (openNoteId: string | null) => void;

/** Both come from the host, and nothing here reaches past it for them. */
let log: Log;

/** Errors don't survive structured cloning intact, so flatten before sending. */
function describeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

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
const deleteNote = element('delete-note', HTMLButtonElement);
const emptyHint = element('empty-hint', HTMLDivElement);
const deleteNoteLabel = element('delete-note-label', HTMLSpanElement);
const deletedBlock = element('deleted-block', HTMLDivElement);
const deletedSee = element('deleted-see', HTMLButtonElement);
const deletedBlockLabel = element('deleted-block-label', HTMLSpanElement);
const confirmPane = element('confirm', HTMLDialogElement);
const deletedPane = element('deleted', HTMLDialogElement);
const versionsPane = element('versions', HTMLDialogElement);
const seeVersions = element('see-versions', HTMLButtonElement);
const seeVersionsLabel = element('see-versions-label', HTMLSpanElement);

/** Built here from whatever filesystem the host provides. */
let store: ReturnType<typeof createNoteStore>;

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

let notes: Note[] = [];
/** Everything he has put away. Held like `notes`, and for the same reason. */
let deleted: DeletedNote[] = [];

/**
 * How many copies are kept of the text he has open.
 *
 * Counted rather than read: it decides only whether the way to them is there at
 * all, and for most of his texts the answer is none.
 */
let keptOfOpen = 0;
let openId: string | null = null;

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
 * list has something to show him immediately; `openId` being null is what
 * actually means "the new one is what's open".
 */
let draft: Draft | null = null;
let savedAt: number | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function draw(): void {
  renderList(listPane, { notes, query: search.value, openId, draft, language });
  drawDeletedBlock();
}

/**
 * Which of the matches in the open text he is standing on.
 *
 * Kept here rather than worked out from the scroll position, because he can
 * scroll away and come back and should not lose his place in the search.
 */
let found: TextMatch[] = [];
let atFound = 0;
/** Built once the words are known, since its buttons are named in them. */
let foundSteps: Stepper;

/**
 * Paints the matches on the layer behind his writing.
 *
 * Built out of text nodes and `mark` elements rather than a string of HTML: his
 * writing is never turned into markup, so there is nothing in it that could be
 * read as markup — no escaping to get right, and no way for a stray angle
 * bracket in an essay to become part of the page.
 */
function markMatches(): void {
  const text = editor.value;
  found = matchesIn(text, search.value);
  atFound = Math.min(atFound, Math.max(0, found.length - 1));

  showFound();

  if (found.length === 0) {
    editorMarks.replaceChildren();
    return;
  }

  const pieces: Node[] = [];
  let at = 0;
  found.forEach(({ start, end }, index) => {
    if (start > at) pieces.push(document.createTextNode(text.slice(at, start)));
    const mark = document.createElement('mark');
    if (index === atFound) mark.className = 'now';
    mark.textContent = text.slice(start, end);
    pieces.push(mark);
    at = end;
  });
  // A trailing newline is not given a line of its own unless something follows
  // it, so the layer would come up a line short of the textarea at the bottom.
  pieces.push(document.createTextNode(`${text.slice(at)}
`));

  editorMarks.replaceChildren(...pieces);
  editorMarks.scrollTop = editor.scrollTop;
}

/**
 * Says where he is among the matches, and offers the way to the next.
 *
 * Shown for a single match as well as for many. Hiding it there was considered
 * and is worse: as he types, the count falls away — 74, 12, 3, 1, none — and a
 * panel that vanished at one would go while a match was still highlighted in
 * front of him, which reads as the match having gone too.
 *
 * The buttons stay for the same reason, greyed rather than gone: they would
 * otherwise appear and disappear as he crosses between one match and two,
 * moving the panel twice in as many keystrokes. "Samo jednom" is what makes
 * that greying legible — there is one, so there is nowhere to go — where
 * "1 od 1" would only have counted him against himself.
 */
function showFound(): void {
  const panel = foundPanelFor(found, atFound, language);
  foundPane.hidden = !panel.shown;
  foundSteps.showing(panel.label, { canGoBack: panel.canGoBack, canGoOn: panel.canGoOn });
}

/**
 * Moves to the match before or after this one, round the ends.
 *
 * Stopping at the ends rather than wrapping. Wrapping kept both buttons alive,
 * but a list that silently starts over is worse than a button that is visibly
 * spent: he presses on, lands back at the first match, and has no way of
 * telling whether he has seen them all or lost his place. The greyed-out
 * button says where the end is before he reaches for it.
 */
function stepThroughFound(direction: 1 | -1): void {
  const next = atFound + direction;
  if (next < 0 || next >= found.length) return;
  atFound = next;
  markMatches();
  scrollToCurrentMatch();
}

/**
 * Brings the current match into view.
 *
 * A textarea cannot say where a character has ended up on screen, so the
 * position comes from the layer behind it, which is laid out identically and is
 * made of elements that can be asked. Placed a third of the way down rather than
 * at the very top, so he can see what comes before it and know where he is.
 */
function scrollToCurrentMatch(): void {
  const mark = editorMarks.querySelector('mark.now');
  if (!(mark instanceof HTMLElement)) return;

  const target = mark.offsetTop - editor.clientHeight / 3;
  editor.scrollTop = Math.max(0, target);
  editorMarks.scrollTop = editor.scrollTop;
}

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
  return { openId, text: editor.value, savedAt, saving: saveTimer !== undefined, notice };
}

function showStatus(): void {
  const now = whatIsHappening();

  deleteNote.disabled = !canDelete(now);
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

async function saveNow(): Promise<void> {
  const text = editor.value;
  const id = await store.save(openId, text);
  if (id === null) return;

  const wasNew = openId === null;
  openId = id;
  savedAt = Date.now();
  draft = null;
  remember(id);

  // Reload rather than patch: saving can rename the note, which moves it in the
  // list, and a stale entry is exactly the kind of thing that reads as loss.
  notes = await store.list();
  draw();
  showStatus();
  // A save may have kept a copy before it landed, which is when the way to them
  // first appears.
  void countKeptOfOpen();
  if (wasNew) log.info('Created a text', { id });
}

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    saveNow().catch((error: unknown) => {
      statusText.textContent = words.notSaved;
      log.error('Could not save', describeError(error));
    });
  }, AUTOSAVE_IDLE_MS);
  showStatus();
}

async function open(id: string): Promise<void> {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    await saveNow();
  }

  const note = notes.find((candidate) => candidate.id === id);
  if (note === undefined) return;

  openId = id;
  editor.value = note.text;
  savedAt = note.updatedAt;
  draft = null;
  remember(id);
  editor.setSelectionRange(0, 0);
  editor.scrollTop = 0;
  atFound = 0;
  markMatches();
  scrollToCurrentMatch();
  keptOfOpen = 0;
  draw();
  showStatus();
  void countKeptOfOpen();
  log.info('Opened a text', { id });
}

listPane.addEventListener('click', (event) => {
  const row = (event.target as Element | null)?.closest('.note');
  const id = row instanceof HTMLElement ? row.dataset['id'] : undefined;
  if (id !== undefined) void open(id);
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
  stepThroughFound(event.shiftKey ? -1 : 1);
});

editor.addEventListener('scroll', () => {
  editorMarks.scrollTop = editor.scrollTop;
});

// The box changes with the window, and the marks have to be re-fitted to it.
window.addEventListener('resize', () => {
  markMatches();
});

editor.addEventListener('input', () => {
  // He can also start a new text simply by typing, without going near the
  // button. Either way it belongs in the list from the first keystroke.
  if (openId === null && draft === null) {
    draft = { startedAt: Date.now() };
    draw();
  }
  markMatches();
  scheduleSave();
});

/**
 * Everything that has to follow a change to what he is looking for.
 *
 * Shared by the search box and by the way out beside his text, so the two can't
 * come to mean different things.
 */
function searchChanged(): void {
  // A fresh search starts at the top of the text again.
  atFound = 0;
  draw();

  // And at the top of the list. What he found goes above everything else, so
  // searching from five thousand pixels down would put the answer off-screen
  // above him with nothing on screen having changed — which reads as the search
  // having done nothing, or the word not being there. Nothing else moves the
  // list: opening a text and saving one both leave him where he was.
  listPane.scrollTop = 0;
  markMatches();
  // Only on a fresh search: once he is reading, moving the page under him would
  // be the app taking the text away from where he had put it.
  scrollToCurrentMatch();
}

search.addEventListener('input', searchChanged);



newNote.addEventListener('click', () => {
  openId = null;
  savedAt = null;
  // A new text has no copies. Left alone, the count belonged to whatever he was
  // in before, and the way to that text's copies stayed live over this one.
  keptOfOpen = 0;
  editor.value = '';
  editorMarks.replaceChildren();
  found = [];
  showFound();

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
  const id = openId;
  if (id === null) return;
  const note = notes.find((candidate) => candidate.id === id);
  if (note === undefined) return;

  const close = openConfirmDialog(
    confirmPane,
    {
      ...confirmationForDeleting(note, language),
      onConfirm: () => {
        close();
        void deleteOpenNote(id);
      },
      onCancel: () => {
        close();
        deleteNote.focus();
      },
    },
    language,
  );
}

async function deleteOpenNote(id: string): Promise<void> {
  try {
    // Anything still on its way to disk lands first. Putting away a file while
    // a save is in flight would write the text back where it no longer lives.
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      await saveNow();
    }
    await store.moveToDeleted(id);
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

  openId = null;
  editor.value = '';
  savedAt = null;
  draft = null;
  remember(null);
  await reload();
  markMatches();
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
  seeVersions.disabled = keptOfOpen === 0;
}

/** Asks the store how many copies the open text has, and shows the way to them. */
async function countKeptOfOpen(): Promise<void> {
  const asking = openId;
  const kept = asking === null ? 0 : await store.countVersions(asking).catch(() => 0);
  // He may have moved on while the disk was answering.
  if (asking !== openId) return;
  keptOfOpen = kept;
  showVersionsButton();
}

function showVersions(): void {
  if (versionsPane.open || openId === null) return;
  const id = openId;

  void (async () => {
    // A copy that matches his text exactly is not worth offering, and the
    // count on the button cannot know that without reading every file, so the
    // button can be there with nothing behind it. Saying so is better than a
    // press that does nothing.
    const versions = versionsWorthShowing(await store.listVersions(id), editor.value);
    if (versions.length === 0) {
      notice = words.versionsAllSame;
      showStatus();
      return;
    }

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
  const id = openId;
  if (id === null) return;

  try {
    restored = { note: id, version: await store.keepCopy(id, editor.value) };
  } catch (failure) {
    log.error('Could not keep a copy before bringing a version back', { id, failure });
    notice = words.notRestored;
    showStatus();
    return;
  }

  editor.value = text;
  editor.setSelectionRange(0, 0);
  editor.scrollTop = 0;
  atFound = 0;
  markMatches();
  notice = words.restored;
  scheduleSave();
  editor.focus();
  log.info('Brought an earlier version back', { id: openId });
}

function showDeleted(): void {
  if (deletedPane.open) return;

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
    await store.destroy(id);
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
  let back: string;
  try {
    back = await store.restore(id);
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
  [notes, deleted] = await Promise.all([store.list(), store.listDeleted()]);
  draw();
}

function showAppearance(): void {
  if (appearancePanel !== null) return;

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
  });
}

function hideAppearance(): void {
  appearancePanel?.close();
  appearancePanel = null;
  appearanceButton.focus();
}

appearanceButton.addEventListener('click', showAppearance);
deleteNote.addEventListener('click', askToDelete);
// On the strip, not the button: a press on the button bubbles up to here, so
// there is one way in rather than two that have to agree.
deletedBlock.addEventListener('click', () => {
  if (!deletedSee.disabled) showDeleted();
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
export async function startApp(host: Host): Promise<void> {
  log = host.log;
  reportUncaught();

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

  store = createNoteStore(host.files, host.writingFolder);
  newNoteLabel.textContent = words.newNote;
  foundSteps = createStepper(
    { previous: words.foundPrevious, next: words.foundNext, close: words.clearSearch },
    {
      onPrevious: () => stepThroughFound(-1),
      onNext: () => stepThroughFound(1),
      // The whole search, not merely these marks. Stopping the highlighting
      // while the list stayed filtered would leave two thirds of his texts
      // missing with nothing on screen left to explain why.
      onClose: () => {
        search.value = '';
        searchChanged();
      },
    },
  );
  foundPane.append(foundSteps.root);
  newNote.prepend(icon('new-text'));
  appearanceLabel.textContent = words.appearance;
  deleteNoteLabel.textContent = words.deleteNote;
  deletedSee.textContent = words.deletedSee;
  seeVersionsLabel.textContent = words.versions;
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

  // Before anything is listed: a note still in another format is one he can't
  // open without this app, which is the guarantee .txt was chosen for.
  const converted = await store.convertToPlainText();
  if (converted.converted > 0) log.info('Put texts into plain text', { count: converted.converted });
  if (converted.refused.length > 0) {
    log.warn('Could not convert some texts, so they are not in the list', converted.refused);
  }

  // Emptied texts used to be swept away here, on the reading that clearing one
  // was how he deleted. His old archive says otherwise — 95 texts deliberately
  // put in the trash against 8 emptied ones left sitting in the list — so an
  // empty text now stays where he left it, and the status line points him at
  // the button for getting rid of it.
  [notes, deleted] = await Promise.all([store.list(), store.listDeleted()]);

  // Reopen what he was last in. The search is deliberately not restored — a
  // filtered list on startup looks exactly like texts having gone missing.
  const { openNoteId } = await readSession(host.files, host.appFolder);
  if (openNoteId !== null && notes.some((note) => note.id === openNoteId)) {
    await open(openNoteId);
  } else {
    draw();
    showStatus();
  }

  const body = document.body.getBoundingClientRect();
  log.info('Ready', {
    build: BUILD_STAMP,
    notes: notes.length,
    deleted: deleted.length,
    host: host.name,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    body: { width: Math.round(body.width), height: Math.round(body.height) },
    devicePixelRatio: window.devicePixelRatio,
  });
}
