import type { Tier } from './lektor-tiers.ts';

/*
  The three Lektors' marks rather than a company's, since who runs each may change (spec §3): a
  gift for the free one, a coin for paid Flash, a gem for Opus. Lucide's line icons, drawn as the
  app's own icons are, coloured by lektor.css (light and dark), and always beside the Lektor's name,
  never instead of it. On a filled button a mark takes the button's own colour.
*/

const TIER_PATHS: Readonly<Record<Tier, readonly string[]>> = {
  // Lucide's gift.
  free: ['M3 8h18v4H3z', 'M12 8v13', 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7', 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5'],
  // Lucide's circle-dollar-sign, the circle drawn as a path.
  'paid-flash': ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8', 'M12 18V6'],
  // Lucide's gem.
  'paid-opus': ['M6 3h12l4 6-10 13L2 9Z', 'M11 3 8 9l4 13 4-13-3-6', 'M2 9h20'],
};

/** Lucide's key: a dead key's own mark, so it reads as a matter of the key, not as the Lektor being busy or broken. */
const KEY_PATHS = ['m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4', 'm21 2-9.6 9.6', 'M7.5 10a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11'];

/** An icon in the app's line, from Lucide's paths: for the marks the app's own set lacks. */
function lineIcon(paths: readonly string[], classes: readonly string[]): SVGSVGElement {
  const made = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    made.setAttribute(name, value);
  }
  made.classList.add(...classes);
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    made.append(path);
  }
  return made;
}

export const markOf = (tier: Tier): SVGSVGElement => lineIcon(TIER_PATHS[tier], ['lektor-choice-mark', `lektor-choice-mark-${tier}`]);

export const deadKeyMark = (): SVGSVGElement => lineIcon(KEY_PATHS, ['lektor-dead-key-mark']);
