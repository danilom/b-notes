import { type Language, strings } from '../../language/wording.ts';
import { diffTexts, mergeCloseChanges, separateTidying } from '../../notes/text-diff.ts';
import { openConfirmDialog } from '../dialogs/confirm-dialog.ts';
import { titleOf } from '../dialogs/dialog-heading.ts';
import { scrollTakenByBand } from '../diff-bar-band.ts';
import { createDiffLegend } from '../diff-legend.ts';
import { createDiffReview } from '../diff-review.ts';
import { createTextDiffView } from '../diff-view.ts';
import { icon } from '../icons.ts';
import { burstFrom } from './lektor-confetti.ts';
import { button, el } from './lektor-pieces.ts';

/*
  What a proofreader proposes for a text, for him to look over, drawn as the corrections window's
  own screen (spec §8). Everything counts as accepted unless he steps in: this is not a queue to work
  through, and the main button takes whatever is on the page. He is free to change one thing and stop.
*/

export interface ReviewSetup {
  /** What the text is called. */
  title: string;
  /** The text as it stands. */
  current: string;
  /** What the proofreader would make of it. */
  proposed: string;
  /** The line over the legend: the kind, who made them, when, what they cost, and how many changes. */
  whoLine: (large: number, small: number) => HTMLElement;
  /** Whether the changes start drawn as the text they make, for a rework read as a text. */
  showsOnlyNew: boolean;
  /** Said under the title when the reply is a saved one rather than a fresh one (the browser build's fake network). */
  savedNote: string | null;
}

export interface ReviewHandlers {
  /** The text as he left it here, to become the active text. */
  onApply: (text: string) => void;
  /** Back to the request, keeping the suggestions. Never asks. */
  onBack: () => void;
  /** He left without taking anything. */
  onClose: () => void;
}

export interface ShownReview {
  panel: HTMLElement;
  /** Closing, asking first whenever there is something to lose. */
  leave: () => void;
  /** Draws the text, once the panel is on the page. */
  draw: () => void;
}

/** The changes as the text itself draws them, at the legend's size, with the legend's own word. */
function sampleOf(marks: string, word: string): HTMLElement {
  return el('span', marks, word);
}

export function createReviewPanel(confirmContainer: HTMLDialogElement, setup: ReviewSetup, language: Language, handlers: ReviewHandlers): ShownReview {
  const words = strings(language);
  const said = words.lektor.review;
  const pieces = mergeCloseChanges(separateTidying(diffTexts(setup.current, setup.proposed)));
  const hasAnything = pieces.some((piece) => piece.kind !== 'same');
  const large = pieces.filter((piece) => piece.kind === 'change').length;
  const small = pieces.filter((piece) => piece.kind === 'tidy').length;

  const preview = el('div', 'lektor-review-text-slot');
  const review = createDiffReview(pieces, redraw, setup.showsOnlyNew);
  let applyButton: HTMLButtonElement | null = null;
  const viewInputs: HTMLInputElement[] = [];

  /** He has been through all of them, and the next thing to do is the main button. Not for a single change. */
  function noticeIfAtTheEnd(changeAt: number): void {
    if (large <= 1 || changeAt !== large - 1 || applyButton === null) return;
    // Once to a review: going back and forward again is checking, not finishing.
    if (!applyButton.classList.contains('lektor-apply-ready')) burstFrom(applyButton, panel);
    applyButton.classList.add('lektor-apply-ready');
  }

  const stepperLabel = (at: number, total: number): string => (total > 1 && at === total ? said.reviewedAll(at, total) : words.changeAt(at, total));

  function editingWithTheEnd(): ReturnType<typeof review.editing> {
    const editing = review.editing();
    return {
      ...editing,
      // The bar on a band of its own, covering no words of the line above (Danilo, 2026-11-12).
      makesRoom: true,
      onCurrent: (changeAt) => {
        editing.onCurrent(changeAt);
        noticeIfAtTheEnd(changeAt);
      },
    };
  }

  /** Drawn again in the same place: he is looking at something, and it should not jump. */
  function redraw(): void {
    const before = preview.querySelector('.review-text')?.scrollTop ?? 0;
    preview.replaceChildren(
      createTextDiffView(review.piecesNow(), { previous: words.changePrevious, next: words.changeNext, at: stepperLabel }, { showTidied: true, editing: editingWithTheEnd() }),
    );
    for (const input of viewInputs) input.checked = (input.value === 'result') === review.showsOnlyNew();
    queueMicrotask(() => {
      const box = preview.querySelector('.review-text');
      if (box !== null) box.scrollTop = before + scrollTakenByBand(box);
    });
  }

  /**
   * "Izgled izmena" (Danilo, 2026-11-11), in place of the easily missed checkbox: two radio rows,
   * each a sample of what it shows. Choosing one draws every change that way; on a click, not a
   * change, so the row already chosen applies again, closing what he opened since.
   */
  function viewChoice(): HTMLElement {
    const group = el('div', 'lektor-view-choice');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', said.look);
    const option = (isOnlyNew: boolean, name: string, samples: HTMLElement[]): HTMLElement => {
      const row = el('label', 'lektor-view-option');
      const input = el('input');
      input.type = 'radio';
      input.name = 'lektor-view';
      input.value = isOnlyNew ? 'result' : 'marked';
      input.checked = isOnlyNew === review.showsOnlyNew();
      input.setAttribute('aria-label', name);
      input.addEventListener('click', () => review.setShowsOnlyNew(isOnlyNew));
      viewInputs.push(input);
      const shown = el('span', 'lektor-view-sample');
      shown.append(...samples);
      row.append(input, shown);
      return row;
    };
    const options = el('div', 'lektor-view-options');
    options.append(
      option(false, said.lookMarked, [sampleOf('diff-gone diff-struck', words.legendSample), sampleOf('diff-new', words.legendSample)]),
      option(true, said.lookResult, [sampleOf('diff-resolved', words.legendSample)]),
    );
    group.append(el('span', 'lektor-view-title', said.look), options);
    return group;
  }

  function legend(): HTMLElement {
    const { old, proposed, own, goesIn, small: smallFixes } = said.legend;
    return createDiffLegend(
      [
        { sample: 'old', said: old },
        { sample: 'proposed', said: proposed },
        { sample: 'own', said: own },
        { sample: 'goes-in', said: goesIn },
        { sample: 'small', said: smallFixes },
      ],
      words.legendSample,
    );
  }

  /** Who made them and what the marks mean, on the left; how the changes are drawn at the right of both. */
  function head(): HTMLElement {
    const legendRow = el('div', 'lektor-review-row');
    legendRow.append(legend());
    const lines = el('div', 'lektor-review-lines');
    lines.append(setup.whoLine(large, small), legendRow);
    const row = el('div', 'lektor-review-head');
    row.append(lines, ...(large > 0 ? [viewChoice()] : []));
    return row;
  }

  /** Asks whenever there is something to lose: these took minutes and may have cost real money. */
  function leave(): void {
    if (!hasAnything) {
      handlers.onClose();
      return;
    }
    const closeQuestion = openConfirmDialog(
      confirmContainer,
      {
        // Not the text's name: that made it read as closing the text, and this closes only the window.
        title: { mark: 'lektor', label: said.leaveTitle },
        body: review.hasDecisions() ? said.leaveBodyDecided : said.leaveBody,
        confirm: said.leave,
        cancel: said.leaveCancel,
        danger: true,
        onConfirm: () => {
          closeQuestion();
          handlers.onClose();
        },
        onCancel: () => closeQuestion(),
      },
      language,
    );
  }

  const panel = el('div', 'panel review-panel lektor-panel lektor-window');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const heading = el('div', 'review-heading');
  heading.append(titleOf({ mark: 'lektor', label: said.title, name: setup.title }));
  if (setup.savedNote !== null) heading.append(el('p', 'review-note', setup.savedNote));
  const dismiss = button('', leave, 'close');
  dismiss.title = words.close;
  dismiss.setAttribute('aria-label', words.close);
  dismiss.append(icon('close'));
  const header = el('header');
  header.append(heading, dismiss);

  const body = el('div', 'review-body lektor-body');
  body.append(...(hasAnything ? [head()] : []), preview);
  const panes = el('div', 'review-panes');
  panes.append(body);

  // A step back at the footer's left, apart from the two that finish or leave.
  const back = button('', handlers.onBack, 'lektor-footer-back');
  back.append(icon('back'), el('span', '', words.lektor.back));
  const footer = el('footer');
  footer.append(back);
  if (hasAnything) {
    // Solid blue, the next step, as on every screen of the window; no note beside it, its words say what it does.
    applyButton = button(said.apply, () => handlers.onApply(review.textNow()), 'lektor-main-action');
    footer.append(applyButton);
  }
  footer.append(button(words.close, leave));
  panel.append(header, panes, footer);

  const draw = (): void => {
    if (hasAnything) {
      redraw();
      return;
    }
    preview.replaceChildren(el('div', 'review-text review-text-empty', said.nothing));
  };
  return { panel, leave, draw };
}
