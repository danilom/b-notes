import { diffParagraphs } from '../src/notes/paragraph-diff.ts';
import { type DiffViewOptions, createDiffView } from '../src/ui/diff-view.ts';
import { DIFF_SAMPLES } from './diff-prototype-samples.ts';

function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`The page has no ${kind.name} #${id}`);
  return found;
}

const current = element('current', HTMLTextAreaElement);
const proposed = element('proposed', HTMLTextAreaElement);
const sample = element('sample', HTMLSelectElement);
const shorten = element('shorten', HTMLInputElement);
const dark = element('dark', HTMLInputElement);
const view = element('view', HTMLElement);

/**
 * Proposed goes first because the first text is the one whose paragraphs read
 * as added, and what a proofreader proposes is what would be added. Its words
 * are the new ones for the same reason, which is the opposite of how Ranije
 * verzije calls the view.
 */
function optionsNow(): DiffViewOptions {
  return {
    tags: {
      added: { tag: '(+) New', why: '(in Proposed, not in Current)' },
      missing: { tag: '(−) Removed', why: '(in Current, not in Proposed)' },
      changed: { tag: '(±) Changed', why: '(in both; struck through is Current, green is Proposed)' },
    },
    stepper: { previous: 'Previous', next: 'Next', at: (at, total) => `Change ${at} of ${total}` },
    newWords: 'added',
    shortenMissing: shorten.checked,
  };
}

function render(): void {
  const { pieces, unrelated } = diffParagraphs(proposed.value, current.value);

  const column = document.createElement('div');
  column.className = 'review-body';

  if (unrelated) {
    const aside = document.createElement('p');
    aside.className = 'review-note-aside';
    aside.textContent = 'Reported as unrelated: not one paragraph matches, so nothing is marked.';
    column.append(aside);
  }
  column.append(createDiffView(pieces, optionsNow()));
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
shorten.addEventListener('change', renderKeepingPlace);

element('swap', HTMLButtonElement).addEventListener('click', () => {
  [current.value, proposed.value] = [proposed.value, current.value];
  render();
});

dark.addEventListener('change', () => {
  document.documentElement.dataset['mode'] = dark.checked ? 'dark' : 'light';
});

showSample(0);
