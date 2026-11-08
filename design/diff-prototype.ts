import { strings } from '../src/language/wording.ts';
import { type TextPiece, diffTexts, mergeCloseChanges, separateTidying } from '../src/notes/text-diff.ts';
import { createDiffLegend } from '../src/ui/diff-legend.ts';
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
const onlyNew = element('only-new', HTMLInputElement);
const readOnly = element('read-only', HTMLInputElement);
const preamble = element('preamble', HTMLInputElement);
const view = element('view', HTMLElement);

/** The lines the Lektor's panel puts above the text: what each mark means, and how many there are. */
function aboveTheText(pieces: readonly TextPiece[]): HTMLElement[] {
  const words = strings('sr');
  const said = words.lektor.review;
  const count = (kind: TextPiece['kind']): number => pieces.filter((piece) => piece.kind === kind).length;
  const legend = createDiffLegend(
    [
      { sample: 'old', said: said.legend.old },
      { sample: 'proposed', said: said.legend.proposed },
      { sample: 'own', said: said.legend.own },
      { sample: 'goes-in', said: said.legend.goesIn },
      { sample: 'small', said: said.legend.small },
    ],
    words.legendSample,
  );
  const counts = document.createElement('p');
  counts.className = 'review-note-aside diff-legend-counts';
  counts.textContent = said.counts(count('change'), count('tidy'));
  return [legend, counts];
}

/** The proposal in front of him, which starts over whenever what is compared changes. */
let review: DiffReview | null = null;

function forgetDecisions(): void {
  review = null;
}

function render(): void {
  const words = strings('sr');
  const compared = diffTexts(current.value, proposed.value);
  const pieces = separateTidying(compared);
  const shown = tidying.value === 'full' ? compared : pieces;
  const reviewed = merging.checked ? mergeCloseChanges(shown) : shown;
  review ??= createDiffReview(reviewed, renderKeepingPlace, onlyNew.checked);
  result.value = review.textNow();

  const column = document.createElement('div');
  // The Lektor's own, so that its rules for the review apply here as there.
  column.className = 'review-body lektor-body';
  if (preamble.checked) column.append(...aboveTheText(reviewed));
  column.append(
    createTextDiffView(
      review.piecesNow(),
      { previous: words.changePrevious, next: words.changeNext, at: words.changeAt },
      // Without the editing, the view only shows: no bar, nothing decided, a click only makes a change current.
      readOnly.checked ? { showTidied: tidying.value === 'coloured' } : { showTidied: tidying.value === 'coloured', editing: review.editing() },
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

/** Puts his real texts at the top of the list, where the server has any, leaving the one open as it is. */
async function addRealSamples(): Promise<void> {
  const real = await fetchRealSamples();
  samples.unshift(...real);
  listSamples(Number(sample.value) + real.length);
}

sample.addEventListener('change', () => showSample(Number(sample.value)));

current.addEventListener('input', startOver);
proposed.addEventListener('input', startOver);
merging.addEventListener('change', startOver);
tidying.addEventListener('change', startOver);
// A view and not a new comparison, as in the app: what he chose and opened stays.
onlyNew.addEventListener('change', () => {
  if (review === null) render();
  else review.setShowsOnlyNew(onlyNew.checked);
});
readOnly.addEventListener('change', startOver);

const PREAMBLE_KEY = 'diff-prototype:above-the-text';
try {
  preamble.checked = localStorage.getItem(PREAMBLE_KEY) !== 'off';
} catch (error) {
  console.warn('Whether to show the lines above the text could not be read back', error);
}
preamble.addEventListener('change', () => {
  try {
    localStorage.setItem(PREAMBLE_KEY, preamble.checked ? 'on' : 'off');
  } catch (error) {
    console.warn('Whether to show the lines above the text could not be remembered', error);
  }
  renderKeepingPlace();
});

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

const TAB_KEY = 'diff-prototype:tab';

/** One panel of controls open at a time, or none, which leaves the page to the diff. */
function openTab(name: string | null): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>('.prototype-tabs [data-tab]')) {
    const isOpen = tab.dataset['tab'] === name;
    tab.setAttribute('aria-selected', String(isOpen));
    element(`tab-${tab.dataset['tab'] ?? ''}`, HTMLElement).hidden = !isOpen;
  }
  try {
    localStorage.setItem(TAB_KEY, name ?? '');
  } catch (error) {
    console.warn('The open tab could not be remembered', error);
  }
}

/** The tab left open last time, if it is one this page still has. */
function rememberedTab(): string | null {
  try {
    const name = localStorage.getItem(TAB_KEY);
    return name !== null && document.getElementById(`tab-${name}`) !== null ? name : null;
  } catch (error) {
    console.warn('The open tab could not be read back', error);
    return null;
  }
}

for (const tab of document.querySelectorAll<HTMLButtonElement>('.prototype-tabs [data-tab]')) {
  tab.addEventListener('click', () => openTab(tab.getAttribute('aria-selected') === 'true' ? null : (tab.dataset['tab'] ?? null)));
}
openTab(rememberedTab());

// Opens on the one with every kind of change in it, for judging how each is drawn.
const opening = Math.max(0, samples.findIndex(({ name }) => name.startsWith('Svi slučajevi')));
listSamples(opening);
showSample(opening);
void addRealSamples();
