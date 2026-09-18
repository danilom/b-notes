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
contextBridge.exposeInMainWorld('log', log);
