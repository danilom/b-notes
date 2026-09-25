import { type Shown, showAsModal } from '../parts/modal.ts';
import { APP_VERSION, BUILD_STAMP } from '../../platform/build-info.ts';
import type { Host } from '../../platform/host.ts';
import { icon } from '../parts/icons.ts';

/**
 * The one surface in this app that is not written for him.
 *
 * Everywhere else, showing a filename, a path or a file dialog is on the list
 * of things the app must never do. This shows three paths and opens a picker,
 * because its reader is whoever set the machine up — probably years ago,
 * probably standing in his living room, probably with no checkout to hand.
 *
 * So it is in English, and only English. The rest of the app is bilingual
 * because he reads Serbian; this has one reader and one shape, and a panel that
 * needed its wording tuned in two languages would be a panel nobody maintained.
 *
 * Nothing is applied until the one button at the bottom, which then starts the
 * app again. Both halves are deliberate: the folders decide where his six
 * hundred texts are read from, so a half-applied change is not a thing to
 * discover live — and every piece of state the app is holding, from which text
 * is open to what it has listed, belongs to the old folder the moment the new
 * one is chosen. Starting again is cheaper than unpicking all of it correctly.
 */
export interface AdvancedHandlers {
  onClose: () => void;
  onKeep: (folders: { writing: string; logs: string }) => void;
}

/** A path, and the way to look at it. */
function folderRow(
  label: string,
  path: string,
  host: Host,
  change: ((to: string) => void) | null,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'advanced-row';

  const name = document.createElement('span');
  name.className = 'advanced-label';
  name.textContent = label;

  // A link because it behaves like one: it opens the thing it names. Windows
  // has the only folder window worth opening, so a browser tab says so instead.
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'advanced-path';
  open.title = 'Open in Explorer';
  open.textContent = path;
  open.addEventListener('click', () => {
    void host.openFolder(path).catch((failure: unknown) => {
      host.log.warn('Could not open a folder', { path, failure });
    });
  });

  /*
    Said on the row rather than only when it fails later.

    A path that is not a place looks exactly like one that is, and the app
    started from it shows an empty list — which is the catastrophe as far as he
    is concerned. Checked as the panel is drawn, so a folder typed or picked
    wrongly is caught before Apply rather than after a restart.
  */
  const missing = document.createElement('span');
  missing.className = 'advanced-missing';
  missing.textContent = 'not found';
  missing.hidden = true;
  void host.files
    .folderExists(path)
    .then((there) => {
      missing.hidden = there;
    })
    .catch((failure: unknown) => {
      host.log.warn('Could not check whether a folder is there', { path, failure });
    });

  row.append(name, open, missing);

  if (change !== null) {
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'advanced-change';
    pick.textContent = 'Change…';
    pick.addEventListener('click', () => {
      void (async () => {
        let chose: string | null = null;
        try {
          chose = await host.chooseFolder(path);
        } catch (failure: unknown) {
          host.log.warn('Could not ask for a folder', { failure });
        }
        if (chose !== null && chose.trim().length > 0) change(chose.trim());
      })();
    });
    row.append(pick);
  }

  return row;
}

export function openAdvancedPanel(
  container: HTMLDialogElement,
  host: Host,
  handlers: AdvancedHandlers,
): () => void {
  let writing = host.writingFolder;
  let logs = host.logsFolder;

  let modal: Shown | null = null;
  const close = (): void => {
    modal?.close();
  };

  const panel = document.createElement('div');
  panel.className = 'panel advanced-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  function fill(): void {
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'Advanced settings';

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'close';
    dismiss.title = 'Close';
    dismiss.setAttribute('aria-label', 'Close');
    dismiss.append(icon('close'));
    dismiss.addEventListener('click', handlers.onClose);
    header.append(title, dismiss);

    // Loud on purpose: it is the first thing anyone needs when he telephones,
    // and until now it existed only inside the log file.
    const build = document.createElement('div');
    build.className = 'advanced-build';
    const version = document.createElement('strong');
    version.textContent = APP_VERSION;
    const stamp = document.createElement('span');
    stamp.textContent = BUILD_STAMP;
    build.append(version, stamp);

    /*
      Which copy of the app this is, said where the person changing things will
      see it.

      A browser copy is reading pretend files: everything in this panel points
      at names that exist only in a tab, and pressing anything here changes
      nothing on any disk. A dev build is the opposite danger — it is reading
      his real writing while being altered underneath. What he has installed
      says nothing at all, because for him there is nothing to warn about.
    */
    const warnings: Record<string, string> = {
      browser: 'Test in a browser. These folders are pretend and nothing here touches a disk.',
      dev: 'Development build (not the installed app). These folders are real.',
    };
    const said = warnings[host.runMode];

    const folders = document.createElement('div');
    folders.className = 'advanced-folders';
    folders.append(
      folderRow('Writing', writing, host, (to) => {
        writing = to;
        fill();
      }),
      folderRow('Logs', logs, host, (to) => {
        logs = to;
        fill();
      }),
      // Not changeable: it is where the file naming these two lives, so it has
      // to be somewhere the app can find without being told.
      folderRow('Settings', host.appFolder, host, null),
    );

    const note = document.createElement('p');
    note.className = 'advanced-note';
    note.textContent = 'Nothing is moved or copied. The app starts again when you apply.';

    const footer = document.createElement('footer');
    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'keep';
    keep.textContent = 'Apply and restart';
    keep.addEventListener('click', () => handlers.onKeep({ writing, logs }));

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', handlers.onClose);
    footer.append(keep, cancel);

    const pieces: HTMLElement[] = [header, build];
    if (said !== undefined) {
      const warning = document.createElement('p');
      warning.className = host.runMode === 'browser' ? 'advanced-warning' : 'advanced-warning mild';
      warning.textContent = said;
      pieces.push(warning);
    }

    panel.replaceChildren(...pieces, folders, note, footer);
  }

  fill();
  modal = showAsModal(container, panel, handlers.onClose);
  panel.tabIndex = -1;
  panel.focus();

  return close;
}
