import type { LengthBand } from '../notes/text-length.ts';

/**
 * A page with as much written on it as the text has in it.
 *
 * Drawn rather than described: a page carrying more lines depicts a longer
 * text, where a number would have to be read and a row of dots would have to
 * be learned. Four is as many lines as tell apart at this size, and a page
 * with none says the text is empty — which he can otherwise only find out by
 * opening it.
 *
 * Its own module because four lists draw it now — his texts, the deleted, the
 * archive and the copies of one text. They are all writing, and a mark that
 * meant one thing in the list and something else a dialog away would be worse
 * than no mark at all.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The sheet, with its top-right corner turned down. */
const SHEET = 'M5 2h9l5 5v15H5z';

/**
 * The same sheet drawn as an edge rather than a mass, for a text with nothing
 * in it.
 *
 * Every other band is a filled page with the writing punched out of it, so ink
 * *falls* as a text gets longer — which nobody notices while there are lines to
 * count, and which makes the empty page the heaviest mark in the list the
 * moment there are none. An empty page is the limit of the same idea: a page
 * whose whole surface is the hole. It keeps the edge so it still reads as a
 * page and not as a gap.
 *
 * Held half a unit inside `SHEET` because a stroke straddles its path, and this
 * one runs along the edge of the viewBox — centred on the original it would be
 * shaved in half on all four sides.
 */
const BLANK_SHEET = 'M5.5 2.5h8.3l4.7 4.7v14.3H5.5z';

/**
 * Where each line of writing goes, filled from the top.
 *
 * Four fixed places rather than a loop over an offset, because the first and
 * last are not like the middle two. The first is short and tucks up beside the
 * turned corner, which would otherwise be the one part of the page that never
 * gets written on; the last is short across and stops well clear of the bottom
 * edge, the way a paragraph ends. Every band draws the same slot the same way,
 * so two rows can be compared by their lines rather than by their spacing.
 */
const LINES = [
  'M7.5 5h4.5',
  'M7.5 9.2h9',
  'M7.5 13.4h9',
  'M7.5 17.6h6.5',
] as const;

/**
 * The glyph for one band, ready to put in a row.
 *
 * Shape only. What colour the sheet and the writing are is in the stylesheet,
 * because the two modes do not agree: light fills a pale sheet and writes on it
 * a little darker, dark fills a firmer sheet and takes the writing out of it in
 * the page colour. Same geometry either way, so nothing here has to know which
 * mode it is in.
 */
export function pageGlyph(band: LengthBand): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  // The sheet's own bounds, not a square around it. A square box carried four
  // or five pixels of empty margin into a row that has none to spare, and no
  // amount of adjusting the padding could reach it: it was inside the picture.
  svg.setAttribute('viewBox', '5 2 14 20');
  svg.setAttribute('class', 'note-length');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const blank = band === 0;
  const sheet = document.createElementNS(SVG_NS, 'path');
  sheet.setAttribute('class', blank ? 'note-sheet-blank' : 'note-sheet');
  sheet.setAttribute('d', blank ? BLANK_SHEET : SHEET);
  svg.append(sheet);

  for (const line of LINES.slice(0, band)) {
    const written = document.createElementNS(SVG_NS, 'path');
    written.setAttribute('class', 'note-written');
    written.setAttribute('d', line);
    svg.append(written);
  }

  return svg;
}
