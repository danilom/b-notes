/*
  A page for choosing the marks of the Lektor's three tiers (http://localhost:5177/lektor-tier-marks):
  Besplatni „Flash” a gift, Plaćeni „Flash” a coin in green, as in "fine to use", and Plaćeni „Opus”
  a gem, the premium one (Danilo, 2026-11-10). The marks big, then at their real size in the places
  the app shows them, on the window's white and the panel's grey, in the colours picked at the top;
  below, every green with every gem colour.
*/
import { icon } from '../src/ui/icons.ts';

type Tier = 'free' | 'flash' | 'opus';

interface MarkPath {
  d: string;
  /** The part a filled colouring tints: the body of the thing, not its details. */
  isBody?: boolean;
}

/** The marks, from Lucide, so they are drawn in the app's own line. */
const MARKS: Readonly<Record<Tier, readonly MarkPath[]>> = {
  // Gift: the free one's mark as it is now.
  free: [
    { d: 'M3 8h18v4H3z', isBody: true },
    { d: 'M12 8v13' },
    { d: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7', isBody: true },
    { d: 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5' },
  ],
  // Circle-dollar-sign: the paid one's mark as it is now.
  flash: [{ d: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', isBody: true }, { d: 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8' }, { d: 'M12 18V6' }],
  // Gem: dearer because it is the better one.
  opus: [{ d: 'M6 3h12l4 6-10 13L2 9Z', isBody: true }, { d: 'M11 3 8 9l4 13 4-13-3-6' }, { d: 'M2 9h20' }],
};

/** The free one's blue, the app's accent as light as the coin's gold was, so neither looks the weightier. */
const FREE_COLOUR = '#3380d6';

interface Colour {
  name: string;
  line: string;
  /** A light tint inside the body, for a mark that should look solid. */
  fill?: string;
}

const FLASH_COLOURS = {
  green: { name: 'Zeleno', line: '#2f8a3e' },
  'green-deep': { name: 'Tamnozeleno', line: '#1f6e36' },
  'green-filled': { name: 'Zeleno, popunjeno', line: '#2f8a3e', fill: '#cfeccf' },
  teal: { name: 'Zelenoplavo', line: '#13806a' },
  olive: { name: 'Maslinasto', line: '#5c8a1c' },
  gold: { name: 'Zlatno (kao sad)', line: '#a87412' },
} as const satisfies Record<string, Colour>;

const OPUS_COLOURS = {
  purple: { name: 'Ljubičasto', line: '#7b4bc4' },
  'purple-filled': { name: 'Ljubičasto, popunjeno', line: '#7b4bc4', fill: '#e2d5f6' },
  magenta: { name: 'Ciklama', line: '#a8338a' },
  ice: { name: 'Ledeno (dijamant)', line: '#1b87a3' },
  'ice-filled': { name: 'Ledeno, popunjeno', line: '#1b87a3', fill: '#cdeef6' },
  ruby: { name: 'Rubin', line: '#b3304a' },
  gold: { name: 'Zlatno', line: '#a87412' },
  'gold-filled': { name: 'Zlatno, popunjeno', line: '#a87412', fill: '#f2d48a' },
} as const satisfies Record<string, Colour>;

type FlashColour = keyof typeof FLASH_COLOURS;
type OpusColour = keyof typeof OPUS_COLOURS;

interface Picked {
  flash: FlashColour;
  opus: OpusColour;
}

const picked: Picked = { flash: 'green', opus: 'purple' };

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

function colourOf(tier: Tier, colours: Picked): Colour {
  if (tier === 'free') return { name: 'Plavo', line: FREE_COLOUR };
  return tier === 'flash' ? FLASH_COLOURS[colours.flash] : OPUS_COLOURS[colours.opus];
}

/** A mark in the app's line (24 units, stroke 2, round). On a filled button the CSS gives it the button's white. */
function mark(tier: Tier, colours: Picked = picked): SVGSVGElement {
  const made = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    made.setAttribute(name, value);
  }
  const colour = colourOf(tier, colours);
  made.classList.add('tier-mark');
  made.style.setProperty('--mark-line', colour.line);
  if (colour.fill !== undefined) made.style.setProperty('--mark-fill', colour.fill);
  for (const part of MARKS[tier]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', part.d);
    if (part.isBody === true) path.classList.add('tier-body');
    made.append(path);
  }
  return made;
}

/** A radio row as the choice draws it: the mark, the name, and in grey why one might pick it. */
function choiceRow(tier: Tier, name: string, aside: string, checked: boolean, group: string, hasBalance = false): HTMLLabelElement {
  const row = el('label', 'tier-choice');
  const input = el('input');
  input.type = 'radio';
  input.name = group;
  input.checked = checked;
  const words = el('span', 'tier-words', name);
  if (aside !== '') words.append(' ', el('span', 'tier-aside', aside));
  row.append(input, mark(tier), words);
  if (hasBalance) row.append(el('span', 'tier-balance', 'Na računu: $7,47'));
  return row;
}

function sendButton(label: string, tier: Tier): HTMLButtonElement {
  const made = el('button', 'tier-send', label);
  made.type = 'button';
  made.append(mark(tier), icon('move-out'));
  return made;
}

let groupCount = 0;

/** The panel's step 2: the free one or the same Flash paid, and the button that sends. */
function panelCase(): HTMLElement {
  const group = `g${groupCount++}`;
  const box = el('div', 'tier-case tier-case-panel');
  box.append(
    el('p', 'tier-heading', 'Izaberi AI Lektora:'),
    choiceRow('free', 'Besplatni „Flash”', '', false, group),
    choiceRow('flash', 'Plaćeni „Flash”', 'mnogo brži', true, group, true),
    sendButton('Pošalji tekst OpenRouteru', 'flash'),
  );
  return box;
}

/** The corrections window on Dubinska prerada: the free one or Opus, its service line, and its button. */
function windowCase(): HTMLElement {
  const group = `g${groupCount++}`;
  const box = el('div', 'tier-case');
  const service = el('p', 'tier-service');
  service.append('AI Lektor: ', mark('opus'), 'Plaćeni „Opus”');
  box.append(
    el('p', 'tier-heading', 'Izaberi AI Lektora:'),
    choiceRow('free', 'Besplatni „Flash”', '', false, group),
    choiceRow('opus', 'Plaćeni „Opus”', 'bolje piše i čuva tvoj glas', true, group, true),
    service,
    sendButton('Pošalji zahtev za ispravke', 'opus'),
  );
  return box;
}

/** Slova i zarezi on free: its service line and the fallback to paid Flash. */
function fallbackCase(): HTMLElement {
  const box = el('div', 'tier-case');
  const service = el('p', 'tier-service');
  service.append('AI Lektor: ', mark('free'), 'Besplatni „Flash”');
  const check = el('label', 'tier-check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = true;
  check.append(input, mark('flash'), el('span', '', 'Ako je besplatni spor, pošalji plaćenom lektoru'));
  check.append(el('span', 'tier-check-note', 'Posle 2 minuta čekanja. Za ovu vrstu ispravke plaćeni je jeftin.'));
  box.append(service, check);
  return box;
}

/** One background's column: every case on it. */
function background(kind: 'white' | 'grey'): HTMLElement {
  const column = el('div', `tier-ground tier-ground-${kind}`);
  column.append(el('p', 'tier-ground-name', kind === 'white' ? 'Belo (prozor za ispravke)' : 'Sivo (panel)'), panelCase(), windowCase(), fallbackCase());
  return column;
}

function bigMarks(): HTMLElement {
  const row = el('div', 'tier-big');
  for (const [tier, name] of [['free', 'Besplatni „Flash”'], ['flash', 'Plaćeni „Flash”'], ['opus', 'Plaćeni „Opus”']] as const) {
    const one = el('figure', 'tier-big-one');
    one.append(mark(tier), el('figcaption', '', name));
    row.append(one);
  }
  return row;
}

function pickedSection(): HTMLElement {
  const section = el('section', 'tier-set');
  const grounds = el('div', 'tier-grounds');
  grounds.append(background('white'), background('grey'));
  section.append(el('h2', '', `${FLASH_COLOURS[picked.flash].name} i ${OPUS_COLOURS[picked.opus].name.toLowerCase()}`), bigMarks(), grounds);
  return section;
}

/** Every Flash colour with every Opus colour, at their real size, on white and on grey; a click picks the pair. */
function contactSheet(): HTMLElement {
  const table = el('table', 'tier-sheet');
  const head = el('tr');
  head.append(el('th', '', 'Novčić / dragulj'));
  for (const colour of Object.values(OPUS_COLOURS)) head.append(el('th', '', colour.name));
  table.append(head);
  for (const flash of Object.keys(FLASH_COLOURS).filter(isFlashColour)) {
    const row = el('tr');
    row.append(el('th', '', FLASH_COLOURS[flash].name));
    for (const opus of Object.keys(OPUS_COLOURS).filter(isOpusColour)) row.append(pairCell({ flash, opus }));
    table.append(row);
  }
  const section = el('section', 'tier-set');
  section.append(el('h2', '', 'Sve boje zajedno (klik bira par)'), table);
  return section;
}

function pairCell(colours: Picked): HTMLTableCellElement {
  const cell = el('td');
  if (colours.flash === picked.flash && colours.opus === picked.opus) cell.classList.add('tier-picked');
  for (const kind of ['white', 'grey'] as const) {
    const strip = el('span', `tier-strip tier-ground-${kind}`);
    strip.append(mark('free', colours), mark('flash', colours), mark('opus', colours));
    cell.append(strip);
  }
  cell.addEventListener('click', () => {
    picked.flash = colours.flash;
    picked.opus = colours.opus;
    draw();
  });
  return cell;
}

function isFlashColour(value: string): value is FlashColour {
  return Object.hasOwn(FLASH_COLOURS, value);
}

function isOpusColour(value: string): value is OpusColour {
  return Object.hasOwn(OPUS_COLOURS, value);
}

function colourSelect(label: string, colours: Readonly<Record<string, Colour>>, current: () => string, choose: (value: string) => void): HTMLLabelElement {
  const made = el('label', 'sheet-control', label);
  const select = el('select');
  for (const [value, colour] of Object.entries(colours)) {
    const option = el('option', '', colour.name);
    option.value = value;
    select.append(option);
  }
  select.value = current();
  select.addEventListener('change', () => choose(select.value));
  made.append(select);
  return made;
}

const flashSelect = colourSelect('Novčić („Flash”): ', FLASH_COLOURS, () => picked.flash, (value) => {
  if (!isFlashColour(value)) throw new Error(`Unknown colour ${value}`);
  picked.flash = value;
  draw();
});

const opusSelect = colourSelect('Dragulj („Opus”): ', OPUS_COLOURS, () => picked.opus, (value) => {
  if (!isOpusColour(value)) throw new Error(`Unknown colour ${value}`);
  picked.opus = value;
  draw();
});

function draw(): void {
  for (const [label, value] of [[flashSelect, picked.flash], [opusSelect, picked.opus]] as const) {
    const select = label.querySelector('select');
    if (select !== null) select.value = value;
  }
  byId('tier-sheet', HTMLElement).replaceChildren(pickedSection(), contactSheet());
}

byId('sheet-controls', HTMLElement).append(flashSelect, opusSelect);
draw();
