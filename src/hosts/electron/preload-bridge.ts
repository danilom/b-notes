import { contextBridge, ipcRenderer, webFrame } from 'electron';

/**
 * Everything the packaged app hands the interface: somewhere to keep files, and
 * somewhere to log.
 *
 * Deliberately no notion of a note. What a note is belongs to the app, which
 * runs the same code whether it's sitting on this bridge or on a pretend
 * filesystem in a browser tab.
 */
const files = {
  list: (folder: string) => ipcRenderer.invoke('files:list', folder),
  read: (path: string) => ipcRenderer.invoke('files:read', path),
  write: (path: string, text: string) => ipcRenderer.invoke('files:write', path, text),
  rename: (from: string, to: string) => ipcRenderer.invoke('files:rename', from, to),
};

/** Only the main process knows where Windows keeps his Documents folder. */
const folders = () => ipcRenderer.invoke('app:folders');

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

contextBridge.exposeInMainWorld('files', files);
contextBridge.exposeInMainWorld('setZoom', setZoom);
contextBridge.exposeInMainWorld('folders', folders);
contextBridge.exposeInMainWorld('log', log);
