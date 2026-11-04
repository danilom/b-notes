import { strings } from '../src/language/wording.ts';
import { type TextPiece, diffTexts, mergeCloseChanges, separateTidying } from '../src/notes/text-diff.ts';
import { createTextDiffView } from '../src/ui/diff-view.ts';
import { DIFF_SAMPLES } from './diff-prototype-samples.ts';

function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`The page has no ${kind.name} #${id}`);
  return found;
}

const current = element('current', HTMLTextAreaElement);
const proposed = element('proposed', HTMLTextAreaElement);
const sample = element('sample', HTMLSelectElement);
const merging = element('merging', HTMLInputElement);
const tidying = element('tidying', HTMLSelectElement);
const lineBreaks = element('line-breaks', HTMLInputElement);
const correctionSymbol = element('correction-symbol', HTMLSelectElement);
const spaceSymbol = element('space-symbol', HTMLSelectElement);
const breakSymbol = element('break-symbol', HTMLSelectElement);
const dark = element('dark', HTMLInputElement);
const view = element('view', HTMLElement);

function aside(text: string): HTMLParagraphElement {
  const line = document.createElement('p');
  line.className = 'review-note-aside';
  line.textContent = text;
  return line;
}

/** What the view is leaving out, so that hiding it is never a secret. */
function tidyingNote(pieces: readonly TextPiece[]): string {
  const tidied = pieces.filter((piece) => piece.kind === 'tidy').length;
  const spacing = pieces.filter((piece) => piece.kind === 'tidy' && !/\S/.test(piece.removed)).length;
  return (
    `Sitne popravke: ${tidied} (razmaci i prelomi: ${spacing}; slova s kukicama: ${tidied - spacing}).`
  );
}

function render(): void {
  const words = strings('sr');
  const compared = diffTexts(current.value, proposed.value);
  const pieces = separateTidying(compared, { lineBreaks: lineBreaks.checked });
  const hasTidying = pieces.some((piece) => piece.kind === 'tidy');
  const shown = tidying.value === 'full' ? compared : pieces;

  const column = document.createElement('div');
  column.className = 'review-body';
  column.append(aside('Precrtano je trenutni tekst, zeleno je predlog.'));
  if (hasTidying && tidying.value !== 'full') column.append(aside(tidyingNote(pieces)));
  column.append(
    createTextDiffView(
      merging.checked ? mergeCloseChanges(shown) : shown,
      { previous: words.changePrevious, next: words.changeNext, at: words.changeAt },
      {
        symbols: {
          space: spaceSymbol.value === '' ? null : spaceSymbol.value,
          lineBreak: breakSymbol.value,
          correction: correctionSymbol.value === '' ? null : correctionSymbol.value,
        },
        showTidied: tidying.value === 'coloured',
      },
    ),
  );
  view.replaceChildren(column);
}

/**
 * Redraws without moving the box, for edits made while watching one place in
 * it. The view scrolls to its first change once it has measured itself, and
 * this is queued behind that.
 */
function renderKeepingPlace(): void {
  const before = view.querySelector('.review-text')?.scrollTop ?? 0;
  render();
  queueMicrotask(() => {
    const box = view.querySelector('.review-text');
    if (box !== null) box.scrollTop = before;
  });
}

function showSample(at: number): void {
  const chosen = DIFF_SAMPLES[at];
  if (chosen === undefined) return;
  current.value = chosen.current;
  proposed.value = chosen.proposed;
  render();
}

sample.append(...DIFF_SAMPLES.map(({ name }, at) => new Option(name, String(at))));
sample.addEventListener('change', () => showSample(Number(sample.value)));

current.addEventListener('input', renderKeepingPlace);
proposed.addEventListener('input', renderKeepingPlace);
merging.addEventListener('change', renderKeepingPlace);
tidying.addEventListener('change', renderKeepingPlace);
lineBreaks.addEventListener('change', renderKeepingPlace);
correctionSymbol.addEventListener('change', renderKeepingPlace);
spaceSymbol.addEventListener('change', renderKeepingPlace);
breakSymbol.addEventListener('change', renderKeepingPlace);

element('swap', HTMLButtonElement).addEventListener('click', () => {
  [current.value, proposed.value] = [proposed.value, current.value];
  render();
});

dark.addEventListener('change', () => {
  document.documentElement.dataset['mode'] = dark.checked ? 'dark' : 'light';
});

// Opens on the long untidy one, which is the case the page is mostly for judging.
const opening = Math.max(0, DIFF_SAMPLES.findIndex(({ name }) => name.startsWith('Dugačak neuredan')));
sample.value = String(opening);
showSample(opening);
