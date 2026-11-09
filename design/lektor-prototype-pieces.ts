/*
  What the Lektor prototype's panel and window share: the state the switches set, the made-up
  text, and the app's own small pieces rebuilt from its classes and icons, so that what is drawn
  is what the app would draw. Nothing real behind any of it.

  The text is made up on purpose: this folder is committed to a public repository, and his
  essays must never be.
*/
import { icon } from '../src/ui/icons.ts';

export type Choice = 'free' | 'paid';
export type Preset = 'letters' | 'grammar' | 'wording' | 'rewrite';
export const PRESETS: readonly Preset[] = ['letters', 'grammar', 'wording', 'rewrite'];

export const PRESET_NAMES: Readonly<Record<Preset, string>> = {
  letters: 'Slova i zarezi',
  grammar: 'Pravopis i gramatika',
  wording: 'Stilska dorada',
  rewrite: 'Dubinska prerada',
};

/** The app's own instructions, whole, so the window shows what would really be sent. */
export { PRESET_PROMPTS } from '../src/ui/lektor/lektor-presets.ts';

/** What each choice runs, for the tooltips and the review's line. */
export const MODELS: Readonly<Record<Choice, Readonly<Record<Preset | 'comment', string>>>> = {
  free: { comment: 'gemini-3.8-flash', letters: 'gemini-3.8-flash', grammar: 'gemini-3.8-flash', wording: 'gemini-3.8-flash', rewrite: 'gemini-3.8-flash' },
  paid: { comment: 'claude-opus-5.5', letters: 'gemini-3.8-flash', grammar: 'gemini-3.8-flash', wording: 'claude-opus-5.5', rewrite: 'claude-opus-5.5' },
};

/** Only corrections fall back: on rework the quicker model fades and loses his dialect, so he hears it's busy. */
export const FALLS_BACK: ReadonlySet<Preset> = new Set(['letters', 'grammar']);

export const TEXT_TITLE = 'Probni tekst';

/** Made up, in his way of writing: ijekavian, Latin letters, most diacritics left out. */
export const TEXT_PARAGRAPHS: readonly string[] = [
  'Ujutru sam sisao do obale, gdje ribari vec slazu mreze. Mirisalo je na so i na kafu iz obliznje kafane, a galebovi su se svadjali oko onoga sto je ostalo od noci.',
  'Djed Marko sjedio je na klupi i gledao more kao da ga prvi put vidi. Rekao mi je: "Vidi kako se bonaca smirila, a juce je jugo lomilo grane." Ja sam klimnuo glavom i sjeo pored njega.',
  'Dugo smo cutali; ponekad je tisina bolja od price. Preko zaliva je prolazio trajekt, spor i bijel, i za njim je ostajala pruga koja se polako zatvarala.',
  'Kad je sunce preslo preko brda, djed je ustao, otresao kapu i krenuo uz stepenice. "Ajde," rekao je, "riba nece cekati." Ostao sam jos malo, da vidim kako voda mijenja boju.',
];

export type Pace = 'short' | 'double' | 'quadruple' | 'real';

export interface PrototypeState {
  choice: Choice;
  /** Dollars on the account, or null when it couldn't be read. */
  balance: number | null;
  /** How Google's free tier treats each model today: as normal, with a queue past the limit, or refusing it as busy. */
  google: Record<FreeModel, GoogleDay>;
  /** How long the pretended waits take: shortened to watch, twice that to feel, or as measured. */
  pace: Pace;
  /** The paid Lektor is refused for want of money. */
  isMoneyOut: boolean;
}

/** The free tier's two models: 3.8 first, 3.6 standing in for it on Slova i zarezi and Pravopis. */
export type FreeModel = 'gemini-3.8-flash' | 'gemini-3.6-flash';
export type GoogleDay = 'ok' | 'slow' | 'busy';

export const state: PrototypeState = {
  choice: 'free',
  balance: 7.47,
  google: { 'gemini-3.8-flash': 'ok', 'gemini-3.6-flash': 'ok' },
  pace: 'double',
  isMoneyOut: false,
};

export function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`The page has no ${kind.name} #${id}`);
  return found;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  if (className !== '') made.className = className;
  if (text !== '') made.textContent = text;
  return made;
}

export function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const made = el('button', className, label);
  made.type = 'button';
  made.addEventListener('click', onClick);
  return made;
}

/** The sign first, as dollars are written; the decimal comma, as everything else in the app. */
export const dollars = (amount: number): string => `$${amount.toFixed(2).replace('.', ',')}`;
export const lektorName = (choice: Choice = state.choice): string => (choice === 'free' ? 'Besplatni' : 'Plaćeni');

/**
 * Who his text goes to: the company it is sent to, and no further. Past OpenRouter it may be
 * Anthropic, Google or Amazon running the model, which changes with the kind of correction and
 * with who has room, so naming one would be a promise the app can't keep.
 */
export const recipient = (): string => (state.choice === 'free' ? 'Guglu' : 'firmi OpenRouter');

/* The free and paid marks: a gift and a coin rather than a company's mark, since who runs either may change. */

const CHOICE_PATHS: Readonly<Record<Choice, readonly string[]>> = {
  // Lucide's gift.
  free: ['M3 8h18v4H3z', 'M12 8v13', 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7', 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5'],
  // Lucide's circle-dollar-sign, the circle drawn as a path.
  paid: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8', 'M12 18V6'],
};

export function choiceMark(choice: Choice = state.choice): SVGSVGElement {
  const made = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    made.setAttribute(name, value);
  }
  made.classList.add('lektor-choice-mark', `lektor-choice-mark-${choice}`);
  for (const d of CHOICE_PATHS[choice]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    made.append(path);
  }
  return made;
}

export function radio(name: string, label: string, checked: boolean, onChange: () => void, mark: Choice | null = null): HTMLLabelElement {
  const made = el('label', 'lektor-preset');
  const input = el('input');
  input.type = 'radio';
  input.name = name;
  input.checked = checked;
  input.addEventListener('change', onChange);
  made.append(input);
  if (mark !== null) made.append(choiceMark(mark));
  made.append(el('span', '', label));
  return made;
}

/**
 * Under this the balance line says "malo" and turns red: the only warning about money. No cost is
 * estimated in advance: it is mostly the model's thinking, which varies, at prices that can change,
 * so a warning built on a guess would cry wolf or stay quiet. Nothing is blocked either: if the
 * money runs out, OpenRouter refuses and the window says so, with the way to the free one.
 */
export const LOW_BALANCE_USD = 1;

/**
 * Under Plaćeni, in the panel and in the window alike. Nothing when the balance can't be read:
 * that is OpenRouter's balance lookup failing for a moment while sending still works, and
 * "unknown" would read as trouble with his money.
 */
export function balanceLine(): HTMLElement[] {
  if (state.balance === null) return [];
  // A span: it goes inside Plaćeni's label, where a paragraph may not.
  if (state.balance >= LOW_BALANCE_USD) return [el('span', 'lektor-balance', `Na računu: ${dollars(state.balance)}`)];
  return [el('span', 'lektor-balance lektor-balance-low', `Na računu: ${dollars(state.balance)} (malo)`)];
}

/** Who did or does it: the Lektor's mark and name, as the app's service line has them. */
export function serviceLine(by: Choice = state.choice): HTMLElement {
  const line = el('p', 'lektor-service-line');
  line.append(el('span', '', 'AI Lektor:'), ' ', choiceMark(by), el('span', '', lektorName(by)));
  return line;
}

/**
 * What hovering a sending button tells: who gets the text and which model, one to a line. For
 * whoever wants the particulars, which he needn't. No cost: it can't be known before the run.
 */
export function sendTooltip(what: Preset | 'comment'): string {
  const fallsBack = state.choice === 'free' && what !== 'comment' && FALLS_BACK.has(what);
  return [`Šalje se ${recipient()}`, `Model: ${MODELS[state.choice][what]}${fallsBack ? ' (ako je zauzet: gemini-3.6-flash)' : ''}`].join('\n');
}

/** A button that sends: its words, the mark of where it goes, and the app's arrow. */
export function sendButton(label: string, what: Preset | 'comment', onClick: () => void, className: string): HTMLButtonElement {
  const made = button(label, onClick, `${className} lektor-sends`);
  made.title = sendTooltip(what);
  made.append(choiceMark(), icon('move-out'));
  return made;
}

export function problem(sentence: string, note = ''): HTMLElement {
  const box = el('div', 'lektor-problem');
  box.setAttribute('role', 'alert');
  const lines = el('div', 'lektor-problem-words');
  lines.append(el('p', 'lektor-line', sentence));
  if (note !== '') lines.append(el('p', 'lektor-where', note));
  box.append(icon('problem'), lines);
  return box;
}
