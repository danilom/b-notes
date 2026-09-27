import type { Host } from '../platform/host.ts';
import { codesFor, legendOf, pathsOf } from './test-mode-codes.ts';
import { type Whereabouts, readWhereabouts } from './test-mode-whereabouts.ts';

/**
 * Test mode on screen: where each text lives, over the list, for whoever is
 * testing — and a tag saying test mode is on, so it is never left on unseen.
 *
 * Deliberately unlike the rest of the app: dark monospace whatever the mode,
 * English, and never taking a pixel from the layout. The badges float over
 * their rows, so the list is laid out exactly as it is with test mode off, and
 * what is being tested is what he gets.
 *
 * Its styles come with it rather than living in `interface.css`, so that none
 * of test mode is in the stylesheet or the page the app ships with.
 */
export interface TestMode {
  /** The list was drawn: marks its rows, and reads the folders again when his texts have changed. */
  drawn(notes: readonly unknown[]): void;
}

const STYLES = `
#list .note[data-id] { position: relative; }
.test-mode-badge {
  position: absolute; top: -1px; right: 2px; z-index: 1;
  padding: 0 4px; border-radius: 3px;
  background: #1b1d21; color: #e6e6e6; font: 10px/1.2 Consolas, monospace;
  white-space: nowrap; opacity: 0.9; cursor: help;
}
.test-mode-tools { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.test-mode-tag {
  padding: 1px 5px; border-radius: 3px;
  background: #b3261e; color: #ffffff; font: 11px Consolas, monospace;
}
.test-mode-files {
  padding: 2px 8px; border: 1px solid #3a3d44; border-radius: 4px;
  background: #1b1d21; color: #e6e6e6; font: 12px Consolas, monospace; cursor: pointer;
}
`;

/**
 * @param say shows a line to whoever pressed something, in the app's own toast.
 */
export function startTestMode(host: Host, listPane: HTMLElement, say: (said: string, how: string) => void): TestMode {
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.append(style);
  addTools(host, say);

  let whereabouts = new Map<string, Whereabouts>();
  let listed: readonly unknown[] | null = null;
  let asked = 0;

  const markAll = (): void => {
    for (const row of listPane.querySelectorAll<HTMLElement>('.note[data-id]')) {
      mark(row, whereabouts.get(row.dataset['id'] ?? ''));
    }
  };

  async function readAgain(): Promise<void> {
    const asking = ++asked;
    let found: Map<string, Whereabouts>;
    try {
      found = await readWhereabouts(host.files, host.notesFolder, host.resophFolder);
    } catch (failure: unknown) {
      host.log.warn('Test mode could not read where the texts are', { failure });
      return;
    }
    // A later reading has started since: it will be the one that counts.
    if (asking !== asked) return;
    whereabouts = found;
    markAll();
  }

  return {
    drawn(notes) {
      markAll();
      if (notes === listed) return;
      listed = notes;
      void readAgain();
    },
  };
}

/** A row's badge, over its corner, and the paths when the row is hovered. */
function mark(row: HTMLElement, where: Whereabouts | undefined): void {
  row.querySelector(':scope > .test-mode-badge')?.remove();
  if (where === undefined) return;
  const codes = codesFor(where);
  const badge = document.createElement('span');
  badge.className = 'test-mode-badge';
  badge.textContent = codes.map(({ code }) => code).join(' ');
  badge.title = legendOf(codes);
  row.title = pathsOf(where);
  row.append(badge);
}

/**
 * The tag, and the file list, at the empty end of the sidebar toolbar — the
 * one piece of the app with room to spare, so adding them moves nothing.
 */
function addTools(host: Host, say: (said: string, how: string) => void): void {
  const tools = document.createElement('span');
  tools.className = 'test-mode-tools';

  const tag = document.createElement('span');
  tag.className = 'test-mode-tag';
  tag.textContent = '[test-mode]';
  tag.title = 'Test mode is on, on this machine. Switch it off in Advanced settings.';

  const files = document.createElement('button');
  files.type = 'button';
  files.className = 'test-mode-files';
  files.textContent = 'files';
  files.addEventListener('click', () => {
    if (host.testTools === null) {
      say('[test-mode] Browser-only test feature', 'The file list shows the browser build’s pretend files.');
      return;
    }
    host.testTools.toggleFiles();
  });

  tools.append(tag, files);
  (document.getElementById('toolbar') ?? document.body).append(tools);
}
