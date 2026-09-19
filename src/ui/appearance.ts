/**
 * How the app looks, and the few choices he's offered over it.
 *
 * He is a visual person and the machines he uses differ wildly in screen and
 * age, so this is his to set rather than ours to guess. Everything here is a
 * named choice rather than a raw value: a colour is `blue`, not a hex code, and
 * a size is `larger`, not a pixel count. That keeps the settings file readable,
 * keeps an older build from choking on a newer one, and means we can retune any
 * of these without his saved choice turning into something ugly.
 */

export type FontChoice = 'tahoma' | 'calibri' | 'corbel' | 'verdana' | 'segoe';
export type AccentChoice = 'blue' | 'teal' | 'green' | 'gold' | 'red' | 'violet';
export type ModeChoice = 'light' | 'dark';
export type WritingFontChoice = 'georgia' | 'cambria' | 'corbel';

export interface Appearance {
  font: FontChoice;
  /** How much larger than life the app is, the way a browser means it. */
  zoom: number;
  accent: AccentChoice;
  mode: ModeChoice;
  /** His writing, which is the point of the whole thing. */
  writingFont: WritingFontChoice;
  /** On top of the zoom, so his prose can grow without the list growing with it. */
  writingSize: number;
}

/**
 * Light, always, and never taken from what Windows happens to be set to. He
 * would have no idea why the app had changed, and "it looks different today" is
 * the same alarm as "it disappeared".
 */
export const DEFAULT_APPEARANCE: Appearance = {
  font: 'tahoma',
  zoom: 1,
  accent: 'blue',
  mode: 'light',
  writingFont: 'georgia',
  writingSize: 1,
};

export const MODES = ['light', 'dark'] as const satisfies readonly ModeChoice[];

interface FontFace {
  /** Shown to him as its own name, set in itself — the only label that means anything. */
  readonly label: string;
  readonly stack: string;
  /**
   * Corrects for x-height so every face looks the same size as the others.
   * Measured, not guessed: Calibri and Corbel draw noticeably smaller at a given
   * pixel size, and without this, choosing a font would silently change how big
   * his list is.
   */
  readonly scale: number;
}

export const FONTS = {
  tahoma: { label: 'Tahoma', stack: "Tahoma, 'Segoe UI', sans-serif", scale: 1 },
  calibri: { label: 'Calibri', stack: "Calibri, 'Segoe UI', sans-serif", scale: 1.13 },
  corbel: { label: 'Corbel', stack: "Corbel, 'Segoe UI', sans-serif", scale: 1.13 },
  verdana: { label: 'Verdana', stack: 'Verdana, sans-serif', scale: 1 },
  segoe: { label: 'Segoe UI', stack: "'Segoe UI', system-ui, sans-serif", scale: 1 },
} as const satisfies Record<FontChoice, FontFace>;

/**
 * The sizes he can step through, for the app as a whole and for his writing
 * alone, and they are not ours.
 *
 * This is Chromium's own preset ladder — the values Ctrl+ and Ctrl- move
 * between in Chrome, taken from `kPresetBrowserZoomFactors` — cut down to the
 * range that suits this app. A geometric step of our own invention was the
 * obvious thing to write and it was wrong: it produced 121% and 146%, numbers
 * no browser has ever shown anyone. These are the numbers he has seen every
 * time he has ever zoomed anything, and 125% is the same 125% Windows offers
 * him in its own display settings.
 *
 * The full ladder runs 25% to 500%. Below 80% the app is smaller than it has
 * any business being for him. 200% is the top because 250% was tried and is
 * absurd: the panel outgrows the window it sits in, and a title is two words
 * wide. 200% is already generous, and Windows has its own display scaling for
 * anyone who needs more than that.
 */
export const SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export const MIN_SCALE = SCALE_STEPS[0];

/**
 * How far each of the two sizes may go, and they are not the same.
 *
 * The app stops at 175%: past that the panel outgrows the window it sits in
 * and a title is two words wide. His writing may go to 200%, because that is
 * the one that has to answer his eyes — and it can, now that it is no longer
 * the app zoom's job to make his text bigger. Anyone needing more than this
 * wants Windows' own display scaling, which enlarges every program he uses
 * rather than this one alone.
 */
export const MAX_ZOOM = 1.75;
export const MAX_WRITING = SCALE_STEPS[SCALE_STEPS.length - 1] ?? 1;

function nearestStep(factor: number, ceiling: number): number {
  let nearest = 0;
  for (let i = 1; i < SCALE_STEPS.length; i += 1) {
    const step = SCALE_STEPS[i] ?? 1;
    if (step > ceiling) break;
    if (Math.abs(step - factor) < Math.abs((SCALE_STEPS[nearest] ?? 1) - factor)) nearest = i;
  }
  return nearest;
}

/**
 * Brings any stored number onto the ladder.
 *
 * Snapped rather than merely clamped, so a file written by a build that stepped
 * differently — or edited by hand — lands on a real step instead of sitting
 * between two of them, where pressing + would jump somewhere unexpected.
 */
export function clampScale(factor: number, ceiling: number = MAX_WRITING): number {
  if (!Number.isFinite(factor)) return DEFAULT_APPEARANCE.zoom;
  return SCALE_STEPS[nearestStep(factor, ceiling)] ?? DEFAULT_APPEARANCE.zoom;
}

/** The next rung up or down, stopping at either end. */
export function stepScale(
  factor: number,
  direction: 1 | -1,
  ceiling: number = MAX_WRITING,
): number {
  const next = nearestStep(factor, ceiling) + direction;
  const stepped = SCALE_STEPS[next];
  if (next < 0 || stepped === undefined || stepped > ceiling) return clampScale(factor, ceiling);
  return stepped;
}

export function isScale(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The three faces his own writing can be set in.
 *
 * A far shorter list than the interface gets, and a different one: these are
 * chosen for reading paragraphs rather than for labelling buttons. Two serifs
 * because that is what he writes in, and one sans for the possibility that he
 * simply cannot get on with serifs.
 *
 * The sans is Corbel and not Verdana. Verdana is superbly legible and it is a
 * screen face, but it was drawn for short strings at small sizes — interface
 * labels — and it is wide and evenly weighted, which makes a flat texture and
 * a short measure over a page of prose. Corbel, Cambria and Constantia came
 * out of Microsoft's ClearType collection as text faces for exactly this, and
 * Corbel is the sans among them.
 *
 * `scale` matches x-heights to Georgia, so changing the face doesn't silently
 * change how big his text is. Measured, not guessed: Corbel runs 4% smaller at
 * the same pixel size.
 *
 * Shown after each face's name, set in that face.
 *
 * A line of ordinary speech rather than a specimen phrase: what he is judging
 * is how a sentence of his sits on the page, and a pangram would tell him about
 * letters he will never notice. It carries č and ć, which is what he needs to
 * see, and it is a line he will recognise.
 */
const WRITING_SAMPLE = 'Kakav čoek gospodin bi bio da mu nema te mane, no da se hrani vaduhom';

export const WRITING_FONTS = {
  georgia: { label: 'Georgia', stack: "Georgia, 'Times New Roman', serif", scale: 1 },
  cambria: { label: 'Cambria', stack: 'Cambria, Georgia, serif', scale: 1.021 },
  corbel: { label: 'Corbel', stack: "Corbel, 'Segoe UI', sans-serif", scale: 1.043 },
} as const satisfies Record<
  WritingFontChoice,
  { label: string; stack: string; scale: number }
>;

export function writingSampleFor(choice: WritingFontChoice): string {
  return `${WRITING_FONTS[choice].label} — ${WRITING_SAMPLE}`;
}

export function isWritingFontChoice(value: unknown): value is WritingFontChoice {
  return typeof value === 'string' && Object.hasOwn(WRITING_FONTS, value);
}

/**
 * One hue drives the whole interface.
 *
 * The app is otherwise monochrome. The greys are not neutral greys — they carry
 * a little of the chosen hue, so the accent never looks pasted onto a grey app,
 * and the accent itself is only spent where something genuinely needs pointing
 * at: the text he has open, and whatever has the keyboard.
 */
export const ACCENTS = {
  blue: { hue: 212, saturation: 58 },
  teal: { hue: 186, saturation: 44 },
  green: { hue: 146, saturation: 38 },
  gold: { hue: 36, saturation: 60 },
  red: { hue: 12, saturation: 52 },
  violet: { hue: 278, saturation: 38 },
} as const satisfies Record<AccentChoice, { hue: number; saturation: number }>;

/** Everything else in the interface is sized off these two. */
const BASE_UI_PX = 16.5;
const BASE_TEXT_PX = 21.6;

export function isFontChoice(value: unknown): value is FontChoice {
  return typeof value === 'string' && Object.hasOwn(FONTS, value);
}

export function isAccentChoice(value: unknown): value is AccentChoice {
  return typeof value === 'string' && Object.hasOwn(ACCENTS, value);
}

export function isModeChoice(value: unknown): value is ModeChoice {
  return value === 'light' || value === 'dark';
}

/**
 * Puts his choices onto the document as the handful of custom properties the
 * stylesheet derives everything else from.
 *
 * @param root normally `document.documentElement`; taken as a parameter so a
 * preview swatch can be themed without touching the whole app.
 */
export function applyAppearance(root: HTMLElement, appearance: Appearance): void {
  const font = FONTS[appearance.font];
  const accent = ACCENTS[appearance.accent];

  // Zoom is not among these: it scales the whole window and is the host's to
  // apply, so that Ctrl+ and our own buttons move one and the same thing.
  const writing = WRITING_FONTS[appearance.writingFont];

  root.style.setProperty('--ui-font', font.stack);
  root.style.setProperty('--ui-size', `${(BASE_UI_PX * font.scale).toFixed(2)}px`);
  root.style.setProperty('--writing-font', writing.stack);
  root.style.setProperty(
    '--text-size',
    `${(BASE_TEXT_PX * writing.scale * appearance.writingSize).toFixed(2)}px`,
  );
  root.style.setProperty('--accent-h', String(accent.hue));
  root.style.setProperty('--accent-s', `${accent.saturation}%`);

  // An attribute rather than another custom property: the stylesheet swaps a
  // whole ladder of lightnesses on it, which a single value can't express.
  root.dataset['mode'] = appearance.mode;
}
