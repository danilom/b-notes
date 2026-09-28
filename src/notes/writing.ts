import type { FileSystem } from '../platform/file-system.ts';
import { type Log, describeError } from '../platform/logging.ts';
import type { NoteHandle } from './note-handle.ts';
import { NO_NOTE, type NoNote, createHandles } from './note-handle.ts';
import type {
  Archive,
  ArchivedNote,
  DeletedNote,
  Note,
  NoteVersion,
} from './note.ts';
import { createNoteLibrary } from './note-library.ts';
import { type Naming, createNoteStore } from './note-store.ts';
import { createResophFolder } from './resoph-folder.ts';

/** A text of his, and what it is called while the app runs. */
export interface LiveNote extends Note {
  handle: NoteHandle;
}

/** What the strip along the bottom needs to know about one text. */
export interface WritingState {
  /** Something of his is not on disk yet — typed, waiting, or being attempted. */
  waiting: boolean;
  /** Attempts in a row that have failed. Zero unless something is wrong. */
  failures: number;
}

/**
 * Said on the second failure in a row, not the first.
 *
 * Dropbox holds a file for about a second while it uploads it and Windows
 * refuses to touch one that is held, so a single failure is the ordinary case
 * and the attempt after it succeeds. A warning that clears itself weekly is
 * one he learns to pass over, and then passes over the once it is real.
 */
export const SPEAK_AFTER_FAILURES = 2;

/** Slow, and forever. A save that stopped being attempted is one he was never told about. */
const RETRY_AFTER_MS = [1_000, 3_000, 10_000, 30_000] as const;

/** 800ms after he stops, pushed back by every keystroke. */
const AUTOSAVE_IDLE_MS = 800;

/** Where his texts are read from, and how new ones are named. */
export interface WritingOptions {
  /** His Resoph folder, read and never written. Null where there is none. */
  resophFolder?: string | null;
  naming?: Naming;
}

/** Handed in so a test can hold time still rather than wait it out. */
export interface Timers {
  set: (run: () => void, ms: number) => unknown;
  clear: (timer: unknown) => void;
}

const realTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** One text's words, waiting to be written. */
interface Waiting {
  text: string;
  failures: number;
  timer: unknown;
  /** The wait is over; only the worker is left to run it. */
  due: boolean;
}

export interface Writing {
  /** Everything of his, read once at startup. */
  load(): Promise<{ notes: LiveNote[] }>;
  /** Read again, keeping the handle each text already had. */
  list(): Promise<LiveNote[]>;
  /** A text he has begun that has no file yet. */
  begin(): NoteHandle;
  /** He typed. Nothing reaches disk for 800ms, and the newest words win. */
  save(handle: NoteHandle, text: string): void;
  /** Write what is waiting now — one text, or every one. Never rejects. */
  flush(handle?: NoteHandle): Promise<void>;
  /** What the strip reads. */
  stateOf(handle: NoteHandle): WritingState;
  /** The name a text lives under, for the one place that has to write it down. */
  tokenOf(handle: NoteHandle): string | null;
  /**
   * That name read back, once `load` has minted the handles.
   *
   * For `session.json`, the one place that has to write a name down and read
   * it back next time. A row he clicks carries its own handle, which is both
   * quicker and incapable of answering "no such text" about a text sitting in
   * front of him.
   *
   * `NO_NOTE` and not null when the name finds nothing: null is what a name
   * uses for its own absence, and a handle that could be null could be
   * compared with one — which is the whole fault this pair of types exists to
   * refuse, and it would be back in the one function that turns a name into a
   * text.
   */
  handleFor(token: string): NoteHandle | NoNote;
  /** Everything he has put away, newest first. */
  putAway(): Promise<DeletedNote[]>;
  /** The archive folders and how many texts each holds. Counted, not read. */
  archives(): Promise<Archive[]>;
  /** Every archived text, from every archive. Only when he asks. */
  archived(liveTitles: ReadonlySet<string>): Promise<ArchivedNote[]>;
  /**
   * Out of his list and into Obrisano, with the copies kept of it.
   *
   * Anything of his still waiting is written first, or the copy that lands
   * there is missing his last sentence — and nothing is attempted for it
   * afterwards, or the write would put back the file he just removed.
   */
  discard(handle: NoteHandle): Promise<void>;
  /** Back from Obrisano, under whatever name is free, as a text he can edit. */
  restore(token: string): Promise<NoteHandle>;
  /** Out of an archive and into his list, with its kept copies. */
  bringBack(archive: string, token: string): Promise<NoteHandle>;
  /** Destroyed, along with every copy that went with it. Never from his list. */
  destroy(token: string): Promise<void>;
  /** A copy kept now, whatever the ordinary rule would say. */
  keepCopy(handle: NoteHandle, text: string): Promise<string>;
  /**
   * Moves a text of b-notes' into Resoph, his last words written first. The
   * handle follows it, and from then on names a Resoph text.
   *
   * @throws {ResophMoveRefused} where it cannot go; and plainly, when his last
   *   words could not be written, since moving without them would lose them.
   */
  moveToResoph(handle: NoteHandle): Promise<void>;
  /** How many copies are kept of a text. Counted without reading any. */
  countVersions(handle: NoteHandle): Promise<number>;
  /** Every copy kept of a text, newest first. */
  versionsOf(handle: NoteHandle): Promise<NoteVersion[]>;
  /** Resolves once nothing is being written. Waiting, unstarted work stays waiting. */
  idle(): Promise<void>;
  /** Timers down, nothing further attempted. */
  stop(): void;
}

/**
 * His writing: which texts there are, and when they reach disk.
 *
 * The store below knows files — names, the copies kept of each, taking a text
 * over from Resoph. This knows two things it deliberately does not: that a
 * text stays the same text when the name it is held by changes, as a Resoph
 * text's does when it becomes b-notes' copy, and that a save happens over time
 * and can fail.
 *
 * Both of those lived in the interface, among the drawing, and every fault
 * worth the name came from there: a save fired and never awaited, so two could
 * run at once over a folder one of them was renaming; a failure remembered
 * under a filename, so rewriting his first line made a second entry for one
 * text; words thrown away because a save of *another* text succeeded.
 *
 * @param changed run after every pass of the worker, with whichever texts were
 * written — none of them, when the pass failed. Always, and not only on a
 * write, because a failure changes what the strip along the bottom should say
 * and nothing else would ever tell it.
 */
export function createWriting(
  files: FileSystem,
  folder: string,
  log: Log,
  changed: (written: NoteHandle[]) => void = () => undefined,
  timers: Timers = realTimers,
  options: WritingOptions = {},
): Writing {
  const nextHandle = createHandles();
  /** Where each text lives now. Null for one he has begun and not yet saved. */
  const livesAt = new Map<NoteHandle, string | null>();
  const byToken = new Map<string, NoteHandle>();
  const waiting = new Map<NoteHandle, Waiting>();

  /** The write in progress, or null. A promise so anything can wait for it. */
  let running: Promise<void> | null = null;
  let retry: unknown;

  /**
   * A text now held under another name — a Resoph text that has just become
   * b-notes' own copy. Three lines, because a handle is not a name.
   */
  function renamed(from: string, to: string): void {
    const handle = byToken.get(from);
    if (handle === undefined) return;
    byToken.delete(from);
    byToken.set(to, handle);
    livesAt.set(handle, to);
  }

  const own = createNoteStore(files, folder, log, renamed, options.naming);
  const resophFolder = options.resophFolder ?? null;
  const store = createNoteLibrary(
    own,
    resophFolder === null ? null : createResophFolder(files, resophFolder, log),
    files,
    folder,
    log,
    renamed,
    options.naming,
  );

  function remember(id: string): NoteHandle {
    const known = byToken.get(id);
    if (known !== undefined) return known;
    const handle = nextHandle();
    byToken.set(id, handle);
    livesAt.set(handle, id);
    return handle;
  }

  function scheduleRetry(): void {
    timers.clear(retry);
    const failing = [...waiting.values()].filter((entry) => entry.failures > 0);
    if (failing.length === 0) {
      retry = undefined;
      return;
    }
    const worst = Math.max(...failing.map((entry) => entry.failures));
    const wait = RETRY_AFTER_MS[Math.min(worst, RETRY_AFTER_MS.length) - 1] ?? 30_000;
    retry = timers.set(() => {
      for (const entry of waiting.values()) if (entry.failures > 0) entry.due = true;
      void work();
    }, wait);
  }

  /**
   * One write at a time, ever.
   *
   * Two saves running together is not a rare interleaving to be careful about:
   * `store.save` reads what is on disk, may keep a copy, and the first time a
   * Resoph text is written takes it over and writes a stub, so two of them
   * crossing can take one text over twice or land the older text last. This
   * is the whole of the answer, and the reason saving goes through a queue
   * that normally holds nothing at all.
   */
  function work(): Promise<void> {
    running ??= run().finally(() => {
      running = null;
    });
    return running;
  }

  async function run(): Promise<void> {
    const wrote: NoteHandle[] = [];
    try {
      for (;;) {
        const next = [...waiting].find(([, entry]) => entry.due);
        if (next === undefined) break;
        const [handle, entry] = next;
        waiting.delete(handle);

        const was = livesAt.get(handle) ?? null;
        try {
          const id = await store.save(was, entry.text);
          if (id !== null) {
            byToken.set(id, handle);
            livesAt.set(handle, id);
            /*
              Logged here and not above, because only here are both names
              known. The save itself is never logged — it lands within a second
              of him stopping, and a session would be a thousand identical
              lines — but the part that moves a file is what a telephone call
              turns out to be about.
            */
            if (was === null) log.info('Created a text', { id });
          }
          wrote.push(handle);
        } catch (error: unknown) {
          const failures = entry.failures + 1;
          log.error('Could not save', { failures, error: describeError(error) });
          /*
            Put back only if nothing newer arrived while this was being
            written. His latest words are already waiting in that case, and
            returning the older ones would be worth more than the failed write.
          */
          if (!waiting.has(handle)) {
            waiting.set(handle, { text: entry.text, failures, due: false, timer: null });
          }
          scheduleRetry();
        }
      }
    } finally {
      /*
        Held apart from the writing, because it is the caller's code and a
        throw in it must not come back as a failed save. Closing waits on this
        promise, and a window that will not shut because the strip could not be
        redrawn would be the worst trade in the app.
      */
      try {
        changed(wrote);
      } catch (error: unknown) {
        log.error('Something went wrong reacting to a save', describeError(error));
      }
    }
  }

  /** A token for something still on disk, or a failure he can be told about. */
  function nameOf(handle: NoteHandle): string {
    const id = livesAt.get(handle) ?? null;
    if (id === null) throw new Error('That text has not been written yet');
    return id;
  }

  return {
    async load(): Promise<{ notes: LiveNote[] }> {
      return { notes: await this.list() };
    },

    putAway: () => store.listDeleted(),
    archives: () => store.listArchives(),
    archived: (liveTitles) => store.listArchived(liveTitles),
    destroy: (token) => store.destroy(token),

    async discard(handle: NoteHandle): Promise<void> {
      // His last sentence first, or the copy that lands in Obrisano is missing
      // it. Then nothing more is attempted for this text: a write afterwards
      // would put back the file he has just put away.
      await this.flush(handle);
      const id = nameOf(handle);
      waiting.delete(handle);
      await store.moveToDeleted(id);
      byToken.delete(id);
      livesAt.delete(handle);
    },

    async restore(token: string): Promise<NoteHandle> {
      return remember(await store.restore(token));
    },

    async bringBack(archive: string, token: string): Promise<NoteHandle> {
      return remember(await store.bringBack(archive, token));
    },

    keepCopy: (handle, text) => store.keepCopy(nameOf(handle), text),

    async moveToResoph(handle: NoteHandle): Promise<void> {
      await this.flush(handle);
      // A flush never rejects: what it could not write is still waiting.
      if (waiting.has(handle)) throw new Error('His last words could not be written, so the text was not moved');
      await store.moveToResoph(nameOf(handle));
    },
    countVersions: (handle) => store.countVersions(nameOf(handle)),
    versionsOf: (handle) => store.listVersions(nameOf(handle)),

    async list(): Promise<LiveNote[]> {
      const notes = await store.list();
      return notes.map((note) => ({ ...note, handle: remember(note.id) }));
    },

    begin(): NoteHandle {
      const handle = nextHandle();
      livesAt.set(handle, null);
      return handle;
    },

    save(handle: NoteHandle, text: string): void {
      const already = waiting.get(handle);
      if (already !== undefined) timers.clear(already.timer);
      /*
        The newest words replace the waiting ones rather than queueing behind
        them. A save writes the whole text, so an older one is not work left
        undone — it is the same work, wrong.
      */
      const entry: Waiting = { text, failures: already?.failures ?? 0, timer: null, due: false };
      entry.timer = timers.set(() => {
        entry.due = true;
        void work();
      }, AUTOSAVE_IDLE_MS);
      waiting.set(handle, entry);
    },

    async flush(handle?: NoteHandle): Promise<void> {
      for (const [each, entry] of waiting) {
        if (handle !== undefined && each !== handle) continue;
        timers.clear(entry.timer);
        entry.due = true;
      }
      timers.clear(retry);
      retry = undefined;
      // Never rejects: a failure stays waiting and is read from `stateOf`.
      // Closing a window must not hang on a disk that has stopped answering.
      await work();
    },

    stateOf(handle: NoteHandle): WritingState {
      const entry = waiting.get(handle);
      return { waiting: entry !== undefined, failures: entry?.failures ?? 0 };
    },

    tokenOf(handle: NoteHandle): string | null {
      return livesAt.get(handle) ?? null;
    },

    handleFor(token: string): NoteHandle | NoNote {
      return byToken.get(token) ?? NO_NOTE;
    },

    idle(): Promise<void> {
      return running ?? Promise.resolve();
    },

    stop(): void {
      for (const entry of waiting.values()) timers.clear(entry.timer);
      timers.clear(retry);
      retry = undefined;
    },
  };
}
