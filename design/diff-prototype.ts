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
const pencil = element('pencil', HTMLSelectElement);
const paragraphMarks = element('paragraph-marks', HTMLSelectElement);
const markColour = element('mark-colour', HTMLSelectElement);
const lineStyle = element('line-style', HTMLSelectElement);
const preamble = element('preamble', HTMLSelectElement);
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

/** A sample word drawn with the marks the text itself uses, so that it looks exactly as there. */
function markedSample(classes: string, before: string, marked: string, after = ''): HTMLElement {
  const word = document.createElement('span');
  word.className = 'prototype-legend-sample';
  const mark = document.createElement('span');
  mark.className = classes;
  mark.textContent = marked;
  word.append(before, mark, after);
  return word;
}

function legendItem(shown: HTMLElement, said: string): HTMLElement {
  const item = document.createElement('span');
  item.className = 'prototype-legend-item';
  item.append(shown, said);
  return item;
}

/**
 * What each mark in the text means, each beside a sample drawn as it is there, with the
 * counts after. A draft of the wording, for trying.
 */
function legend(pieces: readonly TextPiece[]): HTMLElement {
  const count = (kind: TextPiece['kind']): number => pieces.filter((piece) => piece.kind === kind).length;
  const line = document.createElement('p');
  line.className = 'prototype-legend';
  const counts = document.createElement('span');
  counts.textContent = `Veće promene: ${count('change')}, sitne popravke: ${count('tidy')}.`;
  line.append(
    legendItem(markedSample('diff-gone diff-struck', '', 'reč'), 'tvoj stari tekst'),
    legendItem(markedSample('diff-new', '', 'reč'), 'predlog'),
    legendItem(markedSample('diff-own', '', 'reč'), 'tvoja izmena'),
    legendItem(markedSample('diff-tidied', 're', 'č'), 'ispravljeno slovo'),
    legendItem(markedSample('diff-resolved', '', 'reč'), 'izabrano'),
    counts,
  );
  return line;
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
  const hasTidying = pieces.some((piece) => piece.kind === 'tidy');
  const shown = tidying.value === 'full' ? compared : pieces;
  review ??= createDiffReview(merging.checked ? mergeCloseChanges(shown) : shown, renderKeepingPlace, onlyNew.checked);
  result.value = review.textNow();

  const column = document.createElement('div');
  // The Lektor's own, so that its rules for the review apply here as there.
  column.className = 'review-body lektor-body';
  if (preamble.value === 'lines') {
    column.append(aside('Precrtano je trenutni tekst, zeleno je predlog.'));
    if (hasTidying && tidying.value !== 'full') column.append(aside(tidyingNote(pieces)));
  } else if (preamble.value === 'legend') {
    column.append(legend(merging.checked ? mergeCloseChanges(shown) : shown));
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
// A view and not a new comparison, as in the app: what he chose and opened stays.
onlyNew.addEventListener('change', () => {
  if (review === null) render();
  else review.setShowsOnlyNew(onlyNew.checked);
});
readOnly.addEventListener('change', startOver);

/** How far left of the text the paragraph bar stood, which is where the line marks go. */
function barInset(box: HTMLElement): number {
  const probe = document.createElement('div');
  probe.style.width = 'calc(var(--run-inset) + 8px)';
  box.append(probe);
  const inset = probe.getBoundingClientRect().width;
  probe.remove();
  return inset;
}

/** What is highlighted in a change: its boxes, or its text once collapsed. Not the room below for its dashed line. */
const HIGHLIGHTED = '.diff-new, .diff-gone, .diff-own, .diff-resolved, .diff-edit';

/**
 * The lines the current change is on, top to bottom, each as the top and bottom of what
 * is highlighted on it. Pieces side by side on one line are one line.
 */
function currentChangeLines(box: HTMLElement): { top: number; bottom: number }[] {
  const pieces = [...box.querySelectorAll('.diff-current')]
    .flatMap((fragment) => [...fragment.querySelectorAll(HIGHLIGHTED)])
    .flatMap((piece) => [...piece.getClientRects()])
    .filter((piece) => piece.height > 0)
    .sort((one, other) => one.top - other.top);
  const lines: { top: number; bottom: number }[] = [];
  for (const { top, bottom } of pieces) {
    const line = lines.at(-1);
    if (line !== undefined && top < line.bottom) {
      line.top = Math.min(line.top, top);
      line.bottom = Math.max(line.bottom, bottom);
    } else {
      lines.push({ top, bottom });
    }
  }
  return lines;
}

const LINE_MARKS = new Set(['bar-start', 'bar-extent', 'triangle', 'circle', 'arrow']);

/**
 * A mark in the margin beside the current change, tried in place of the paragraph's bar
 * and frame: a bar as tall as the first highlighted line or all of them, or a shape
 * centred on the first. Drawn in the scrolling box, so that it moves with the text.
 */
function drawLineMarks(): void {
  const box = view.querySelector<HTMLElement>('.review-text');
  if (box === null) return;
  for (const old of box.querySelectorAll('.prototype-line-mark')) old.remove();
  const mode = paragraphMarks.value;
  const lines = currentChangeLines(box);
  const [first, last] = [lines.at(0), lines.at(-1)];
  const paragraph = box.querySelector('.diff-paragraph');
  if (!LINE_MARKS.has(mode) || first === undefined || last === undefined || paragraph === null) return;

  const frame = box.getBoundingClientRect();
  const top = first.top - frame.top + box.scrollTop;
  const mark = document.createElement('div');
  mark.className = 'prototype-line-mark';
  mark.style.left = `${paragraph.getBoundingClientRect().left - frame.left + box.scrollLeft - barInset(box)}px`;
  if (mode === 'bar-start' || mode === 'bar-extent') {
    mark.style.top = `${top}px`;
    mark.style.height = `${(mode === 'bar-start' ? first.bottom : last.bottom) - first.top}px`;
  } else {
    mark.dataset['shape'] = mode;
    mark.style.top = `${top + (first.bottom - first.top) / 2}px`;
  }
  box.append(mark);
}

let lineMarksPending = false;

/** Once per frame however many things moved the current change. */
function scheduleLineMarks(): void {
  if (lineMarksPending) return;
  lineMarksPending = true;
  requestAnimationFrame(() => {
    lineMarksPending = false;
    drawLineMarks();
  });
}

// The current change moves by stepping, clicking and every redraw, all of which mark it
// with a class. Classes only: watching elements come and go would see each mark drawn,
// and draw it again, for ever.
new MutationObserver(scheduleLineMarks).observe(view, { subtree: true, attributes: true, attributeFilter: ['class'] });
addEventListener('resize', scheduleLineMarks);

/** The looks being tried, which change no decision and need no redrawing. */
const showLooks = (): void => {
  view.dataset['hover'] = hover.value;
  view.dataset['own'] = ownLook.value;
  view.dataset['chosen'] = chosenLook.value;
  view.dataset['dots'] = dots.checked ? 'on' : 'off';
  view.dataset['pencil'] = pencil.value;
  view.dataset['paragraphMarks'] = paragraphMarks.value;
  view.dataset['markColour'] = markColour.value;
  view.dataset['line'] = lineStyle.value;
  scheduleLineMarks();
};
for (const control of [hover, ownLook, chosenLook, dots, pencil, paragraphMarks, markColour, lineStyle]) {
  control.addEventListener('change', showLooks);
}
showLooks();
choiceWords.addEventListener('change', renderKeepingPlace);

// Its own key: the one before held "on" and "off", which mean nothing to this list.
const PREAMBLE_KEY = 'diff-prototype:above-text';
try {
  const remembered = localStorage.getItem(PREAMBLE_KEY);
  if (remembered !== null && [...preamble.options].some((option) => option.value === remembered)) preamble.value = remembered;
} catch (error) {
  console.warn('Whether to show the lines above the text could not be read back', error);
}
preamble.addEventListener('change', () => {
  try {
    localStorage.setItem(PREAMBLE_KEY, preamble.value);
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
