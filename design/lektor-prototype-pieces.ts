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
  /** No internet: every request fails before it reaches anyone. */
  isOffline: boolean;
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
  isOffline: false,
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

/** What is asked of the Lektor: one of the corrections, or the utisak. */
export type Work = Preset | 'comment';

/**
 * The three Lektors he can meet (Danilo, 2026-11-10): the free Flash, the same Flash paid, and Opus,
 * which paid rework runs. Which paid one it is follows from the work, so the choice stays free or paid.
 */
export type Tier = 'free' | 'flash' | 'opus';

/** Which of the three ran or runs a model: on paid, Opus or else Flash. */
export function tierOfModel(choice: Choice, model: string): Tier {
  if (choice === 'free') return 'free';
  return model.startsWith('claude-opus') ? 'opus' : 'flash';
}

export const tierOf = (choice: Choice, what: Work): Tier => tierOfModel(choice, MODELS[choice][what]);

/**
 * Where a free request goes when it is slow and he ticked for that: paid Flash, whatever the work
 * (Danilo, 2026-11-10). The same writer he chose, without the queue, so what comes back is what he
 * asked for, only sooner; never Opus, which would swap in another writer at several times the price.
 */
export const PAID_IF_SLOW_MODEL = 'gemini-3.8-flash';

/**
 * Each one's name, the model family in quotes as Serbian sets a product's name: one name, in one
 * style, rather than a word and a grey family after it. Families only, never versions: those change.
 */
const TIER_NAMES: Readonly<Record<Tier, string>> = {
  free: 'Besplatni „Flash”',
  flash: 'Plaćeni „Flash”',
  opus: 'Plaćeni „Opus”',
};

export const nameOf = (tier: Tier): string => TIER_NAMES[tier];

/** The family alone, in quotes, for "lektora „Opus”": where the mark already says free or paid. */
export const familyOf = (tier: Tier): string => (tier === 'opus' ? '„Opus”' : '„Flash”');

/** What a paid run cost, said as paid, so the sum means something on its own; nothing on free. */
export const paidWords = (cost: number | null | undefined): string => (cost == null ? '' : ` · plaćeno ${dollars(cost)}`);
export const tierName = (choice: Choice, what: Work): string => nameOf(tierOf(choice, what));

/**
 * Who his text goes to: the company it is sent to, and no further. Past OpenRouter it may be
 * Anthropic, Google or Amazon running the model, which changes with the kind of correction and
 * with who has room, so naming one would be a promise the app can't keep.
 */
export const recipient = (): string => (state.choice === 'free' ? 'Guglu' : 'firmi OpenRouter');

/*
  The three Lektors' marks rather than a company's, since who runs each may change: a gift for the
  free one, a coin for paid Flash, a gem for Opus, the premium one (chosen on the tier marks sheet,
  Danilo, 2026-11-10).
*/
const TIER_PATHS: Readonly<Record<Tier, readonly string[]>> = {
  // Lucide's gift.
  free: ['M3 8h18v4H3z', 'M12 8v13', 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7', 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5'],
  // Lucide's circle-dollar-sign, the circle drawn as a path.
  flash: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8', 'M12 18V6'],
  // Lucide's gem.
  opus: ['M6 3h12l4 6-10 13L2 9Z', 'M11 3 8 9l4 13 4-13-3-6', 'M2 9h20'],
};

/**
 * The mark of the Lektor that does this work, or, where no work is meant (the paid key), the coin:
 * the key is OpenRouter's, for both paid ones, and Flash is the one most work goes to.
 */
export function choiceMark(choice: Choice = state.choice, what: Work | null = null): SVGSVGElement {
  return markOf(what === null ? (choice === 'free' ? 'free' : 'flash') : tierOf(choice, what));
}

export function markOf(tier: Tier): SVGSVGElement {
  return lineIcon(TIER_PATHS[tier], ['lektor-choice-mark', `lektor-choice-mark-${tier}`]);
}

/** An icon drawn in the app's line, from Lucide's paths: for the prototype's own marks, which the app's set lacks. */
export function lineIcon(paths: readonly string[], classes: readonly string[]): SVGSVGElement {
  const made = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    made.setAttribute(name, value);
  }
  made.classList.add(...classes);
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    made.append(path);
  }
  return made;
}

export function radio(name: string, label: string, checked: boolean, onChange: () => void, mark: Choice | null = null, what: Work | null = null): HTMLLabelElement {
  const made = el('label', 'lektor-preset');
  const input = el('input');
  input.type = 'radio';
  input.name = name;
  input.checked = checked;
  input.addEventListener('change', onChange);
  made.append(input);
  if (mark !== null) made.append(choiceMark(mark, what));
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
 * Under the choice, on a line of its own: the account is both paid Lektors', and the tick box for a
 * slow free one spends from it too, so it belongs to no one row (Danilo, 2026-11-10); said whose it
 * is, since apart from the rows "Na računu" alone would leave that to him. Nothing when the
 * balance can't be read: that is OpenRouter's balance lookup failing for
 * a moment while sending still works, and "unknown" would read as trouble with his money.
 */
export function balanceLine(): HTMLElement[] {
  if (state.balance === null) return [];
  const isLow = state.balance < LOW_BALANCE_USD;
  return [el('p', `lektor-balance${isLow ? ' lektor-balance-low' : ''}`, `Na računu za plaćene lektore: ${dollars(state.balance)}${isLow ? ' (malo)' : ''}`)];
}

/**
 * What a paid run cost comes off the balance at once, as OpenRouter's reply states it, so "Na računu"
 * is right the moment he is back; in the app a fresh read of the account follows to correct any lag.
 */
export function spend(cost: number | null): void {
  if (cost === null || state.balance === null) return;
  state.balance = Math.max(0, Math.round((state.balance - cost) * 100) / 100);
}

/** Who did or does it: the Lektor's mark and name, as the app's service line has them. */
export function serviceLine(by: Choice, what: Work): HTMLElement {
  return serviceLineOf(tierOf(by, what));
}

/** The same, for one that is known by the model that ran: a slow free one handed on was paid Flash. */
export function serviceLineOf(tier: Tier): HTMLElement {
  const line = el('p', 'lektor-service-line');
  line.append(el('span', '', 'AI Lektor:'), ' ', markOf(tier), el('span', '', nameOf(tier)));
  return line;
}

/**
 * What hovering a sending button tells: who gets the text and which model, one to a line. For
 * whoever wants the particulars, which he needn't. No cost: it can't be known before the run.
 */
export function sendTooltip(what: Work): string {
  const fallsBack = state.choice === 'free' && what !== 'comment' && FALLS_BACK.has(what);
  return [`Šalje se ${recipient()}`, `Model: ${MODELS[state.choice][what]}${fallsBack ? ' (ako je zauzet: gemini-3.6-flash)' : ''}`].join('\n');
}

/** A button that sends: its words, the mark of where it goes, and the app's arrow. */
export function sendButton(label: string, what: Work, onClick: () => void, className: string): HTMLButtonElement {
  const made = button(label, onClick, `${className} lektor-sends`);
  made.title = sendTooltip(what);
  made.append(choiceMark(state.choice, what), icon('move-out'));
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
