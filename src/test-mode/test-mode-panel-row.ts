/**
 * The switch, in the advanced panel, among the other things that are not his.
 * Applied with the rest of the panel, when the app starts again.
 */
export function testModeRow(on: boolean, change: (on: boolean) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'advanced-row';

  const name = document.createElement('label');
  name.className = 'advanced-label';
  name.textContent = 'Test mode';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'advanced-test-mode';
  box.checked = on;
  name.htmlFor = box.id;
  box.addEventListener('change', () => {
    change(box.checked);
  });

  const note = document.createElement('span');
  note.className = 'advanced-note';
  note.textContent = 'Where each text lives, on every row, and a [test-mode] tag. This machine only.';

  row.append(name, box, note);
  return row;
}
