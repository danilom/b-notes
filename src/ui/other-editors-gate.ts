import type { Log } from '../platform/logging.ts';
import type { OtherEditor, OtherEditors } from '../platform/other-editors.ts';
import { type Language, strings } from '../language/wording.ts';
import { showAsModal } from './dialogs/modal.ts';

/** What each is called where he reads it: the name on its own window. */
const SHOWN_AS: Record<OtherEditor, string> = {
  ResophNotes: 'ResophNotes',
  Notepad: 'Notepad',
  Obsidian: 'Obsidian',
};

/** How often to look again while he closes them himself. */
const LOOK_AGAIN_MS = 2_000;

/**
 * Whether to tell him Notepad is waiting on him: it is still open after he
 * pressed the button. Notepad asked to close with unsaved changes asks about
 * them — from behind b-notes, where Windows only lets its taskbar button blink —
 * and until he answers, b-notes waits for nothing he can see. On Windows 11
 * Notepad keeps unsaved tabs instead of asking, so this should rarely show.
 */
export function notepadIsAsking(running: readonly OtherEditor[], pressed: boolean): boolean {
  return pressed && running.includes('Notepad');
}

/**
 * Waits, behind one plain modal message, until Resoph, Notepad and Obsidian
 * are closed — and returns at once when none of them is open, which is most
 * of the time.
 *
 * A firm hold, not an error: a big raised hand, what to do and why, the
 * programs by name, and one button. There is no way past it but closing them,
 * by the button or by hand, and no mode that half-works: b-notes simply waits.
 * Not being able to tell what is running counts as nothing running, so this
 * can never keep him from his writing on its own account.
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

  const header = document.createElement('header');
  const title = document.createElement('h1');
  const stop = document.createElement('span');
  stop.className = 'close-editors-stop';
  stop.setAttribute('aria-hidden', 'true');
  stop.textContent = '\u270B';
  const titleText = document.createElement('span');
  titleText.className = 'heading-text';
  titleText.textContent = words.closeEditorsTitle;
  title.append(stop, titleText);
  header.append(title);

  const why = document.createElement('p');
  why.className = 'confirm-body';
  why.textContent = words.closeEditorsWhy;

  const listed = document.createElement('p');
  listed.className = 'confirm-body close-editors-label';
  const names = document.createElement('ul');
  names.className = 'close-editors-open';

  const how = document.createElement('p');
  how.className = 'close-editors-how';
  how.textContent = words.closeEditorsHow;

  const footer = document.createElement('footer');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'keep';
  button.textContent = words.closeEditorsButton;
  footer.append(how, button);

  const asks = document.createElement('p');
  asks.className = 'confirm-body close-editors-asks';
  asks.textContent = words.closeEditorsNotepadAsks;
  asks.hidden = true;

  // Above the footer rather than in or below it: the footer is pinned to the
  // bottom of the panel, and a line after it could sit hidden behind it.
  panel.append(header, why, listed, names, asks, footer);

  let pressed = false;
  const describe = (running: readonly OtherEditor[]): void => {
    listed.textContent = words.closeEditorsOpen(running.length);
    names.replaceChildren(
      ...running.map((editor) => {
        const item = document.createElement('li');
        item.textContent = SHOWN_AS[editor];
        return item;
      }),
    );
    asks.hidden = !notepadIsAsking(running, pressed);
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
      pressed = true;
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
