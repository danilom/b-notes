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
const barRoom = element('bar-room', HTMLInputElement);
const view = element('view', HTMLElement);

/** A sample of how the changes are drawn, at the legend's size, with the legend's own word. */
function sampleOf(marks: string): HTMLElement {
  const sample = document.createElement('span');
  sample.className = marks;
  sample.textContent = strings('sr').legendSample;
  return sample;
}

/**
 * "Izgled izmena" as the Lektor's window draws it (lektor-review.ts): two radio rows, each a
 * sample of what it shows, and a click on one, chosen already or not, draws every change that way.
 */
function viewChoice(shown: DiffReview): HTMLElement {
  const said = strings('sr').lektor.review;
  const option = (isOnlyNew: boolean, name: string, samples: HTMLElement[]): HTMLElement => {
    const row = document.createElement('label');
    row.className = 'lektor-view-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'lektor-view';
    input.checked = isOnlyNew === shown.showsOnlyNew();
    input.setAttribute('aria-label', name);
    input.addEventListener('click', () => {
      onlyNew.checked = isOnlyNew;
      shown.setShowsOnlyNew(isOnlyNew);
    });
    const sample = document.createElement('span');
    sample.className = 'lektor-view-sample';
    sample.append(...samples);
    row.append(input, sample);
    return row;
  };
  const options = document.createElement('div');
  options.className = 'lektor-view-options';
  options.append(
    option(false, said.lookMarked, [sampleOf('diff-gone diff-struck'), sampleOf('diff-new')]),
    option(true, said.lookResult, [sampleOf('diff-resolved')]),
  );
  const title = document.createElement('span');
  title.className = 'lektor-view-title';
  title.textContent = said.look;
  const group = document.createElement('div');
  group.className = 'lektor-view-choice';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', said.look);
  group.append(title, options);
  return group;
}

/** The lines the Lektor's window puts above the text: how many changes and what each mark means, and at their right how they are drawn. */
function aboveTheText(pieces: readonly TextPiece[], shown: DiffReview): HTMLElement {
  const lines = document.createElement('div');
  lines.className = 'lektor-review-lines';
  lines.append(...legendAndCounts(pieces));
  const head = document.createElement('div');
  head.className = 'lektor-review-head';
  head.append(lines, viewChoice(shown));
  return head;
}

function legendAndCounts(pieces: readonly TextPiece[]): HTMLElement[] {
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
  const legendRow = document.createElement('div');
  legendRow.className = 'lektor-review-row';
  legendRow.append(legend);
  // In the window's order: the line with the counts, then the legend.
  return [counts, legendRow];
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
  if (preamble.checked) column.append(aboveTheText(reviewed, review));
  column.append(
    createTextDiffView(
      review.piecesNow(),
      { previous: words.changePrevious, next: words.changeNext, at: words.changeAt },
      // Without the editing, the view only shows: no bar, nothing decided, a click only makes a change current.
      readOnly.checked ? { showTidied: tidying.value === 'coloured' } : { showTidied: tidying.value === 'coloured', editing: { ...review.editing(), makesRoom: barRoom.checked } },
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

const BAR_ROOM_KEY = 'diff-prototype:bar-room';
try {
  barRoom.checked = localStorage.getItem(BAR_ROOM_KEY) !== 'off';
} catch (error) {
  console.warn('Whether to make room for the bar could not be read back', error);
}
barRoom.addEventListener('change', () => {
  try {
    localStorage.setItem(BAR_ROOM_KEY, barRoom.checked ? 'on' : 'off');
  } catch (error) {
    console.warn('Whether to make room for the bar could not be remembered', error);
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
