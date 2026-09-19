import { everyFile } from './mock-file-system.ts';

/**
 * The pretend filesystem, on screen, for testing in a browser.
 *
 * Deliberately unlike the rest of the app: fixed dark colours whatever mode the
 * app is in, a monospaced list, English labels. It should never be mistaken for
 * part of what he sees, and it should stay legible in a screenshot taken of
 * either mode.
 *
 * Built in script rather than added to `index.html`, because that file is
 * shared with the packaged app and this must not be in it even switched off.
 */

const PANEL_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  right: '12px',
  bottom: '46px',
  zIndex: '9999',
  display: 'none',
  flexDirection: 'column',
  gap: '6px',
  width: 'min(46rem, calc(100vw - 24px))',
  maxHeight: 'min(32rem, calc(100vh - 80px))',
  padding: '10px',
  borderRadius: '6px',
  background: '#1b1d21',
  color: '#e6e6e6',
  font: '12px/1.45 Consolas, monospace',
  boxShadow: '0 8px 30px rgb(0 0 0 / 0.45)',
};

/*
  At the empty end of the sidebar toolbar, which is the one piece of the app
  with room to spare. Floating it put it over Izgled; putting it in the status
  strip made that strip wrap, so the layout under test stopped matching the
  layout that ships. A test tool that changes the thing being tested is worse
  than no test tool.
*/
const BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
  marginLeft: 'auto',
  padding: '2px 8px',
  border: '1px solid #3a3d44',
  borderRadius: '4px',
  background: '#1b1d21',
  color: '#e6e6e6',
  font: '12px Consolas, monospace',
  cursor: 'pointer',
};

/** Where it floats instead, if the strip it belongs in isn't there. */
const ADRIFT_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  right: '12px',
  bottom: '12px',
  zIndex: '9999',
  marginLeft: '0',
};

const thousands = (value: number): string => value.toLocaleString('en-GB');

const HEADING = '#ffffff';
/** His writing and the app's own files, which sit directly in a folder. */
const TOP_LEVEL = '#c9ccd1';
/** What the app has filed away — verzije, Obrisano — which is usually the question. */
const NESTED = '#7ec4e8';

const isNested = (path: string): boolean => path.split('/').length > 2;

function line(text: string, colour: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.style.color = colour;
  span.textContent = `${text}\n`;
  return span;
}

/**
 * One line per file, sizes right-aligned so the big ones stand out.
 *
 * Filed-away files last and in their own colour: there are five hundred texts
 * at the top level and a handful underneath, and the handful is always what the
 * question was about.
 */
function fill(into: HTMLElement, filter: string): void {
  const all = everyFile();
  const wanted = all.filter((file) => file.path.toLowerCase().includes(filter.toLowerCase()));
  const total = wanted.reduce((sum, file) => sum + file.bytes, 0);
  const width = Math.max(...wanted.map((file) => thousands(file.bytes).length), 1);
  const shown = (file: { path: string; bytes: number }): string =>
    `${thousands(file.bytes).padStart(width)}  ${file.path}`;

  const top = wanted.filter((file) => !isNested(file.path));
  const nested = wanted.filter((file) => isNested(file.path));
  const head =
    `${wanted.length} of ${all.length} files, ${thousands(total)} bytes` +
    (nested.length > 0 ? ` \u00b7 ${nested.length} filed away` : '');

  into.replaceChildren(
    line(head, HEADING),
    line('', HEADING),
    ...top.map((file) => line(shown(file), TOP_LEVEL)),
    ...(top.length > 0 && nested.length > 0 ? [line('', HEADING)] : []),
    ...nested.map((file) => line(shown(file), NESTED)),
  );
}

export function addMockFileList(): void {
  const panel = document.createElement('div');
  Object.assign(panel.style, PANEL_STYLE);

  const filter = document.createElement('input');
  filter.type = 'search';
  filter.placeholder = 'filter by path — try verzije, Obrisano, Podaci';
  Object.assign(filter.style, {
    padding: '4px 6px',
    border: '1px solid #3a3d44',
    borderRadius: '3px',
    background: '#111317',
    color: '#e6e6e6',
    font: 'inherit',
  } satisfies Partial<CSSStyleDeclaration>);

  const lines = document.createElement('pre');
  Object.assign(lines.style, {
    margin: '0',
    overflow: 'auto',
    font: 'inherit',
    whiteSpace: 'pre',
  } satisfies Partial<CSSStyleDeclaration>);

  const draw = (): void => {
    fill(lines, filter.value);
  };
  filter.addEventListener('input', draw);
  panel.append(filter, lines);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'files';
  Object.assign(button.style, BUTTON_STYLE);
  button.addEventListener('click', () => {
    const opening = panel.style.display === 'none';
    panel.style.display = opening ? 'flex' : 'none';
    // Read afresh every time it opens: the whole point is to see what the last
    // thing he pressed actually did.
    if (opening) draw();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') panel.style.display = 'none';
  });

  const toolbar = document.getElementById('toolbar');
  if (toolbar === null) Object.assign(button.style, ADRIFT_STYLE);
  (toolbar ?? document.body).append(button);
  document.body.append(panel);
}
