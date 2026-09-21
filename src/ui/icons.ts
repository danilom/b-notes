/**
 * The app's icons, from Lucide.
 *
 * One set rather than shapes drawn by hand one at a time: they share a grid, a
 * stroke weight and a set of corners, which is the whole reason a handful of
 * small marks look deliberate instead of collected. Copied in as path data
 * rather than pulled from a package — a handful of icons is not worth a dependency,
 * and the app must keep working with no network and no CDN.
 *
 * Lucide, ISC licence. See THIRD-PARTY.md, and lucide.dev for the rest of the
 * set if another is ever needed.
 */

/** Every icon is drawn on this grid, at this weight. */
const VIEW_BOX = '0 0 24 24';
const STROKE_WIDTH = '2';

export type IconName =
  | 'new-text'
  | 'appearance'
  | 'close'
  | 'delete'
  | 'versions'
  | 'previous'
  | 'next'
  | 'settings';

const PATHS = {
  'new-text': [
    'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
    'M14 2v5a1 1 0 0 0 1 1h5',
    'M9 15h6',
    'M12 18v-6',
  ],
  appearance: [
    'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
  ],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  versions: [
    'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8',
    'M3 3v5h5',
    'M12 7v5l4 2',
  ],
  delete: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    'M10 11v6',
    'M14 11v6',
  ],
  // A cogwheel, for the one door in the app that is not for him. Lucide's, at
  // the same weight as the rest: it is a developer's mark and only has to be
  // spotted, not understood.
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  ],
  // Up and down rather than left and right: his matches are ordered down the
  // page, and that is the direction he will actually travel.
  previous: ['m18 15-6-6-6 6'],
  next: ['m6 9 6 6 6-6'],
} as const satisfies Record<IconName, readonly string[]>;

/** The paint spots on the palette, which are dots rather than strokes. */
const DOTS = {
  appearance: [
    { cx: 13.5, cy: 6.5 },
    { cx: 17.5, cy: 10.5 },
    { cx: 6.5, cy: 12.5 },
    { cx: 8.5, cy: 7.5 },
  ],
} as const;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds an icon element.
 *
 * Always `aria-hidden`: an icon here either sits beside its own words or on a
 * button that carries its name some other way, so announcing it twice would
 * only be noise.
 */
export function icon(name: IconName): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', VIEW_BOX);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', STROKE_WIDTH);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }

  if (name === 'appearance') {
    for (const { cx, cy } of DOTS.appearance) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(cy));
      dot.setAttribute('r', '0.5');
      dot.setAttribute('fill', 'currentColor');
      svg.append(dot);
    }
  }

  return svg;
}
