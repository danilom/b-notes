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
export type SizeChoice = 'normal' | 'large' | 'larger' | 'largest';
export type AccentChoice = 'blue' | 'teal' | 'green' | 'gold' | 'red' | 'violet';

export interface Appearance {
  font: FontChoice;
  size: SizeChoice;
  accent: AccentChoice;
}

export const DEFAULT_APPEARANCE: Appearance = {
  font: 'tahoma',
  size: 'normal',
  accent: 'blue',
};

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

/** Steps rather than a slider: four things to choose between, not a number to get right. */
export const SIZES = {
  normal: 1,
  large: 1.15,
  larger: 1.3,
  largest: 1.5,
} as const satisfies Record<SizeChoice, number>;

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

export function isSizeChoice(value: unknown): value is SizeChoice {
  return typeof value === 'string' && Object.hasOwn(SIZES, value);
}

export function isAccentChoice(value: unknown): value is AccentChoice {
  return typeof value === 'string' && Object.hasOwn(ACCENTS, value);
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
  const size = SIZES[appearance.size];
  const accent = ACCENTS[appearance.accent];

  root.style.setProperty('--ui-font', font.stack);
  root.style.setProperty('--ui-size', `${(BASE_UI_PX * font.scale * size).toFixed(2)}px`);
  root.style.setProperty('--text-size', `${(BASE_TEXT_PX * size).toFixed(2)}px`);
  root.style.setProperty('--accent-h', String(accent.hue));
  root.style.setProperty('--accent-s', `${accent.saturation}%`);
}
