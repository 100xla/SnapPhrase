/**
 * SatzTresor v1.3.0 — Main Process
 * Supports:
 * - Sidebar Mode (Left / Right docked tab over full screen height) & Spotlight Mode (Centered)
 * - Triggers:
 *   1. Double-Tap Ctrl (2x quick Ctrl tap — zero text interference, zero conflicts)
 *   2. Draggable Edge-Tab Handle at screen edge (mouse-only 1-click access without stealing focus)
 *   3. Freely recordable Global Hotkeys + System Tray
 * - Global Hotstring Engine: Optional real-time text expansion (e.g. ;;mfg) across Windows apps
 * - Features: Pinning, Multi-Monitor DPI-aware docking, Favorites, Duplication, Date/Time/Variable templates,
 *   Silent Windows Autostart (--hidden), Clipboard protection & restoration, AES-256 encryption (lock & password change),
 *   and JSON/CSV/INI export & import.
 */

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  dialog,
  clipboard,
  screen,
  shell,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const Storage = require('./storage');
const win32 = require('./win32');

const APP_NAME = 'SatzTresor';
const APP_VERSION = '1.3.0';
const EDGE_TAB_WIDTH = 20;
const EDGE_TAB_HEIGHT = 72;

let mainWindow = null;
let edgeTabWindow = null;
let tray = null;
let currentTrayMenu = null;
let isQuitting = false;
let isSystemDialogOpen = false;
let isRecordingHotkey = false;
let hotstringTriggers = [];
let pendingPromptClipboard = null;

const hasCustomUserDataArg = process.argv.some((arg) => arg.startsWith('--user-data-dir'));
const launchedHidden =
  process.argv.includes('--hidden') ||
  (app.getLoginItemSettings && app.getLoginItemSettings().wasOpenedAsHidden);

function getStorageFilePath() {
  if (app.isPackaged && process.env.PORTABLE_EXECUTABLE_DIR) {
    const portableDataDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'SatzTresor-Daten');
    const legacyPortableDataDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'QuickTab-Daten');
    const portableLegacyIni = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'bausteine.ini');
    if (fs.existsSync(portableDataDir)) {
      return path.join(portableDataDir, 'bausteine.ini');
    }
    if (fs.existsSync(legacyPortableDataDir)) {
      return path.join(legacyPortableDataDir, 'bausteine.ini');
    }
    if (fs.existsSync(portableLegacyIni)) {
      return portableLegacyIni;
    }
  }

  const userDataDir = app.getPath('userData');
  const userFile = path.join(userDataDir, 'bausteine.ini');

  if (!fs.existsSync(userDataDir)) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
    } catch (e) {}
  }

  if (app.isPackaged || hasCustomUserDataArg) {
    if (!fs.existsSync(userFile) && !hasCustomUserDataArg) {
      try {
        const legacyQuickTabFile = path.join(app.getPath('appData'), 'quicktab', 'bausteine.ini');
        if (fs.existsSync(legacyQuickTabFile)) {
          fs.copyFileSync(legacyQuickTabFile, userFile);
        }
      } catch (e) {}
    }
    return userFile;
  }

  const devFile = path.join(__dirname, '..', 'bausteine.ini');
  return fs.existsSync(devFile) ? devFile : userFile;
}

function getAppIcon() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'satztresor.ico') : '',
    path.join(__dirname, '..', 'satztresor.ico'),
    path.join(__dirname, '..', 'satztresor.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const img = nativeImage.createFromPath(c);
        if (img && !img.isEmpty()) return img;
      } catch (e) {}
    }
  }
  return nativeImage.createEmpty();
}

if (!hasCustomUserDataArg) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    console.log('[Main] Another instance is already running. Exiting.');
    app.quit();
    process.exit(0);
  }

  app.on('second-instance', () => {
    toggleWindow(true);
  });
}

const storageFile = getStorageFilePath();
const appIcon = getAppIcon();

const storage = new Storage(storageFile);
storage.init();
console.log(`[Storage] File: ${storageFile}`);
console.log(`[Storage] Encrypted: ${storage.isEncrypted}, Locked: ${storage.isLocked}, Layout: ${storage.getLayoutMode()}`);

function getAutostartEnabled() {
  try {
    if (!app.isPackaged) {
      const settings = app.getLoginItemSettings({
        path: process.execPath,
        args: [path.resolve(__dirname, '..'), '--hidden'],
      });
      return !!settings.openAtLogin;
    }
    return !!app.getLoginItemSettings().openAtLogin;
  } catch (e) {
    return false;
  }
}

function setAutostartEnabled(enabled) {
  try {
    if (!app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        path: process.execPath,
        args: [path.resolve(__dirname, '..'), '--hidden'],
      });
    } else {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        args: ['--hidden'],
      });
    }
  } catch (err) {
    console.error('[Main] setAutostartEnabled error:', err);
  }
}

async function withSystemDialog(fn) {
  isSystemDialogOpen = true;
  try {
    return await fn();
  } finally {
    setTimeout(() => {
      isSystemDialogOpen = false;
    }, 150);
  }
}

function getWindowHwnd(win) {
  if (!win || win.isDestroyed()) return 0;
  try {
    const handle = win.getNativeWindowHandle();
    return process.arch === 'x64' ? Number(handle.readBigInt64LE(0)) : handle.readInt32LE(0);
  } catch (e) {
    return 0;
  }
}

function getMainWindowHwnd() {
  return getWindowHwnd(mainWindow);
}

function getEdgeTabHwnd() {
  return getWindowHwnd(edgeTabWindow);
}

function getOwnWindowHwnds() {
  return [getMainWindowHwnd(), getEdgeTabHwnd()].filter(Boolean);
}

function getActiveDisplayContext() {
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleFactor = activeDisplay.scaleFactor || 1;
  const workArea = activeDisplay.workArea;

  return {
    activeDisplay,
    isPrimary: activeDisplay.id === primaryDisplay.id,
    scaleFactor,
    workArea,
    physicalWorkArea: {
      x: Math.round(workArea.x * scaleFactor),
      y: Math.round(workArea.y * scaleFactor),
      width: Math.round(workArea.width * scaleFactor),
      height: Math.round(workArea.height * scaleFactor),
    },
  };
}

function getBoundsForLayout(mode) {
  const { workArea } = getActiveDisplayContext();
  const sidebarWidth = storage.getSidebarWidth();

  switch (mode) {
    case 'sidebar_right':
      return {
        x: workArea.x + workArea.width - sidebarWidth,
        y: workArea.y,
        width: sidebarWidth,
        height: workArea.height,
      };
    case 'center': {
      const centerW = 720;
      const centerH = 540;
      return {
        x: Math.round(workArea.x + (workArea.width - centerW) / 2),
        y: Math.round(workArea.y + (workArea.height - centerH) / 2),
        width: centerW,
        height: centerH,
      };
    }
    case 'sidebar_left':
    default:
      return {
        x: workArea.x,
        y: workArea.y,
        width: sidebarWidth,
        height: workArea.height,
      };
  }
}

// ============================================================================
// Edge-Tab Handle Window (Mouse Screen-Edge Handle)
// ============================================================================
function getEdgeTabSide() {
  return storage.getLayoutMode() === 'sidebar_right' ? 'right' : 'left';
}

function getEdgeTabBounds(customY = null) {
  const primary = screen.getPrimaryDisplay();
  const wa = primary.workArea;
  const side = getEdgeTabSide();
  const x = side === 'right' ? wa.x + wa.width - EDGE_TAB_WIDTH : wa.x;

  let y;
  if (typeof customY === 'number') {
    y = Math.max(wa.y + 16, Math.min(wa.y + wa.height - EDGE_TAB_HEIGHT - 16, Math.round(customY - EDGE_TAB_HEIGHT / 2)));
  } else {
    const pct = storage.getEdgeTabYPercent() / 100;
    y = Math.round(wa.y + (wa.height - EDGE_TAB_HEIGHT) * pct);
    y = Math.max(wa.y + 16, Math.min(wa.y + wa.height - EDGE_TAB_HEIGHT - 16, y));
  }

  return { x, y, width: EDGE_TAB_WIDTH, height: EDGE_TAB_HEIGHT, workArea: wa };
}

function createEdgeTabWindow() {
  const b = getEdgeTabBounds();

  edgeTabWindow = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  edgeTabWindow.setAlwaysOnTop(true, 'screen-saver');
  edgeTabWindow.loadFile(path.join(__dirname, '..', 'ui', 'edge-tab.html'));

  edgeTabWindow.webContents.on('did-finish-load', () => {
    syncEdgeTabWindow();
  });

  edgeTabWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      edgeTabWindow.hide();
    }
  });
}

function syncEdgeTabWindow() {
  if (!edgeTabWindow || edgeTabWindow.isDestroyed()) return;

  const side = getEdgeTabSide();
  const theme = storage.getTheme();

  if (edgeTabWindow.webContents && !edgeTabWindow.webContents.isLoading()) {
    edgeTabWindow.webContents.send('satztresor-msg', {
      type: 'edgeTabState',
      side,
      theme,
    });
  }

  const shouldShow =
    !isQuitting &&
    storage.getEdgeTabEnabled() &&
    (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible());

  if (shouldShow) {
    const b = getEdgeTabBounds();
    edgeTabWindow.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    if (!edgeTabWindow.isVisible()) {
      edgeTabWindow.showInactive();
    }
  } else if (edgeTabWindow.isVisible()) {
    edgeTabWindow.hide();
  }
}

// ============================================================================
// Main SatzTresor Palette Window
// ============================================================================
function createSatzTresorWindow() {
  const layoutMode = storage.getLayoutMode();
  const initialBounds = getBoundsForLayout(layoutMode);

  mainWindow = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: false,
    hasShadow: true,
    icon: appIcon,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    sendDataToRenderer();
    if (storage.isLocked) {
      mainWindow.webContents.send('satztresor-msg', { type: 'openUnlock' });
    }
  });

  mainWindow.on('blur', () => {
    if (isRecordingHotkey) {
      isRecordingHotkey = false;
      registerHotkeys();
    }
    if (
      !isQuitting &&
      !isSystemDialogOpen &&
      mainWindow &&
      mainWindow.isVisible() &&
      !storage.isLocked &&
      !storage.isPinned()
    ) {
      pendingPromptClipboard = null;
      mainWindow.hide();
    }
  });

  mainWindow.on('show', () => {
    syncEdgeTabWindow();
  });

  mainWindow.on('hide', () => {
    win32.restoreWindowsFromDock();
    syncEdgeTabWindow();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function updatePinAndDock(isPinned) {
  const layoutMode = storage.getLayoutMode();
  const sidebarWidth = storage.getSidebarWidth();
  const targetHwnd = win32.getLastForegroundWindow();
  const ctx = getActiveDisplayContext();

  if (isPinned && (layoutMode === 'sidebar_left' || layoutMode === 'sidebar_right')) {
    const physicalWidth = Math.round(sidebarWidth * ctx.scaleFactor);
    win32.alignWindowsToDock(layoutMode, physicalWidth, targetHwnd, {
      isPrimary: ctx.isPrimary,
      workArea: ctx.physicalWorkArea,
    });
  } else {
    win32.restoreWindowsFromDock();
  }
}

function applyLayout(mode) {
  storage.setLayoutMode(mode);
  if (!mainWindow) return;

  const bounds = getBoundsForLayout(mode);
  mainWindow.setBounds(bounds);

  if (storage.isPinned()) {
    updatePinAndDock(true);
  } else {
    win32.restoreWindowsFromDock();
  }

  syncEdgeTabWindow();
  sendDataToRenderer();
  updateTrayMenu();
}

// ============================================================================
// Unified Keyboard Hook Management (Double-Tap Ctrl + Hotstrings)
// ============================================================================
function computeEffectiveHotstring(rawKuerzel, prefix) {
  const k = String(rawKuerzel || '').trim();
  if (!k) return '';
  if (prefix && k.startsWith(prefix)) return k;
  if (/^([;/:!#$~]{1,2})/.test(k)) return k;
  return (prefix || '') + k;
}

function rebuildHotstringTriggers() {
  if (storage.isLocked || !storage.getHotstringsEnabled()) {
    hotstringTriggers = [];
    return;
  }

  const prefix = storage.getHotstringPrefix();
  const snippets = storage.getSnippets();
  const list = [];

  for (const s of snippets) {
    if (!s.kuerzel) continue;
    const effective = computeEffectiveHotstring(s.kuerzel, prefix);
    const charLen = Array.from(effective).length;
    if (charLen < 2) continue;
    list.push({
      trigger: effective,
      triggerLower: effective.toLowerCase(),
      triggerCharLen: charLen,
      snippet: s,
    });
  }

  list.sort((a, b) => b.triggerCharLen - a.triggerCharLen);
  hotstringTriggers = list;
}

function restartKeyboardHook() {
  rebuildHotstringTriggers();

  const useDoubleTap = storage.getDoubleTapCtrlEnabled();
  const useHotstrings = storage.getHotstringsEnabled() && !storage.isLocked;

  if (useDoubleTap || useHotstrings) {
    win32.startKeyboardHook({
      doubleTapCtrlEnabled: () => storage.getDoubleTapCtrlEnabled() && !isRecordingHotkey,
      onDoubleTapCtrl: () => toggleWindow(),
      hotstringsEnabled: () => storage.getHotstringsEnabled() && !storage.isLocked && !isRecordingHotkey,
      getTriggers: () => hotstringTriggers,
      onHotstringMatch: handleHotstringMatch,
      getExcludeHwnds: getOwnWindowHwnds,
    });
  } else {
    win32.stopKeyboardHook();
  }
}

function handleHotstringMatch(match, targetHwnd) {
  if (!match || !match.snippet || storage.isLocked) return;

  const savedClipboard = clipboard.readText() || '';
  const rawContent = match.snippet.content || '';
  const hasInteractiveVars = /\{\?([^}]+)\}/.test(rawContent);

  win32.simulateBackspaces(match.triggerCharLen);

  if (hasInteractiveVars) {
    pendingPromptClipboard = savedClipboard;
    win32.setLastForegroundWindow(targetHwnd);

    setTimeout(() => {
      if (!mainWindow) return;
      const bounds = getBoundsForLayout(storage.getLayoutMode());
      mainWindow.setBounds(bounds);
      mainWindow.show();
      mainWindow.focus();
      sendDataToRenderer();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'openPromptForSnippet',
        snippet: match.snippet,
      });
    }, 30);
    return;
  }

  setTimeout(async () => {
    await executePaste(rawContent, savedClipboard);
    storage.incrementUsage(match.snippet.title);
    rebuildHotstringTriggers();
    sendDataToRenderer();
  }, 30);
}

function sendDataToRenderer() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents) return;

  rebuildHotstringTriggers();

  const payload = {
    type: 'updateData',
    version: APP_VERSION,
    layoutMode: storage.getLayoutMode(),
    sidebarWidth: storage.getSidebarWidth(),
    isPinned: storage.isPinned(),
    isEncrypted: storage.isEncrypted,
    isLocked: storage.isLocked,
    theme: storage.getTheme(),
    doubleTapCtrlEnabled: storage.getDoubleTapCtrlEnabled(),
    edgeTabEnabled: storage.getEdgeTabEnabled(),
    hotstringsEnabled: storage.getHotstringsEnabled(),
    hotstringPrefix: storage.getHotstringPrefix(),
    restoreClipboard: storage.getRestoreClipboard(),
    activeHotkeys: storage.getActiveHotkeys(),
    autostart: getAutostartEnabled(),
    snippets: storage.isLocked ? [] : storage.getSnippets(),
    categories: storage.isLocked ? [] : storage.getCategories(),
  };

  mainWindow.webContents.send('satztresor-msg', payload);
}

function showWindow() {
  if (!mainWindow) return;

  win32.captureForegroundWindow(getOwnWindowHwnds());
  win32.resetHotstringBuffer();

  const layoutMode = storage.getLayoutMode();
  const bounds = getBoundsForLayout(layoutMode);
  mainWindow.setBounds(bounds);

  mainWindow.show();
  mainWindow.focus();

  if (storage.isPinned()) {
    updatePinAndDock(true);
  }

  sendDataToRenderer();

  if (storage.isLocked) {
    mainWindow.webContents.send('satztresor-msg', { type: 'openUnlock' });
  } else {
    mainWindow.webContents.send('satztresor-msg', { type: 'focusSearch' });
  }
}

function toggleWindow(forceShow = false) {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && !forceShow) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

// ============================================================================
// Template & Paste Engine
// ============================================================================
const GERMAN_WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const GERMAN_WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const GERMAN_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const GERMAN_MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function formatDateTimeCustom(d, fmt) {
  const pad = (n) => String(n).padStart(2, '0');
  const YYYY = String(d.getFullYear());
  const YY = YYYY.slice(-2);
  const M = d.getMonth() + 1;
  const MM = pad(M);
  const D = d.getDate();
  const DD = pad(D);
  const H = d.getHours();
  const HH = pad(H);
  const h = H % 12 || 12;
  const hh = pad(h);
  const m = d.getMinutes();
  const mm = pad(m);
  const s = d.getSeconds();
  const ss = pad(s);

  return fmt
    .replace(/\bYYYY\b/g, YYYY)
    .replace(/\byyyy\b/g, YYYY)
    .replace(/\bYY\b/g, YY)
    .replace(/\byy\b/g, YY)
    .replace(/\bMM\b/g, MM)
    .replace(/\bDD\b/g, DD)
    .replace(/\bdd\b/g, DD)
    .replace(/\bHH\b/g, HH)
    .replace(/\bhh\b/g, hh)
    .replace(/\bmm\b/g, mm)
    .replace(/\bss\b/g, ss);
}

function resolveTemplates(text, sourceClipboardText = null) {
  let resolved = text || '';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const defaultDate = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  resolved = resolved.replace(/\{datum:([+-]\d+)d?\}/gi, (match, offsetStr) => {
    const offset = parseInt(offsetStr, 10);
    const relDate = new Date();
    relDate.setDate(relDate.getDate() + offset);
    return `${pad(relDate.getDate())}.${pad(relDate.getMonth() + 1)}.${relDate.getFullYear()}`;
  });

  resolved = resolved.replace(/\{wochentag\}/gi, GERMAN_WEEKDAYS[now.getDay()]);
  resolved = resolved.replace(/\{wochentag_kurz\}/gi, GERMAN_WEEKDAYS_SHORT[now.getDay()]);
  resolved = resolved.replace(/\{monat\}/gi, GERMAN_MONTHS[now.getMonth()]);
  resolved = resolved.replace(/\{monat_kurz\}/gi, GERMAN_MONTHS_SHORT[now.getMonth()]);

  resolved = resolved.replace(/\{datum:([^}]+)\}/gi, (m, fmt) => formatDateTimeCustom(now, fmt));
  resolved = resolved.replace(/\{datum\}/gi, defaultDate);
  resolved = resolved.replace(/\{zeit:([^}]+)\}/gi, (m, fmt) => formatDateTimeCustom(now, fmt));
  resolved = resolved.replace(/\{zeit\}/gi, defaultTime);

  const clipContent = sourceClipboardText !== null ? sourceClipboardText : (clipboard.readText() || '');
  resolved = resolved.replace(/\{clipboard\}/gi, () => clipContent);
  resolved = resolved.replace(/\{n\}/gi, '\n');

  return resolved;
}

async function executePaste(text, savedClipboardOverride = null) {
  const previousClipboard =
    savedClipboardOverride !== null ? savedClipboardOverride : (clipboard.readText() || '');
  let resolved = resolveTemplates(text, previousClipboard);

  let cursorOffset = 0;
  const cursorIdx = resolved.indexOf('{cursor}');
  if (cursorIdx !== -1) {
    const before = resolved.slice(0, cursorIdx);
    const after = resolved.slice(cursorIdx + 8);
    resolved = before + after;
    cursorOffset = Array.from(after.replace(/\r/g, '')).length;
  }

  await win32.waitForModifiersReleased(220);

  clipboard.writeText(resolved);
  win32.setClipboardPrivate();

  win32.simulatePaste();

  if (cursorOffset > 0) {
    setTimeout(() => {
      win32.simulateLeftArrows(cursorOffset);
    }, 110);
  }

  if (storage.getRestoreClipboard()) {
    setTimeout(() => {
      try {
        clipboard.writeText(previousClipboard);
        win32.setClipboardPrivate();
      } catch (e) {}
    }, 450);
  }
}

function formatHotkeyLabel(hk) {
  return String(hk || '')
    .replace('Control', 'Strg')
    .replace('CommandOrControl', 'Strg')
    .replace('Space', 'Leertaste')
    .replace('ScrollLock', 'Rollen')
    .replace('Insert', 'Einfg')
    .replace('Delete', 'Entf')
    .replace('Plus', '+');
}

// ============================================================================
// Import / Export & Tray Menu
// ============================================================================
async function openImportDialog() {
  const parentWin = mainWindow && mainWindow.isVisible() ? mainWindow : undefined;
  const { filePaths } = await withSystemDialog(() =>
    dialog.showOpenDialog(parentWin, {
      title: 'Bausteine importieren',
      defaultPath: app.getPath('desktop'),
      filters: [
        { name: 'Alle unterstützten Formate (*.ini, *.json, *.csv)', extensions: ['ini', 'json', 'csv'] },
        { name: 'JSON-Dateien (*.json)', extensions: ['json'] },
        { name: 'CSV-Dateien (*.csv)', extensions: ['csv'] },
        { name: 'INI-Dateien (*.ini)', extensions: ['ini'] },
      ],
      properties: ['openFile'],
    })
  );

  if (filePaths && filePaths[0]) {
    const res = storage.importSnippets(filePaths[0]);
    if (res.success) {
      restartKeyboardHook();
      sendDataToRenderer();
      await withSystemDialog(() =>
        dialog.showMessageBox(parentWin, {
          type: 'info',
          title: `${APP_NAME} — Import erfolgreich`,
          message: `${res.count} Baustein(e) wurden erfolgreich importiert.`,
        })
      );
    } else {
      await withSystemDialog(() =>
        dialog.showMessageBox(parentWin, {
          type: 'error',
          title: `${APP_NAME} — Import-Fehler`,
          message: res.error || 'Fehler beim Importieren.',
        })
      );
    }
  }
}

async function exportSnippetsWithFormat(format) {
  const ext = format.toLowerCase();
  const filterMap = {
    ini: [{ name: 'INI-Dateien', extensions: ['ini'] }],
    json: [{ name: 'JSON-Dateien', extensions: ['json'] }],
    csv: [{ name: 'CSV-Tabellen', extensions: ['csv'] }],
  };

  const parentWin = mainWindow && mainWindow.isVisible() ? mainWindow : undefined;
  const { filePath } = await withSystemDialog(() =>
    dialog.showSaveDialog(parentWin, {
      title: `Bausteine exportieren (${ext.toUpperCase()})`,
      defaultPath: path.join(app.getPath('desktop'), `SatzTresor_Bausteine.${ext}`),
      filters: filterMap[ext] || filterMap.json,
    })
  );

  if (filePath) {
    const ok = storage.exportSnippets(filePath);
    await withSystemDialog(() =>
      dialog.showMessageBox(parentWin, {
        type: ok ? 'info' : 'error',
        title: `${APP_NAME} — Export`,
        message: ok ? `Erfolgreich exportiert nach:\n${filePath}` : 'Fehler beim Exportieren.',
      })
    );
  }
}

function updateTrayMenu() {
  const currentLayout = storage.getLayoutMode();
  const isAutostart = getAutostartEnabled();
  const doubleTapOn = storage.getDoubleTapCtrlEnabled();
  const edgeTabOn = storage.getEdgeTabEnabled();
  const hotstringsOn = storage.getHotstringsEnabled();
  const activeHks = storage.getActiveHotkeys();

  const hints = [];
  if (doubleTapOn) hints.push('2× Strg');
  if (activeHks.length > 0) hints.push(formatHotkeyLabel(activeHks[0]));
  const openHint = hints.length > 0 ? ` (${hints.join(' / ')})` : '';

  const template = [
    {
      label: `${APP_NAME} öffnen${openHint}`,
      click: () => toggleWindow(true),
    },
    { type: 'separator' },
    {
      label: 'Aufruf per 2× kurz Strg',
      type: 'checkbox',
      checked: doubleTapOn,
      click: (item) => {
        storage.setDoubleTapCtrlEnabled(item.checked);
        restartKeyboardHook();
        sendDataToRenderer();
        updateTrayMenu();
      },
    },
    {
      label: 'Bildschirmrand-Lasche (Maus-Tab)',
      type: 'checkbox',
      checked: edgeTabOn,
      click: (item) => {
        storage.setEdgeTabEnabled(item.checked);
        syncEdgeTabWindow();
        sendDataToRenderer();
        updateTrayMenu();
      },
    },
    {
      label: 'Automatisches Ersetzen (Hotstrings)',
      type: 'checkbox',
      checked: hotstringsOn,
      click: (item) => {
        storage.setHotstringsEnabled(item.checked);
        restartKeyboardHook();
        sendDataToRenderer();
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Erscheinungsbild',
      submenu: [
        {
          label: 'Seitlicher Tab (Links)',
          type: 'radio',
          checked: currentLayout === 'sidebar_left',
          click: () => applyLayout('sidebar_left'),
        },
        {
          label: 'Seitlicher Tab (Rechts)',
          type: 'radio',
          checked: currentLayout === 'sidebar_right',
          click: () => applyLayout('sidebar_right'),
        },
        {
          label: 'Zentriert (Spotlight)',
          type: 'radio',
          checked: currentLayout === 'center',
          click: () => applyLayout('center'),
        },
      ],
    },
    {
      label: 'Design (Theme)',
      submenu: [
        {
          label: 'Dunkel (Dark)',
          type: 'radio',
          checked: storage.getTheme() === 'dark',
          click: () => {
            storage.setTheme('dark');
            syncEdgeTabWindow();
            sendDataToRenderer();
            updateTrayMenu();
          },
        },
        {
          label: 'Hell (Light)',
          type: 'radio',
          checked: storage.getTheme() === 'light',
          click: () => {
            storage.setTheme('light');
            syncEdgeTabWindow();
            sendDataToRenderer();
            updateTrayMenu();
          },
        },
      ],
    },
    {
      label: 'Neuen Baustein anlegen…',
      click: () => {
        showWindow();
        mainWindow.webContents.send('satztresor-msg', { type: 'openManager' });
      },
    },
    {
      label: 'Einstellungen…',
      click: () => {
        showWindow();
        mainWindow.webContents.send('satztresor-msg', { type: 'openSettings' });
      },
    },
    { type: 'separator' },
    {
      label: 'Mit Windows starten (im Hintergrund)',
      type: 'checkbox',
      checked: isAutostart,
      click: (item) => {
        setAutostartEnabled(item.checked);
        sendDataToRenderer();
        updateTrayMenu();
      },
    },
    {
      label: 'Bausteine exportieren…',
      submenu: [
        {
          label: 'Als JSON-Datei (*.json)…',
          click: () => exportSnippetsWithFormat('json'),
        },
        {
          label: 'Als CSV-Tabelle (*.csv)…',
          click: () => exportSnippetsWithFormat('csv'),
        },
        {
          label: 'Als INI-Datei (*.ini)…',
          click: () => exportSnippetsWithFormat('ini'),
        },
      ],
    },
    {
      label: 'Bausteine importieren…',
      click: () => openImportDialog(),
    },
    {
      label: 'Datenordner öffnen…',
      click: () => {
        shell.openPath(path.dirname(storageFile));
      },
    },
    {
      label: 'Verschlüsselung verwalten…',
      click: () => {
        showWindow();
        mainWindow.webContents.send('satztresor-msg', { type: 'manageEncryption' });
      },
    },
  ];

  if (storage.isEncrypted && !storage.isLocked) {
    template.push({
      label: '🔒 Datenbank jetzt sperren',
      click: () => {
        storage.lock();
        restartKeyboardHook();
        sendDataToRenderer();
        updateTrayMenu();
        if (mainWindow && mainWindow.isVisible()) {
          mainWindow.hide();
        }
      },
    });
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Hilfe & Info',
      click: () => {
        withSystemDialog(() =>
          dialog.showMessageBox({
            type: 'info',
            title: `Über ${APP_NAME} v${APP_VERSION}`,
            message:
              `${APP_NAME} v${APP_VERSION} — Moderner Satzbaustein-Manager\n\n` +
              '• Aufruf: 2× kurz Strg antippen, Bildschirmrand-Lasche anklicken oder eigenes Tastenkürzel\n' +
              '• Automatisches Ersetzen: Kürzel wie ;;mfg direkt in jedem Programm tippen\n' +
              '• Erscheinungsbild: Seitlicher Tab (links/rechts) oder Zentriert (Spotlight)\n' +
              '• Schnelles Einfügen: [Alt] + [1..9] oder Eingabetaste\n' +
              '• 100% Sicher vor Windows Clipboard-Verlauf (Win+V) + Clipboard-Wiederherstellung\n' +
              '• Optionale AES-256-CBC PBKDF2 Verschlüsselung & automatische Backups',
          })
        );
      },
    },
    {
      label: 'Beenden',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    }
  );

  currentTrayMenu = Menu.buildFromTemplate(template);
  if (tray) {
    tray.setContextMenu(currentTrayMenu);
  }
}

function setupTray() {
  try {
    tray = new Tray(appIcon);
  } catch (e) {
    console.error('[Tray] icon load failed:', e);
    return;
  }

  tray.setToolTip(`${APP_NAME} v${APP_VERSION} — Satzbaustein-Manager`);
  updateTrayMenu();

  tray.on('click', () => {
    toggleWindow();
  });
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  if (isRecordingHotkey) return;

  const toggle = () => toggleWindow();
  const hotkeys = storage.getActiveHotkeys();

  for (const hk of hotkeys) {
    try {
      if (globalShortcut.register(hk, toggle)) {
        console.log(`[Hotkey] Registered ${hk}`);
      }
    } catch (e) {
      console.warn(`[Hotkey] Could not register ${hk}:`, e.message);
    }
  }
}

// ============================================================================
// IPC Handling
// ============================================================================
ipcMain.on('satztresor-msg', (event, data) => {
  if (!data || !data.action) return;

  switch (data.action) {
    case 'ready':
      sendDataToRenderer();
      if (storage.isLocked) {
        mainWindow.webContents.send('satztresor-msg', { type: 'openUnlock' });
      }
      break;

    // Edge-Tab Window actions
    case 'edgeTabReady':
      syncEdgeTabWindow();
      break;

    case 'edgeTabClick':
      showWindow();
      break;

    case 'edgeTabDrag': {
      if (edgeTabWindow && !edgeTabWindow.isDestroyed() && typeof data.screenY === 'number') {
        const b = getEdgeTabBounds(data.screenY);
        edgeTabWindow.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
      }
      break;
    }

    case 'edgeTabDragEnd': {
      if (typeof data.screenY === 'number') {
        const b = getEdgeTabBounds(data.screenY);
        const usableH = Math.max(1, b.workArea.height - EDGE_TAB_HEIGHT);
        const pct = ((b.y - b.workArea.y) / usableH) * 100;
        storage.setEdgeTabYPercent(pct);
      }
      break;
    }

    case 'edgeTabContextMenu': {
      if (currentTrayMenu) {
        currentTrayMenu.popup();
      }
      break;
    }

    case 'setLayoutMode': {
      if (data.mode) {
        applyLayout(data.mode);
      }
      break;
    }

    case 'unlock': {
      const password = data.password || '';
      const res = storage.unlock(password);
      if (res.success) {
        registerHotkeys();
        restartKeyboardHook();
        applyThemeAndBoundsAfterUnlock();
        syncEdgeTabWindow();
        sendDataToRenderer();
        updateTrayMenu();
        mainWindow.webContents.send('satztresor-msg', { type: 'unlockSuccess' });
      } else {
        mainWindow.webContents.send('satztresor-msg', {
          type: 'unlockError',
          message: res.error || 'Falsches Master-Passwort!',
        });
      }
      break;
    }

    case 'lockDatabase': {
      const res = storage.lock();
      if (res.success) {
        restartKeyboardHook();
        sendDataToRenderer();
        updateTrayMenu();
        mainWindow.webContents.send('satztresor-msg', { type: 'openUnlock' });
      }
      break;
    }

    case 'cancelPrompt': {
      const wasHotstringPrompt = pendingPromptClipboard !== null;
      pendingPromptClipboard = null;
      if (wasHotstringPrompt && !storage.isPinned()) {
        mainWindow.hide();
        const targetHwnd = win32.getLastForegroundWindow();
        if (targetHwnd) {
          setTimeout(() => win32.restoreForegroundWindow(targetHwnd), 25);
        }
      }
      break;
    }

    case 'paste': {
      const { title, text } = data;
      const savedClip = pendingPromptClipboard;
      pendingPromptClipboard = null;

      const isPinned = storage.isPinned();
      if (!isPinned) {
        mainWindow.hide();
      }

      setTimeout(() => {
        const targetHwnd = win32.getLastForegroundWindow();
        win32.restoreForegroundWindow(targetHwnd);

        setTimeout(async () => {
          await executePaste(text, savedClip);
          if (title) {
            storage.incrementUsage(title);
            sendDataToRenderer();
          }
          if (isPinned && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('satztresor-msg', {
              type: 'showToast',
              message: '✓ Eingefügt',
            });
          }
        }, 45);
      }, 30);
      break;
    }

    case 'copyToClipboardOnly': {
      const { title, text } = data;
      const resolved = resolveTemplates(text);
      clipboard.writeText(resolved);
      win32.setClipboardPrivate();
      if (title) {
        storage.incrementUsage(title);
        sendDataToRenderer();
      }
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: '📋 In Zwischenablage kopiert',
      });
      break;
    }

    case 'toggleFavorite': {
      if (data.title) {
        const isFav = storage.toggleFavorite(data.title);
        sendDataToRenderer();
        mainWindow.webContents.send('satztresor-msg', {
          type: 'showToast',
          message: isFav ? '⭐ Zu Favoriten hinzugefügt' : '☆ Aus Favoriten entfernt',
        });
      }
      break;
    }

    case 'duplicateSnippet': {
      if (data.title) {
        const newTitle = storage.duplicateSnippet(data.title);
        restartKeyboardHook();
        sendDataToRenderer();
        mainWindow.webContents.send('satztresor-msg', {
          type: 'showToast',
          message: `📑 Dupliziert als "${newTitle}"`,
        });
      }
      break;
    }

    case 'togglePin': {
      const next = !storage.isPinned();
      storage.setPinned(next);
      updatePinAndDock(next);
      sendDataToRenderer();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: next ? '📌 SatzTresor fixiert (Desktop ausgerichtet)' : '🔓 Fixierung gelöst (Normalansicht)',
      });
      break;
    }

    case 'collapseWindow':
    case 'hide':
    case 'close': {
      pendingPromptClipboard = null;
      if (mainWindow && mainWindow.isVisible()) {
        mainWindow.hide();
        win32.restoreWindowsFromDock();
      }
      break;
    }

    case 'toggleCompactWidth': {
      const current = storage.getSidebarWidth();
      const next = current === 440 ? 320 : 440;
      storage.setSidebarWidth(next);
      const layoutMode = storage.getLayoutMode();
      const bounds = getBoundsForLayout(layoutMode);
      mainWindow.setBounds(bounds);
      if (storage.isPinned()) {
        updatePinAndDock(true);
      }
      sendDataToRenderer();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: next === 320 ? '⇤ Kompaktansicht (320px)' : '⇥ Standardansicht (440px)',
      });
      break;
    }

    case 'saveSnippet': {
      storage.saveSnippet(data);
      restartKeyboardHook();
      sendDataToRenderer();
      mainWindow.webContents.send('satztresor-msg', { type: 'showToast', message: '✓ Gespeichert' });
      break;
    }

    case 'deleteSnippet': {
      if (data.title) {
        storage.deleteSnippet(data.title);
        restartKeyboardHook();
        sendDataToRenderer();
        mainWindow.webContents.send('satztresor-msg', { type: 'showToast', message: '✓ Gelöscht' });
      }
      break;
    }

    case 'setTheme': {
      if (data.theme) {
        storage.setTheme(data.theme);
        syncEdgeTabWindow();
        sendDataToRenderer();
        updateTrayMenu();
      }
      break;
    }

    case 'setAutostart': {
      const enabled = !!data.enabled;
      setAutostartEnabled(enabled);
      sendDataToRenderer();
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: enabled ? '✓ Autostart aktiviert' : '✓ Autostart deaktiviert',
      });
      break;
    }

    case 'setDoubleTapCtrlEnabled': {
      storage.setDoubleTapCtrlEnabled(!!data.enabled);
      restartKeyboardHook();
      sendDataToRenderer();
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: data.enabled ? '✓ 2× Strg Aufruf aktiviert' : '2× Strg Aufruf deaktiviert',
      });
      break;
    }

    case 'setEdgeTabEnabled': {
      storage.setEdgeTabEnabled(!!data.enabled);
      syncEdgeTabWindow();
      sendDataToRenderer();
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: data.enabled ? '✓ Bildschirmrand-Lasche aktiviert' : 'Bildschirmrand-Lasche ausgeblendet',
      });
      break;
    }

    case 'setHotstringsEnabled': {
      storage.setHotstringsEnabled(!!data.enabled);
      restartKeyboardHook();
      sendDataToRenderer();
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: data.enabled ? '⚡ Auto-Ersetzen aktiviert' : '⏸ Auto-Ersetzen deaktiviert',
      });
      break;
    }

    case 'setHotstringPrefix': {
      if (typeof data.prefix === 'string') {
        storage.setHotstringPrefix(data.prefix);
        restartKeyboardHook();
        sendDataToRenderer();
      }
      break;
    }

    case 'setRestoreClipboard': {
      storage.setRestoreClipboard(!!data.enabled);
      sendDataToRenderer();
      break;
    }

    case 'pauseHotkeys': {
      isRecordingHotkey = !!data.paused;
      if (isRecordingHotkey) {
        globalShortcut.unregisterAll();
      } else {
        registerHotkeys();
      }
      break;
    }

    case 'addCustomHotkey': {
      isRecordingHotkey = false;
      const acc = String(data.accelerator || '').trim();
      const existing = storage.getActiveHotkeys();

      if (!acc) {
        registerHotkeys();
        break;
      }

      if (existing.includes(acc)) {
        registerHotkeys();
        mainWindow.webContents.send('satztresor-msg', {
          type: 'hotkeyRecorded',
          success: true,
          message: `✓ ${formatHotkeyLabel(acc)} ist bereits aktiv`,
        });
        break;
      }

      let canRegister = false;
      try {
        canRegister = globalShortcut.register(acc, () => toggleWindow());
        if (canRegister) {
          globalShortcut.unregister(acc);
        }
      } catch (err) {
        canRegister = false;
      }

      if (canRegister) {
        const updated = [...existing, acc];
        storage.setActiveHotkeys(updated);
        registerHotkeys();
        sendDataToRenderer();
        updateTrayMenu();
        mainWindow.webContents.send('satztresor-msg', {
          type: 'hotkeyRecorded',
          success: true,
          message: `✓ ${formatHotkeyLabel(acc)} gespeichert`,
        });
      } else {
        registerHotkeys();
        mainWindow.webContents.send('satztresor-msg', {
          type: 'hotkeyRecorded',
          success: false,
          message: `⚠️ „${formatHotkeyLabel(acc)}“ ist durch Windows oder ein anderes Programm belegt.`,
        });
      }
      break;
    }

    case 'removeHotkey': {
      const acc = String(data.accelerator || '').trim();
      const updated = storage.getActiveHotkeys().filter((h) => h !== acc);
      storage.setActiveHotkeys(updated);
      registerHotkeys();
      sendDataToRenderer();
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: '✓ Tastenkürzel entfernt',
      });
      break;
    }

    case 'exportDialog': {
      exportSnippetsWithFormat(data.format || 'json');
      break;
    }

    case 'importDialog': {
      openImportDialog();
      break;
    }

    case 'encryptDatabase': {
      const ok = storage.encryptDatabase(data.password);
      sendDataToRenderer();
      updateTrayMenu();
      if (ok) {
        mainWindow.webContents.send('satztresor-msg', {
          type: 'cryptoSuccess',
          message: '✓ AES-256 Verschlüsselung aktiviert',
        });
      } else {
        mainWindow.webContents.send('satztresor-msg', {
          type: 'cryptoError',
          message: 'Fehler beim Verschlüsseln.',
        });
      }
      break;
    }

    case 'changePassword': {
      const res = storage.changePassword(data.currentPassword, data.newPassword);
      if (res.success) {
        sendDataToRenderer();
        mainWindow.webContents.send('satztresor-msg', {
          type: 'cryptoSuccess',
          message: '✓ Master-Passwort geändert',
        });
      } else {
        mainWindow.webContents.send('satztresor-msg', {
          type: 'cryptoError',
          message: res.error || 'Passwort konnte nicht geändert werden.',
        });
      }
      break;
    }

    case 'decryptDatabase': {
      const ok = storage.decryptDatabase(data.password);
      if (ok) {
        sendDataToRenderer();
        updateTrayMenu();
        mainWindow.webContents.send('satztresor-msg', {
          type: 'cryptoSuccess',
          message: '✓ Verschlüsselung entfernt',
        });
      } else {
        mainWindow.webContents.send('satztresor-msg', {
          type: 'cryptoError',
          message: 'Falsches Master-Passwort!',
        });
      }
      break;
    }
  }
});

function applyThemeAndBoundsAfterUnlock() {
  if (!mainWindow) return;
  const bounds = getBoundsForLayout(storage.getLayoutMode());
  mainWindow.setBounds(bounds);
  if (storage.isPinned()) {
    updatePinAndDock(true);
  }
}

app.whenReady().then(() => {
  createSatzTresorWindow();
  createEdgeTabWindow();
  setupTray();
  registerHotkeys();
  restartKeyboardHook();

  screen.on('display-metrics-changed', () => {
    syncEdgeTabWindow();
  });

  if (!launchedHidden) {
    showWindow();
  } else {
    syncEdgeTabWindow();
  }
});

app.on('will-quit', () => {
  isQuitting = true;
  storage.flushSave();
  win32.restoreWindowsFromDock();
  win32.stopKeyboardHook();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

module.exports = {
  resolveTemplates,
  computeEffectiveHotstring,
};
