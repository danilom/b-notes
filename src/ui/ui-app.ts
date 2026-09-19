import { type Language, describeWhen, strings } from '../language/wording.ts';
import { createNoteStore } from '../notes/note-store.ts';
import { type Note, isEmptied } from '../notes/note.ts';
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
import { readSession, writeSession } from './app-session.ts';
import {
  type Settings,
  type SettingsFolders,
  createSettingsWriter,
  readSettings,
} from './app-settings.ts';
import { icon } from './icons.ts';
import { type Draft, renderList } from './note-list.ts';
import { type TextMatch, matchesIn } from './text-match.ts';

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

function textIn(words: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = words;
  return span;
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
const foundAt = element('found-at', HTMLSpanElement);
const foundPrevious = element('found-previous', HTMLButtonElement);
const foundNext = element('found-next', HTMLButtonElement);
const statusText = element('status-text', HTMLSpanElement);
const search = element('search', HTMLInputElement);
const newNote = element('new-note', HTMLButtonElement);
const newNoteLabel = element('new-note-label', HTMLSpanElement);
const appearanceButton = element('appearance-button', HTMLButtonElement);
const appearanceLabel = element('appearance-label', HTMLSpanElement);
const appearancePane = element('appearance', HTMLDivElement);

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

let notes: Note[] = [];
let openId: string | null = null;

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
}

/**
 * Which of the matches in the open text he is standing on.
 *
 * Kept here rather than worked out from the scroll position, because he can
 * scroll away and come back and should not lose his place in the search.
 */
let found: TextMatch[] = [];
let atFound = 0;

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
 * "1. od 1" would only have stated an ordinal of itself.
 */
function showFound(): void {
  foundPane.hidden = found.length === 0;
  if (found.length === 0) return;

  const alone = found.length === 1;
  foundAt.textContent = alone ? words.foundOnce : words.foundAt(atFound + 1, found.length);
  foundPrevious.disabled = alone;
  foundNext.disabled = alone;
}

/**
 * Moves to the match before or after this one, round the ends.
 *
 * Wrapping rather than stopping, so neither button is ever a dead one — and
 * because the alternative is him pressing a button that does nothing and
 * concluding the app has stopped working.
 */
function stepThroughFound(direction: 1 | -1): void {
  if (found.length === 0) return;
  atFound = (atFound + direction + found.length) % found.length;
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

function showStatus(): void {
  // Nothing open and nothing typed: there is no state to report yet, and the
  // line is for reporting, not for telling him to get on with it.
  if (openId === null && editor.value.trim().length === 0) {
    statusText.textContent = '';
    return;
  }
  if (saveTimer !== undefined) {
    statusText.textContent = words.saving;
    return;
  }
  statusText.textContent =
    savedAt === null
      ? words.notSaved
      : words.savedAgo(describeWhen(savedAt, language));
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
  draw();
  showStatus();
  log.info('Opened a text', { id });
}

listPane.addEventListener('click', (event) => {
  const row = (event.target as Element | null)?.closest('.note');
  const id = row instanceof HTMLElement ? row.dataset['id'] : undefined;
  if (id !== undefined) void open(id);
});

foundPrevious.addEventListener('click', () => {
  stepThroughFound(-1);
});

foundNext.addEventListener('click', () => {
  stepThroughFound(1);
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

search.addEventListener('input', () => {
  // A fresh search starts at the top of the text again.
  atFound = 0;
  draw();
  markMatches();
  // Only on a fresh search: once he is reading, moving the page under him would
  // be the app taking the text away from where he had put it.
  scrollToCurrentMatch();
});

newNote.addEventListener('click', () => {
  openId = null;
  savedAt = null;
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
  foundPrevious.append(icon('previous'), textIn(words.foundPrevious));
  foundNext.append(icon('next'), textIn(words.foundNext));
  newNote.prepend(icon('new-text'));
  appearanceLabel.textContent = words.appearance;
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

  notes = await store.list();

  // Emptied notes are put away at startup, never while he's working — a note
  // vanishing moments after he cleared it is the unexplained movement that
  // unsettles him. An empty row tells him nothing either way.
  const emptied = notes.filter(isEmptied);
  if (emptied.length > 0) {
    for (const note of emptied) await store.moveToDeleted(note.id);
    notes = await store.list();
    log.info('Put emptied texts away', { count: emptied.length });
  }

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
    host: host.name,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    body: { width: Math.round(body.width), height: Math.round(body.height) },
    devicePixelRatio: window.devicePixelRatio,
  });
}
