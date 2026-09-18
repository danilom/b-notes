import { contextBridge, ipcRenderer } from 'electron';

const notes = {
  list: () => ipcRenderer.invoke('notes:list'),
  read: (id: string) => ipcRenderer.invoke('notes:read', id),
  write: (id: string, text: string) => ipcRenderer.invoke('notes:write', id, text),
  create: (title: string) => ipcRenderer.invoke('notes:create', title),
};

contextBridge.exposeInMainWorld('notes', notes);
