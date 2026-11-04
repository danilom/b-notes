import { strings } from '../src/language/wording.ts';
import { type TextPiece, diffTexts, mergeCloseChanges, separateTidying } from '../src/notes/text-diff.ts';
import { createTextDiffView } from '../src/ui/diff-view.ts';
import { DIFF_SAMPLES, type DiffSample } from './diff-prototype-samples.ts';

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

function render(): void {
  const words = strings('sr');
  const compared = diffTexts(current.value, proposed.value);
  const pieces = separateTidying(compared);
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
      { showTidied: tidying.value === 'coloured' },
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

const samples: DiffSample[] = [...DIFF_SAMPLES];

function showSample(at: number): void {
  const chosen = samples[at];
  if (chosen === undefined) return;
  current.value = chosen.current;
  proposed.value = chosen.proposed;
  render();
}

function listSamples(selectedAt: number): void {
  sample.replaceChildren(...samples.map(({ name }, at) => new Option(name, String(at))));
  sample.value = String(selectedAt);
}

const isDiffSample = (value: unknown): value is DiffSample =>
  typeof value === 'object' &&
  value !== null &&
  'name' in value &&
  typeof value.name === 'string' &&
  'current' in value &&
  typeof value.current === 'string' &&
  'proposed' in value &&
  typeof value.proposed === 'string';

/**
 * Puts his real texts at the top of the list, where the server has any: they are
 * kept out of the repository, so a checkout may well have none. Whatever is on
 * the page stays as it is, since he may already be looking at it.
 */
async function addRealSamples(): Promise<void> {
  try {
    const response = await fetch('/diff-samples.json');
    if (!response.ok) throw new Error(`Server answered ${response.status}`);
    const received: unknown = await response.json();
    if (!Array.isArray(received)) throw new Error('The samples are not a list');

    const real = received.filter(isDiffSample);
    samples.unshift(...real);
    listSamples(Number(sample.value) + real.length);
  } catch (error) {
    console.error('Could not load the real samples', error);
  }
}

sample.addEventListener('change', () => showSample(Number(sample.value)));

current.addEventListener('input', renderKeepingPlace);
proposed.addEventListener('input', renderKeepingPlace);
merging.addEventListener('change', renderKeepingPlace);
tidying.addEventListener('change', renderKeepingPlace);

element('swap', HTMLButtonElement).addEventListener('click', () => {
  [current.value, proposed.value] = [proposed.value, current.value];
  render();
});

dark.addEventListener('change', () => {
  document.documentElement.dataset['mode'] = dark.checked ? 'dark' : 'light';
});

// Opens on the long untidy one, which is the case the page is mostly for judging.
const opening = Math.max(0, samples.findIndex(({ name }) => name.startsWith('Dugačak neuredan')));
listSamples(opening);
showSample(opening);
void addRealSamples();
