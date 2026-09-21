import { type Shown, showAsModal } from './modal.ts';
import { type Language, strings } from '../language/wording.ts';
import {
  ACCENTS,
  type Appearance,
  DEFAULT_APPEARANCE,
  FONTS,
  MAX_WRITING,
  MIN_SCALE,
  MAX_ZOOM,
  MODES,
  WRITING_FONTS,
  stepScale,
  writingSampleFor,
} from './appearance.ts';
import { titleOf } from './dialog-heading.ts';
import { icon } from './icons.ts';

/**
 * The one place he is asked to make a choice about the app rather than about
 * his writing.
 *
 * Deliberately the one corner of the app that behaves like a Windows dialog
 * rather than like the rest of it: choices preview live, but nothing is kept
 * until he says so, and the X, Escape and Otkaži all put it back exactly as he
 * found it. Everywhere else his work saves itself and there is nothing to undo.
 * Here he is experimenting with how things look, which is precisely the case
 * where being able to back out is what makes experimenting safe.
 */
export interface PanelHandlers {
  /** The door to the settings that are not his. See `advanced-panel.ts`. */
  onAdvanced: () => void;
  /** Put it on screen without keeping it. The panel applies nothing itself. */
  onPreview: (appearance: Appearance) => void;
  onKeep: (appearance: Appearance) => void;
  onCancel: () => void;
}

/** A panel that is open, and the two things anyone outside it needs. */
export interface OpenPanel {
  close: () => void;
  /**
   * What he has chosen so far, which is not yet what is saved.
   *
   * The keyboard can change the size while this is open, and it has to step
   * from what the panel is showing rather than from what is on disk — otherwise
   * the two disagree about the current size and the panel writes a stale one
   * back when he presses U redu.
   */
  current: () => Appearance;
  change: (next: Appearance) => void;
}

interface OptionSpec<T extends string> {
  value: T;
  /** What this option is called. Always set, even where nothing is drawn. */
  name: string;
  /** What he sees, where that isn't the name — a sample, or nothing at all. */
  label?: string;
  className?: string;
  /** Styling for the button itself, so each option looks like what it does. */
  style?: Partial<CSSStyleDeclaration>;
  swatch?: string;
}

/** `Object.keys` widens to `string`, which loses every one of these unions. */
function choicesIn<T extends string>(record: Record<T, unknown>): T[] {
  return Object.keys(record) as T[];
}

function optionGroup<T extends string>(
  heading: string,
  options: readonly OptionSpec<T>[],
  chosen: T,
  choose: (value: T) => void,
): HTMLElement {
  const group = document.createElement('section');
  group.className = 'choice-group';

  const title = document.createElement('h3');
  title.textContent = heading;
  group.append(title);

  const list = document.createElement('div');
  list.className = 'choices';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', heading);

  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = option.className === undefined ? 'choice' : `choice ${option.className}`;
    button.setAttribute('aria-pressed', String(option.value === chosen));

    // Named even when unnamed on screen, so the tooltip and a screen reader
    // both have something better than "button" to say.
    button.title = option.name;
    button.setAttribute('aria-label', option.name);
    if (option.style !== undefined) Object.assign(button.style, option.style);

    if (option.swatch !== undefined) {
      const dot = document.createElement('span');
      dot.className = 'swatch';
      dot.style.background = option.swatch;
      button.append(dot);
    }

    if (option.label !== undefined) {
      const label = document.createElement('span');
      label.textContent = option.label;
      button.append(label);
    }

    button.addEventListener('click', () => choose(option.value));
    list.append(button);
  }

  group.append(list);
  return group;
}

/**
 * A pair of buttons and a reading, rather than a row of named sizes.
 *
 * The named steps asked him to judge four samples against each other inside a
 * fixed-size panel and predict which would suit a whole essay. Bigger and
 * smaller ask a far easier question — is this comfortable yet? — against the
 * real thing behind the panel, and they go on asking it as far as he wants.
 *
 * The percentage is there for the telephone. It is the only part of how the app
 * looks that can be said out loud, which is what makes "what does it say?" a
 * question with an answer.
 */
function scaleGroup(
  words: ReturnType<typeof strings>,
  heading: string,
  factor: number,
  setTo: (next: number) => void,
  ceiling?: number,
  /** Something to sit at the far end of the same row, if anything does. */
  beside?: HTMLElement,
): HTMLElement {
  const group = document.createElement('section');
  group.className = 'choice-group';

  const title = document.createElement('h3');
  title.textContent = heading;

  const row = document.createElement('div');
  row.className = 'choices zoom-row';

  const step = (direction: 1 | -1, name: string, glyph: string): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice zoom-step';
    button.textContent = glyph;
    button.title = name;
    button.setAttribute('aria-label', name);
    const next = stepScale(factor, direction, ceiling);
    // Stopped rather than hidden at the ends: a button that vanishes is a
    // button he has to find again.
    button.disabled = next === factor;
    button.addEventListener('click', () => setTo(next));
    return button;
  };

  const reading = document.createElement('span');
  reading.className = 'zoom-reading';
  reading.textContent = `${Math.round(factor * 100)}%`;
  reading.setAttribute('aria-live', 'polite');

  row.append(
    step(-1, words.appearanceSmaller, '−'),
    reading,
    step(1, words.appearanceLarger, '+'),
  );
  if (beside !== undefined) row.append(beside);
  group.append(title, row);
  return group;
}

/** Groups narrow enough to sit side by side, so the panel stays short. */
function row(groups: readonly HTMLElement[]): HTMLElement {
  const line = document.createElement('div');
  line.className = 'group-row';
  line.append(...groups);
  return line;
}

/**
 * One half of the panel, named for what it changes.
 *
 * Both halves hold something called Veličina, and without this they would sit
 * in one flat list two inches apart with no way to tell which was which. Split
 * by what each affects, the same word is unambiguous in both places: one is the
 * size of his writing, the other the size of the app around it.
 */
function half(heading: string, groups: readonly HTMLElement[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'panel-half';

  const title = document.createElement('h2');
  title.textContent = heading;
  section.append(title, ...groups);
  return section;
}

/**
 * Builds the panel's contents for the choices as they currently stand.
 *
 * Rebuilt outright on every change rather than patched, because it is a dozen
 * buttons and the alternative is bookkeeping that can drift out of step with
 * what he's looking at.
 */
function fill(
  panel: HTMLElement,
  chosen: Appearance,
  language: Language,
  handlers: PanelHandlers,
  change: (next: Appearance) => void,
): void {
  const words = strings(language);

  const header = document.createElement('header');
  const title = titleOf({ mark: 'appearance', label: words.appearance });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  // The one convention he has never had to be taught. It means what it means
  // on every window he has ever shut: leave, and leave nothing behind.
  close.title = words.appearanceClose;
  close.setAttribute('aria-label', words.appearanceClose);
  close.append(icon('close'));
  close.addEventListener('click', handlers.onCancel);
  header.append(title, close);

  // The one group that still names itself: a face has to be seen to be judged,
  // and its name set in itself is both the sample and the label.
  const fonts = optionGroup(
    words.appearanceFont,
    choicesIn(FONTS).map((value) => ({
      value,
      name: FONTS[value].label,
      label: FONTS[value].label,
      // Scaled the way the app scales it, so what he sees is what he'd get.
      style: {
        fontFamily: FONTS[value].stack,
        fontSize: `${(15 * FONTS[value].scale).toFixed(1)}px`,
      },
    })),
    chosen.font,
    (font) => change({ ...chosen, font }),
  );

  const appSize = scaleGroup(
    words,
    words.appearanceSize,
    chosen.zoom,
    (zoom) => change({ ...chosen, zoom }),
    MAX_ZOOM,
  );

  // A line of prose rather than the font's name: what matters in a paragraph is
  // how the whole line sits, which one word cannot show him.
  const writingFonts = optionGroup(
    words.appearanceFont,
    choicesIn(WRITING_FONTS).map((value) => ({
      value,
      name: writingSampleFor(value),
      label: writingSampleFor(value),
      className: 'writing-choice',
      style: {
        fontFamily: WRITING_FONTS[value].stack,
        fontSize: `${(16 * WRITING_FONTS[value].scale).toFixed(1)}px`,
      },
    })),
    chosen.writingFont,
    (writingFont) => change({ ...chosen, writingFont }),
  );

  /*
    Not for him, and not hidden from him either.

    It sits at the end of the last row of the panel he does use, labelled in
    English and behind a question only someone who meant to come here can
    answer. Hiding it behind a keystroke was considered and dropped: whoever
    needs it will be standing at his machine years from now with no checkout to
    hand, and a door you have to remember is a door you have lost.
  */
  const advanced = document.createElement('button');
  advanced.type = 'button';
  advanced.className = 'advanced-door';
  advanced.append(icon('settings'));
  const doorLabel = document.createElement('span');
  doorLabel.textContent = 'Advanced settings';
  advanced.append(doorLabel);
  advanced.addEventListener('click', handlers.onAdvanced);

  const writingSize = scaleGroup(
    words,
    words.appearanceTextSize,
    chosen.writingSize,
    (size) => change({ ...chosen, writingSize: size }),
    undefined,
    advanced,
  );

  const accents = optionGroup(
    words.appearanceColour,
    choicesIn(ACCENTS).map((value) => ({
      value,
      name: words.accentNames[value],
      className: 'colour-choice',
      swatch: `hsl(${ACCENTS[value].hue} ${ACCENTS[value].saturation}% 45%)`,
    })),
    chosen.accent,
    (accent) => change({ ...chosen, accent }),
  );

  const modes = optionGroup(
    words.appearanceMode,
    MODES.map((value) => ({
      value,
      name: words.modeNames[value],
      label: words.modeNames[value],
    })),
    chosen.mode,
    (mode) => change({ ...chosen, mode }),
  );

  // Windows order, bottom right, because that is where his hand already goes.
  // Everything back to how it came, off on its own at the other end so it is
  // never what he hits while aiming for U redu. It previews like any other
  // change, so Otkaži still undoes it.
  const footer = document.createElement('footer');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset';
  reset.textContent = words.appearanceReset;
  // Never disabled, whatever state things are in. It is the way out, and a way
  // out that is sometimes unavailable is not one he can be told to rely on.
  reset.addEventListener('click', () => change({ ...DEFAULT_APPEARANCE }));

  const keep = document.createElement('button');
  keep.type = 'button';
  keep.className = 'keep';
  keep.textContent = words.appearanceKeep;
  keep.addEventListener('click', () => handlers.onKeep(chosen));

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = words.appearanceCancel;
  cancel.addEventListener('click', handlers.onCancel);
  footer.append(reset, keep, cancel);

  // The app first, then his writing: the zoom multiplies the writing size, so
  // the outer control has to be settled before the one nested inside it means
  // anything. Setting his text first and then the zoom would change it twice.
  panel.replaceChildren(
    header,
    half(words.appearanceApp, [modes, fonts, row([appSize, accents])]),
    half(words.appearanceWriting, [writingFonts, writingSize]),
    footer,
  );
  keep.focus();
}

/**
 * Opens the panel over the app.
 *
 * @param appearance what he has now, which is both the starting point and what
 * cancelling puts back.
 * @returns a function that takes the panel down, for the caller to use once it
 * has decided what to do about the choices inside it.
 */
export function openAppearancePanel(
  container: HTMLDialogElement,
  appearance: Appearance,
  language: Language,
  handlers: PanelHandlers,
): OpenPanel {
  /** The open dialog, once it is open. */
  let modal: Shown | null = null;

  const close = (): void => {
    modal?.close();
  };

  const panel = document.createElement('div');
  // Its own class carries the fixed face: this panel is the instrument, and a
  // sample judged through a lens that changes with it tells him nothing.
  panel.className = 'panel appearance-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  let working = appearance;
  const change = (next: Appearance): void => {
    working = next;
    handlers.onPreview(next);
    fill(panel, next, language, handlers, change);
  };

  fill(panel, working, language, handlers, change);
  modal = showAsModal(container, panel, () => handlers.onCancel());

  // No click-outside-to-close. Everywhere else in the app a stray click costs
  // him nothing, but here it would throw away colours he was still choosing.

  return { close, current: () => working, change };
}
