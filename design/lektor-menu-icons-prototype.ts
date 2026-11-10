/*
  Small coloured pictures for the panel's menu, to try (Danilo, 2026-11-10): "a bit playful, a bit of
  color and personality", big, so they hold their own beside the privacy warning. Drawn here as
  shapes in a 48×48 box, each part filled by a class (lektor-choice-prototype.html colours them, for
  light and dark), with one ink outline over all. Not the app's line icons: those are signs, these
  are pictures. No chat bubble for the utisak: the Lektor's own mark is one already.
*/

type ShapeTag = 'path' | 'circle' | 'rect' | 'ellipse';

interface Shape {
  tag: ShapeTag;
  /** The fill's class: ic-paper, ic-red, ic-blue…; or ic-line for an outline only. */
  part: string;
  attrs: Readonly<Record<string, string | number>>;
}

const shape = (tag: ShapeTag, part: string, attrs: Shape['attrs']): Shape => ({ tag, part, attrs });

export interface MenuPicture {
  label: string;
  shapes: readonly Shape[];
}

/** For the utisak: someone reading his text with care, and liking it. */
export const UTISAK_PICTURES = {
  glasses: {
    label: 'naočare za čitanje',
    shapes: [
      shape('path', 'ic-line', { d: 'M5 25 2.5 19M43 25l2.5-6' }),
      shape('circle', 'ic-lens', { cx: 14, cy: 27, r: 9 }),
      shape('circle', 'ic-lens', { cx: 34, cy: 27, r: 9 }),
      shape('path', 'ic-line', { d: 'M23 26q1-2.5 2 0' }),
      shape('path', 'ic-shine', { d: 'M9.5 24a5 5 0 0 1 3.5-3M29.5 24a5 5 0 0 1 3.5-3' }),
    ],
  },
  'book-heart': {
    label: 'otvorena knjiga sa srcem',
    shapes: [
      shape('path', 'ic-paper', { d: 'M24 20c-6-4-13-4-19-2v24c6-2 13-2 19 2z' }),
      shape('path', 'ic-paper', { d: 'M24 20c6-4 13-4 19-2v24c-6-2-13-2-19 2z' }),
      shape('path', 'ic-line', { d: 'M9 25c4-1 8-1 11 1M9 30c4-1 8-1 11 1M28 26c3-2 7-2 11-1M28 31c3-2 7-2 11-1' }),
      shape('path', 'ic-red', { d: 'M24 9.5c-1.6-3.2-6.4-2.6-6.4 1 0 3.2 6.4 6.4 6.4 6.4s6.4-3.2 6.4-6.4c0-3.6-4.8-4.2-6.4-1z' }),
    ],
  },
  'coffee-book': {
    label: 'knjiga i šolja kafe',
    shapes: [
      shape('rect', 'ic-blue', { x: 4, y: 24, width: 22, height: 17, rx: 2 }),
      shape('path', 'ic-line', { d: 'M8 24v17' }),
      shape('path', 'ic-paper', { d: 'M28 27h13v7a6.5 6.5 0 0 1-6.5 6.5A6.5 6.5 0 0 1 28 34z' }),
      shape('path', 'ic-line', { d: 'M41 29.5a3 3 0 0 1 0 6' }),
      shape('path', 'ic-brown', { d: 'M29.5 30h10' }),
      shape('path', 'ic-steam', { d: 'M32 22c-2-2.5 2-4 0-7M37 22c-2-2.5 2-4 0-7' }),
    ],
  },
  magnifier: {
    label: 'lupa nad stranom',
    shapes: [
      shape('rect', 'ic-paper', { x: 6, y: 5, width: 26, height: 34, rx: 3 }),
      shape('path', 'ic-line', { d: 'M11 13h16M11 18h16M11 23h10' }),
      shape('path', 'ic-handle', { d: 'm33 33 9 9' }),
      shape('circle', 'ic-lens', { cx: 27, cy: 27, r: 9 }),
      shape('path', 'ic-shine', { d: 'M22.5 24a5 5 0 0 1 3.5-3' }),
    ],
  },
  owl: {
    label: 'sova sa naočarima',
    shapes: [
      shape('path', 'ic-wood', { d: 'M10 30c0-10 4-17 14-17s14 7 14 17-6 14-14 14-14-4-14-14z' }),
      shape('path', 'ic-line', { d: 'm13 16 1-7 6 5M35 16l-1-7-6 5' }),
      shape('circle', 'ic-paper', { cx: 18, cy: 25, r: 5.5 }),
      shape('circle', 'ic-paper', { cx: 30, cy: 25, r: 5.5 }),
      shape('path', 'ic-line', { d: 'M23.5 24.5h1' }),
      shape('circle', 'ic-ink', { cx: 18, cy: 25.5, r: 2 }),
      shape('circle', 'ic-ink', { cx: 30, cy: 25.5, r: 2 }),
      shape('path', 'ic-yellow', { d: 'm22 31 2 3 2-3z' }),
      shape('path', 'ic-line', { d: 'M18 38c3 2.5 9 2.5 12 0' }),
    ],
  },
  lamp: {
    label: 'lampa nad knjigom',
    shapes: [
      shape('path', 'ic-glow', { d: 'M17 21 9 37h30l-8-16z' }),
      shape('path', 'ic-yellow', { d: 'm15 21 5-11h8l5 11z' }),
      shape('rect', 'ic-blue', { x: 12, y: 36, width: 24, height: 7, rx: 1.5 }),
      shape('path', 'ic-line', { d: 'M15 39.5h18' }),
    ],
  },
  bookmark: {
    label: 'knjiga sa crvenim obeleživačem',
    shapes: [
      shape('rect', 'ic-blue', { x: 10, y: 6, width: 26, height: 36, rx: 3 }),
      shape('path', 'ic-paper', { d: 'M36 9h3v30h-3' }),
      shape('path', 'ic-line', { d: 'M15 6v36' }),
      shape('path', 'ic-red', { d: 'M27 6v14l3.5-2.5L34 20V6z' }),
    ],
  },
} as const satisfies Record<string, MenuPicture>;

/** For the corrections: marks on his page, and the tools that make them. */
export const ISPRAVKE_PICTURES = {
  'red-pencil': {
    label: 'crvena olovka i talasasta crta',
    shapes: [
      shape('path', 'ic-red-line', { d: 'M8 43q3-3 6 0t6 0 6 0' }),
      shape('path', 'ic-red', { d: 'M14 30 32 12l6 6-18 18z' }),
      shape('path', 'ic-wood', { d: 'm14 30 6 6-10 4z' }),
      shape('path', 'ic-pink', { d: 'm32 12 3-3a2.1 2.1 0 0 1 3 0l3 3a2.1 2.1 0 0 1 0 3l-3 3z' }),
      shape('path', 'ic-line', { d: 'm11.5 38.5-1.5 1.5' }),
    ],
  },
  'marked-page': {
    label: 'strana sa crvenim ispravkama i zelenom kvačicom',
    shapes: [
      shape('rect', 'ic-paper', { x: 7, y: 4, width: 27, height: 36, rx: 3 }),
      shape('path', 'ic-line', { d: 'M12 12h17M12 18h17M12 24h17M12 30h9' }),
      shape('path', 'ic-red-line', { d: 'M11 18h19M22 21.5l1.5 3 1.5-3' }),
      shape('circle', 'ic-green', { cx: 35, cy: 36, r: 8 }),
      shape('path', 'ic-white-line', { d: 'm31 36 3 3 5-6' }),
    ],
  },
  eraser: {
    label: 'gumica sa mrvicama',
    shapes: [
      shape('path', 'ic-blue', { d: 'M10 30 26 14l7 7-16 16z' }),
      shape('path', 'ic-pink', { d: 'm26 14 4-4a3 3 0 0 1 4 0l5 5a3 3 0 0 1 0 4l-6 6z' }),
      shape('path', 'ic-line', { d: 'M17 37h-3l-4-4a2.1 2.1 0 0 1 0-3' }),
      shape('circle', 'ic-pink', { cx: 25, cy: 41, r: 1.6 }),
      shape('circle', 'ic-pink', { cx: 31, cy: 39, r: 1.2 }),
      shape('circle', 'ic-pink', { cx: 36, cy: 42, r: 1.4 }),
    ],
  },
  wand: {
    label: 'čarobni štapić sa zvezdicama',
    shapes: [
      shape('path', 'ic-dark', { d: 'm8 40 22-22 3 3-22 22z' }),
      shape('path', 'ic-white', { d: 'm27 21 3-3 3 3-3 3z' }),
      shape('path', 'ic-yellow', { d: 'm36 6 1.6 3.4L41 11l-3.4 1.6L36 16l-1.6-3.4L31 11l3.4-1.6z' }),
      shape('path', 'ic-yellow', { d: 'm42 21 1 2 2 1-2 1-1 2-1-2-2-1 2-1z' }),
      shape('path', 'ic-pink', { d: 'm22 7 1 2 2 1-2 1-1 2-1-2-2-1 2-1z' }),
    ],
  },
  nib: {
    label: 'pero nalivpera',
    shapes: [
      shape('path', 'ic-dark', { d: 'M24 4 35 19 24 44 13 19z' }),
      shape('path', 'ic-yellow', { d: 'M17 19h14l-7 25z' }),
      shape('path', 'ic-line', { d: 'M24 25v19' }),
      shape('circle', 'ic-paper', { cx: 24, cy: 24, r: 2.2 }),
    ],
  },
  wrench: {
    label: 'ključ za popravke',
    shapes: [
      shape('path', 'ic-blue', { d: 'M31 6a10 10 0 0 0-9 13L7 34a3.5 3.5 0 0 0 0 5l2 2a3.5 3.5 0 0 0 5 0l15-15a10 10 0 0 0 13-9l-6 6-6-1-1-6z' }),
      shape('circle', 'ic-paper', { cx: 10.5, cy: 37.5, r: 1.6 }),
    ],
  },
  bandage: {
    label: 'flaster',
    shapes: [
      shape('path', 'ic-wood', { d: 'M9 31 31 9a6.4 6.4 0 0 1 9 9L18 40a6.4 6.4 0 0 1-9-9z' }),
      shape('path', 'ic-paper', { d: 'm18 24 6-6 6 6-6 6z' }),
      shape('circle', 'ic-ink', { cx: 14, cy: 33, r: 0.9 }),
      shape('circle', 'ic-ink', { cx: 34, cy: 15, r: 0.9 }),
      shape('circle', 'ic-ink', { cx: 16, cy: 37, r: 0.9 }),
      shape('circle', 'ic-ink', { cx: 36, cy: 11, r: 0.9 }),
    ],
  },
} as const satisfies Record<string, MenuPicture>;

export type UtisakPicture = keyof typeof UTISAK_PICTURES;
export type IspravkePicture = keyof typeof ISPRAVKE_PICTURES;

/** In colour, or in one: the Lektor's blue, the text's ink, or one of a few muted others. */
export const PICTURE_COLOURS = {
  colour: 'šarene',
  blue: 'plava (Lektorova)',
  grey: 'tamnosiva',
  warm: 'cigla',
  green: 'maslinasta',
  plum: 'šljiva',
  ochre: 'oker',
  teal: 'tirkizna',
} as const;

export type PictureColours = keyof typeof PICTURE_COLOURS;

export const isPictureColours = (value: unknown): value is PictureColours => typeof value === 'string' && Object.hasOwn(PICTURE_COLOURS, value);

/** A picture as an SVG, its parts classed for colour, at the size the class gives it. */
export function drawPicture(picture: MenuPicture, className: string, colours: PictureColours = 'colour'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('lektor-picture', className);
  if (colours !== 'colour') svg.classList.add('lektor-picture-mono', `lektor-picture-mono-${colours}`);
  for (const part of picture.shapes) {
    const made = document.createElementNS('http://www.w3.org/2000/svg', part.tag);
    for (const [name, value] of Object.entries(part.attrs)) made.setAttribute(name, String(value));
    made.classList.add(part.part);
    svg.append(made);
  }
  return svg;
}
