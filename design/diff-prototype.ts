import { strings } from '../src/language/wording.ts';
import { type TextPiece, diffTexts, mergeCloseChanges, separateTidying } from '../src/notes/text-diff.ts';
import { type DiffReview, createDiffReview } from '../src/ui/diff-review.ts';
import { createTextDiffView } from '../src/ui/diff-view.ts';
import { DIFF_SAMPLES, type DiffSample, fetchRealSamples } from './diff-prototype-samples.ts';

function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`The page has no ${kind.name} #${id}`);
  return found;
}

const current = element('current', HTMLTextAreaElement);
const proposed = element('proposed', HTMLTextAreaElement);
const result = element('result', HTMLTextAreaElement);
const sample = element('sample', HTMLSelectElement);
const merging = element('merging', HTMLInputElement);
const tidying = element('tidying', HTMLSelectElement);
const dark = element('dark', HTMLInputElement);
const view = element('view', HTMLElement);

function aside(text: string): HTMLParagraphElement {
  const line = document.createElement('p');
  line.className = 'review-note-aside';
  line.textContent = text;
  return line;
}

/** How many small corrections there are, so that they are never a secret. */
const tidyingNote = (pieces: readonly TextPiece[]): string =>
  `Sitne popravke: ${pieces.filter((piece) => piece.kind === 'tidy').length}.`;

/** The proposal in front of him, which starts over whenever what is compared changes. */
let review: DiffReview | null = null;

function forgetDecisions(): void {
  review = null;
}

function render(): void {
  const words = strings('sr');
  const compared = diffTexts(current.value, proposed.value);
  const pieces = separateTidying(compared);
  const hasTidying = pieces.some((piece) => piece.kind === 'tidy');
  const shown = tidying.value === 'full' ? compared : pieces;
  review ??= createDiffReview(merging.checked ? mergeCloseChanges(shown) : shown, renderKeepingPlace);
  result.value = review.textNow();

  const column = document.createElement('div');
  column.className = 'review-body';
  column.append(aside('Precrtano je trenutni tekst, zeleno je predlog.'));
  if (hasTidying && tidying.value !== 'full') column.append(aside(tidyingNote(pieces)));
  column.append(
    createTextDiffView(
      review.piecesNow(),
      { previous: words.changePrevious, next: words.changeNext, at: words.changeAt },
      { showTidied: tidying.value === 'coloured', editing: review.editing() },
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

/** The decisions were about what was there before, and mean nothing now. */
function startOver(): void {
  forgetDecisions();
  renderKeepingPlace();
}

const samples: DiffSample[] = [...DIFF_SAMPLES];

function showSample(at: number): void {
  const chosen = samples[at];
  if (chosen === undefined) return;
  current.value = chosen.current;
  proposed.value = chosen.proposed;
  forgetDecisions();
  render();
}

function listSamples(selectedAt: number): void {
  sample.replaceChildren(...samples.map(({ name }, at) => new Option(name, String(at))));
  sample.value = String(selectedAt);
}

/**
 * Puts his real texts at the top of the list and opens on the first, where the
 * server has any. If something has been done on the page by then, it stays as it is.
 */
async function addRealSamples(): Promise<void> {
  const real = await fetchRealSamples();
  const stillOpening = Number(sample.value) === opening && current.value === samples[opening]?.current;
  samples.unshift(...real);
  listSamples(Number(sample.value) + real.length);
  if (stillOpening && real.length > 0) {
    sample.value = '0';
    showSample(0);
  }
}

sample.addEventListener('change', () => showSample(Number(sample.value)));

current.addEventListener('input', startOver);
proposed.addEventListener('input', startOver);
merging.addEventListener('change', startOver);
tidying.addEventListener('change', startOver);

element('swap', HTMLButtonElement).addEventListener('click', () => {
  [current.value, proposed.value] = [proposed.value, current.value];
  forgetDecisions();
  render();
});

// Nothing is saved from this page. Here the main button only stands for what the
// real panel would do: the text becomes what the result says, and nothing is left
// to compare.
element('apply', HTMLButtonElement).addEventListener('click', () => {
  current.value = result.value;
  proposed.value = result.value;
  forgetDecisions();
  render();
});

element('close', HTMLButtonElement).addEventListener('click', startOver);

dark.addEventListener('change', () => {
  document.documentElement.dataset['mode'] = dark.checked ? 'dark' : 'light';
});

// Opens on the long untidy one, which is the case the page is mostly for judging.
const opening = Math.max(0, samples.findIndex(({ name }) => name.startsWith('Dugačak neuredan')));
listSamples(opening);
showSample(opening);
void addRealSamples();
