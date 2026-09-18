import { type Language, strings } from '../language/wording.ts';
import {
  ACCENTS,
  type Appearance,
  FONTS,
  SIZES,
  applyAppearance,
} from './appearance.ts';

/**
 * The one place he is asked to make a choice about the app rather than about
 * his writing.
 *
 * Nothing here is confirmed and nothing is cancelled. Every choice takes effect
 * on the spot and is written straight away, so the way out is simply a way out
 * — there is no state this panel can be closed into that differs from what he
 * can already see behind it.
 */
export interface PanelHandlers {
  /** Called on every change, with the whole of his choices, already applied. */
  onChange: (appearance: Appearance) => void;
  onClose: () => void;
}

interface OptionSpec<T extends string> {
  value: T;
  label: string;
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
    button.className = option.swatch === undefined ? 'choice' : 'choice swatch-choice';
    button.setAttribute('aria-pressed', String(option.value === chosen));
    if (option.style !== undefined) Object.assign(button.style, option.style);

    if (option.swatch !== undefined) {
      const dot = document.createElement('span');
      dot.className = 'swatch';
      dot.style.background = option.swatch;
      button.append(dot);
    }

    const label = document.createElement('span');
    label.textContent = option.label;
    button.append(label);

    button.addEventListener('click', () => choose(option.value));
    list.append(button);
  }

  group.append(list);
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
  appearance: Appearance,
  language: Language,
  handlers: PanelHandlers,
): void {
  const words = strings(language);

  const change = (next: Appearance): void => {
    applyAppearance(document.documentElement, next);
    handlers.onChange(next);
    fill(panel, next, language, handlers);
  };

  const header = document.createElement('header');
  const title = document.createElement('h1');
  title.textContent = words.appearance;
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'done';
  done.textContent = words.appearanceDone;
  done.addEventListener('click', handlers.onClose);
  header.append(title, done);

  const fonts = optionGroup(
    words.appearanceLetters,
    choicesIn(FONTS).map((value) => ({
      value,
      label: FONTS[value].label,
      // Each face set in itself: its name means nothing to him, its shape does.
      // Scaled the same way the app scales it, so the sample is honest.
      style: {
        fontFamily: FONTS[value].stack,
        fontSize: `${(15 * FONTS[value].scale).toFixed(1)}px`,
      },
    })),
    appearance.font,
    (font) => change({ ...appearance, font }),
  );

  const sizes = optionGroup(
    words.appearanceSize,
    choicesIn(SIZES).map((value) => ({
      value,
      label: words.sizeNames[value],
      style: { fontSize: `${(14 * SIZES[value]).toFixed(1)}px` },
    })),
    appearance.size,
    (size) => change({ ...appearance, size }),
  );

  const accents = optionGroup(
    words.appearanceColour,
    choicesIn(ACCENTS).map((value) => ({
      value,
      label: words.accentNames[value],
      swatch: `hsl(${ACCENTS[value].hue} ${ACCENTS[value].saturation}% 45%)`,
    })),
    appearance.accent,
    (accent) => change({ ...appearance, accent }),
  );

  panel.replaceChildren(header, fonts, sizes, accents);
  done.focus();
}

/**
 * Opens the panel over the app.
 *
 * @returns a function that closes it, for the caller that needs to close it
 * from somewhere other than its own button.
 */
export function openAppearancePanel(
  container: HTMLElement,
  appearance: Appearance,
  language: Language,
  handlers: PanelHandlers,
): () => void {
  const close = (): void => {
    container.hidden = true;
    container.replaceChildren();
    document.removeEventListener('keydown', onKey);
  };

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') handlers.onClose();
  }

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  fill(panel, appearance, language, handlers);
  container.replaceChildren(panel);
  container.hidden = false;

  // Anywhere outside the panel closes it. There is nothing to lose by closing,
  // so the more ways out the better.
  container.addEventListener('click', (event) => {
    if (event.target === container) handlers.onClose();
  });
  document.addEventListener('keydown', onKey);

  return close;
}
