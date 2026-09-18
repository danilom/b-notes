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

export interface Appearance {
  font: FontChoice;
  /** How much larger than life, the way a browser means it. 1 is unscaled. */
  zoom: number;
  accent: AccentChoice;
  mode: ModeChoice;
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
 * Bounds on how far he can take it.
 *
 * Below 0.8 the app is smaller than it has any business being for him; above
 * 2.5 the left pane eats the window and a title is three words wide. Both ends
 * are reachable and neither is a cliff — he simply stops getting bigger.
 */
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 2.5;

/** A tenth per press: visible enough to be worth the click, small enough to aim with. */
const ZOOM_STEP = 1.1;

export function clampZoom(factor: number): number {
  if (!Number.isFinite(factor)) return DEFAULT_APPEARANCE.zoom;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor));
}

/**
 * The next step up or down.
 *
 * Multiplicative rather than additive, because a tenth of the current size is
 * the same apparent jump at every size — a flat 0.1 is a big step at 0.8 and
 * barely visible at 2.5. Rounded so that stepping up and back down again lands
 * exactly where it started rather than drifting.
 */
export function stepZoom(factor: number, direction: 1 | -1): number {
  const stepped = direction === 1 ? factor * ZOOM_STEP : factor / ZOOM_STEP;
  return clampZoom(Math.round(stepped * 100) / 100);
}

export function isZoom(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
  root.style.setProperty('--ui-font', font.stack);
  root.style.setProperty('--ui-size', `${(BASE_UI_PX * font.scale).toFixed(2)}px`);
  root.style.setProperty('--text-size', `${BASE_TEXT_PX}px`);
  root.style.setProperty('--accent-h', String(accent.hue));
  root.style.setProperty('--accent-s', `${accent.saturation}%`);

  // An attribute rather than another custom property: the stylesheet swaps a
  // whole ladder of lightnesses on it, which a single value can't express.
  root.dataset['mode'] = appearance.mode;
}
