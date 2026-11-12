import { contextBridge, ipcRenderer, webFrame } from 'electron';

import type { FileSystem } from '../../platform/file-system.ts';
import type { ChosenPlaces } from '../../platform/host.ts';
import type { LektorRequest, LektorResponse } from '../../platform/lektor-remote.ts';
import type { OtherEditor, OtherEditors } from '../../platform/other-editors.ts';

/**
 * Everything the packaged app hands the interface: somewhere to keep files, and
 * somewhere to log.
 *
 * Deliberately no notion of a note. What a note is belongs to the app, which
 * runs the same code whether it's sitting on this bridge or on a pretend
 * filesystem in a browser tab.
 */
/*
  Annotated, which is the whole of what stops this drifting.

  It was a bare object literal, so nothing ever compared it to the interface it
  is standing in for — and when `listFolders` was added for Arhiva, the disk and
  the mock both grew it and this did not. The browser build worked, the
  installed app said `files.listFolders is not a function`, and because that
  lands inside the startup read it came out as "Ne mogu da naći tvoje tekstove",
  which is a sentence about his writing for a fault in ours.
*/
const files: FileSystem = {
  list: (folder: string) => ipcRenderer.invoke('files:list', folder),
  listFolders: (folder: string) => ipcRenderer.invoke('files:listFolders', folder),
  read: (path: string) => ipcRenderer.invoke('files:read', path),
  readStrict: (path: string) => ipcRenderer.invoke('files:readStrict', path),
  write: (path: string, text: string) => ipcRenderer.invoke('files:write', path, text),
  folderExists: (folder: string) => ipcRenderer.invoke('files:folderExists', folder),
  rename: (from: string, to: string) => ipcRenderer.invoke('files:rename', from, to),
  removeEmptyFolder: (folder: string) => ipcRenderer.invoke('files:removeEmptyFolder', folder),
  removeEmptyFile: (path: string) => ipcRenderer.invoke('files:removeEmptyFile', path),
  removeFile: (path: string) => ipcRenderer.invoke('files:removeFile', path),
};

/** Only the main process knows where Windows keeps his Documents folder. */
const folders = () => ipcRenderer.invoke('app:folders');

/** The advanced panel's three, and nothing else in the app uses them. */
const openFolder = (path: string) => ipcRenderer.invoke('app:openFolder', path);
const chooseFolder = (from: string) => ipcRenderer.invoke('app:chooseFolder', from);
const rememberFolders = (next: ChosenPlaces) => ipcRenderer.invoke('app:rememberFolders', next);
const restart = () => ipcRenderer.invoke('app:restart');

/** The programs b-notes asks him to close before it starts. Seen and closed by the main process. */
const otherEditors: OtherEditors = {
  running: () => ipcRenderer.invoke('editors:running'),
  resophTray: () => ipcRenderer.invoke('editors:resophTray'),
  close: (which: readonly OtherEditor[]) => ipcRenderer.invoke('editors:close', [...which]),
};

/**
 * The one thing the main process asks the window for, rather than the other
 * way round.
 *
 * It holds the window open while this runs, so the reply is what lets it
 * close. Sent whatever happens — a save that failed must not leave him with a
 * window that will not shut.
 */
const onBeforeClose = (finish: () => Promise<void>): void => {
  ipcRenderer.on('app:beforeClose', () => {
    void finish().finally(() => {
      ipcRenderer.send('app:closeReady');
    });
  });
};

/**
 * Over IPC, to the main process's clipboard.
 *
 * It used to be Electron's `clipboard` straight from here, on the reasoning
 * that a round trip is one more thing to go wrong. But this preload runs
 * sandboxed, and a sandboxed preload is not given `clipboard` at all: every
 * press of the button in his first hour failed on `undefined`. The test beside
 * this file now holds the preload to what the sandbox provides.
 *
 * `navigator.clipboard` is deliberately not used. It wants a secure context,
 * which the packaged app loading its page off disk is not, and it would work
 * in the browser build and fail in the one he runs.
 */
const copyToClipboard = (text: string): Promise<void> => ipcRenderer.invoke('app:copyToClipboard', text);
/** The other way, for the same reasons. */
const readClipboard = (): Promise<string> => ipcRenderer.invoke('app:readClipboard');

/**
 * The Lektor's way out to an AI service, and its way of calling one off. Numbered by
 * the window, since a signal can't cross this bridge: see `browser-entry.ts`.
 */
const lektorRequest = (id: number, request: LektorRequest): Promise<LektorResponse> => ipcRenderer.invoke('lektor:request', id, request);
const lektorStop = (id: number): Promise<void> => ipcRenderer.invoke('lektor:stop', id);
/** Where a new version of the app stands: asked once on starting, then told of each change. Checked in the window. */
const appUpdateState = (): Promise<unknown> => ipcRenderer.invoke('app:updateState');
const onAppUpdate = (listener: (update: unknown) => void): void => {
  ipcRenderer.on('app:update', (_event, update: unknown) => listener(update));
};

/** How each running request is getting on, by its number; the window sorts them out. Checked there, as anything from across the bridge is. */
const onLektorProgress = (listener: (id: number, progress: unknown) => void): void => {
  ipcRenderer.on('lektor:progress', (_event, id: unknown, progress: unknown) => {
    if (typeof id === 'number') listener(id, progress);
  });
};

const log = {
  info: (message: string, detail?: unknown) => ipcRenderer.send('log:write', 'info', message, detail),
  warn: (message: string, detail?: unknown) => ipcRenderer.send('log:write', 'warn', message, detail),
  error: (message: string, detail?: unknown) => ipcRenderer.send('log:write', 'error', message, detail),
};

/**
 * Chromium's own zoom, which is why the app doesn't reimplement it: it scales
 * type, spacing, borders and scrollbars together and gets sub-pixel rendering
 * right, which nothing we wrote in CSS would.
 */
const setZoom = (factor: number) => webFrame.setZoomFactor(factor);

/**
 * Pinching a trackpad zooms in Chromium by default, and he would have no idea
 * what he had done or how to undo it. Zoom is ours to change, from one place.
 *
 * Here rather than in the main process: `webContents.setVisualZoomLevelLimits`
 * is answered by a renderer, so awaiting it before a page has loaded waits for
 * a reply from a frame that does not exist yet and never returns. From this
 * side there is no round trip to deadlock on.
 */
webFrame.setVisualZoomLevelLimits(1, 1);

contextBridge.exposeInMainWorld('files', files);
contextBridge.exposeInMainWorld('setZoom', setZoom);
contextBridge.exposeInMainWorld('folders', folders);
contextBridge.exposeInMainWorld('openFolder', openFolder);
contextBridge.exposeInMainWorld('copyToClipboard', copyToClipboard);
contextBridge.exposeInMainWorld('readClipboard', readClipboard);
contextBridge.exposeInMainWorld('appUpdateState', appUpdateState);
contextBridge.exposeInMainWorld('onAppUpdate', onAppUpdate);
contextBridge.exposeInMainWorld('lektorRequest', lektorRequest);
contextBridge.exposeInMainWorld('lektorStop', lektorStop);
contextBridge.exposeInMainWorld('onLektorProgress', onLektorProgress);
contextBridge.exposeInMainWorld('onBeforeClose', onBeforeClose);
contextBridge.exposeInMainWorld('chooseFolder', chooseFolder);
contextBridge.exposeInMainWorld('rememberFolders', rememberFolders);
contextBridge.exposeInMainWorld('restart', restart);
contextBridge.exposeInMainWorld('otherEditors', otherEditors);
contextBridge.exposeInMainWorld('log', log);
