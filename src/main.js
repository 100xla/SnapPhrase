/**
 * SatzTresor v1.5.6 — Main Process
 * Supports:
 * - Centered Spotlight Mode (Apple-inspired floating palette with smooth blurred & dimmed desktop backdrop)
 * - Automatic Background Updates via GitHub Releases & NSIS Delta Updates (electron-updater)
 * - Triggers:
 *   1. Double-Tap Ctrl (2x quick Ctrl tap — zero text interference, zero conflicts)
 *   2. Freely recordable Global Hotkeys + 1-Click System Tray
 * - Global Hotstring Engine: Optional real-time text expansion (e.g. ;;mfg) across Windows apps
 * - Features: Pinning, Multi-Monitor DPI-aware centering, Favorites, Duplication, Date/Time/Variable templates,
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
  nativeTheme,
} = require('electron');
const path = require('path');
const fs = require('fs');
const Storage = require('./storage');
const win32 = require('./win32');
const { SatzTresorUpdater } = require('./updater');

const APP_ID = 'de.satztresor.app';
const APP_NAME = 'SatzTresor';
const APP_VERSION = '1.5.6';
const CENTER_WIDTH_STANDARD = 1120;
const CENTER_HEIGHT_STANDARD = 780;
const CENTER_WIDTH_COMPACT = 580;
const CENTER_HEIGHT_COMPACT = 380;
const CLOSE_ANIMATION_MS = 195;
const SHOW_PREPARE_TIMEOUT_MS = 65;

if (process.platform === 'win32' && typeof app.setAppUserModelId === 'function') {
  app.setAppUserModelId(APP_ID);
}

let mainWindow = null;
let lastMainIgnoreMouse = false;
let currentMainAlwaysOnTopLevel = '';
let tray = null;
let lastTrayClickAt = 0;
let currentTrayMenu = null;
let updater = null;
let isQuitting = false;
let isSystemDialogOpen = false;
let isRecordingHotkey = false;
let hotstringTriggers = [];
let pendingPromptClipboard = null;
let isMainRendererReady = false;
let pendingShowRequest = null;
let hideAnimationTimer = null;
let pendingShowFallbackTimer = null;
let pendingShowContext = null;
let isPendingShow = false;
let showSequenceCounter = 0;
let isClosingAnimation = false;
let rendererDataDirty = true;
let currentBackdropSnapshot = null;
let simulatedAutostartForTests = false;

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
    toggleWindow(true, 'auto');
  });
}

const storageFile = getStorageFilePath();
const appIcon = getAppIcon();

const storage = new Storage(storageFile);
storage.init();
console.log(`[Storage] File: ${storageFile}`);
console.log(`[Storage] Encrypted: ${storage.isEncrypted}, Locked: ${storage.isLocked}, Layout: ${storage.getLayoutMode()}`);

function getAutostartRuntimeOptions() {
  return {
    isPackaged: Boolean(app.isPackaged),
    execPath: process.execPath,
    portableExecPath: process.env.PORTABLE_EXECUTABLE_FILE || '',
    appDir: path.resolve(__dirname, '..'),
  };
}

function getAutostartEnabled() {
  if (hasCustomUserDataArg) {
    return simulatedAutostartForTests;
  }
  if (process.platform === 'win32') {
    return win32.getWindowsAutostart(getAutostartRuntimeOptions());
  }
  try {
    if (!app.isPackaged) {
      const settings = app.getLoginItemSettings({
        path: process.execPath,
        args: [path.resolve(__dirname, '..'), '--hidden'],
      });
      return !!settings.openAtLogin;
    }
    return !!app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
  } catch (e) {
    return false;
  }
}

function setAutostartEnabled(enabled) {
  const desired = Boolean(enabled);
  if (hasCustomUserDataArg) {
    simulatedAutostartForTests = desired;
    return { success: true, enabled: desired };
  }
  if (process.platform === 'win32') {
    return win32.setWindowsAutostart(desired, getAutostartRuntimeOptions());
  }
  try {
    if (!app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: desired,
        path: process.execPath,
        args: [path.resolve(__dirname, '..'), '--hidden'],
      });
    } else {
      app.setLoginItemSettings({
        openAtLogin: desired,
        args: ['--hidden'],
      });
    }
    return { success: true, enabled: getAutostartEnabled() };
  } catch (err) {
    console.error('[Main] setAutostartEnabled error:', err);
    return { success: false, enabled: getAutostartEnabled() };
  }
}

function syncSystemTheme() {
  try {
    if (nativeTheme) {
      const targetTheme = storage.getTheme() === 'light' ? 'light' : 'dark';
      if (nativeTheme.themeSource !== targetTheme) {
        nativeTheme.themeSource = targetTheme;
      }
    }
  } catch (e) {}
}

function handleWindowsSessionEnd() {
  if (isQuitting) return;
  isQuitting = true;
  cancelHideAnimation();
  try {
    storage.flushSave();
    win32.restoreWindowsFromDock();
  } catch (e) {}
}

syncSystemTheme();
if (!hasCustomUserDataArg && process.platform === 'win32') {
  win32.syncWindowsAutostartOnLaunch(getAutostartRuntimeOptions());
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

function getOwnWindowHwnds() {
  return [getMainWindowHwnd()].filter(Boolean);
}

function setWindowBoundsSafe(win, bounds) {
  if (!win || win.isDestroyed() || !bounds) return;
  const target = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
  const current = win.getBounds();
  if (
    current.x === target.x &&
    current.y === target.y &&
    current.width === target.width &&
    current.height === target.height
  ) {
    return;
  }

  // Never toggle setResizable(true/false) on transparent frameless Windows BrowserWindows,
  // as mutating WS_THICKFRAME breaks DWM DirectComposition alpha and paints a black background.
  win.setBounds(target, false);
  // Second pass ensures exact DIP sizing when moving across monitors with different DPI scaleFactors on Windows
  const after = win.getBounds();
  if (
    after.x !== target.x ||
    after.y !== target.y ||
    after.width !== target.width ||
    after.height !== target.height
  ) {
    win.setBounds(target, false);
  }
}

function getCenterDimensions(bounds) {
  const isCompact = storage.getCenterCompact();
  const maxW = Math.max(400, bounds.width - 56);
  const maxH = Math.max(320, bounds.height - 64);
  const width = Math.min(isCompact ? CENTER_WIDTH_COMPACT : CENTER_WIDTH_STANDARD, maxW);
  const height = Math.min(isCompact ? CENTER_HEIGHT_COMPACT : CENTER_HEIGHT_STANDARD, maxH);
  return { width, height };
}

function getActiveDisplayContext(triggerSource = 'auto') {
  let targetPoint = null;

  if (triggerSource !== 'mouse') {
    const fgCenterPhys = win32.getWindowCenterPhysical(win32.getLastForegroundWindow());
    if (fgCenterPhys) {
      try {
        targetPoint = screen.screenToDipPoint(fgCenterPhys);
      } catch (e) {
        targetPoint = fgCenterPhys;
      }
    }
  }

  if (!targetPoint) {
    targetPoint = screen.getCursorScreenPoint();
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const activeDisplay = screen.getDisplayNearestPoint(targetPoint) || primaryDisplay;
  const scaleFactor = activeDisplay.scaleFactor || 1;
  const bounds = activeDisplay.bounds;
  const workArea = activeDisplay.workArea;

  // Full monitor overlay minus 1px in height so Windows DWM never mistakes the transparent window
  // for an exclusive fullscreen surface (which forces a black background on Windows)
  const overlayBounds = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: Math.max(1, bounds.height - 1),
  };

  // Usable workArea insets inside full display bounds (used when docking unpinned sidebars)
  const workAreaInsets = {
    top: Math.max(0, workArea.y - bounds.y),
    bottom: Math.max(0, bounds.y + bounds.height - (workArea.y + workArea.height)),
    left: Math.max(0, workArea.x - bounds.x),
    right: Math.max(0, bounds.x + bounds.width - (workArea.x + workArea.width)),
  };

  return {
    activeDisplay,
    isPrimary: activeDisplay.id === primaryDisplay.id,
    scaleFactor,
    bounds,
    workArea,
    overlayBounds,
    workAreaInsets,
    physicalBounds: {
      x: Math.round(bounds.x * scaleFactor),
      y: Math.round(bounds.y * scaleFactor),
      width: Math.round(bounds.width * scaleFactor),
      height: Math.round(bounds.height * scaleFactor),
    },
    physicalWorkArea: {
      x: Math.round(workArea.x * scaleFactor),
      y: Math.round(workArea.y * scaleFactor),
      width: Math.round(workArea.width * scaleFactor),
      height: Math.round(workArea.height * scaleFactor),
    },
  };
}

function getPinnedBoundsForLayout(_mode, ctx = getActiveDisplayContext()) {
  const { bounds, workArea } = ctx;
  const { width: centerW, height: centerH } = getCenterDimensions(bounds);
  // Center on exact physical display bounds, clamped to usable workArea so taskbar never covers it
  const exactX = Math.round(bounds.x + (bounds.width - centerW) / 2);
  const exactY = Math.round(bounds.y + (bounds.height - centerH) / 2);
  const minX = workArea.x;
  const maxX = Math.max(minX, workArea.x + workArea.width - centerW);
  const minY = workArea.y;
  const maxY = Math.max(minY, workArea.y + workArea.height - centerH);
  return {
    x: Math.max(minX, Math.min(maxX, exactX)),
    y: Math.max(minY, Math.min(maxY, exactY)),
    width: centerW,
    height: centerH,
  };
}

function getTargetWindowBounds(mode, isPinned, ctx) {
  if (isPinned) {
    return getPinnedBoundsForLayout(mode, ctx);
  }
  return ctx.overlayBounds;
}

function isWindowEffectivelyVisible() {
  return Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      (isPendingShow || (mainWindow.isVisible() && !isClosingAnimation))
  );
}

function syncNativeBackdrop() {
  const hwnd = getMainWindowHwnd();
  if (!hwnd) return;
  win32.setWindowBackdropEffect(hwnd, {
    mode: storage.getBackdropMode(),
    theme: storage.getTheme(),
    isPinned: storage.isPinned(),
    useSnapshotBlur: Boolean(currentBackdropSnapshot),
  });
}

function cancelPendingShow() {
  if (pendingShowFallbackTimer) {
    clearTimeout(pendingShowFallbackTimer);
    pendingShowFallbackTimer = null;
  }
  pendingShowContext = null;
  isPendingShow = false;
}

function setMainIgnoreMouse(ignore) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const next = Boolean(ignore);
  if (lastMainIgnoreMouse === next) return;
  lastMainIgnoreMouse = next;
  try {
    mainWindow.setIgnoreMouseEvents(next);
  } catch (e) {}
}

function setMainAlwaysOnTopLevel(level) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (currentMainAlwaysOnTopLevel === level) return;
  currentMainAlwaysOnTopLevel = level;
  try {
    mainWindow.setAlwaysOnTop(true, level);
  } catch (e) {}
}

function cancelHideAnimation() {
  cancelPendingShow();
  if (hideAnimationTimer) {
    clearTimeout(hideAnimationTimer);
    hideAnimationTimer = null;
  }
  isClosingAnimation = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    setMainIgnoreMouse(false);
    syncNativeBackdrop();
  }
}

function syncWindowGeometry(triggerSource = 'auto', existingCtx = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const ctx = existingCtx || getActiveDisplayContext(triggerSource);
  const isPinned = storage.isPinned();
  const layoutMode = storage.getLayoutMode();
  const targetBounds = getTargetWindowBounds(layoutMode, isPinned, ctx);

  if (isPinned) {
    syncNativeBackdrop();
    setWindowBoundsSafe(mainWindow, targetBounds);
    setMainAlwaysOnTopLevel('floating');
  } else {
    setMainAlwaysOnTopLevel('screen-saver');
    win32.applyFullscreenOverlayBounds(getMainWindowHwnd(), ctx.physicalBounds);
    syncNativeBackdrop();
  }

  if (mainWindow.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('satztresor-msg', {
      type: 'updateInsets',
      insets: ctx.workAreaInsets,
    });
  }
  return ctx;
}

// ============================================================================
// Main SatzTresor Palette Window
// ============================================================================
function createSatzTresorWindow() {
  const ctx = getActiveDisplayContext('startup');
  const layoutMode = storage.getLayoutMode();
  const isPinned = storage.isPinned();
  const initialBounds = getTargetWindowBounds(layoutMode, isPinned, ctx);

  mainWindow = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: 1,
    minHeight: 1,
    title: '',
    frame: false,
    thickFrame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    icon: appIcon,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (process.platform === 'win32') {
    win32.installFramelessWindowGuard(getMainWindowHwnd(), {
      noActivate: false,
      onSessionEnd: handleWindowsSessionEnd,
    });
  }

  setMainAlwaysOnTopLevel(isPinned ? 'floating' : 'screen-saver');
  if (!isPinned) {
    win32.applyFullscreenOverlayBounds(getMainWindowHwnd(), ctx.physicalBounds);
    syncNativeBackdrop();
  }
  mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'index.html'), {
    query: {
      theme: storage.getTheme(),
    },
  });

  mainWindow.on('blur', () => {
    if (isRecordingHotkey) {
      isRecordingHotkey = false;
      registerHotkeys();
    }
    if (
      !isQuitting &&
      !isSystemDialogOpen &&
      !isClosingAnimation &&
      mainWindow &&
      mainWindow.isVisible() &&
      !storage.isPinned()
    ) {
      hideWindowSmoothly({ restoreFocus: false });
    }
  });

  mainWindow.on('hide', () => {
    win32.restoreWindowsFromDock();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      hideWindowSmoothly({ restoreFocus: false, immediate: true });
    }
  });
}

function updatePinAndDock() {
  win32.restoreWindowsFromDock();
}

function applyLayout() {
  storage.setLayoutMode('center');
  if (!mainWindow) return;

  win32.restoreWindowsFromDock();
  syncWindowGeometry();
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
      onDoubleTapCtrl: () => toggleWindow(false, 'keyboard'),
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

  const savedClipboard = snapshotClipboard();
  const rawContent = match.snippet.content || '';
  const hasInteractiveVars = /\{\?([^}]+)\}/.test(rawContent);

  win32.simulateBackspaces(match.triggerCharLen);

  if (hasInteractiveVars) {
    pendingPromptClipboard = savedClipboard;
    win32.setLastForegroundWindow(targetHwnd);

    setTimeout(() => {
      showWindow({
        source: 'keyboard',
        captureFg: false,
        postShowMessage: {
          type: 'openPromptForSnippet',
          snippet: match.snippet,
        },
      });
    }, 24);
    return;
  }

  setTimeout(async () => {
    await executePaste(rawContent, savedClipboard);
    storage.incrementUsage(match.snippet.title);
    rebuildHotstringTriggers();
    markDataDirtyAndSync();
  }, 24);
}

function sendDataToRenderer(options = {}) {
  const { includeBackdropSnapshot = false } = options;
  rendererDataDirty = true;
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || !isMainRendererReady) return;

  rebuildHotstringTriggers();

  const ctx = getActiveDisplayContext();
  const payload = {
    type: 'updateData',
    version: APP_VERSION,
    layoutMode: storage.getLayoutMode(),
    sidebarWidth: storage.getSidebarWidth(),
    centerCompact: storage.getCenterCompact(),
    backdropMode: storage.getBackdropMode(),
    backdropBlurPercent: storage.getBackdropBlurPercent(),
    backdropDimPercent: storage.getBackdropDimPercent(),
    dimBackground: storage.getDimBackground(),
    isPinned: storage.isPinned(),
    isEncrypted: storage.isEncrypted,
    isLocked: storage.isLocked,
    theme: storage.getTheme(),
    doubleTapCtrlEnabled: storage.getDoubleTapCtrlEnabled(),
    hotstringsEnabled: storage.getHotstringsEnabled(),
    hotstringPrefix: storage.getHotstringPrefix(),
    restoreClipboard: storage.getRestoreClipboard(),
    activeHotkeys: storage.getActiveHotkeys(),
    autostart: getAutostartEnabled(),
    updateState: updater ? updater.getState() : null,
    insets: ctx.workAreaInsets,
    snippets: storage.isLocked ? [] : storage.getSnippets(),
    categories: storage.isLocked ? [] : storage.getCategories(),
  };

  if (includeBackdropSnapshot) {
    payload.backdropSnapshot = !storage.isPinned() ? currentBackdropSnapshot : null;
  }

  rendererDataDirty = false;
  mainWindow.webContents.send('satztresor-msg', payload);
}

function markDataDirtyAndSync() {
  rendererDataDirty = true;
  if (isWindowEffectivelyVisible()) {
    sendDataToRenderer();
  }
}

function revealAndFocusMainWindow(ctx, isPinned) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const mainHwnd = getMainWindowHwnd();

  if (!mainWindow.isVisible()) {
    if (!isPinned && ctx) {
      win32.applyFullscreenOverlayBounds(mainHwnd, ctx.physicalBounds);
      syncNativeBackdrop();
    }
    // Map surface via SW_SHOWNOACTIVATE first so Windows never triggers synchronous caption redraws before focus
    mainWindow.showInactive();
    if (!isPinned && ctx) {
      win32.applyFullscreenOverlayBounds(mainHwnd, ctx.physicalBounds);
    }
  }

  if (process.platform === 'win32') {
    win32.focusOverlayWindow(mainHwnd);
  }
  mainWindow.focus();
}

function finalizePendingShow(seq) {
  if (!pendingShowContext || pendingShowContext.seq !== seq) return;
  const { ctx, isPinned, postShowMessage } = pendingShowContext;
  cancelPendingShow();
  if (!mainWindow || mainWindow.isDestroyed() || isQuitting) return;

  revealAndFocusMainWindow(ctx, isPinned);

  if (isPinned) {
    updatePinAndDock(true);
  }

  mainWindow.webContents.send('satztresor-msg', {
    type: 'startEntrance',
    seq,
    skipDefaultFocus: Boolean(postShowMessage),
  });

  if (postShowMessage && !storage.isLocked) {
    mainWindow.webContents.send('satztresor-msg', postShowMessage);
  } else if (storage.isLocked) {
    mainWindow.webContents.send('satztresor-msg', { type: 'openUnlock' });
  }
}

function showWindow(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const {
    source = 'auto',
    captureFg = true,
    postShowMessage = null,
  } = options;

  const wasEffectivelyVisible = Boolean(
    mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !isClosingAnimation
  );
  const wasHidden = !mainWindow.isVisible();
  cancelHideAnimation();

  if (captureFg) {
    win32.captureForegroundWindow(getOwnWindowHwnds());
  }
  win32.resetHotstringBuffer();

  if (!isMainRendererReady) {
    pendingShowRequest = { source, captureFg: false, postShowMessage };
    return;
  }

  const isPinned = storage.isPinned();
  const targetCtx = getActiveDisplayContext(source);

  if (isPinned) {
    currentBackdropSnapshot = null;
  } else if (wasHidden) {
    currentBackdropSnapshot = win32.captureDisplayBackdrop(targetCtx.physicalBounds);
  }

  const ctx = syncWindowGeometry(source, targetCtx);
  if (rendererDataDirty) {
    sendDataToRenderer();
  }

  const seq = ++showSequenceCounter;
  const waitAck = wasHidden && !isPinned;

  mainWindow.webContents.send('satztresor-msg', {
    type: 'prepareShow',
    seq,
    waitAck,
    layoutMode: 'center',
    isPinned,
    backdropMode: storage.getBackdropMode(),
    backdropBlurPercent: storage.getBackdropBlurPercent(),
    backdropDimPercent: storage.getBackdropDimPercent(),
    dimBackground: storage.getDimBackground(),
    backdropSnapshot: !isPinned ? currentBackdropSnapshot : null,
    centerCompact: storage.getCenterCompact(),
    sidebarWidth: storage.getSidebarWidth(),
    isLocked: storage.isLocked,
    insets: ctx ? ctx.workAreaInsets : { top: 0, right: 0, bottom: 0, left: 0 },
    wasHidden,
    wasEffectivelyVisible,
    skipDefaultFocus: Boolean(postShowMessage),
  });

  if (waitAck) {
    isPendingShow = true;
    pendingShowContext = { seq, ctx, isPinned, postShowMessage };
    pendingShowFallbackTimer = setTimeout(() => {
      finalizePendingShow(seq);
    }, SHOW_PREPARE_TIMEOUT_MS);
    return;
  }

  revealAndFocusMainWindow(ctx, isPinned);

  if (isPinned) {
    updatePinAndDock(true);
  }

  if (postShowMessage && !storage.isLocked) {
    mainWindow.webContents.send('satztresor-msg', postShowMessage);
  } else if (storage.isLocked) {
    mainWindow.webContents.send('satztresor-msg', { type: 'openUnlock' });
  }
}

function hideWindowSmoothly({ restoreFocus = false, immediate = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  pendingPromptClipboard = null;

  if (!mainWindow.isVisible()) {
    cancelHideAnimation();
    currentBackdropSnapshot = null;
    if (isMainRendererReady && mainWindow.webContents) {
      mainWindow.webContents.send('satztresor-msg', { type: 'resetHiddenState' });
    }
    win32.restoreWindowsFromDock();
    return;
  }

  if (immediate || storage.isPinned() || !isMainRendererReady) {
    cancelHideAnimation();
    currentBackdropSnapshot = null;
    mainWindow.hide();
    if (isMainRendererReady && mainWindow.webContents) {
      mainWindow.webContents.send('satztresor-msg', { type: 'resetHiddenState' });
    }
    win32.restoreWindowsFromDock();
    if (restoreFocus) {
      const targetHwnd = win32.getLastForegroundWindow();
      if (targetHwnd) win32.restoreForegroundWindow(targetHwnd);
    }
    return;
  }

  if (isClosingAnimation) {
    if (restoreFocus) {
      const targetHwnd = win32.getLastForegroundWindow();
      if (targetHwnd) win32.restoreForegroundWindow(targetHwnd);
    }
    return;
  }

  cancelPendingShow();
  isClosingAnimation = true;
  setMainIgnoreMouse(true);

  mainWindow.webContents.send('satztresor-msg', { type: 'animateOut' });

  if (restoreFocus) {
    const targetHwnd = win32.getLastForegroundWindow();
    if (targetHwnd) {
      win32.restoreForegroundWindow(targetHwnd);
    }
  }

  hideAnimationTimer = setTimeout(() => {
    hideAnimationTimer = null;
    isClosingAnimation = false;
    currentBackdropSnapshot = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.hide();
        setMainIgnoreMouse(false);
        if (isMainRendererReady && mainWindow.webContents) {
          mainWindow.webContents.send('satztresor-msg', { type: 'resetHiddenState' });
        }
      } catch (e) {}
    }
    win32.restoreWindowsFromDock();
  }, CLOSE_ANIMATION_MS);
}

function toggleWindow(forceShow = false, source = 'auto') {
  if (!mainWindow) return;
  if (isWindowEffectivelyVisible() && !forceShow) {
    hideWindowSmoothly({ restoreFocus: true });
  } else {
    showWindow({ source });
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

function snapshotClipboard() {
  try {
    const text = clipboard.readText() || '';
    const html = clipboard.readHTML() || '';
    const rtf = clipboard.readRTF() || '';
    const img = clipboard.readImage();
    const hasImage = Boolean(img && !img.isEmpty());
    return {
      text,
      html,
      rtf,
      image: hasImage ? img : null,
      hasImage,
    };
  } catch (e) {
    return { text: '', html: '', rtf: '', image: null, hasImage: false };
  }
}

function restoreClipboardSnapshot(snap, expectedInjectedText = null) {
  if (snap === null || snap === undefined) return;
  try {
    if (expectedInjectedText !== null) {
      const currentText = clipboard.readText() || '';
      if (currentText !== expectedInjectedText) {
        return;
      }
    }

    if (typeof snap === 'string') {
      clipboard.writeText(snap);
      win32.setClipboardPrivate();
      return;
    }

    if (snap.hasImage && snap.image) {
      const payload = { image: snap.image };
      if (snap.text) payload.text = snap.text;
      if (snap.html) payload.html = snap.html;
      clipboard.write(payload);
    } else if (snap.html || snap.rtf) {
      const payload = { text: snap.text || '' };
      if (snap.html) payload.html = snap.html;
      if (snap.rtf) payload.rtf = snap.rtf;
      clipboard.write(payload);
    } else {
      clipboard.writeText(snap.text || '');
    }
    win32.setClipboardPrivate();
  } catch (e) {}
}

async function executePaste(text, savedClipboardOverride = null) {
  const previousSnap = savedClipboardOverride !== null ? savedClipboardOverride : snapshotClipboard();
  const previousText = typeof previousSnap === 'string' ? previousSnap : (previousSnap.text || '');
  let resolved = resolveTemplates(text, previousText);

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
    }, 95);
  }

  if (storage.getRestoreClipboard()) {
    setTimeout(() => {
      restoreClipboardSnapshot(previousSnap, resolved);
    }, 420);
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
function buildExportDefaultFilename() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `SatzTresor_Backup_${y}-${m}-${d}.json`;
}

function notifyTransferFeedback({ ok, title, message, toast }) {
  if (mainWindow && !mainWindow.isDestroyed() && isWindowEffectivelyVisible()) {
    if (ok) {
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: toast || `✓ ${message}`,
      });
    } else {
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showAppAlert',
        title,
        message,
      });
    }
    return Promise.resolve();
  }

  return withSystemDialog(() =>
    dialog.showMessageBox({
      type: ok ? 'info' : 'error',
      title: `${APP_NAME} — ${title}`,
      message,
    })
  );
}

async function openImportDialog() {
  const parentWin = mainWindow && mainWindow.isVisible() ? mainWindow : undefined;
  const { filePaths } = await withSystemDialog(() =>
    dialog.showOpenDialog(parentWin, {
      title: 'Bausteine importieren',
      defaultPath: app.getPath('desktop'),
      filters: [
        { name: 'SatzTresor-Dateien (*.json, *.ini, *.csv)', extensions: ['json', 'ini', 'csv'] },
      ],
      properties: ['openFile'],
    })
  );

  if (filePaths && filePaths[0]) {
    const res = storage.importSnippets(filePaths[0]);
    if (res.success) {
      restartKeyboardHook();
      sendDataToRenderer();
      const label = res.count === 1 ? '1 Baustein importiert' : `${res.count} Bausteine importiert`;
      await notifyTransferFeedback({
        ok: true,
        title: 'Import erfolgreich',
        message: `${label}.`,
        toast: `✓ ${label}`,
      });
    } else {
      await notifyTransferFeedback({
        ok: false,
        title: 'Import fehlgeschlagen',
        message: res.error || 'Die ausgewählte Datei konnte nicht importiert werden.',
      });
    }
  }
}

async function openExportDialog(preferredFormat = 'json') {
  const ext = ['json', 'csv', 'ini'].includes(String(preferredFormat || '').toLowerCase())
    ? String(preferredFormat).toLowerCase()
    : 'json';
  const baseDefault = buildExportDefaultFilename().replace(/\.json$/i, `.${ext}`);
  const allFilters = [
    { name: 'SatzTresor-Sicherung (*.json)', extensions: ['json'] },
    { name: 'CSV-Tabelle (*.csv)', extensions: ['csv'] },
    { name: 'INI-Textdatei (*.ini)', extensions: ['ini'] },
  ];
  const orderedFilters = [
    ...allFilters.filter((f) => f.extensions[0] === ext),
    ...allFilters.filter((f) => f.extensions[0] !== ext),
  ];

  const parentWin = mainWindow && mainWindow.isVisible() ? mainWindow : undefined;
  const { filePath } = await withSystemDialog(() =>
    dialog.showSaveDialog(parentWin, {
      title: 'Bausteine exportieren',
      defaultPath: path.join(app.getPath('desktop'), baseDefault),
      filters: orderedFilters,
    })
  );

  if (filePath) {
    const ok = storage.exportSnippets(filePath);
    const count = storage.getSnippets().length;
    const countLabel = count === 1 ? '1 Baustein gesichert' : `${count} Bausteine gesichert`;
    await notifyTransferFeedback({
      ok,
      title: ok ? 'Export erfolgreich' : 'Export fehlgeschlagen',
      message: ok
        ? `${countLabel} unter:\n${filePath}`
        : 'Die Sicherungsdatei konnte am gewählten Ort nicht gespeichert werden.',
      toast: `✓ ${countLabel}`,
    });
  }
}

function updateTrayMenu() {
  const doubleTapOn = storage.getDoubleTapCtrlEnabled();
  const hotstringsOn = storage.getHotstringsEnabled();
  const activeHks = storage.getActiveHotkeys();

  const hints = [];
  if (doubleTapOn) hints.push('2× Strg');
  if (activeHks.length > 0) hints.push(formatHotkeyLabel(activeHks[0]));
  const openHint = hints.length > 0 ? ` (${hints.join(' / ')})` : '';

  const template = [
    {
      label: `${APP_NAME} öffnen${openHint}`,
      click: () => toggleWindow(true, 'mouse'),
    },
    {
      label: 'Neuer Baustein…',
      click: () => {
        showWindow({
          source: 'mouse',
          postShowMessage: { type: 'openManager' },
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Automatische Textersetzung',
      type: 'checkbox',
      checked: hotstringsOn,
      click: (item) => {
        storage.setHotstringsEnabled(item.checked);
        restartKeyboardHook();
        sendDataToRenderer();
        updateTrayMenu();
      },
    },
  ];

  if (storage.isEncrypted && !storage.isLocked) {
    template.push({
      label: 'Tresor jetzt sperren',
      click: () => {
        storage.lock();
        restartKeyboardHook();
        sendDataToRenderer();
        updateTrayMenu();
        if (isWindowEffectivelyVisible()) {
          hideWindowSmoothly({ restoreFocus: false });
        }
      },
    });
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Einstellungen…',
      click: () => {
        showWindow({
          source: 'mouse',
          postShowMessage: { type: 'openSettings' },
        });
      },
    }
  );

  const updState = updater ? updater.getState() : null;
  const isUpdateReady =
    updState && (updState.status === 'downloaded' || updState.status === 'portable-available');

  if (isUpdateReady) {
    template.push({
      label:
        updState.status === 'portable-available'
          ? `Update v${updState.availableVersion} herunterladen…`
          : `Update v${updState.availableVersion} jetzt installieren`,
      click: () => {
        if (updater) updater.installNow();
      },
    });
  }

  template.push(
    { type: 'separator' },
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
    const now = Date.now();
    if (now - lastTrayClickAt < 240) return;
    lastTrayClickAt = now;
    toggleWindow(false, 'mouse');
  });

  tray.on('double-click', () => {
    lastTrayClickAt = Date.now();
    showWindow({ source: 'mouse' });
  });
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  if (isRecordingHotkey) return;

  const toggle = () => toggleWindow(false, 'keyboard');
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
    case 'ready': {
      isMainRendererReady = true;
      sendDataToRenderer();
      if (pendingShowRequest) {
        const req = pendingShowRequest;
        pendingShowRequest = null;
        showWindow(req);
      } else if (storage.isLocked) {
        mainWindow.webContents.send('satztresor-msg', { type: 'openUnlock' });
      }
      break;
    }

    case 'showPrepared': {
      if (typeof data.seq === 'number') {
        finalizePendingShow(data.seq);
      }
      break;
    }

    case 'setLayoutMode': {
      applyLayout('center');
      break;
    }

    case 'unlock': {
      const password = data.password || '';
      const res = storage.unlock(password);
      if (res.success) {
        registerHotkeys();
        restartKeyboardHook();
        applyThemeAndBoundsAfterUnlock();
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
        hideWindowSmoothly({ restoreFocus: true });
      }
      break;
    }

    case 'paste': {
      const { title, text } = data;
      const savedClip = pendingPromptClipboard !== null ? pendingPromptClipboard : snapshotClipboard();
      pendingPromptClipboard = null;

      const isPinned = storage.isPinned();
      if (!isPinned) {
        hideWindowSmoothly({ restoreFocus: false });
      }

      (async () => {
        const targetHwnd = win32.getLastForegroundWindow();
        if (targetHwnd) {
          win32.restoreForegroundWindow(targetHwnd);
          await win32.waitForWindowFocused(targetHwnd, 135);
        } else {
          await new Promise((r) => setTimeout(r, 25));
        }

        await executePaste(text, savedClip);
        if (title) {
          storage.incrementUsage(title);
          markDataDirtyAndSync();
        }
        if (isPinned && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('satztresor-msg', {
            type: 'showToast',
            message: '✓ Eingefügt',
          });
        }
      })().catch((err) => console.error('[Main] paste error:', err));
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
        message: '✓ In Zwischenablage kopiert',
      });
      break;
    }

    case 'toggleFavorite': {
      if (data.title) {
        const isFav = storage.toggleFavorite(data.title);
        sendDataToRenderer();
        mainWindow.webContents.send('satztresor-msg', {
          type: 'showToast',
          message: isFav ? '★ Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt',
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
          message: `✓ Dupliziert als „${newTitle}“`,
        });
      }
      break;
    }

    case 'togglePin': {
      const next = !storage.isPinned();
      storage.setPinned(next);
      if (next) {
        currentBackdropSnapshot = null;
      } else {
        const pinCtx = getActiveDisplayContext();
        currentBackdropSnapshot = win32.captureDisplayBackdrop(pinCtx.physicalBounds);
      }
      sendDataToRenderer({ includeBackdropSnapshot: true });
      syncWindowGeometry();
      updatePinAndDock(next);
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: next
          ? '✓ Im Vordergrund angeheftet'
          : '✓ Anheftung gelöst',
      });
      break;
    }

    case 'dismissOverlay':
    case 'collapseWindow':
    case 'hide':
    case 'close': {
      hideWindowSmoothly({ restoreFocus: true });
      break;
    }

    case 'toggleCompactWidth': {
      const nextCompact = !storage.getCenterCompact();
      storage.setCenterCompact(nextCompact);
      if (storage.isPinned()) {
        syncWindowGeometry();
      }
      sendDataToRenderer();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: nextCompact
          ? `⇤ Kompaktansicht (${CENTER_WIDTH_COMPACT}×${CENTER_HEIGHT_COMPACT})`
          : `⇥ Großansicht (${CENTER_WIDTH_STANDARD}×${CENTER_HEIGHT_STANDARD})`,
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
        syncSystemTheme();
        syncNativeBackdrop();
        sendDataToRenderer();
        updateTrayMenu();
      }
      break;
    }

    case 'setBackdropMode': {
      if (data.mode) {
        storage.setBackdropMode(data.mode);
        syncNativeBackdrop();
        sendDataToRenderer();
        updateTrayMenu();
        const labels = {
          blur: '✓ Hintergrund: Unscharf (Milchglas)',
          solid: '✓ Hintergrund: Vollständig ausgeblendet',
          off: 'Hintergrund-Effekt deaktiviert',
        };
        mainWindow.webContents.send('satztresor-msg', {
          type: 'showToast',
          message: labels[storage.getBackdropMode()] || '✓ Gespeichert',
        });
      }
      break;
    }

    case 'setBackdropBlurPercent': {
      if (typeof data.blurPercent !== 'undefined') {
        storage.setBackdropBlurPercent(data.blurPercent);
        markDataDirtyAndSync();
      }
      break;
    }

    case 'setBackdropDimPercent': {
      if (typeof data.dimPercent !== 'undefined') {
        storage.setBackdropDimPercent(data.dimPercent);
        markDataDirtyAndSync();
      }
      break;
    }

    case 'setDimBackground': {
      const enabled = !!data.enabled;
      storage.setDimBackground(enabled);
      syncNativeBackdrop();
      sendDataToRenderer();
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: enabled ? '✓ Hintergrund-Effekt aktiviert' : 'Hintergrund-Effekt deaktiviert',
      });
      break;
    }

    case 'setAutostart': {
      const enabled = !!data.enabled;
      const res = setAutostartEnabled(enabled);
      const actualEnabled = res && typeof res.enabled === 'boolean' ? res.enabled : getAutostartEnabled();
      sendDataToRenderer();
      updateTrayMenu();
      const toastText =
        res && res.success === false
          ? '⚠️ Autostart konnte nicht geändert werden'
          : actualEnabled
            ? '✓ Mit Windows starten aktiviert'
            : '✓ Mit Windows starten deaktiviert';
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: toastText,
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

    case 'setHotstringsEnabled': {
      storage.setHotstringsEnabled(!!data.enabled);
      restartKeyboardHook();
      sendDataToRenderer();
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: data.enabled ? '✓ Automatische Textersetzung aktiv' : 'Automatische Textersetzung pausiert',
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
      openExportDialog(data.format || 'json');
      break;
    }

    case 'importDialog': {
      openImportDialog();
      break;
    }

    case 'openDataFolder': {
      shell.openPath(path.dirname(storageFile));
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

    case 'checkForUpdates': {
      if (updater) {
        updater.checkForUpdates({ manual: true });
      }
      break;
    }

    case 'installUpdateNow': {
      if (updater) {
        updater.installNow();
      }
      break;
    }

    case 'setAutoUpdateEnabled': {
      const enabled = !!data.enabled;
      if (updater) {
        updater.setAutoUpdateEnabled(enabled);
      } else {
        storage.setAutoUpdateEnabled(enabled);
      }
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: enabled
          ? '✓ Automatische Updates aktiviert'
          : 'Automatische Updates deaktiviert',
      });
      break;
    }

    case 'setUpdateRepo': {
      const rawRepo = String(data.repo || '').trim();
      const saved = updater ? updater.setUpdateRepo(rawRepo) : storage.setUpdateRepo(rawRepo);
      updateTrayMenu();
      if (rawRepo && !saved) {
        mainWindow.webContents.send('satztresor-msg', {
          type: 'showToast',
          message: 'Bitte Format name/repository verwenden',
        });
      } else {
        mainWindow.webContents.send('satztresor-msg', {
          type: 'showToast',
          message: saved ? `✓ Update-Quelle: ${saved}` : 'Update-Quelle zurückgesetzt',
        });
        if (saved && updater) {
          updater.checkForUpdates({ manual: true });
        }
      }
      break;
    }
  }
});

function broadcastUpdateState(nextUpdateState) {
  updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && isMainRendererReady) {
    mainWindow.webContents.send('satztresor-msg', {
      type: 'updateStatus',
      updateState: nextUpdateState,
    });
  }
}

function prepareQuitForUpdate() {
  isQuitting = true;
  cancelHideAnimation();
  storage.flushSave();
  win32.restoreWindowsFromDock();
  win32.stopKeyboardHook();
  win32.removeAllFramelessWindowGuards();
  globalShortcut.unregisterAll();
  if (tray) {
    try {
      tray.destroy();
    } catch (e) {}
    tray = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.destroy();
    } catch (e) {}
  }
}

function applyThemeAndBoundsAfterUnlock() {
  syncSystemTheme();
  if (!mainWindow) return;
  syncWindowGeometry();
  if (storage.isPinned()) {
    updatePinAndDock(true);
  }
}

app.whenReady().then(() => {
  updater = new SatzTresorUpdater({
    app,
    shell,
    storage,
    currentVersion: APP_VERSION,
    onStateChange: (nextState) => broadcastUpdateState(nextState),
    onToast: (message) => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && isMainRendererReady) {
        mainWindow.webContents.send('satztresor-msg', { type: 'showToast', message });
      }
    },
    onBeforeQuitAndInstall: () => prepareQuitForUpdate(),
  });

  createSatzTresorWindow();
  setupTray();
  registerHotkeys();
  restartKeyboardHook();
  updater.startSchedule();

  const handleDisplayChange = () => {
    updateTrayMenu();
    markDataDirtyAndSync();
    if (isWindowEffectivelyVisible()) {
      syncWindowGeometry();
    }
  };

  screen.on('display-metrics-changed', handleDisplayChange);
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);

  if (!launchedHidden) {
    showWindow({ source: 'startup' });
  }
});

app.on('session-end', () => {
  handleWindowsSessionEnd();
});

app.on('before-quit', () => {
  isQuitting = true;
  cancelHideAnimation();
  win32.removeAllFramelessWindowGuards();
});

app.on('will-quit', () => {
  isQuitting = true;
  if (updater) {
    updater.stopSchedule();
  }
  storage.flushSave();
  win32.restoreWindowsFromDock();
  win32.stopKeyboardHook();
  win32.removeAllFramelessWindowGuards();
  globalShortcut.unregisterAll();
  if (tray) {
    try {
      tray.destroy();
    } catch (e) {}
    tray = null;
  }
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

module.exports = {
  resolveTemplates,
  computeEffectiveHotstring,
};
