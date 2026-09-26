import { type Language, strings } from '../language/wording.ts';

export interface CtrlCardParts {
  /** Where it hangs. The editor's own box, so it can sit against his writing. */
  within: HTMLElement;
  /** His writing: the card only answers while the caret is in here. */
  editor: HTMLTextAreaElement;
  languageNow: () => Language;
  /** How long Ctrl is held first. Asked each time, so changing it needs no restart. */
  waitNow: () => number;
}

export interface CtrlCard {
  /** Nothing further; used when the window goes. */
  stop(): void;
}

/** As long as the stylesheet takes to fade it, and the reason it waits. */
const FADE_MS = 160;

/**
 * The keys he can use, shown while he holds the one they all start with.
 *
 * He does not have to remember four shortcuts, only that Ctrl shows him what
 * he can do. Everything after that is reading, and reading happens at the
 * moment he is stuck rather than in an instruction he was given once.
 *
 * It answers immediately and leaves slowly, which is the opposite of the
 * toast and for the same reason. A toast arrives unbidden, so it fades in or
 * it is a flinch. This he asked for by holding a key, and a thing you asked
 * for should already be there.
 */
export function createCtrlCard(parts: CtrlCardParts): CtrlCard {
  const { within, editor } = parts;

  const card = document.createElement('div');
  card.id = 'ctrl-card';
  card.hidden = true;
  // Not his writing, and not in the way of it: it takes no pointer and no
  // focus, so he can go on typing straight through it.
  card.setAttribute('aria-hidden', 'true');

  /*
    A way out, shown only while a mouse is over the card.

    In ordinary use it is never seen and never needed: the card goes on the
    key, on a click, on the window going quiet. It is here for the state where
    none of that happened, and that state is reached by exactly one route — him
    reaching for the mouse to get rid of the thing. So that is when it appears.
  */
  const away = document.createElement('button');
  away.id = 'ctrl-card-close';
  away.type = 'button';
  away.textContent = '×';
  away.tabIndex = -1;
  // Pressed without taking the caret out of his writing.
  away.addEventListener('mousedown', (event) => {
    event.preventDefault();
    hide();
  });
  card.append(away);
  within.append(card);

  let waiting: ReturnType<typeof setTimeout> | undefined;
  let leaving: ReturnType<typeof setTimeout> | undefined;

  function hide(): void {
    clearTimeout(waiting);
    waiting = undefined;
    if (card.hidden || leaving !== undefined) return;
    /*
      Marked as leaving first and hidden afterwards. `hidden` is `display:
      none`, which no transition can run through — set together they would
      make the fade the stylesheet describes impossible, and it would simply
      vanish.
    */
    card.dataset['leaving'] = 'yes';
    leaving = setTimeout(() => {
      leaving = undefined;
      card.hidden = true;
      delete card.dataset['leaving'];
    }, FADE_MS);
  }

  function show(): void {
    clearTimeout(leaving);
    leaving = undefined;
    card.replaceChildren(away, ...rowsFor(parts.languageNow()));
    delete card.dataset['leaving'];
    // Away from where he is working: high when the caret is low, low when it
    // is high.
    card.dataset['where'] = caretIsLow(editor) ? 'high' : 'low';
    delete card.dataset['mouse'];
    card.hidden = false;
  }

  /*
    A mouse that moves while the card is up is a mouse looking for the way out
    — nothing else would be reaching for it. Movement rather than hover: his
    pointer is often already resting where the card lands, and a button that
    is simply there whenever it appears is a button he might press by mistake.
  */
  const onMouseMove = (): void => {
    if (!card.hidden) card.dataset['mouse'] = 'yes';
  };

  /*
    Either Ctrl. What keeps this from appearing mid-word is the rule below —
    any other key cancels — and that covers AltGr too, which Windows makes out
    of Ctrl and Alt: the Alt lands a moment later and takes the card with it.
  */
  function isTheKey(event: KeyboardEvent): boolean {
    return event.key === 'Control' && !event.getModifierState('AltGraph');
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isTheKey(event)) {
      // Anything else he presses means he is doing something rather than
      // wondering what he could do — including Shift and Alt, which are the
      // start of a chord this does not teach.
      hide();
      return;
    }
    // Held keys repeat, and a timer re-armed on every repeat never fires.
    if (waiting !== undefined || !card.hidden) return;
    /*
      Only while the caret is in his writing. That also settles the dialogs:
      every one of them takes the focus when it opens, so there is no state
      where something is in front of his text and this still answers. A second
      test for it was written and removed — it could not be made to fail.
    */
    if (document.activeElement !== editor) return;
    waiting = setTimeout(show, parts.waitNow());
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Control') hide();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', hide);
  window.addEventListener('mousemove', onMouseMove);
  /*
    The keyup that never arrives. He holds Ctrl, moves to another window, and
    the release lands there — leaving this up over a program he has left. The
    window going quiet is the only thing that hears about it.
  */
  window.addEventListener('blur', hide);
  document.addEventListener('visibilitychange', hide);

  return {
    stop(): void {
      hide();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', hide);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', hide);
      card.remove();
    },
  };
}

/**
 * Whether the caret is in the lower half of what he can see.
 *
 * A textarea cannot say where a character has ended up on screen, so this
 * builds a throwaway copy of it — same font, same width, same padding — holds
 * the text up to the caret, and asks the copy instead. The same problem the
 * search has when it scrolls a match into view, answered the same way; that
 * one had a `mark` element to measure, and this has to make one.
 *
 * Once per showing, so what it costs does not matter.
 */
function caretIsLow(editor: HTMLTextAreaElement): boolean {
  const copy = document.createElement('div');
  const from = getComputedStyle(editor);
  for (const property of [
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderLeftWidth', 'textIndent', 'whiteSpace', 'wordWrap',
  ] as const) {
    copy.style[property] = from[property];
  }
  copy.style.position = 'absolute';
  copy.style.visibility = 'hidden';
  copy.style.width = `${editor.clientWidth}px`;
  copy.style.whiteSpace = 'pre-wrap';
  copy.style.wordWrap = 'break-word';

  copy.textContent = editor.value.slice(0, editor.selectionStart);
  const at = document.createElement('span');
  // Something with a height, or an empty span measures nothing.
  at.textContent = '.';
  copy.append(at);
  document.body.append(copy);
  const top = at.offsetTop;
  copy.remove();

  return top - editor.scrollTop > editor.clientHeight / 2;
}

/** A key drawn as the key it is, so it matches what is under his fingers. */
function keyCap(label: string): HTMLElement {
  const cap = document.createElement('kbd');
  cap.textContent = label;
  return cap;
}

function row(keys: string[], said: string, aside?: string): HTMLElement {
  const line = document.createElement('div');
  line.className = 'ctrl-row';

  const combination = document.createElement('div');
  combination.className = 'ctrl-keys';
  keys.forEach((key, index) => {
    if (index > 0) {
      const plus = document.createElement('span');
      // Not a key, so not drawn as one: he is not meant to press it.
      plus.className = 'ctrl-plus';
      plus.textContent = '+';
      combination.append(plus);
    }
    combination.append(keyCap(key));
  });

  const words = document.createElement('div');
  words.className = 'ctrl-said';
  words.append(said);
  if (aside !== undefined) {
    const small = document.createElement('small');
    small.textContent = aside;
    words.append(small);
  }

  line.append(combination, words);
  return line;
}

function rowsFor(language: Language): Node[] {
  const words = strings(language);
  const heading = document.createElement('h2');
  heading.textContent = words.ctrlCardTitle;

  const footer = document.createElement('p');
  footer.className = 'ctrl-footer';
  footer.textContent = words.ctrlCardWholeText;

  return [
    heading,
    row(['Ctrl', 'C'], words.ctrlCopy),
    row(['Ctrl', 'V'], words.ctrlPaste),
    row(['Ctrl', 'Z'], words.ctrlUndo, words.ctrlUndoWhen),
    footer,
  ];
}
