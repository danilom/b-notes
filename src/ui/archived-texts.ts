import { type Language, strings } from '../language/wording.ts';
import type { NoteHandle } from '../notes/note-handle.ts';
import type { Archive, ArchivedNote } from '../notes/note.ts';
import type { Writing } from '../notes/writing.ts';
import { type Log, describeError } from '../platform/logging.ts';
import { openArchiveDialog } from './archive-dialog.ts';
import { archiveStripFor } from './archive-strip.ts';

export interface ArchivedParts {
  pane: HTMLDialogElement;
  /** The footnote under his list, which is there or is not. */
  strip: HTMLElement;
  stripLabel: HTMLElement;
  writing: Writing;
  log: Log;
  languageNow: () => Language;
  /** The titles already in his list, so the dialog can say which it has too. */
  liveTitlesNow: () => ReadonlySet<string>;
  queryNow: () => string;
  refresh: () => Promise<void>;
  openText: (handle: NoteHandle) => Promise<void>;
  say: (notice: string) => void;
}

export interface ArchivedTexts {
  /** Count the archives without reading what is in them. */
  read(): Promise<void>;
  /** Paint the footnote from what was last counted. */
  drawStrip(): void;
  /** Open the archive, reading it first. */
  show(): Promise<void>;
}

/**
 * The texts set aside in an archive, and the way one comes back.
 *
 * Counted at startup and read only when he asks: an import is mostly older
 * copies of what he already has, and reading six hundred of them before his
 * writing appears would spend that second on the one thing he did not ask for.
 */
export function createArchivedTexts(parts: ArchivedParts): ArchivedTexts {
  const { pane, strip, stripLabel, writing, log } = parts;

  let archives: Archive[] = [];
  /**
   * Whether a read is already running.
   *
   * Reading six hundred texts takes long enough that he can press again before
   * the dialog arrives, and twice would read them twice.
   */
  let reading = false;

  function drawStrip(): void {
    const shape = archiveStripFor(archives, parts.languageNow());
    stripLabel.textContent = shape.label;
    strip.hidden = !shape.present;
  }

  async function bringBack(note: ArchivedNote): Promise<void> {
    const words = strings(parts.languageNow());
    // Anything still on its way to disk lands first. Bringing a text in can
    // rename the one he is in — it claims a name in his list — and a save
    // landing afterwards would write his open text back under the old name.
    await writing.flush();

    let back: NoteHandle;
    try {
      back = await writing.bringBack(note.archive, note.id);
      archives = await writing.archives();
      await parts.refresh();
    } catch (error: unknown) {
      parts.say(words.archiveNotBrought);
      log.error('Could not bring a text in from the archive', {
        archive: note.archive,
        id: note.id,
        failure: describeError(error),
      });
      return;
    }

    log.info('Brought a text in from the archive', {
      archive: note.archive,
      from: note.id,
      id: back,
    });
    parts.say(words.archiveBrought);
    await parts.openText(back);
  }

  /**
   * Opens the archive, reading it first.
   *
   * The one place in the app that goes to disk because he pressed something,
   * so it says so: an import can be six hundred texts, and a button that does
   * nothing for a second is a button he presses again.
   */
  async function show(): Promise<void> {
    if (pane.open || reading) return;
    const words = strings(parts.languageNow());

    reading = true;
    let found: ArchivedNote[];
    try {
      found = await writing.archived(parts.liveTitlesNow());
    } catch (error: unknown) {
      // A folder that is there and will not open. He gets a line he can read
      // over the telephone; the reason goes where it can be looked at.
      parts.say(words.archiveUnreadable);
      log.error('Could not read the archive', describeError(error));
      return;
    } finally {
      reading = false;
    }

    log.info('Looked at the archive', { count: found.length, archives: archives.length });
    const close = openArchiveDialog(
      pane,
      { archived: found, query: parts.queryNow() },
      parts.languageNow(),
      {
        onClose: () => {
          close();
          // Back to the strip he came in by, which is the control now.
          strip.focus();
        },
        onBringBack: (note: ArchivedNote) => {
          close();
          void bringBack(note);
        },
      },
    );
  }

  return {
    async read(): Promise<void> {
      archives = await writing.archives();
    },

    drawStrip,
    show,
  };
}
