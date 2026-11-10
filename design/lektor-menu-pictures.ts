/*
  A page for choosing the Lektor menu's pictures (http://localhost:5177/lektor-menu-pictures): every
  picture big and at the menu's size, each choice's in the colour picked for it, the two menu
  choices as they would look with the pictures clicked, and below a contact sheet of every picture
  in every colour. Light or dark as the app's own switch sets it.
*/
import {
  ISPRAVKE_MINI,
  ISPRAVKE_PICTURES,
  type MenuPicture,
  PICTURE_COLOURS,
  type PictureColours,
  UTISAK_PICTURES,
  drawPicture,
  isPictureColours,
} from './lektor-menu-icons-prototype.ts';

type Group = 'utisak' | 'ispravke';

const GROUPS: Readonly<Record<Group, { title: string; pictures: Readonly<Record<string, MenuPicture>>; does: string }>> = {
  utisak: { title: 'Utisak o tekstu', pictures: UTISAK_PICTURES, does: 'Kratak osvrt na tekst, kao od pažljivog čitaoca.' },
  ispravke: { title: 'Ispravke', pictures: ISPRAVKE_PICTURES, does: 'Predlozi ispravki, od zareza do stila.' },
};

const chosen: Record<Group, { picture: string; colours: PictureColours }> = {
  utisak: { picture: 'owl-fluffy', colours: 'colour' },
  ispravke: { picture: 'page-z-caron', colours: 'colour' },
};

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

function pictureOf(group: Group): MenuPicture {
  const pictures = GROUPS[group].pictures;
  const picked = pictures[chosen[group].picture];
  if (picked !== undefined) return picked;
  const first = Object.values(pictures)[0];
  if (first === undefined) throw new Error(`No pictures for ${group}`);
  return first;
}

/** A colour dropdown for one group, redrawing on change. */
function colourSelect(group: Group): HTMLLabelElement {
  const label = el('label', 'sheet-control', `Boje: ${group} `);
  const select = el('select');
  for (const [value, name] of Object.entries(PICTURE_COLOURS)) {
    const option = el('option', '', value === 'colour' ? name : `jednobojne: ${name}`);
    option.value = value;
    option.selected = value === chosen[group].colours;
    select.append(option);
  }
  select.addEventListener('change', () => {
    if (isPictureColours(select.value)) chosen[group].colours = select.value;
    draw();
  });
  label.append(select);
  return label;
}

function darkToggle(): HTMLLabelElement {
  const label = el('label', 'sheet-control');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = document.documentElement.dataset['mode'] === 'dark';
  box.addEventListener('change', () => {
    document.documentElement.dataset['mode'] = box.checked ? 'dark' : 'light';
  });
  label.append(box, ' Tamna pozadina');
  return label;
}

/** The two menu choices at the panel's own size, with the pictures clicked below. */
function menuPreview(): HTMLElement {
  const preview = el('div', 'sheet-menu');
  for (const group of ['utisak', 'ispravke'] as const) {
    const card = el('div', 'sheet-menu-option');
    card.append(drawPicture(pictureOf(group), 'sheet-menu-picture', chosen[group].colours), el('span', 'sheet-menu-name', GROUPS[group].title), el('span', 'sheet-menu-does', GROUPS[group].does));
    preview.append(card);
  }
  return preview;
}

/**
 * "Ispravke…" as the utisak's strip would have it, beside the menu, with each mark it could carry
 * (Danilo, 2026-11-10): the chosen picture's top standing on its edge, the whole picture small, or a
 * ž on a page in the app's line, its ž in ink or red.
 */
function buttonPreviews(): HTMLElement {
  const picture = pictureOf('ispravke');
  const colours = chosen.ispravke.colours;
  // The line ž-page with its folded corner was dropped (Danilo, 2026-11-10).
  const candidates: readonly [string, () => SVGSVGElement, string][] = [
    [`${ISPRAVKE_MINI.label}, veća`, () => drawPicture(ISPRAVKE_MINI, 'sheet-button-mini-big', colours), ''],
    [ISPRAVKE_MINI.label, () => drawPicture(ISPRAVKE_MINI, 'sheet-button-mini', colours), ''],
    ['vrh strane, u boji', () => drawPicture(picture, 'sheet-button-page-top', colours, '6 2 34 33'), 'sheet-button-with-top'],
    ['cela slika, mala', () => drawPicture(picture, 'sheet-button-icon', colours), ''],
  ];
  const list = el('div', 'sheet-buttons');
  for (const [label, mark, extra] of candidates) {
    const made = el('button', `status-action sheet-button ${extra}`.trim());
    made.type = 'button';
    made.append(mark(), 'Ispravke…');
    const item = el('div', 'sheet-button-item');
    item.append(made, el('span', 'sheet-label', label));
    list.append(item);
  }
  return list;
}

/** The menu at the panel's size and, beside it, the utisak's "Ispravke…" with each mark it could carry. */
function topRow(): HTMLElement {
  const row = el('div', 'sheet-top');
  row.append(menuPreview(), buttonPreviews());
  return row;
}

/** One group's pictures, big and at the menu's size, in its colour; clicking one puts it in the menu above. */
function groupGallery(group: Group): HTMLElement {
  const section = el('section', 'sheet-group');
  section.append(el('h2', '', GROUPS[group].title));
  const grid = el('div', 'sheet-gallery');
  for (const [key, picture] of Object.entries(GROUPS[group].pictures)) {
    const tile = el('button', key === chosen[group].picture ? 'sheet-tile sheet-tile-chosen' : 'sheet-tile');
    tile.type = 'button';
    tile.append(drawPicture(picture, 'sheet-big', chosen[group].colours), drawPicture(picture, 'sheet-small', chosen[group].colours), el('span', 'sheet-label', picture.label));
    tile.addEventListener('click', () => {
      chosen[group].picture = key;
      draw();
    });
    grid.append(tile);
  }
  section.append(grid);
  return section;
}

/** Every picture in every colour: colours down, pictures across, the utisak's then the corrections'. */
function contactSheet(): HTMLElement {
  const head = el('tr');
  head.append(el('th'));
  for (const group of ['utisak', 'ispravke'] as const) {
    Object.values(GROUPS[group].pictures).forEach((picture, index) => head.append(el('th', group === 'ispravke' && index === 0 ? 'sheet-divide' : '', picture.label)));
  }
  const table = el('table', 'sheet-table');
  table.append(head);
  for (const colours of Object.keys(PICTURE_COLOURS).filter(isPictureColours)) {
    const row = el('tr');
    const name = el('th', '', PICTURE_COLOURS[colours]);
    name.scope = 'row';
    row.append(name);
    for (const group of ['utisak', 'ispravke'] as const) {
      Object.values(GROUPS[group].pictures).forEach((picture, index) => {
        const cell = el('td', group === 'ispravke' && index === 0 ? 'sheet-divide' : '');
        cell.append(drawPicture(picture, 'sheet-cell', colours));
        row.append(cell);
      });
    }
    table.append(row);
  }
  const scroll = el('div', 'sheet-table-scroll');
  scroll.append(table);
  const section = el('section', 'sheet-group');
  section.append(el('h2', '', 'Kontakt list: sve slike u svim bojama'), scroll);
  return section;
}

function draw(): void {
  byId('sheet', HTMLElement).replaceChildren(topRow(), groupGallery('utisak'), groupGallery('ispravke'), contactSheet());
}

byId('sheet-controls', HTMLElement).append(colourSelect('utisak'), colourSelect('ispravke'), darkToggle());
draw();
