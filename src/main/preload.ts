import { contextBridge, ipcRenderer } from 'electron';

const notes = {
  list: () => ipcRenderer.invoke('notes:list'),
  read: (id: string) => ipcRenderer.invoke('notes:read', id),
  save: (id: string | null, text: string) => ipcRenderer.invoke('notes:save', id, text),
  moveToDeleted: (id: string) => ipcRenderer.invoke('notes:moveToDeleted', id),
};

const log = {
  info: (message: string, detail?: unknown) => ipcRenderer.send('log:write', 'info', message, detail),
  warn: (message: string, detail?: unknown) => ipcRenderer.send('log:write', 'warn', message, detail),
  error: (message: string, detail?: unknown) => ipcRenderer.send('log:write', 'error', message, detail),
};

contextBridge.exposeInMainWorld('notes', notes);
contextBridge.exposeInMainWorld('log', log);
