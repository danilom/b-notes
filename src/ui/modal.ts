/**
 * Showing one of the app's dialogs as a real modal.
 *
 * `showModal` rather than a div made to look like one. What that buys is not
 * appearance — the panel inside is the app's own either way — but the things a
 * hand-rolled overlay has to remember and this app forgot: focus moves into the
 * dialog, focus cannot leave it by tabbing, everything behind it stops
 * answering the keyboard and the mouse, and focus returns where it came from
 * when the dialog goes.
 *
 * That last set is what let two characters typed at a preview land in his live
 * text, behind the panel, on their way to disk.
 */
export interface Shown {
  /** Takes the dialog away and forgets what was in it. */
  close: () => void;
}

/**
 * @param leave What Escape should do. The platform closes a dialog on Escape by
 * itself, which would skip whatever else the caller does on the way out — so it
 * is stopped and handed back, and the caller's own way out runs instead.
 */
export function showAsModal(
  container: HTMLDialogElement,
  panel: HTMLElement,
  leave: () => void,
): Shown {
  const onCancel = (event: Event): void => {
    event.preventDefault();
    leave();
  };

  /*
    Escape, handled here rather than left to the dialog.

    A dialog closes itself on Escape, which would skip whatever else the caller
    does on the way out — and for the deleted texts, Escape is not "close" at
    all but "one step back". Refusing the default on the key is what stops the
    platform acting as well: a close request only proceeds if the keydown it
    came from was not cancelled, so this runs once, not twice.
  */
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    leave();
  };

  container.replaceChildren(panel);
  // Still listened for: a close request can arrive without a key behind it.
  container.addEventListener('cancel', onCancel);
  container.addEventListener('keydown', onKey);
  container.showModal();

  // The panel rather than a control in it: focus has to be inside the dialog,
  // and Enter is a reflex at a dialog that nothing here should answer.
  panel.tabIndex = -1;
  panel.focus();

  return {
    close: () => {
      container.removeEventListener('cancel', onCancel);
      container.removeEventListener('keydown', onKey);
      container.close();
      container.replaceChildren();
    },
  };
}
