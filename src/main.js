/**
 * SatzTresor v1.5.4 — Main Process
 * Supports:
 * - Centered Spotlight Mode (Apple-inspired floating palette with smooth blurred & dimmed desktop backdrop)
 * - Automatic Background Updates via GitHub Releases & NSIS Delta Updates (electron-updater)
 * - Triggers:
 *   1. Double-Tap Ctrl (2x quick Ctrl tap — zero text interference, zero conflicts)
 *   2. Draggable Edge-Tab Handle at screen edge (mouse-only 1-click access without stealing focus)
 *   3. Freely recordable Global Hotkeys + System Tray
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
const APP_VERSION = '1.5.4';
const EDGE_TAB_CORNER_SNAP_PX = 56;
const EDGE_TAB_EDGE_MARGIN_PX = 16;
const CENTER_WIDTH_STANDARD = 780;
const CENTER_HEIGHT_STANDARD = 560;
const CENTER_WIDTH_COMPACT = 640;
const CENTER_HEIGHT_COMPACT = 460;
const CLOSE_ANIMATION_MS = 195;
const SHOW_PREPARE_TIMEOUT_MS = 65;

if (process.platform === 'win32' && typeof app.setAppUserModelId === 'function') {
  app.setAppUserModelId(APP_ID);
}

const EDGE_TAB_POSITION_LABELS = {
  'top-left': '◤ Ecke oben links (Dreieck)',
  'top-right': '◥ Ecke oben rechts (Dreieck)',
  'bottom-left': '◣ Ecke unten links (Dreieck)',
  'bottom-right': '◢ Ecke unten rechts (Dreieck)',
  left: '◀ Linker Bildschirmrand',
  right: '▶ Rechter Bildschirmrand',
  top: '▲ Oberer Bildschirmrand',
  bottom: '▼ Unterer Bildschirmrand',
};

let mainWindow = null;
let edgeTabWindow = null;
let lastMainIgnoreMouse = false;
let currentMainAlwaysOnTopLevel = '';
let lastEdgeTabIgnoreMouse = null;
let lastSentEdgeTabVisualKey = '';
let lastAppliedEdgeTabPhysKey = '';
let isDraggingEdgeTab = false;
let liveDragEdgeTabState = null;
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

function getEdgeTabHwnd() {
  return getWindowHwnd(edgeTabWindow);
}

function getOwnWindowHwnds() {
  return [getMainWindowHwnd(), getEdgeTabHwnd()].filter(Boolean);
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
  const maxW = Math.max(360, bounds.width - 48);
  const maxH = Math.max(320, bounds.height - 48);
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
// Edge-Tab & Corner-Triangle Handle Window (All 4 Edges + All 4 Corners)
// ============================================================================
function isCornerEdgeTabPosition(pos) {
  return (
    pos === 'top-left' ||
    pos === 'top-right' ||
    pos === 'bottom-left' ||
    pos === 'bottom-right'
  );
}

function getEdgeTabDimensions(position, size = 'standard') {
  if (isCornerEdgeTabPosition(position)) {
    if (size === 'compact') return { width: 28, height: 28 };
    if (size === 'large') return { width: 48, height: 48 };
    return { width: 36, height: 36 };
  }

  const isHorizontal = position === 'top' || position === 'bottom';
  if (size === 'compact') {
    return isHorizontal ? { width: 56, height: 20 } : { width: 20, height: 56 };
  }
  if (size === 'large') {
    return isHorizontal ? { width: 92, height: 28 } : { width: 28, height: 92 };
  }
  return isHorizontal ? { width: 72, height: 24 } : { width: 24, height: 72 };
}

function getDisplaysSummary() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, idx) => {
    const isPrimary = d.id === primary.id;
    const res = `${d.bounds.width}×${d.bounds.height}`;
    return {
      id: String(d.id),
      isPrimary,
      label: isPrimary ? `Hauptbildschirm (${res})` : `Monitor ${idx + 1} (${res})`,
    };
  });
}

function getEdgeTabTargetDisplay(customDisplayId = null) {
  const primary = screen.getPrimaryDisplay();
  const wantedId =
    customDisplayId !== null && customDisplayId !== undefined
      ? String(customDisplayId).trim()
      : storage.getEdgeTabDisplayId();

  if (wantedId) {
    const match = screen.getAllDisplays().find((d) => String(d.id) === wantedId);
    if (match) return match;
  }
  return primary;
}

function getEdgeTabBounds(override = null) {
  const position = (override && override.position) || storage.getEdgeTabPosition();
  const size = (override && override.size) || storage.getEdgeTabSize();
  const offsetPercent =
    override && typeof override.offsetPercent === 'number'
      ? override.offsetPercent
      : storage.getEdgeTabOffsetPercent();
  const display = getEdgeTabTargetDisplay(override ? override.displayId : null);
  const wa = display.workArea;
  const { width, height } = getEdgeTabDimensions(position, size);

  const clampedPct = Math.max(5, Math.min(95, offsetPercent));
  const t = (clampedPct - 5) / 90;

  let x = wa.x;
  let y = wa.y;

  switch (position) {
    case 'top-left':
      x = wa.x;
      y = wa.y;
      break;
    case 'top-right':
      x = wa.x + wa.width - width;
      y = wa.y;
      break;
    case 'bottom-left':
      x = wa.x;
      y = wa.y + wa.height - height;
      break;
    case 'bottom-right':
      x = wa.x + wa.width - width;
      y = wa.y + wa.height - height;
      break;
    case 'top': {
      const minX = wa.x + EDGE_TAB_EDGE_MARGIN_PX;
      const maxX = Math.max(minX, wa.x + wa.width - width - EDGE_TAB_EDGE_MARGIN_PX);
      x = Math.round(minX + (maxX - minX) * t);
      y = wa.y;
      break;
    }
    case 'bottom': {
      const minX = wa.x + EDGE_TAB_EDGE_MARGIN_PX;
      const maxX = Math.max(minX, wa.x + wa.width - width - EDGE_TAB_EDGE_MARGIN_PX);
      x = Math.round(minX + (maxX - minX) * t);
      y = wa.y + wa.height - height;
      break;
    }
    case 'right': {
      const minY = wa.y + EDGE_TAB_EDGE_MARGIN_PX;
      const maxY = Math.max(minY, wa.y + wa.height - height - EDGE_TAB_EDGE_MARGIN_PX);
      x = wa.x + wa.width - width;
      y = Math.round(minY + (maxY - minY) * t);
      break;
    }
    case 'left':
    default: {
      const minY = wa.y + EDGE_TAB_EDGE_MARGIN_PX;
      const maxY = Math.max(minY, wa.y + wa.height - height - EDGE_TAB_EDGE_MARGIN_PX);
      x = wa.x;
      y = Math.round(minY + (maxY - minY) * t);
      break;
    }
  }

  return {
    x,
    y,
    width,
    height,
    workArea: wa,
    displayId: String(display.id),
    isPrimaryDisplay: display.id === screen.getPrimaryDisplay().id,
    position,
    offsetPercent: clampedPct,
    size,
  };
}

function computeEdgeTabSnapFromCursor(fallbackData = null) {
  let cursorPt = null;
  try {
    cursorPt = screen.getCursorScreenPoint();
  } catch (e) {}

  if (
    !cursorPt &&
    fallbackData &&
    typeof fallbackData.screenX === 'number' &&
    typeof fallbackData.screenY === 'number'
  ) {
    cursorPt = { x: fallbackData.screenX, y: fallbackData.screenY };
  }
  if (!cursorPt) {
    return null;
  }

  const primary = screen.getPrimaryDisplay();
  const display = screen.getDisplayNearestPoint(cursorPt) || primary;
  const wa = display.workArea;
  const size = storage.getEdgeTabSize();

  const cx = Math.max(wa.x, Math.min(wa.x + wa.width, cursorPt.x));
  const cy = Math.max(wa.y, Math.min(wa.y + wa.height, cursorPt.y));

  const dLeft = cx - wa.x;
  const dRight = wa.x + wa.width - cx;
  const dTop = cy - wa.y;
  const dBottom = wa.y + wa.height - cy;

  let position = 'left';
  let offsetPercent = storage.getEdgeTabOffsetPercent();

  if (dLeft <= EDGE_TAB_CORNER_SNAP_PX && dTop <= EDGE_TAB_CORNER_SNAP_PX) {
    position = 'top-left';
  } else if (dRight <= EDGE_TAB_CORNER_SNAP_PX && dTop <= EDGE_TAB_CORNER_SNAP_PX) {
    position = 'top-right';
  } else if (dLeft <= EDGE_TAB_CORNER_SNAP_PX && dBottom <= EDGE_TAB_CORNER_SNAP_PX) {
    position = 'bottom-left';
  } else if (dRight <= EDGE_TAB_CORNER_SNAP_PX && dBottom <= EDGE_TAB_CORNER_SNAP_PX) {
    position = 'bottom-right';
  } else {
    const minDist = Math.min(dLeft, dRight, dTop, dBottom);
    if (minDist === dTop) {
      position = 'top';
    } else if (minDist === dBottom) {
      position = 'bottom';
    } else if (minDist === dRight) {
      position = 'right';
    } else {
      position = 'left';
    }

    const { width, height } = getEdgeTabDimensions(position, size);
    if (position === 'top' || position === 'bottom') {
      const minX = wa.x + EDGE_TAB_EDGE_MARGIN_PX;
      const maxX = Math.max(minX, wa.x + wa.width - width - EDGE_TAB_EDGE_MARGIN_PX);
      const targetX = Math.max(minX, Math.min(maxX, cx - width / 2));
      const t = maxX > minX ? (targetX - minX) / (maxX - minX) : 0.5;
      offsetPercent = Math.round((5 + t * 90) * 10) / 10;
    } else {
      const minY = wa.y + EDGE_TAB_EDGE_MARGIN_PX;
      const maxY = Math.max(minY, wa.y + wa.height - height - EDGE_TAB_EDGE_MARGIN_PX);
      const targetY = Math.max(minY, Math.min(maxY, cy - height / 2));
      const t = maxY > minY ? (targetY - minY) / (maxY - minY) : 0.5;
      offsetPercent = Math.round((5 + t * 90) * 10) / 10;
    }
  }

  const displayId = display.id === primary.id ? '' : String(display.id);
  const bounds = getEdgeTabBounds({ position, offsetPercent, size, displayId });

  return {
    position,
    offsetPercent,
    displayId,
    bounds,
  };
}

function setEdgeTabIgnoreMouse(ignore) {
  if (!edgeTabWindow || edgeTabWindow.isDestroyed()) return;
  const next = Boolean(ignore);
  if (lastEdgeTabIgnoreMouse === next) return;
  lastEdgeTabIgnoreMouse = next;
  try {
    if (next) {
      edgeTabWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      edgeTabWindow.setIgnoreMouseEvents(false);
    }
  } catch (e) {}
}

function sendVisualStateToEdgeTab(override = null, force = false) {
  if (!edgeTabWindow || edgeTabWindow.isDestroyed()) return;
  if (!edgeTabWindow.webContents || edgeTabWindow.webContents.isLoading()) return;

  const position = (override && override.position) || storage.getEdgeTabPosition();
  const size = (override && override.size) || storage.getEdgeTabSize();
  const locked =
    override && typeof override.locked === 'boolean'
      ? override.locked
      : storage.getEdgeTabLocked();
  const theme = storage.getTheme();

  const key = `${position}|${size}|${locked ? '1' : '0'}|${theme}`;
  if (!force && key === lastSentEdgeTabVisualKey) return;
  lastSentEdgeTabVisualKey = key;

  edgeTabWindow.webContents.send('satztresor-msg', {
    type: 'edgeTabState',
    position,
    side: position === 'right' ? 'right' : 'left',
    size,
    locked,
    theme,
  });
}

function setEdgeTabBoundsExact(dipBounds, force = false) {
  if (!edgeTabWindow || edgeTabWindow.isDestroyed() || !dipBounds) return;
  const targetDip = {
    x: Math.round(dipBounds.x),
    y: Math.round(dipBounds.y),
    width: Math.max(1, Math.round(dipBounds.width)),
    height: Math.max(1, Math.round(dipBounds.height)),
  };

  if (process.platform === 'win32') {
    let phys = targetDip;
    try {
      if (typeof screen.dipToScreenRect === 'function') {
        phys = screen.dipToScreenRect(edgeTabWindow, targetDip);
      }
    } catch (e) {}

    const key = `${phys.x}|${phys.y}|${phys.width}|${phys.height}`;
    if (!force && key === lastAppliedEdgeTabPhysKey) return;
    lastAppliedEdgeTabPhysKey = key;
    win32.applyEdgeTabBounds(getEdgeTabHwnd(), phys);
    return;
  }

  setWindowBoundsSafe(edgeTabWindow, targetDip);
}

function createEdgeTabWindow() {
  const b = getEdgeTabBounds();

  edgeTabWindow = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    minWidth: 1,
    minHeight: 1,
    title: '',
    frame: false,
    thickFrame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
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

  if (process.platform === 'win32') {
    win32.installFramelessWindowGuard(getEdgeTabHwnd(), {
      noActivate: true,
      onSessionEnd: handleWindowsSessionEnd,
    });
  }

  edgeTabWindow.setAlwaysOnTop(true, 'screen-saver');
  setEdgeTabBoundsExact(b, true);
  edgeTabWindow.loadFile(path.join(__dirname, '..', 'ui', 'edge-tab.html'), {
    query: {
      pos: b.position,
      size: b.size,
      locked: storage.getEdgeTabLocked() ? '1' : '0',
      theme: storage.getTheme(),
    },
  });

  edgeTabWindow.webContents.on('did-finish-load', () => {
    lastSentEdgeTabVisualKey = '';
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

  const activeOverride = isDraggingEdgeTab ? liveDragEdgeTabState : null;
  sendVisualStateToEdgeTab(activeOverride, false);

  const shouldShow =
    !isQuitting &&
    storage.getEdgeTabEnabled() &&
    !isWindowEffectivelyVisible();

  if (shouldShow) {
    const b = getEdgeTabBounds(activeOverride);
    setEdgeTabBoundsExact(b, !edgeTabWindow.isVisible());
    if (isDraggingEdgeTab || !isCornerEdgeTabPosition(b.position)) {
      setEdgeTabIgnoreMouse(false);
    } else if (lastEdgeTabIgnoreMouse === null) {
      setEdgeTabIgnoreMouse(true);
    }
    if (!edgeTabWindow.isVisible()) {
      edgeTabWindow.showInactive();
      setEdgeTabBoundsExact(b, true);
    }
  } else if (edgeTabWindow.isVisible()) {
    lastEdgeTabIgnoreMouse = null;
    lastAppliedEdgeTabPhysKey = '';
    edgeTabWindow.hide();
  }
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
    edgeTabEnabled: storage.getEdgeTabEnabled(),
    edgeTabPosition: storage.getEdgeTabPosition(),
    edgeTabOffsetPercent: storage.getEdgeTabOffsetPercent(),
    edgeTabSize: storage.getEdgeTabSize(),
    edgeTabLocked: storage.getEdgeTabLocked(),
    edgeTabDisplayId: storage.getEdgeTabDisplayId(),
    displays: getDisplaysSummary(),
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

  syncEdgeTabWindow();
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
    if (edgeTabWindow && !edgeTabWindow.isDestroyed() && edgeTabWindow.isVisible()) {
      lastEdgeTabIgnoreMouse = null;
      edgeTabWindow.hide();
    }
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
    syncEdgeTabWindow();
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

  syncEdgeTabWindow();
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
    syncEdgeTabWindow();
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
    syncEdgeTabWindow();
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
  syncEdgeTabWindow();

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
    syncEdgeTabWindow();
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

function buildEdgeTabSubmenuTemplate() {
  const edgeTabOn = storage.getEdgeTabEnabled();
  const edgeTabPos = storage.getEdgeTabPosition();
  const edgeTabSize = storage.getEdgeTabSize();
  const edgeTabLocked = storage.getEdgeTabLocked();
  const displays = getDisplaysSummary();
  const currentDisplayId = storage.getEdgeTabDisplayId();

  const applyPos = (pos) => {
    storage.setEdgeTabPosition(pos);
    if (!storage.getEdgeTabEnabled()) {
      storage.setEdgeTabEnabled(true);
    }
    syncEdgeTabWindow();
    sendDataToRenderer();
    updateTrayMenu();
  };

  const applySize = (sz) => {
    storage.setEdgeTabSize(sz);
    syncEdgeTabWindow();
    sendDataToRenderer();
    updateTrayMenu();
  };

  const items = [
    {
      label: 'Lasche anzeigen (Aktiviert)',
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
      label: 'Position fixieren (Verschieben sperren)',
      type: 'checkbox',
      checked: edgeTabLocked,
      click: (item) => {
        storage.setEdgeTabLocked(item.checked);
        syncEdgeTabWindow();
        sendDataToRenderer();
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: '◤ Ecke oben links (Dreieck)',
      type: 'radio',
      checked: edgeTabPos === 'top-left',
      click: () => applyPos('top-left'),
    },
    {
      label: '◥ Ecke oben rechts (Dreieck)',
      type: 'radio',
      checked: edgeTabPos === 'top-right',
      click: () => applyPos('top-right'),
    },
    {
      label: '◣ Ecke unten links (Dreieck)',
      type: 'radio',
      checked: edgeTabPos === 'bottom-left',
      click: () => applyPos('bottom-left'),
    },
    {
      label: '◢ Ecke unten rechts (Dreieck)',
      type: 'radio',
      checked: edgeTabPos === 'bottom-right',
      click: () => applyPos('bottom-right'),
    },
    { type: 'separator' },
    {
      label: '◀ Linker Bildschirmrand',
      type: 'radio',
      checked: edgeTabPos === 'left',
      click: () => applyPos('left'),
    },
    {
      label: '▶ Rechter Bildschirmrand',
      type: 'radio',
      checked: edgeTabPos === 'right',
      click: () => applyPos('right'),
    },
    {
      label: '▲ Oberer Bildschirmrand',
      type: 'radio',
      checked: edgeTabPos === 'top',
      click: () => applyPos('top'),
    },
    {
      label: '▼ Unterer Bildschirmrand',
      type: 'radio',
      checked: edgeTabPos === 'bottom',
      click: () => applyPos('bottom'),
    },
    { type: 'separator' },
    {
      label: 'Größe: Kompakt',
      type: 'radio',
      checked: edgeTabSize === 'compact',
      click: () => applySize('compact'),
    },
    {
      label: 'Größe: Standard',
      type: 'radio',
      checked: edgeTabSize === 'standard',
      click: () => applySize('standard'),
    },
    {
      label: 'Größe: Groß',
      type: 'radio',
      checked: edgeTabSize === 'large',
      click: () => applySize('large'),
    },
  ];

  if (displays.length > 1) {
    items.push({ type: 'separator' });
    for (const d of displays) {
      const checked = d.isPrimary
        ? !currentDisplayId || currentDisplayId === d.id
        : currentDisplayId === d.id;
      items.push({
        label: `Bildschirm: ${d.label}`,
        type: 'radio',
        checked,
        click: () => {
          storage.setEdgeTabDisplayId(d.isPrimary ? '' : d.id);
          syncEdgeTabWindow();
          sendDataToRenderer();
          updateTrayMenu();
        },
      });
    }
  }

  return items;
}

function updateTrayMenu() {
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
      click: () => toggleWindow(true, 'mouse'),
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
      label: `Bildschirmrand-Lasche (${edgeTabOn ? 'Aktiv' : 'Aus'})`,
      submenu: buildEdgeTabSubmenuTemplate(),
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
      label: 'Hintergrund-Effekt',
      submenu: [
        {
          label: 'Unscharf & abgedunkelt (Milchglas)',
          type: 'radio',
          checked: storage.getBackdropMode() === 'blur',
          click: () => {
            storage.setBackdropMode('blur');
            syncNativeBackdrop();
            sendDataToRenderer();
            updateTrayMenu();
          },
        },
        {
          label: 'Vollständig ausblenden (Fokus)',
          type: 'radio',
          checked: storage.getBackdropMode() === 'solid',
          click: () => {
            storage.setBackdropMode('solid');
            syncNativeBackdrop();
            sendDataToRenderer();
            updateTrayMenu();
          },
        },
        {
          label: 'Transparent (Kein Effekt)',
          type: 'radio',
          checked: storage.getBackdropMode() === 'off',
          click: () => {
            storage.setBackdropMode('off');
            syncNativeBackdrop();
            sendDataToRenderer();
            updateTrayMenu();
          },
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
            syncSystemTheme();
            syncNativeBackdrop();
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
            syncSystemTheme();
            syncNativeBackdrop();
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
        showWindow({
          source: 'mouse',
          postShowMessage: { type: 'openManager' },
        });
      },
    },
    {
      label: 'Einstellungen…',
      click: () => {
        showWindow({
          source: 'mouse',
          postShowMessage: { type: 'openSettings' },
        });
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
        showWindow({
          source: 'mouse',
          postShowMessage: { type: 'manageEncryption' },
        });
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
        if (isWindowEffectivelyVisible()) {
          hideWindowSmoothly({ restoreFocus: false });
        }
      },
    });
  }

  const updState = updater ? updater.getState() : null;
  const isUpdateReady =
    updState && (updState.status === 'downloaded' || updState.status === 'portable-available');

  template.push(
    { type: 'separator' },
    {
      label: isUpdateReady
        ? updState.status === 'portable-available'
          ? `↓ Update v${updState.availableVersion} herunterladen…`
          : `↻ Update v${updState.availableVersion} jetzt installieren`
        : 'Nach Updates suchen…',
      click: () => {
        if (!updater) return;
        if (isUpdateReady) {
          updater.installNow();
        } else {
          showWindow({
            source: 'mouse',
            postShowMessage: { type: 'openSettings' },
          });
          updater.checkForUpdates({ manual: true });
        }
      },
    },
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
              '• Erscheinungsbild: Zentriertes Spotlight-Fenster mit weichem Milchglas-Hintergrund\n' +
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

    // Edge-Tab & Corner-Triangle Window actions
    case 'edgeTabReady':
      lastSentEdgeTabVisualKey = '';
      syncEdgeTabWindow();
      break;

    case 'edgeTabClick':
      showWindow({ source: 'mouse' });
      break;

    case 'edgeTabSetIgnoreMouse': {
      if (!isDraggingEdgeTab) {
        const pos = storage.getEdgeTabPosition();
        if (isCornerEdgeTabPosition(pos)) {
          setEdgeTabIgnoreMouse(!!data.ignore);
        } else {
          setEdgeTabIgnoreMouse(false);
        }
      }
      break;
    }

    case 'edgeTabDrag': {
      if (storage.getEdgeTabLocked()) break;
      if (edgeTabWindow && !edgeTabWindow.isDestroyed()) {
        const snap = computeEdgeTabSnapFromCursor(data);
        if (snap) {
          isDraggingEdgeTab = true;
          liveDragEdgeTabState = {
            position: snap.position,
            offsetPercent: snap.offsetPercent,
            displayId: snap.displayId,
            size: storage.getEdgeTabSize(),
            locked: false,
          };
          setEdgeTabIgnoreMouse(false);
          sendVisualStateToEdgeTab(liveDragEdgeTabState, false);
          setEdgeTabBoundsExact(snap.bounds);
        }
      }
      break;
    }

    case 'edgeTabDragEnd': {
      const wasDragging = isDraggingEdgeTab;
      const snap = !storage.getEdgeTabLocked()
        ? computeEdgeTabSnapFromCursor(data) || liveDragEdgeTabState
        : null;
      isDraggingEdgeTab = false;
      liveDragEdgeTabState = null;

      if (wasDragging && snap && snap.position) {
        const clampedPct = Math.max(
          5,
          Math.min(95, Math.round((Number(snap.offsetPercent) || 42) * 10) / 10)
        );
        storage.setSettingsBatch({
          EdgeTabPosition: snap.position,
          EdgeTabOffsetPercent: String(clampedPct),
          EdgeTabYPercent: String(Math.round(clampedPct)),
          EdgeTabDisplayId: String(snap.displayId || ''),
        });
        syncEdgeTabWindow();
        markDataDirtyAndSync();
        updateTrayMenu();
      } else {
        syncEdgeTabWindow();
      }
      break;
    }

    case 'edgeTabContextMenu': {
      if (currentTrayMenu) {
        const popupOpts =
          edgeTabWindow && !edgeTabWindow.isDestroyed() ? { window: edgeTabWindow } : undefined;
        currentTrayMenu.popup(popupOpts);
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
          ? '📌 SatzTresor dauerhaft im Vordergrund fixiert'
          : '🔓 Fixierung gelöst (Spotlight-Overlay)',
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
          : `⇥ Standardansicht (${CENTER_WIDTH_STANDARD}×${CENTER_HEIGHT_STANDARD})`,
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
        syncEdgeTabWindow();
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

    case 'setEdgeTabPosition': {
      if (data.position) {
        storage.setEdgeTabPosition(data.position);
        syncEdgeTabWindow();
        sendDataToRenderer();
        updateTrayMenu();
        const label = EDGE_TAB_POSITION_LABELS[storage.getEdgeTabPosition()] || 'Position aktualisiert';
        mainWindow.webContents.send('satztresor-msg', {
          type: 'showToast',
          message: `✓ ${label}`,
        });
      }
      break;
    }

    case 'setEdgeTabOffsetPercent': {
      if (typeof data.offsetPercent !== 'undefined') {
        storage.setEdgeTabOffsetPercent(data.offsetPercent);
        syncEdgeTabWindow();
        sendDataToRenderer();
      }
      break;
    }

    case 'setEdgeTabSize': {
      if (data.size) {
        storage.setEdgeTabSize(data.size);
        syncEdgeTabWindow();
        sendDataToRenderer();
        updateTrayMenu();
        const sizeLabels = {
          compact: 'Kompakt',
          standard: 'Standard',
          large: 'Groß',
        };
        mainWindow.webContents.send('satztresor-msg', {
          type: 'showToast',
          message: `✓ Laschen-Größe: ${sizeLabels[storage.getEdgeTabSize()] || 'Standard'}`,
        });
      }
      break;
    }

    case 'setEdgeTabLocked': {
      const locked = !!data.locked;
      storage.setEdgeTabLocked(locked);
      syncEdgeTabWindow();
      sendDataToRenderer();
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: locked ? '🔒 Laschen-Position fixiert' : '🔓 Lasche wieder frei verschiebbar',
      });
      break;
    }

    case 'setEdgeTabDisplayId': {
      storage.setEdgeTabDisplayId(data.displayId || '');
      syncEdgeTabWindow();
      sendDataToRenderer();
      updateTrayMenu();
      mainWindow.webContents.send('satztresor-msg', {
        type: 'showToast',
        message: '✓ Bildschirm für Lasche aktualisiert',
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
  if (edgeTabWindow && !edgeTabWindow.isDestroyed()) {
    try {
      edgeTabWindow.destroy();
    } catch (e) {}
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
  createEdgeTabWindow();
  setupTray();
  registerHotkeys();
  restartKeyboardHook();
  updater.startSchedule();

  const handleDisplayChange = () => {
    syncEdgeTabWindow();
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
  } else {
    syncEdgeTabWindow();
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
