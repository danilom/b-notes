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

/** A red "ž" in the editor's hand, its z's top left corner at (x, y), 7 wide; the háček above. */
const redZ = (x: number, y: number): Shape =>
  shape('path', 'ic-red-line', { d: `M${x} ${y}h7l-7 7h7M${x + 1.3} ${y - 4.6} ${x + 3.5} ${y - 2.6}l2.2-2` });

/** The editor's caret under a line of text, its tip just below the line, at x. */
const redCaret = (x: number, lineY: number): Shape => shape('path', 'ic-red-line', { d: `m${x - 2} ${lineY + 5} 2-3.4 2 3.4` });

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
  'glasses-on-book': {
    label: 'naočare na otvorenoj knjizi',
    shapes: [
      shape('path', 'ic-paper', { d: 'M24 27c-6-4-13-4-19-2v16c6-2 13-2 19 2z' }),
      shape('path', 'ic-paper', { d: 'M24 27c6-4 13-4 19-2v16c-6-2-13-2-19 2z' }),
      shape('path', 'ic-line', { d: 'M9 32c4-1 8-1 11 1M28 33c3-2 7-2 11-1M9 37c4-1 8-1 11 1M28 38c3-2 7-2 11-1' }),
      shape('path', 'ic-line', { d: 'M9.5 15.5 6 12m32.5 3.5L42 12' }),
      shape('circle', 'ic-lens', { cx: 16, cy: 17, r: 6.5 }),
      shape('circle', 'ic-lens', { cx: 32, cy: 17, r: 6.5 }),
      shape('path', 'ic-line', { d: 'M22.5 16.5q1.5-2 3 0' }),
      shape('path', 'ic-shine', { d: 'M12.5 15a3.5 3.5 0 0 1 2.5-2M28.5 15a3.5 3.5 0 0 1 2.5-2' }),
    ],
  },
  'owl-reading': {
    label: 'sova čita knjigu',
    shapes: [
      shape('path', 'ic-wood', { d: 'M12 26c0-9 4-15 12-15s12 6 12 15-5 12-12 12-12-3-12-12z' }),
      shape('path', 'ic-line', { d: 'm15 13 1-6 5 4M33 13l-1-6-5 4' }),
      shape('circle', 'ic-paper', { cx: 19, cy: 21, r: 4.5 }),
      shape('circle', 'ic-paper', { cx: 29, cy: 21, r: 4.5 }),
      shape('circle', 'ic-ink', { cx: 19, cy: 22.5, r: 1.8 }),
      shape('circle', 'ic-ink', { cx: 29, cy: 22.5, r: 1.8 }),
      shape('path', 'ic-yellow', { d: 'm22.5 26 1.5 2.5 1.5-2.5z' }),
      shape('path', 'ic-paper', { d: 'M24 34c-5-3-11-3-16-1v10c5-2 11-2 16 1z' }),
      shape('path', 'ic-paper', { d: 'M24 34c5-3 11-3 16-1v10c-5-2-11-2-16 1z' }),
    ],
  },
  'owl-face': {
    label: 'glava sove sa naočarima',
    shapes: [
      shape('path', 'ic-wood', { d: 'M8 26c0-11 7-18 16-18s16 7 16 18-7 16-16 16S8 37 8 26z' }),
      shape('path', 'ic-line', { d: 'M11 14 10 5l8 6M37 14l1-9-8 6' }),
      shape('circle', 'ic-pink', { cx: 11.5, cy: 32, r: 2 }),
      shape('circle', 'ic-pink', { cx: 36.5, cy: 32, r: 2 }),
      shape('circle', 'ic-lens', { cx: 17, cy: 24, r: 6.5 }),
      shape('circle', 'ic-lens', { cx: 31, cy: 24, r: 6.5 }),
      shape('path', 'ic-line', { d: 'M23.5 23.5h1' }),
      shape('circle', 'ic-ink', { cx: 17, cy: 24.5, r: 2.2 }),
      shape('circle', 'ic-ink', { cx: 31, cy: 24.5, r: 2.2 }),
      shape('path', 'ic-yellow', { d: 'm22 31 2 3.5 2-3.5z' }),
    ],
  },
  /* Variations on the owl's face, Danilo's pick for the utisak (2026-11-10). */
  'owl-wink': {
    label: 'sova namiguje',
    shapes: [
      shape('path', 'ic-wood', { d: 'M8 26c0-11 7-18 16-18s16 7 16 18-7 16-16 16S8 37 8 26z' }),
      shape('path', 'ic-line', { d: 'M11 14 10 5l8 6M37 14l1-9-8 6' }),
      shape('circle', 'ic-pink', { cx: 11.5, cy: 32, r: 2 }),
      shape('circle', 'ic-pink', { cx: 36.5, cy: 32, r: 2 }),
      shape('circle', 'ic-lens', { cx: 17, cy: 24, r: 6.5 }),
      shape('circle', 'ic-lens', { cx: 31, cy: 24, r: 6.5 }),
      shape('path', 'ic-line', { d: 'M23.5 23.5h1' }),
      shape('circle', 'ic-ink', { cx: 17, cy: 24.5, r: 2.2 }),
      shape('path', 'ic-line', { d: 'M28 25q3 2 6 0' }),
      shape('path', 'ic-yellow', { d: 'm22 31 2 3.5 2-3.5z' }),
    ],
  },
  'owl-peek': {
    label: 'sova viri iznad knjige',
    shapes: [
      shape('path', 'ic-wood', { d: 'M8 22c0-11 7-18 16-18s16 7 16 18-7 14-16 14S8 33 8 22z' }),
      shape('path', 'ic-line', { d: 'M11 10 10 2l8 5M37 10l1-8-8 5' }),
      shape('circle', 'ic-lens', { cx: 17, cy: 20, r: 6 }),
      shape('circle', 'ic-lens', { cx: 31, cy: 20, r: 6 }),
      shape('path', 'ic-line', { d: 'M23 19.5h2' }),
      shape('circle', 'ic-ink', { cx: 17, cy: 22, r: 2 }),
      shape('circle', 'ic-ink', { cx: 31, cy: 22, r: 2 }),
      shape('path', 'ic-paper', { d: 'M24 31c-6-4-13-4-19-2v14c6-2 13-2 19 2z' }),
      shape('path', 'ic-paper', { d: 'M24 31c6-4 13-4 19-2v14c-6-2-13-2-19 2z' }),
      shape('path', 'ic-line', { d: 'M9 36c4-1 8-1 11 1M28 37c3-2 7-2 11-1' }),
    ],
  },
  'owl-curious': {
    label: 'sova radoznalo diže obrve',
    shapes: [
      shape('path', 'ic-wood', { d: 'M8 26c0-11 7-18 16-18s16 7 16 18-7 16-16 16S8 37 8 26z' }),
      shape('path', 'ic-line', { d: 'M11 14 10 5l8 6M37 14l1-9-8 6' }),
      shape('path', 'ic-line', { d: 'M11.5 15.5q5-3.5 10 0M27 14q5-3 10 .5' }),
      shape('circle', 'ic-pink', { cx: 11.5, cy: 33, r: 2 }),
      shape('circle', 'ic-pink', { cx: 36.5, cy: 33, r: 2 }),
      shape('circle', 'ic-lens', { cx: 17, cy: 25, r: 6.5 }),
      shape('circle', 'ic-lens', { cx: 31, cy: 25, r: 6.5 }),
      shape('path', 'ic-line', { d: 'M23.5 24.5h1' }),
      shape('circle', 'ic-ink', { cx: 18, cy: 24.5, r: 2.2 }),
      shape('circle', 'ic-ink', { cx: 32, cy: 24.5, r: 2.2 }),
      shape('path', 'ic-yellow', { d: 'm22 32 2 3.5 2-3.5z' }),
    ],
  },
  'owl-fluffy': {
    label: 'okrugla sova, velike naočare',
    shapes: [
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
    ],
  },
  'glasses-twinkle': {
    label: 'naočare sa iskrama',
    shapes: [
      shape('path', 'ic-line', { d: 'M5 28 2.5 22M43 28l2.5-6' }),
      shape('circle', 'ic-lens', { cx: 14, cy: 30, r: 9 }),
      shape('circle', 'ic-lens', { cx: 34, cy: 30, r: 9 }),
      shape('path', 'ic-line', { d: 'M23 29q1-2.5 2 0' }),
      shape('path', 'ic-shine', { d: 'M9.5 27a5 5 0 0 1 3.5-3M29.5 27a5 5 0 0 1 3.5-3' }),
      shape('path', 'ic-yellow', { d: 'm40 4 1.2 2.6 2.6 1.2-2.6 1.2L40 11.6l-1.2-2.6-2.6-1.2 2.6-1.2z' }),
      shape('path', 'ic-pink', { d: 'm9 7 .9 1.9 1.9.9-1.9.9L9 12.6l-.9-1.9-1.9-.9 1.9-.9z' }),
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
  'pencil-on-page': {
    label: 'olovka piše po strani',
    shapes: [
      shape('rect', 'ic-paper', { x: 5, y: 5, width: 26, height: 34, rx: 3 }),
      shape('path', 'ic-line', { d: 'M10 13h16M10 19h16M10 25h9' }),
      shape('path', 'ic-red-line', { d: 'M10 31q2.5-2.5 5 0t5 0' }),
      shape('path', 'ic-red', { d: 'M24 38 38 24l5 5-14 14z' }),
      shape('path', 'ic-wood', { d: 'm24 38 5 5-8 3z' }),
      shape('path', 'ic-pink', { d: 'm38 24 2.5-2.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L43 29z' }),
    ],
  },
  'page-circled': {
    label: 'strana sa zaokruženom rečju',
    shapes: [
      shape('rect', 'ic-paper', { x: 8, y: 4, width: 30, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M13 12h20M13 18h20M13 24h20M13 30h12' }),
      shape('ellipse', 'ic-red-line', { cx: 24, cy: 18, rx: 6.5, ry: 3.6 }),
      shape('path', 'ic-red-line', { d: 'M14 24h8M28 27.5l2 3 2-3' }),
    ],
  },
  /*
    His own letters, put in by the editor's hand (Danilo, 2026-11-10): the Lektor's commonest work on
    his texts is the diacritics he leaves out. A red letter over the line, its caret under it.
  */
  'page-c-caron': {
    label: 'strana sa crvenim č',
    shapes: [
      shape('rect', 'ic-paper', { x: 8, y: 4, width: 30, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M13 24h20M13 30h20M13 36h12' }),
      shape('path', 'ic-red-line', { d: 'M28.6 14.2a3.8 3.8 0 1 0 0 4.6M21.8 9 24 11l2.2-2' }),
      shape('path', 'ic-red-line', { d: 'm22 29 2-3.4 2 3.4' }),
    ],
  },
  'page-z-caron': {
    label: 'strana sa crvenim ž',
    shapes: [
      shape('rect', 'ic-paper', { x: 8, y: 4, width: 30, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M13 24h20M13 30h20M13 36h12' }),
      shape('path', 'ic-red-line', { d: 'M20.5 13h7l-7 7h7M21.8 8.4 24 10.4l2.2-2' }),
      shape('path', 'ic-red-line', { d: 'm22 29 2-3.4 2 3.4' }),
    ],
  },
  'page-c-caron-tick': {
    label: 'strana sa crvenim č i zelenom kvačicom',
    shapes: [
      shape('rect', 'ic-paper', { x: 7, y: 4, width: 27, height: 36, rx: 3 }),
      shape('path', 'ic-line', { d: 'M12 22h17M12 28h17M12 34h9' }),
      shape('path', 'ic-red-line', { d: 'M25.6 12.2a3.8 3.8 0 1 0 0 4.6M18.8 7 21 9l2.2-2' }),
      shape('path', 'ic-red-line', { d: 'm19 27 2-3.4 2 3.4' }),
      shape('circle', 'ic-green', { cx: 35, cy: 36, r: 8 }),
      shape('path', 'ic-white-line', { d: 'm31 36 3 3 5-6' }),
    ],
  },
  /*
    The ž in a corner, away from its caret, as an editor writes the letter in the margin and marks the
    place in the line (Danilo, 2026-11-10); the page fuller of lines, so it reads as text.
  */
  'page-z-margin': {
    label: 'ž na margini, strelica u redu',
    shapes: [
      shape('rect', 'ic-paper', { x: 4, y: 4, width: 30, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M9 11h20M9 17h20M9 23h20M9 29h20M9 35h12' }),
      redCaret(18, 23),
      redZ(37, 11),
    ],
  },
  'page-z-margin-line': {
    label: 'ž na margini, crta do strelice',
    shapes: [
      shape('rect', 'ic-paper', { x: 4, y: 4, width: 30, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M9 11h20M9 17h20M9 23h20M9 29h20M9 35h12' }),
      shape('path', 'ic-red-thin', { d: 'M20 26.5c6 0 11-3 15-8' }),
      redCaret(18, 23),
      redZ(37, 11),
    ],
  },
  'page-z-corner': {
    label: 'ž u gornjem uglu strane',
    shapes: [
      shape('rect', 'ic-paper', { x: 6, y: 4, width: 36, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M11 12h16M11 18h26M11 24h26M11 30h26M11 36h14' }),
      redCaret(17, 30),
      redZ(30, 9.5),
    ],
  },
  /*
    The ž on the page's first row, as in "ž u gornjem uglu", but clear of the edges (Danilo,
    2026-11-10): its háček well under the top, and room at the side; at the left, middle or right.
  */
  'page-z-top-left': {
    label: 'ž gore levo, sa razmakom',
    shapes: [
      shape('rect', 'ic-paper', { x: 6, y: 4, width: 36, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M22 17h15M11 24h26M11 31h26M11 38h14' }),
      redCaret(28, 31),
      redZ(11, 13),
    ],
  },
  'page-z-top-middle': {
    label: 'ž gore u sredini, sa razmakom',
    shapes: [
      shape('rect', 'ic-paper', { x: 6, y: 4, width: 36, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M11 17h7M30 17h7M11 24h26M11 31h26M11 38h14' }),
      redCaret(16, 31),
      redZ(20.5, 13),
    ],
  },
  'page-z-top-right': {
    label: 'ž gore desno, sa razmakom',
    shapes: [
      shape('rect', 'ic-paper', { x: 6, y: 4, width: 36, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M11 17h15M11 24h26M11 31h26M11 38h14' }),
      redCaret(17, 31),
      redZ(30, 13),
    ],
  },
  'page-z-bottom': {
    label: 'ž u donjem uglu strane',
    shapes: [
      shape('rect', 'ic-paper', { x: 6, y: 4, width: 36, height: 38, rx: 3 }),
      shape('path', 'ic-line', { d: 'M11 11h26M11 17h26M11 23h26M11 29h14' }),
      redCaret(21, 11),
      redZ(30, 33),
    ],
  },
  'pencil-check': {
    label: 'olovka crta zelenu kvačicu',
    shapes: [
      shape('path', 'ic-green-line', { d: 'm6 30 7 7 15-12' }),
      shape('path', 'ic-red', { d: 'M30 22 40 12l4 4-10 10z' }),
      shape('path', 'ic-wood', { d: 'm30 22 4 4-6 2z' }),
      shape('path', 'ic-pink', { d: 'm40 12 2-2a1.8 1.8 0 0 1 2.5 0l1.5 1.5a1.8 1.8 0 0 1 0 2.5l-2 2z' }),
    ],
  },
  'notebook-pencil': {
    label: 'sveska i olovka',
    shapes: [
      shape('rect', 'ic-paper', { x: 8, y: 6, width: 25, height: 36, rx: 3 }),
      shape('path', 'ic-line', { d: 'M5 12h6M5 19h6M5 26h6M5 33h6M15 14h13M15 20h13M15 26h8' }),
      shape('path', 'ic-red-line', { d: 'm15 33 2 2 4-4' }),
      shape('rect', 'ic-red', { x: 37, y: 12, width: 7, height: 24 }),
      shape('path', 'ic-wood', { d: 'M37 36h7l-3.5 6z' }),
      shape('path', 'ic-pink', { d: 'M37 12V9a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 44 9v3z' }),
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
