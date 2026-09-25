import type { FileSystem } from '../platform/file-system.ts';
import { type Log, describeError } from '../platform/logging.ts';
import type { Handle } from './note-handle.ts';
import { createHandles } from './note-handle.ts';
import type { Note, NoteStore } from './note.ts';
import { createNoteStore } from './note-store.ts';

/** A text of his, and what it is called while the app runs. */
export interface LiveNote extends Note {
  handle: Handle;
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
  /** Everything of his, read once. Handles are minted here and nowhere else. */
  load(): Promise<LiveNote[]>;
  /** Read again, keeping the handle each text already had. */
  list(): Promise<LiveNote[]>;
  /** A text he has begun that has no file yet. */
  begin(): Handle;
  /** He typed. Nothing reaches disk for 800ms, and the newest words win. */
  save(handle: Handle, text: string): void;
  /** Write what is waiting now — one text, or every one. Never rejects. */
  flush(handle?: Handle): Promise<void>;
  /** What the strip reads. */
  stateOf(handle: Handle): WritingState;
  /** The name a text lives under, for the one place that has to write it down. */
  tokenOf(handle: Handle): string | null;
  /** That name read back, once `load` has minted the handles. */
  handleFor(token: string): Handle | null;
  /** The store underneath, while the rest of the app still speaks to it directly. */
  readonly store: NoteStore;
  /** Resolves once nothing is being written. Waiting, unstarted work stays waiting. */
  idle(): Promise<void>;
  /** Timers down, nothing further attempted. */
  stop(): void;
}

/**
 * His writing: which texts there are, and when they reach disk.
 *
 * The store below knows files — names, renames, the numbering of same-named
 * texts, the copies kept of each. This knows two things it deliberately does
 * not: that a text stays the same text when its name changes, and that a save
 * happens over time and can fail.
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
  changed: (written: Handle[]) => void = () => undefined,
  timers: Timers = realTimers,
): Writing {
  const nextHandle = createHandles();
  /** Where each text lives now. Null for one he has begun and not yet saved. */
  const livesAt = new Map<Handle, string | null>();
  const byToken = new Map<string, Handle>();
  const waiting = new Map<Handle, Waiting>();

  /** The write in progress, or null. A promise so anything can wait for it. */
  let running: Promise<void> | null = null;
  let retry: unknown;

  /**
   * A text renaming itself, or being renamed by someone else's save.
   *
   * The second is the one that was invisible: a second `Pismo` makes the first
   * `Pismo (1)`, and whatever held that first text by name was wrong from that
   * moment. Here it is three lines, because a handle is not a name.
   */
  function renamed(from: string, to: string): void {
    const handle = byToken.get(from);
    if (handle === undefined) return;
    byToken.delete(from);
    byToken.set(to, handle);
    livesAt.set(handle, to);
  }

  const store = createNoteStore(files, folder, log, renamed);

  function remember(id: string): Handle {
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
   * `store.save` reads the folder, plans a rename and may keep a copy, so two
   * of them crossing can rename against each other or land the older text
   * last. This is the whole of the answer, and the reason saving goes through
   * a queue that normally holds nothing at all.
   */
  function work(): Promise<void> {
    running ??= run().finally(() => {
      running = null;
    });
    return running;
  }

  async function run(): Promise<void> {
    const wrote: Handle[] = [];
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
            else if (was !== id) log.info('Renamed a text, since his first line changed', {
              from: was,
              to: id,
            });
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
      changed(wrote);
    }
  }

  return {
    store,

    async load(): Promise<LiveNote[]> {
      // Both of these are startup housekeeping that a caller should not have
      // to know to call, and in what order.
      await store.convertToPlainText();
      await store.settleNames();
      return this.list();
    },

    async list(): Promise<LiveNote[]> {
      const notes = await store.list();
      return notes.map((note) => ({ ...note, handle: remember(note.id) }));
    },

    begin(): Handle {
      const handle = nextHandle();
      livesAt.set(handle, null);
      return handle;
    },

    save(handle: Handle, text: string): void {
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

    async flush(handle?: Handle): Promise<void> {
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

    stateOf(handle: Handle): WritingState {
      const entry = waiting.get(handle);
      return { waiting: entry !== undefined, failures: entry?.failures ?? 0 };
    },

    tokenOf(handle: Handle): string | null {
      return livesAt.get(handle) ?? null;
    },

    handleFor(token: string): Handle | null {
      return byToken.get(token) ?? null;
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
