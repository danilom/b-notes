/*
  A small mark for each Lektor, always beside its name and never instead of it. He needn't know
  what they stand for: a shape and a colour to tell the two apart at a glance, and to name on the telephone.
*/

const SVG_NS = 'http://www.w3.org/2000/svg';
const RAYS_OF_THOROUGH = 11;

/** Names the gradient each mark paints with, since an id is shared by the whole page. */
let marksMade = 0;

function part(name: string, attributes: Readonly<Record<string, string>>): SVGElement {
  const made = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) made.setAttribute(key, value);
  return made;
}

function freeMark(svg: SVGElement): void {
  marksMade += 1;
  const id = `lektor-free-mark-${marksMade}`;
  const gradient = part('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '1' });
  for (const [offset, color] of [['0', '#4285f4'], ['0.55', '#9b72cb'], ['1', '#d96570']] as const) {
    gradient.append(part('stop', { offset, 'stop-color': color }));
  }
  svg.append(gradient, part('path', { d: 'M12 2C12.6 7.5 16.5 11.4 22 12 16.5 12.6 12.6 16.5 12 22 11.4 16.5 7.5 12.6 2 12 7.5 11.4 11.4 7.5 12 2Z', fill: `url(#${id})` }));
}

function thoroughMark(svg: SVGElement): void {
  for (let ray = 0; ray < RAYS_OF_THOROUGH; ray += 1) {
    const angle = (ray / RAYS_OF_THOROUGH) * 2 * Math.PI;
    const end = { x: 12 + 10 * Math.cos(angle), y: 12 + 10 * Math.sin(angle) };
    svg.append(part('line', { x1: '12', y1: '12', x2: end.x.toFixed(2), y2: end.y.toFixed(2), stroke: '#d97757', 'stroke-width': '2.4', 'stroke-linecap': 'round' }));
  }
}

function fakeMark(svg: SVGElement): void {
  svg.append(part('circle', { cx: '12', cy: '12', r: '9', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-dasharray': '3 3' }));
}

const DRAWN_BY: Readonly<Record<string, (svg: SVGElement) => void>> = { free: freeMark, thorough: thoroughMark, fake: fakeMark };

export function serviceMark(level: string): SVGElement {
  const svg = part('svg', { viewBox: '0 0 24 24', class: 'lektor-service-mark', 'aria-hidden': 'true', focusable: 'false' });
  DRAWN_BY[level]?.(svg);
  return svg;
}

/** The mark with the Lektor's name, for saying who something came from. Nothing at all when that isn't known, as with a comment from an older version. */
export function serviceLine(level: string, names: Readonly<Record<string, string>>): HTMLElement[] {
  const name = names[level];
  if (name === undefined) return [];
  const line = document.createElement('p');
  line.className = 'lektor-service-line';
  const words = document.createElement('span');
  words.textContent = name;
  line.append(serviceMark(level), words);
  return [line];
}
