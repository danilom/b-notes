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
const onlyNew = element('only-new', HTMLInputElement);
const readOnly = element('read-only', HTMLInputElement);
const hover = element('hover', HTMLSelectElement);
const ownLook = element('own-look', HTMLSelectElement);
const chosenLook = element('chosen-look', HTMLSelectElement);
const choiceWords = element('choice-words', HTMLSelectElement);
const dots = element('dots', HTMLInputElement);
const preamble = element('preamble', HTMLInputElement);
const view = element('view', HTMLElement);

/** The bar's choices named for what each one is, rather than for what it does. */
const NOUNS = { old: 'Staro', proposed: 'Predlog', own: 'Tvoje' };

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
  review ??= createDiffReview(merging.checked ? mergeCloseChanges(shown) : shown, renderKeepingPlace, onlyNew.checked);
  result.value = review.textNow();

  const column = document.createElement('div');
  // The Lektor's own, so that its rules for the review apply here as there.
  column.className = 'review-body lektor-body';
  if (preamble.checked) {
    column.append(aside('Precrtano je trenutni tekst, zeleno je predlog.'));
    if (hasTidying && tidying.value !== 'full') column.append(aside(tidyingNote(pieces)));
  }
  column.append(
    createTextDiffView(
      review.piecesNow(),
      { previous: words.changePrevious, next: words.changeNext, at: words.changeAt },
      // Without the editing, the view only shows: no bar, nothing decided, a click only makes a change current.
      readOnly.checked
        ? { showTidied: tidying.value === 'coloured' }
        : {
            showTidied: tidying.value === 'coloured',
            editing: { ...review.editing(), ...(choiceWords.value === 'nouns' ? { choiceWords: NOUNS } : {}) },
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
onlyNew.addEventListener('change', startOver);
readOnly.addEventListener('change', startOver);

/** The looks being tried, which change no decision and need no redrawing. */
const showLooks = (): void => {
  view.dataset['hover'] = hover.value;
  view.dataset['own'] = ownLook.value;
  view.dataset['chosen'] = chosenLook.value;
  view.dataset['dots'] = dots.checked ? 'on' : 'off';
};
for (const control of [hover, ownLook, chosenLook, dots]) control.addEventListener('change', showLooks);
showLooks();
choiceWords.addEventListener('change', renderKeepingPlace);

const PREAMBLE_KEY = 'diff-prototype:preamble';
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

function rememberedTab(): string | null {
  try {
    return localStorage.getItem(TAB_KEY) || null;
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
