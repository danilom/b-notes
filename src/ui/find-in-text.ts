import type { Language } from '../language/wording.ts';
import { type Stepper, createStepper } from './parts/stepper.ts';
import { type TextMatch, foundPanelFor, matchesIn } from './parts/text-match.ts';

/** What the panel's three buttons are called, in his language. */
export interface FindWords {
  previous: string;
  next: string;
  close: string;
}

/** The parts of the page this borrows, and the two things it cannot decide. */
export interface FindInTextParts {
  /** His writing, which is what is searched and what is scrolled. */
  editor: HTMLTextAreaElement;
  /** The layer behind it, where the marks are painted. */
  marks: HTMLElement;
  /** The strip that says where he is among the matches. */
  panel: HTMLElement;
  words: FindWords;
  /** Asked each time rather than kept: the language is his to change. */
  languageNow: () => Language;
  /** Clearing the search is more than clearing these marks. */
  onClear: () => void;
}

export interface FindInText {
  /** Paint the matches for what is in the editor now. */
  again(query: string): void;
  /** Back to the first match, without moving the view. */
  fromTheTop(): void;
  /** Nothing searched for, nothing to show. */
  nothing(): void;
  /** The match before or after this one. */
  step(direction: 1 | -1): void;
  /** Bring the match he is on into view. */
  scrollToCurrent(): void;
}

/**
 * Finding his own words inside a text, and stepping between them.
 *
 * All of it was loose in the interface, reading and writing two variables that
 * nothing else touched. It is separate because it needs almost nothing from
 * the rest — the text, what he typed in the box, and somewhere to paint — and
 * because the rules about when the panel shows and which buttons are alive are
 * worth reading in one place.
 */
export function createFindInText(parts: FindInTextParts): FindInText {
  const { editor, marks, panel, words, languageNow, onClear } = parts;

  let found: TextMatch[] = [];
  let at = 0;
  /** What the last paint was for, so stepping can repaint the same search. */
  let query = '';

  const steps: Stepper = createStepper(
    { previous: words.previous, next: words.next, close: words.close },
    { onPrevious: () => step(-1), onNext: () => step(1), onClose: onClear },
  );
  panel.append(steps.root);

  /**
   * Says where he is among the matches, and offers the way to the next.
   *
   * Shown for a single match as well as for many. Hiding it there was
   * considered and is worse: as he types, the count falls away — 74, 12, 3, 1,
   * none — and a panel that vanished at one would go while a match was still
   * highlighted in front of him, which reads as the match having gone too.
   *
   * The buttons stay for the same reason, greyed rather than gone: they would
   * otherwise appear and disappear as he crosses between one match and two,
   * moving the panel twice in as many keystrokes. "Samo jednom" is what makes
   * that greying legible — there is one, so there is nowhere to go — where
   * "1 od 1" would only have counted him against himself.
   */
  function showFound(): void {
    const shape = foundPanelFor(found, at, languageNow());
    panel.hidden = !shape.shown;
    steps.showing(shape.label, { canGoBack: shape.canGoBack, canGoOn: shape.canGoOn });
  }

  /**
   * Paints the matches on the layer behind his writing.
   *
   * Built out of text nodes and `mark` elements rather than a string of HTML:
   * his writing is never turned into markup, so there is nothing in it that
   * could be read as markup — no escaping to get right, and no way for a stray
   * angle bracket in an essay to become part of the page.
   */
  function paint(): void {
    const text = editor.value;
    found = matchesIn(text, query);
    at = Math.min(at, Math.max(0, found.length - 1));

    showFound();

    if (found.length === 0) {
      marks.replaceChildren();
      return;
    }

    const pieces: Node[] = [];
    let from = 0;
    found.forEach(({ start, end }, index) => {
      if (start > from) pieces.push(document.createTextNode(text.slice(from, start)));
      const mark = document.createElement('mark');
      if (index === at) mark.className = 'now';
      mark.textContent = text.slice(start, end);
      pieces.push(mark);
      from = end;
    });
    // A trailing newline is not given a line of its own unless something
    // follows it, so the layer would come up a line short of the textarea at
    // the bottom.
    pieces.push(document.createTextNode(`${text.slice(from)}\n`));

    marks.replaceChildren(...pieces);
    marks.scrollTop = editor.scrollTop;
  }

  /**
   * Brings the current match into view.
   *
   * A textarea cannot say where a character has ended up on screen, so the
   * position comes from the layer behind it, which is laid out identically and
   * is made of elements that can be asked. Placed a third of the way down
   * rather than at the very top, so he can see what comes before it and know
   * where he is.
   */
  function scrollToCurrent(): void {
    const mark = marks.querySelector('mark.now');
    if (!(mark instanceof HTMLElement)) return;

    const target = mark.offsetTop - editor.clientHeight / 3;
    editor.scrollTop = Math.max(0, target);
    marks.scrollTop = editor.scrollTop;
  }

  /**
   * Moves to the match before or after this one, and stops at the ends.
   *
   * Stopping rather than wrapping. Wrapping kept both buttons alive, but a
   * list that silently starts over is worse than a button that is visibly
   * spent: he presses on, lands back at the first match, and has no way of
   * telling whether he has seen them all or lost his place. The greyed-out
   * button says where the end is before he reaches for it.
   */
  function step(direction: 1 | -1): void {
    const next = at + direction;
    if (next < 0 || next >= found.length) return;
    at = next;
    paint();
    scrollToCurrent();
  }

  return {
    again(looking: string): void {
      query = looking;
      paint();
    },

    fromTheTop(): void {
      at = 0;
    },

    nothing(): void {
      found = [];
      at = 0;
      showFound();
    },

    step,
    scrollToCurrent,
  };
}
