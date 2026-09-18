import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'node:path';

import { createFileNoteStore } from './note-store.ts';

// The machines this runs on have old integrated GPUs, where acceleration causes
// more rendering glitches than it prevents.
app.disableHardwareAcceleration();

// Where notes live is not settled: they belong in the Dropbox folder, which
// needs detecting at first run. Documents keeps the scaffold runnable until then.
const notesDir = path.join(app.getPath('documents'), 'brano-notes');
const store = createFileNoteStore(notesDir);

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  return value;
}

ipcMain.handle('notes:list', () => store.list());
ipcMain.handle('notes:read', (_event, id: unknown) => store.read(asString(id, 'id')));
ipcMain.handle('notes:write', (_event, id: unknown, text: unknown) =>
  store.write(asString(id, 'id'), asString(text, 'text')),
);
ipcMain.handle('notes:create', (_event, title: unknown) => store.create(asString(title, 'title')));

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
    },
  });

  // Showing only once painted avoids the white flash, which is slow and ugly on an old disk.
  window.once('ready-to-show', () => window.show());
  void window.loadFile(path.join(import.meta.dirname, 'index.html'));
}

app.on('window-all-closed', () => app.quit());

await app.whenReady();
createWindow();
