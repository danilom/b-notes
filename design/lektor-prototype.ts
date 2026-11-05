import { titleFrom } from '../src/notes/note-title.ts';
import { openLektorDialog } from '../src/ui/lektor/lektor-dialog.ts';
import { DIFF_SAMPLES, type DiffSample, fetchRealSamples } from './diff-prototype-samples.ts';

function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`The page has no ${kind.name} #${id}`);
  return found;
}

const text = element('text', HTMLTextAreaElement);
const sample = element('sample', HTMLSelectElement);
const status = element('status', HTMLParagraphElement);
const dialog = element('lektor', HTMLDialogElement);

const samples: DiffSample[] = [...DIFF_SAMPLES];

const chosenSample = (): DiffSample | undefined => samples[Number(sample.value)];

function showSample(): void {
  text.value = chosenSample()?.current ?? '';
  status.textContent = '';
}

function openDialog(): void {
  const chosen = chosenSample();
  if (chosen === undefined) return;

  const close = openLektorDialog(
    dialog,
    element('lektor-confirm', HTMLDialogElement),
    { title: titleFrom(text.value), current: text.value, proposed: chosen.proposed },
    'sr',
    {
      onApply: (result) => {
        close();
        text.value = result;
        status.textContent = 'Izmene su unete. Pravi dijalog bi prethodni tekst sačuvao kao verziju; ovde se ništa ne čuva.';
      },
      onClose: () => {
        close();
        status.textContent = 'Zatvoreno, tekst je ostao kakav je bio.';
      },
    },
  );
}

sample.append(...samples.map(({ name }, at) => new Option(name, String(at))));
sample.addEventListener('change', showSample);
element('reset', HTMLButtonElement).addEventListener('click', showSample);
element('open', HTMLButtonElement).addEventListener('click', openDialog);

const dark = element('dark', HTMLInputElement);
dark.addEventListener('change', () => {
  document.documentElement.dataset['mode'] = dark.checked ? 'dark' : 'light';
});

/** His real texts first, where the server has any, and opens straight into the dialog: it is what the page is for. */
async function start(): Promise<void> {
  const real = await fetchRealSamples();
  samples.unshift(...real);
  sample.replaceChildren(...samples.map(({ name }, at) => new Option(name, String(at))));
  sample.value = '0';
  showSample();
  openDialog();
}

void start();
