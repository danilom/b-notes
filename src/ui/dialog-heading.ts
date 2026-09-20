/**
 * A dialog's title: what this screen is, and which text it is about.
 *
 * The two halves are told apart by colour rather than by him reading the whole
 * line — the label is the same handful of words every time, and the name is the
 * one part that changes and the one part he is looking for. Every dialog that
 * acts on a text is built this way, so the name is always in the same place and
 * always the same colour.
 */
export interface Titled {
  /** What this screen does, in the app's words. */
  label: string;
  /** What the text is called, in his. */
  name: string;
}

export function titleOf({ label, name }: Titled): HTMLHeadingElement {
  const heading = document.createElement('h1');
  const named = document.createElement('span');
  named.className = 'heading-name';
  named.textContent = name;

  heading.append(`${label}: `, named);
  return heading;
}
