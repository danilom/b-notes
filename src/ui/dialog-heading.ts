import { type IconName, icon } from './icons.ts';

/**
 * A dialog's title: what this screen is, and which text it is about.
 *
 * The three parts are told apart without him reading the line. The mark is the
 * one the button that brought him here carries, so the dialog is visibly the
 * far end of the press. The label is the same handful of words every time. The
 * name is the part that changes, and the part he is looking for, so it is in
 * the accent. Every dialog that acts on a text is built here, which is what
 * keeps the colon, the spacing and the colour from drifting apart across four
 * files.
 */
export interface Titled {
  /** The same mark as on the control that opens this. */
  mark: IconName;
  /** What this screen does, in the app's words. */
  label: string;
  /** What the text is called, in his. Absent where the screen is about all of them. */
  name?: string;
}

export function titleOf({ mark, label, name }: Titled): HTMLHeadingElement {
  const heading = document.createElement('h1');

  const said = document.createElement('span');
  said.className = 'heading-text';

  if (name === undefined) {
    said.textContent = label;
  } else {
    const named = document.createElement('span');
    named.className = 'heading-name';
    named.textContent = name;
    said.append(`${label}: `, named);
  }

  heading.append(icon(mark), said);
  return heading;
}
