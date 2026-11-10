/*
  A page for choosing the marks of the Lektor's three tiers (http://localhost:5176/lektor-tier-marks):
  Besplatni „Flash”, Plaćeni „Flash” and Plaćeni „Opus”, the last one's mark saying it costs more
  (Danilo, 2026-11-10). Each set of marks big, then at its real size in the places the app shows
  them, on the window's white and the panel's grey; below, every set in every colour.
*/
import { icon } from '../src/ui/icons.ts';

type Tier = 'free' | 'flash' | 'opus';

interface MarkPath {
  d: string;
  /** The part a "filled" colouring tints: the body of the thing, not its details. */
  isBody?: boolean;
}

interface MarkSet {
  name: string;
  marks: Readonly<Record<Tier, readonly MarkPath[]>>;
}

/** Lucide's gift: the free one's mark as it is now, the same in every set. */
const GIFT: readonly MarkPath[] = [
  { d: 'M3 8h18v4H3z', isBody: true },
  { d: 'M12 8v13' },
  { d: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7', isBody: true },
  { d: 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5' },
];

/** Lucide's circle-dollar-sign, the paid one's mark as it is now. */
const COIN: readonly MarkPath[] = [
  { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', isBody: true },
  { d: 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8' },
  { d: 'M12 18V6' },
];

/** Lucide's coins: two coins, the front one with its value. */
const COINS: readonly MarkPath[] = [
  { d: 'M8 2a6 6 0 1 0 0 12 6 6 0 1 0 0-12', isBody: true },
  { d: 'M18.09 10.37A6 6 0 1 1 10.34 18', isBody: true },
  { d: 'M7 6h1v4' },
  { d: 'm16.71 13.88.7.71-2.82 2.82' },
];

/** Two of the paid one's own coins, the second behind the first: "the same, twice". */
const TWO_DOLLAR_COINS: readonly MarkPath[] = [
  { d: 'M15.5 3.2a8.5 8.5 0 0 1 0 17.6', isBody: true },
  { d: 'M10 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17', isBody: true },
  { d: 'M13.4 9h-5a1.7 1.7 0 1 0 0 3.4h3.2a1.7 1.7 0 1 1 0 3.4h-5' },
  { d: 'M10 17.2V6.8' },
];

/** Lucide's gem: costs more because it is the better one. */
const GEM: readonly MarkPath[] = [
  { d: 'M6 3h12l4 6-10 13L2 9Z', isBody: true },
  { d: 'M11 3 8 9l4 13 4-13-3-6' },
  { d: 'M2 9h20' },
];

/** Lucide's crown. */
const CROWN: readonly MarkPath[] = [
  {
    d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
    isBody: true,
  },
  { d: 'M5 21h14' },
];

/** A stack of coins seen from the side, its bottom on the box's floor, each coin 3 units thick. */
function coinStack(count: number): MarkPath[] {
  const top = 17 - 3 * count;
  const paths: MarkPath[] = [
    { d: `M4 ${top}V17a8 3 0 0 0 16 0V${top}`, isBody: true },
    { d: `M4 ${top}a8 3 0 1 0 16 0a8 3 0 1 0 -16 0`, isBody: true },
  ];
  for (let coin = 1; coin < count; coin++) paths.push({ d: `M4 ${top + 3 * coin}a8 3 0 0 0 16 0` });
  return paths;
}

const SETS: readonly MarkSet[] = [
  { name: 'A. Novčić, pa dva novčića (Lucide „coins”)', marks: { free: GIFT, flash: COIN, opus: COINS } },
  { name: 'B. Novčić, pa dva ista novčića', marks: { free: GIFT, flash: COIN, opus: TWO_DOLLAR_COINS } },
  { name: 'C. Jedan novčić, pa gomilica od tri', marks: { free: GIFT, flash: coinStack(1), opus: coinStack(3) } },
  { name: 'D. Gomilica od dva, pa od četiri', marks: { free: GIFT, flash: coinStack(2), opus: coinStack(4) } },
  { name: 'E. Novčić, pa dragulj', marks: { free: GIFT, flash: COIN, opus: GEM } },
  { name: 'F. Novčić, pa kruna', marks: { free: GIFT, flash: COIN, opus: CROWN } },
];

/** How the Opus mark is coloured; the free one stays blue and paid Flash gold throughout. */
const OPUS_COLOURS = {
  gold: 'Isto zlatno kao plaćeni',
  'gold-filled': 'Zlatno, popunjeno',
  bronze: 'Tamnije zlatno (bronza)',
  copper: 'Bakar',
  purple: 'Ljubičasto',
  'purple-filled': 'Ljubičasto, popunjeno',
} as const;

type OpusColour = keyof typeof OPUS_COLOURS;

let opusColour: OpusColour = 'gold';

function isOpusColour(value: string): value is OpusColour {
  return Object.hasOwn(OPUS_COLOURS, value);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  if (className !== '') made.className = className;
  if (text !== '') made.textContent = text;
  return made;
}

function byId<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`The page has no ${kind.name} #${id}`);
  return found;
}

/** A mark in the app's line (Lucide's: 24 units, stroke 2, round), coloured by its tier's class. */
function mark(set: MarkSet, tier: Tier, colour: OpusColour = opusColour): SVGSVGElement {
  const made = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    made.setAttribute(name, value);
  }
  made.classList.add('tier-mark', `tier-mark-${tier}`);
  if (tier === 'opus') made.classList.add(`opus-${colour}`);
  for (const part of set.marks[tier]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', part.d);
    if (part.isBody === true) path.classList.add('tier-body');
    made.append(path);
  }
  return made;
}

/** A radio row as the choice draws it: the mark, the name, and in grey why one might pick it. */
function choiceRow(set: MarkSet, tier: Tier, name: string, aside: string, checked: boolean, group: string, hasBalance = false): HTMLLabelElement {
  const row = el('label', 'tier-choice');
  const input = el('input');
  input.type = 'radio';
  input.name = group;
  input.checked = checked;
  const words = el('span', 'tier-words', name);
  if (aside !== '') words.append(' ', el('span', 'tier-aside', aside));
  row.append(input, mark(set, tier), words);
  if (hasBalance) row.append(el('span', 'tier-balance', 'Na računu: $7,47'));
  return row;
}

let groupCount = 0;

/** The panel's step 2: the free one or the same Flash paid, and the button that sends. */
function panelCase(set: MarkSet): HTMLElement {
  const group = `g${groupCount++}`;
  const box = el('div', 'tier-case tier-case-panel');
  const sendFlash = el('button', 'tier-send', 'Pošalji tekst OpenRouteru');
  sendFlash.type = 'button';
  sendFlash.append(mark(set, 'flash'), icon('move-out'));
  box.append(
    el('p', 'tier-heading', 'Izaberi AI Lektora:'),
    choiceRow(set, 'free', 'Besplatni „Flash”', '', false, group),
    choiceRow(set, 'flash', 'Plaćeni „Flash”', 'mnogo brži', true, group, true),
    sendFlash,
  );
  return box;
}

/** The corrections window on Dubinska prerada: the free one or Opus, its service line, and its button. */
function windowCase(set: MarkSet): HTMLElement {
  const group = `g${groupCount++}`;
  const box = el('div', 'tier-case');
  const service = el('p', 'tier-service');
  service.append('AI Lektor: ', mark(set, 'opus'), 'Plaćeni „Opus”');
  const sendOpus = el('button', 'tier-send', 'Pošalji zahtev za ispravke');
  sendOpus.type = 'button';
  sendOpus.append(mark(set, 'opus'), icon('move-out'));
  box.append(
    el('p', 'tier-heading', 'Izaberi AI Lektora:'),
    choiceRow(set, 'free', 'Besplatni „Flash”', '', false, group),
    choiceRow(set, 'opus', 'Plaćeni „Opus”', 'bolje piše i čuva tvoj glas', true, group, true),
    service,
    sendOpus,
  );
  return box;
}

/** Slova i zarezi on free: its service line and the fallback to paid Flash. */
function fallbackCase(set: MarkSet): HTMLElement {
  const box = el('div', 'tier-case');
  const service = el('p', 'tier-service');
  service.append('AI Lektor: ', mark(set, 'free'), 'Besplatni „Flash”');
  const check = el('label', 'tier-check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = true;
  check.append(input, mark(set, 'flash'), el('span', '', 'Ako je besplatni spor, pošalji plaćenom lektoru'));
  check.append(el('span', 'tier-check-note', 'Posle 2 minuta čekanja. Za ovu vrstu ispravke plaćeni je jeftin.'));
  box.append(service, check);
  return box;
}

/** One background's column: every case on it. */
function background(set: MarkSet, kind: 'white' | 'grey'): HTMLElement {
  const column = el('div', `tier-ground tier-ground-${kind}`);
  column.append(el('p', 'tier-ground-name', kind === 'white' ? 'Belo (prozor za ispravke)' : 'Sivo (panel)'), panelCase(set), windowCase(set), fallbackCase(set));
  return column;
}

function bigMarks(set: MarkSet): HTMLElement {
  const row = el('div', 'tier-big');
  for (const [tier, name] of [['free', 'Besplatni „Flash”'], ['flash', 'Plaćeni „Flash”'], ['opus', 'Plaćeni „Opus”']] as const) {
    const one = el('figure', 'tier-big-one');
    one.append(mark(set, tier), el('figcaption', '', name));
    row.append(one);
  }
  return row;
}

function setSection(set: MarkSet): HTMLElement {
  const section = el('section', 'tier-set');
  const grounds = el('div', 'tier-grounds');
  grounds.append(background(set, 'white'), background(set, 'grey'));
  section.append(el('h2', '', set.name), bigMarks(set), grounds);
  return section;
}

/** Every set in every Opus colour, at its real size, on white and on grey. */
function contactSheet(): HTMLElement {
  const table = el('table', 'tier-sheet');
  const head = el('tr');
  head.append(el('th'));
  for (const name of Object.values(OPUS_COLOURS)) head.append(el('th', '', name));
  table.append(head);
  for (const set of SETS) {
    const row = el('tr');
    row.append(el('th', '', set.name));
    for (const colour of Object.keys(OPUS_COLOURS).filter(isOpusColour)) {
      const cell = el('td');
      for (const kind of ['white', 'grey'] as const) {
        const strip = el('span', `tier-strip tier-ground-${kind}`);
        strip.append(mark(set, 'free', colour), mark(set, 'flash', colour), mark(set, 'opus', colour));
        cell.append(strip);
      }
      row.append(cell);
    }
    table.append(row);
  }
  const section = el('section', 'tier-set');
  section.append(el('h2', '', 'Sve zajedno, u svim bojama za „Opus”'), table);
  return section;
}

function colourSelect(): HTMLLabelElement {
  const label = el('label', 'sheet-control', 'Boja za „Opus”: ');
  const select = el('select');
  for (const [value, name] of Object.entries(OPUS_COLOURS)) {
    const option = el('option', '', name);
    option.value = value;
    option.selected = value === opusColour;
    select.append(option);
  }
  select.addEventListener('change', () => {
    if (!isOpusColour(select.value)) throw new Error(`Unknown colour ${select.value}`);
    opusColour = select.value;
    draw();
  });
  label.append(select);
  return label;
}

function draw(): void {
  const sheet = byId('tier-sheet', HTMLElement);
  sheet.replaceChildren(...SETS.map(setSection), contactSheet());
}

byId('sheet-controls', HTMLElement).append(colourSelect());
draw();
