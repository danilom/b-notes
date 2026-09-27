import type { OtherEditor, OtherEditors, ResophTray } from '../../platform/other-editors.ts';

const KEY = 'b-notes:mock-running';

/**
 * The browser build's stand-in for Resoph, Notepad and Obsidian: nothing is
 * running unless a test says so, with `pretendRunning` on the window. Kept in
 * the page's storage so a test can set it before the page starts.
 *
 * `stubborn` makes the pretend programs ignore being asked to close, which is
 * what a Notepad waiting on "save changes?" looks like from here.
 */
function readRunning(): { running: OtherEditor[]; stubborn: boolean } {
  try {
    const held: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    if (typeof held !== 'object' || held === null) return { running: [], stubborn: false };
    const { running, stubborn } = held as { running?: unknown; stubborn?: unknown };
    return {
      running: Array.isArray(running) ? (running.filter((each) => typeof each === 'string') as OtherEditor[]) : [],
      stubborn: stubborn === true,
    };
  } catch (failure: unknown) {
    console.warn('Could not read the pretend programs', failure);
    return { running: [], stubborn: false };
  }
}

/** Resoph's tray setting as the browser build pretends it, set with `pretendTray`. */
const TRAY_KEY = 'b-notes:mock-tray';

function readTray(): ResophTray {
  try {
    const held: unknown = JSON.parse(window.localStorage.getItem(TRAY_KEY) ?? 'null');
    if (typeof held !== 'object' || held === null) return { on: null, switchedOffAt: null };
    const { on, switchedOffAt } = held as { on?: unknown; switchedOffAt?: unknown };
    return {
      on: typeof on === 'boolean' ? on : null,
      switchedOffAt: typeof switchedOffAt === 'number' ? switchedOffAt : null,
    };
  } catch (failure: unknown) {
    console.warn('Could not read the pretend tray setting', failure);
    return { on: null, switchedOffAt: null };
  }
}

export function pretendTray(tray: ResophTray): void {
  window.localStorage.setItem(TRAY_KEY, JSON.stringify(tray));
}

export function pretendRunning(running: OtherEditor[], stubborn = false): void {
  window.localStorage.setItem(KEY, JSON.stringify({ running, stubborn }));
}

export function createMockOtherEditors(): OtherEditors {
  return {
    // The browser has no Resoph settings, unless a test pretends it has.
    resophTray: async () => readTray(),
    running: async () => readRunning().running,
    async close(which: readonly OtherEditor[]): Promise<void> {
      const now = readRunning();
      if (now.stubborn) return;
      pretendRunning(
        now.running.filter((each) => !which.includes(each)),
        false,
      );
    },
  };
}
