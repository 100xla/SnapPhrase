/**
 * SatzTresor v1.5.4 — Electron Preload Script
 * Secure IPC Bridge between Renderer UI and Main Process.
 */

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  send: (payload) => {
    ipcRenderer.send('satztresor-msg', payload);
  },
  onMessage: (callback) => {
    ipcRenderer.on('satztresor-msg', (event, data) => {
      callback(data);
    });
  },
};

contextBridge.exposeInMainWorld('satztresorApi', api);
contextBridge.exposeInMainWorld('quicktabApi', api);
