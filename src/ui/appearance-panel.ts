import { type Language, strings } from '../language/wording.ts';
import {
  ACCENTS,
  type Appearance,
  DEFAULT_APPEARANCE,
  FONTS,
  MAX_ZOOM,
  MIN_ZOOM,
  MODES,
  stepZoom,
} from './appearance.ts';
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
  /** Put it on screen without keeping it. The panel applies nothing itself. */
  onPreview: (appearance: Appearance) => void;
  onKeep: (appearance: Appearance) => void;
  onCancel: () => void;
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

/** Everything "back to the start" puts back, which is all of it. */
const MODE_KEYS = ['font', 'zoom', 'accent', 'mode'] as const satisfies readonly (keyof Appearance)[];

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

  const title = document.createElement('h2');
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
function zoomGroup(
  words: ReturnType<typeof strings>,
  chosen: Appearance,
  change: (next: Appearance) => void,
): HTMLElement {
  const group = document.createElement('section');
  group.className = 'choice-group';

  const title = document.createElement('h2');
  title.textContent = words.appearanceSize;

  const row = document.createElement('div');
  row.className = 'choices zoom-row';

  const step = (direction: 1 | -1, name: string, glyph: string): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice zoom-step';
    button.textContent = glyph;
    button.title = name;
    button.setAttribute('aria-label', name);
    const next = stepZoom(chosen.zoom, direction);
    // Stopped rather than hidden at the ends: a button that vanishes is a
    // button he has to find again.
    button.disabled = next === chosen.zoom;
    button.addEventListener('click', () => change({ ...chosen, zoom: next }));
    return button;
  };

  const reading = document.createElement('span');
  reading.className = 'zoom-reading';
  reading.textContent = `${Math.round(chosen.zoom * 100)}%`;
  reading.setAttribute('aria-live', 'polite');

  row.append(
    step(-1, words.appearanceSmaller, '−'),
    reading,
    step(1, words.appearanceLarger, '+'),
  );
  group.append(title, row);
  return group;
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
): void {
  const words = strings(language);

  const change = (next: Appearance): void => {
    handlers.onPreview(next);
    fill(panel, next, language, handlers);
  };

  const header = document.createElement('header');
  const title = document.createElement('h1');
  title.textContent = words.appearance;

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

  const sizes = zoomGroup(words, chosen, change);

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
  reset.disabled = MODE_KEYS.every((key) => chosen[key] === DEFAULT_APPEARANCE[key]);
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

  panel.replaceChildren(header, fonts, sizes, accents, modes, footer);
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
  container: HTMLElement,
  appearance: Appearance,
  language: Language,
  handlers: PanelHandlers,
): () => void {
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') handlers.onCancel();
  }

  const close = (): void => {
    container.hidden = true;
    container.replaceChildren();
    document.removeEventListener('keydown', onKey);
  };

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  fill(panel, appearance, language, handlers);
  container.replaceChildren(panel);
  container.hidden = false;

  // No click-outside-to-close. Everywhere else in the app a stray click costs
  // him nothing, but here it would throw away colours he was still choosing.
  document.addEventListener('keydown', onKey);

  return close;
}
