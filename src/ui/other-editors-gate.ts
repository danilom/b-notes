import type { Log } from '../platform/logging.ts';
import type { OtherEditor, OtherEditors } from '../platform/other-editors.ts';
import { type Language, strings } from '../language/wording.ts';
import { showAsModal } from './dialogs/modal.ts';

/** What each is called where he reads it: the name on its own window. */
const SHOWN_AS: Record<OtherEditor, string> = {
  ResophNotes: 'Resoph',
  Notepad: 'Notepad',
  Obsidian: 'Obsidian',
};

/** `Resoph`, `Resoph i Notepad`, `Resoph, Notepad i Obsidian`. */
export function namesOf(editors: readonly OtherEditor[], and: string): string {
  const names = editors.map((editor) => SHOWN_AS[editor]);
  const last = names.pop();
  if (last === undefined) return '';
  return names.length === 0 ? last : `${names.join(', ')} ${and} ${last}`;
}

/** How often to look again while he closes them himself. */
const LOOK_AGAIN_MS = 2_000;

/**
 * Waits, behind one plain modal message, until Resoph, Notepad and Obsidian
 * are closed — and returns at once when none of them is open, which is most
 * starts.
 *
 * There is no way past it but closing them, by the button or by hand, and no
 * mode that half-works: b-notes simply has not started yet. Not being able to
 * tell what is running counts as nothing running, so this can never keep him
 * from his writing on its own account.
 */
export async function untilOtherEditorsClose(
  container: HTMLDialogElement,
  editors: OtherEditors,
  log: Log,
  language: Language,
): Promise<void> {
  const open = await editors.running();
  if (open.length === 0) return;
  log.info('Other writing programs are open, so b-notes waits for them to close', { open });

  const words = strings(language);
  const panel = document.createElement('div');
  panel.className = 'panel close-editors';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  // No mark beside the title. Every other dialog's is the icon of the button
  // that opened it; nothing opened this one, and the obvious mark — an X —
  // reads as a way out, which is exactly what this has none of.
  const header = document.createElement('header');
  const title = document.createElement('h1');
  const titleText = document.createElement('span');
  titleText.className = 'heading-text';
  titleText.textContent = words.closeEditorsTitle;
  title.append(titleText);
  header.append(title);

  const said = document.createElement('p');
  said.className = 'confirm-body';
  const notepad = document.createElement('p');
  notepad.className = 'confirm-body close-editors-notepad';

  const footer = document.createElement('footer');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'keep';
  button.textContent = words.closeEditorsButton;
  const beside = document.createElement('span');
  beside.className = 'close-editors-beside';
  beside.textContent = words.closeEditorsBeside;
  footer.append(button, beside);

  panel.append(header, said, notepad, footer);

  const describe = (running: readonly OtherEditor[]): void => {
    said.textContent = words.closeEditorsSay(namesOf(running, words.closeEditorsAnd));
    notepad.textContent = running.includes('Notepad') ? words.closeEditorsNotepad : '';
    notepad.hidden = !running.includes('Notepad');
  };
  describe(open);

  // Nothing dismisses it: Escape does nothing, and there is no X. The one way
  // on is for them to be closed.
  const shown = showAsModal(container, panel, () => undefined);
  button.focus();

  return new Promise<void>((resolve) => {
    let closing = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const look = async (): Promise<void> => {
      const running = await editors.running();
      if (running.length > 0) {
        describe(running);
        return;
      }
      clearInterval(timer);
      shown.close();
      log.info('The other writing programs are closed; b-notes carries on');
      resolve();
    };

    timer = setInterval(() => {
      if (!closing) void look();
    }, LOOK_AGAIN_MS);

    button.addEventListener('click', () => {
      if (closing) return;
      closing = true;
      button.disabled = true;
      button.textContent = words.closeEditorsClosing;
      log.info('He asked b-notes to close the other writing programs');
      void (async () => {
        try {
          await editors.close(await editors.running());
        } catch (failure: unknown) {
          log.error('Could not close the other writing programs', failure);
        }
        await look();
        closing = false;
        button.disabled = false;
        button.textContent = words.closeEditorsButton;
      })();
    });
  });
}
