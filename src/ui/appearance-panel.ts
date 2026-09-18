import { type Language, strings } from '../language/wording.ts';
import { ACCENTS, type Appearance, FONTS, SIZES, applyAppearance } from './appearance.ts';
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
  /** Shown but not kept. Applied to the document already; nothing to store. */
  onPreview: (appearance: Appearance) => void;
  onKeep: (appearance: Appearance) => void;
  onCancel: () => void;
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
    button.className = 'choice';
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
  chosen: Appearance,
  language: Language,
  handlers: PanelHandlers,
): void {
  const words = strings(language);

  const change = (next: Appearance): void => {
    applyAppearance(document.documentElement, next);
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

  const fonts = optionGroup(
    words.appearanceFont,
    choicesIn(FONTS).map((value) => ({
      value,
      label: FONTS[value].label,
      // Each face set in itself, and scaled the way the app scales it, so what
      // he is looking at is what he would get.
      style: {
        fontFamily: FONTS[value].stack,
        fontSize: `${(15 * FONTS[value].scale).toFixed(1)}px`,
      },
    })),
    chosen.font,
    (font) => change({ ...chosen, font }),
  );

  const sizes = optionGroup(
    words.appearanceSize,
    choicesIn(SIZES).map((value) => ({
      value,
      label: words.sizeNames[value],
      style: { fontSize: `${(13 * SIZES[value]).toFixed(1)}px` },
    })),
    chosen.size,
    (size) => change({ ...chosen, size }),
  );

  const accents = optionGroup(
    words.appearanceColour,
    choicesIn(ACCENTS).map((value) => ({
      value,
      label: words.accentNames[value],
      swatch: `hsl(${ACCENTS[value].hue} ${ACCENTS[value].saturation}% 45%)`,
    })),
    chosen.accent,
    (accent) => change({ ...chosen, accent }),
  );

  // Windows order, bottom right, because that is where his hand already goes.
  const footer = document.createElement('footer');
  const keep = document.createElement('button');
  keep.type = 'button';
  keep.className = 'keep';
  keep.textContent = words.appearanceKeep;
  keep.addEventListener('click', () => handlers.onKeep(chosen));

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = words.appearanceCancel;
  cancel.addEventListener('click', handlers.onCancel);
  footer.append(keep, cancel);

  panel.replaceChildren(header, fonts, sizes, accents, footer);
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
