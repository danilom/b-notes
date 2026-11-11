/*
  The two coloured pictures on the Lektor's menu (spec §6), chosen by Danilo on the pictures sheet
  (design/lektor-menu-pictures): the owl reading for the utisak, the page with a red ž for the
  corrections. Pictures, not signs, so not the app's line icons: shapes in a 48×48 box, each part
  filled by a class lektor.css colours, with one ink outline over all. They keep their light-mode
  colours in dark mode too: ink and paper flipped looked like a negative.
*/

type ShapeTag = 'path' | 'circle' | 'rect';

interface Shape {
  tag: ShapeTag;
  /** The fill's class: ic-paper, ic-red…; or ic-line for an outline only. */
  part: string;
  attrs: Readonly<Record<string, string | number>>;
}

const shape = (tag: ShapeTag, part: string, attrs: Shape['attrs']): Shape => ({ tag, part, attrs });

/** "owl-fluffy": a round owl in big glasses, someone reading his text with care, and liking it. */
const OWL: readonly Shape[] = [
  shape('path', 'ic-wood', { d: 'M7 27c0-12 7-19 17-19s17 7 17 19-8 17-17 17S7 39 7 27z' }),
  shape('path', 'ic-line', { d: 'm11 15 1-7 5 5M37 15l-1-7-5 5' }),
  shape('circle', 'ic-pink', { cx: 11, cy: 33, r: 2 }),
  shape('circle', 'ic-pink', { cx: 37, cy: 33, r: 2 }),
  shape('circle', 'ic-lens', { cx: 16.5, cy: 23, r: 7.5 }),
  shape('circle', 'ic-lens', { cx: 31.5, cy: 23, r: 7.5 }),
  shape('circle', 'ic-ink', { cx: 17, cy: 23.5, r: 2.6 }),
  shape('circle', 'ic-ink', { cx: 31, cy: 23.5, r: 2.6 }),
  shape('path', 'ic-shine', { d: 'M12 21a4.5 4.5 0 0 1 3-3M27 21a4.5 4.5 0 0 1 3-3' }),
  shape('path', 'ic-yellow', { d: 'm22 28.5 2 3.5 2-3.5z' }),
];

/** "page-z-caron": a page with a red ž, and the editor's caret a row below it, as an editor marks the place. */
const PAGE: readonly Shape[] = [
  shape('rect', 'ic-paper', { x: 8, y: 4, width: 30, height: 38, rx: 3 }),
  shape('path', 'ic-line', { d: 'M13 24h20M13 30h20M13 36h12' }),
  shape('path', 'ic-red-line', { d: 'M20.5 13h7l-7 7h7M21.8 8.4 24 10.4l2.2-2' }),
  shape('path', 'ic-red-line', { d: 'm22.3 34.2 1.7-2.6 1.7 2.6' }),
];

function drawPicture(shapes: readonly Shape[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('lektor-picture', 'lektor-menu-icon');
  for (const part of shapes) {
    const made = document.createElementNS('http://www.w3.org/2000/svg', part.tag);
    for (const [name, value] of Object.entries(part.attrs)) made.setAttribute(name, String(value));
    made.classList.add(part.part);
    svg.append(made);
  }
  return svg;
}

export const utisakPicture = (): SVGSVGElement => drawPicture(OWL);
export const ispravkePicture = (): SVGSVGElement => drawPicture(PAGE);
