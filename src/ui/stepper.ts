import { icon } from './icons.ts';

/**
 * The little box that counts a run of things and steps through them.
 *
 * Two of these exist — over his writing for search matches, over a diff for the
 * places it differs — and they are one control, not two that resemble each
 * other. He meets it in one place and can use it in the other, which only holds
 * if it is the same box: same marks, same words in the same order, same face,
 * and the same answer to pressing a button at the end of the run.
 */
export interface StepperWords {
  previous: string;
  next: string;
  /** Only where there is something for it to dismiss. */
  close?: string;
}

export interface Stepper {
  /** The box. Where it sits, and whether it is shown at all, are the caller's. */
  root: HTMLDivElement;
  /** What it says, and which way it can still go from here. */
  showing(label: string, ends: { canGoBack: boolean; canGoOn: boolean }): void;
}

/**
 * Leaves the pen in his hand.
 *
 * A button takes the focus when it is pressed, which would take the cursor out
 * of his text — he clicks one of these, then types, and the letters go nowhere.
 * Refusing the default on the way down means the button never takes focus at
 * all, so the click still happens and the cursor stays where he left it. It
 * costs nothing in the dialog, where there is no caret to keep, and the buttons
 * are still reachable by keyboard either way.
 */
function withoutTakingFocus(button: HTMLButtonElement): HTMLButtonElement {
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  return button;
}

function stepButton(mark: 'previous' | 'next', said: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';

  const words = document.createElement('span');
  words.textContent = said;
  button.append(icon(mark), words);

  return withoutTakingFocus(button);
}

export function createStepper(
  words: StepperWords,
  handlers: { onPrevious: () => void; onNext: () => void; onClose?: () => void },
): Stepper {
  const root = document.createElement('div');
  root.className = 'stepper';

  const label = document.createElement('span');
  label.className = 'stepper-at';

  const back = stepButton('previous', words.previous);
  back.addEventListener('click', handlers.onPrevious);

  const on = stepButton('next', words.next);
  on.addEventListener('click', handlers.onNext);

  root.append(label, back, on);

  if (handlers.onClose !== undefined && words.close !== undefined) {
    const away = document.createElement('button');
    away.type = 'button';
    away.className = 'stepper-close';
    away.title = words.close;
    away.setAttribute('aria-label', words.close);
    away.append(icon('close'));
    away.addEventListener('click', handlers.onClose);
    root.append(withoutTakingFocus(away));
  }

  return {
    root,
    showing(said, { canGoBack, canGoOn }) {
      label.textContent = said;
      back.disabled = !canGoBack;
      on.disabled = !canGoOn;
    },
  };
}
