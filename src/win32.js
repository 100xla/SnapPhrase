/**
 * SnapPhrase v1.6.0 — Win32 Native Integration (Koffi FFI)
 * Handles window focus, clipboard protection (Win+V history exclusion),
 * atomic SendInput keyboard simulation, unified Low-Level Keyboard Hook (WH_KEYBOARD_LL)
 * for Double-Tap Ctrl trigger + automatic Hotstring expansion,
 * DWM Acrylic full-screen backdrop blur, and multi-monitor aware desktop work area / window docking.
 */

const koffi = require('koffi');

let user32, kernel32, dwmapi, gdi32, advapi32;
let GetForegroundWindow, SetForegroundWindow, ShowWindow, BringWindowToTop, AttachThreadInput;
let OpenClipboard, CloseClipboard, RegisterClipboardFormatA, SetClipboardData;
let GlobalAlloc, GlobalLock, GlobalUnlock, GlobalFree, GetCurrentThreadId;
let keybd_event, SendInput, GetAsyncKeyState, GetKeyState, MapVirtualKeyW;
let GetWindowThreadProcessId, GetKeyboardLayout, ToUnicodeEx;
let SetWindowsHookExW, UnhookWindowsHookEx, CallNextHookEx;
let LowLevelKeyboardProc, KBDLLHOOKSTRUCT, INPUT_STRUCT, RECT_STRUCT, WCA_DATA_STRUCT, STYLESTRUCT;
let WndProcProto, SetWindowLongPtrW, GetWindowLongPtrW, CallWindowProcW;
let SystemParametersInfoW, GetWindowRect, SetWindowPos, IsWindow, IsZoomed, IsWindowVisible, IsIconic, GetClassNameW;
let SetWindowCompositionAttribute, DwmSetWindowAttribute;
let GetDC, ReleaseDC;
let CreateCompatibleDC, DeleteDC, CreateCompatibleBitmap, SelectObject, DeleteObject;
let BitBlt, SetStretchBltMode, SetBrushOrgEx, StretchBlt, GetDIBits;
let RegOpenKeyExW, RegCreateKeyExW, RegQueryValueExW, RegSetValueExW, RegDeleteValueW, RegCloseKey;

try {
  user32 = koffi.load('user32.dll');
  kernel32 = koffi.load('kernel32.dll');
  try {
    dwmapi = koffi.load('dwmapi.dll');
  } catch (e) {
    dwmapi = null;
  }

  GetForegroundWindow = user32.func('GetForegroundWindow', 'intptr_t', []);
  SetForegroundWindow = user32.func('SetForegroundWindow', 'bool', ['intptr_t']);
  ShowWindow = user32.func('ShowWindow', 'bool', ['intptr_t', 'int']);
  BringWindowToTop = user32.func('BringWindowToTop', 'bool', ['intptr_t']);
  AttachThreadInput = user32.func('bool __stdcall AttachThreadInput(uint32 idAttach, uint32 idAttachTo, bool fAttach)');

  OpenClipboard = user32.func('OpenClipboard', 'bool', ['intptr_t']);
  CloseClipboard = user32.func('CloseClipboard', 'bool', []);
  RegisterClipboardFormatA = user32.func('RegisterClipboardFormatA', 'uint32_t', ['string']);
  SetClipboardData = user32.func('SetClipboardData', 'intptr_t', ['uint32_t', 'intptr_t']);

  GlobalAlloc = kernel32.func('GlobalAlloc', 'intptr_t', ['uint32_t', 'size_t']);
  GlobalLock = kernel32.func('GlobalLock', 'void *', ['intptr_t']);
  GlobalUnlock = kernel32.func('GlobalUnlock', 'bool', ['intptr_t']);
  GlobalFree = kernel32.func('GlobalFree', 'intptr_t', ['intptr_t']);
  GetCurrentThreadId = kernel32.func('uint32 __stdcall GetCurrentThreadId()');

  keybd_event = user32.func('keybd_event', 'void', ['uint8_t', 'uint8_t', 'uint32_t', 'uintptr_t']);
  GetAsyncKeyState = user32.func('GetAsyncKeyState', 'int16_t', ['int']);
  GetKeyState = user32.func('GetKeyState', 'int16_t', ['int']);
  MapVirtualKeyW = user32.func('uint32 __stdcall MapVirtualKeyW(uint32 uCode, uint32 uMapType)');

  const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
    dx: 'long',
    dy: 'long',
    mouseData: 'uint32',
    dwFlags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr_t',
  });
  const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
    wVk: 'uint16',
    wScan: 'uint16',
    dwFlags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr_t',
  });
  const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
    uMsg: 'uint32',
    wParamL: 'uint16',
    wParamH: 'uint16',
  });
  const INPUT_UNION = koffi.union('INPUT_UNION', {
    mi: MOUSEINPUT,
    ki: KEYBDINPUT,
    hi: HARDWAREINPUT,
  });
  INPUT_STRUCT = koffi.struct('INPUT', {
    type: 'uint32',
    u: INPUT_UNION,
  });

  SendInput = user32.func('uint32 __stdcall SendInput(uint32 cInputs, const INPUT *pInputs, int cbSize)');

  GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(intptr_t hWnd, void *lpdwProcessId)');
  GetKeyboardLayout = user32.func('intptr_t __stdcall GetKeyboardLayout(uint32 idThread)');
  ToUnicodeEx = user32.func('int __stdcall ToUnicodeEx(uint32 wVirtKey, uint32 wScanCode, const uint8 *lpKeyState, _Out_ uint16 *pwszBuff, int cchBuff, uint32 wFlags, intptr_t dwhkl)');

  KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
    vkCode: 'uint32',
    scanCode: 'uint32',
    flags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr_t',
  });

  LowLevelKeyboardProc = koffi.proto('intptr_t __stdcall LowLevelKeyboardProc(int nCode, uintptr_t wParam, void *lParam)');
  SetWindowsHookExW = user32.func('intptr_t __stdcall SetWindowsHookExW(int idHook, LowLevelKeyboardProc *lpfn, intptr_t hMod, uint32 dwThreadId)');
  UnhookWindowsHookEx = user32.func('bool __stdcall UnhookWindowsHookEx(intptr_t hhk)');
  CallNextHookEx = user32.func('intptr_t __stdcall CallNextHookEx(intptr_t hhk, int nCode, uintptr_t wParam, void *lParam)');

  RECT_STRUCT = koffi.struct('RECT', {
    left: 'long',
    top: 'long',
    right: 'long',
    bottom: 'long',
  });

  STYLESTRUCT = koffi.struct('STYLESTRUCT', {
    styleOld: 'uint32',
    styleNew: 'uint32',
  });

  WndProcProto = koffi.proto(
    'intptr_t __stdcall WndProc(intptr_t hWnd, uint32 uMsg, uintptr_t wParam, void *lParam)'
  );
  const setWinLongName = process.arch === 'ia32' ? 'SetWindowLongW' : 'SetWindowLongPtrW';
  const getWinLongName = process.arch === 'ia32' ? 'GetWindowLongW' : 'GetWindowLongPtrW';
  SetWindowLongPtrW = user32.func(`intptr_t __stdcall ${setWinLongName}(intptr_t hWnd, int nIndex, intptr_t dwNewLong)`);
  GetWindowLongPtrW = user32.func(`intptr_t __stdcall ${getWinLongName}(intptr_t hWnd, int nIndex)`);
  CallWindowProcW = user32.func(
    'intptr_t __stdcall CallWindowProcW(intptr_t lpPrevWndFunc, intptr_t hWnd, uint32 uMsg, uintptr_t wParam, void *lParam)'
  );

  SystemParametersInfoW = user32.func('bool __stdcall SystemParametersInfoW(uint32 uiAction, uint32 uiParam, _Inout_ RECT *pvParam, uint32 fWinIni)');
  GetWindowRect = user32.func('GetWindowRect', 'bool', ['intptr_t', '_Out_ RECT *']);
  SetWindowPos = user32.func('SetWindowPos', 'bool', ['intptr_t', 'intptr_t', 'int', 'int', 'int', 'int', 'uint']);
  IsWindow = user32.func('IsWindow', 'bool', ['intptr_t']);
  IsZoomed = user32.func('IsZoomed', 'bool', ['intptr_t']);
  IsWindowVisible = user32.func('IsWindowVisible', 'bool', ['intptr_t']);
  IsIconic = user32.func('IsIconic', 'bool', ['intptr_t']);
  GetClassNameW = user32.func('int __stdcall GetClassNameW(intptr_t hWnd, _Out_ uint16 *lpClassName, int nMaxCount)');

  try {
    advapi32 = koffi.load('advapi32.dll');
    RegOpenKeyExW = advapi32.func(
      'int32 __stdcall RegOpenKeyExW(intptr_t hKey, str16 lpSubKey, uint32 ulOptions, uint32 samDesired, _Out_ intptr_t *phkResult)'
    );
    RegCreateKeyExW = advapi32.func(
      'int32 __stdcall RegCreateKeyExW(intptr_t hKey, str16 lpSubKey, uint32 Reserved, void *lpClass, uint32 dwOptions, uint32 samDesired, void *lpSecurityAttributes, _Out_ intptr_t *phkResult, _Out_ uint32 *lpdwDisposition)'
    );
    RegQueryValueExW = advapi32.func(
      'int32 __stdcall RegQueryValueExW(intptr_t hKey, str16 lpValueName, void *lpReserved, _Out_ uint32 *lpType, _Out_ uint8 *lpData, _Inout_ uint32 *lpcbData)'
    );
    RegSetValueExW = advapi32.func(
      'int32 __stdcall RegSetValueExW(intptr_t hKey, str16 lpValueName, uint32 Reserved, uint32 dwType, const uint8 *lpData, uint32 cbData)'
    );
    RegDeleteValueW = advapi32.func(
      'int32 __stdcall RegDeleteValueW(intptr_t hKey, str16 lpValueName)'
    );
    RegCloseKey = advapi32.func('int32 __stdcall RegCloseKey(intptr_t hKey)');
  } catch (e) {
    advapi32 = null;
  }

  WCA_DATA_STRUCT = koffi.struct('WINDOWCOMPOSITIONATTRIBDATA', {
    Attrib: 'int32',
    pvData: 'void *',
    cbData: 'uint32',
  });

  try {
    SetWindowCompositionAttribute = user32.func(
      'bool __stdcall SetWindowCompositionAttribute(intptr_t hWnd, WINDOWCOMPOSITIONATTRIBDATA *pAttrData)'
    );
  } catch (e) {
    SetWindowCompositionAttribute = null;
  }

  if (dwmapi) {
    try {
      DwmSetWindowAttribute = dwmapi.func(
        'int32 __stdcall DwmSetWindowAttribute(intptr_t hwnd, uint32 dwAttribute, void *pvAttribute, uint32 cbAttribute)'
      );
    } catch (e) {
      DwmSetWindowAttribute = null;
    }
  }

  try {
    GetDC = user32.func('intptr_t __stdcall GetDC(intptr_t hWnd)');
    ReleaseDC = user32.func('int __stdcall ReleaseDC(intptr_t hWnd, intptr_t hDC)');
    gdi32 = koffi.load('gdi32.dll');
    CreateCompatibleDC = gdi32.func('intptr_t __stdcall CreateCompatibleDC(intptr_t hdc)');
    DeleteDC = gdi32.func('bool __stdcall DeleteDC(intptr_t hdc)');
    CreateCompatibleBitmap = gdi32.func('intptr_t __stdcall CreateCompatibleBitmap(intptr_t hdc, int cx, int cy)');
    SelectObject = gdi32.func('intptr_t __stdcall SelectObject(intptr_t hdc, intptr_t h)');
    DeleteObject = gdi32.func('bool __stdcall DeleteObject(intptr_t ho)');
    BitBlt = gdi32.func(
      'bool __stdcall BitBlt(intptr_t hdc, int x, int y, int cx, int cy, intptr_t hdcSrc, int x1, int y1, uint32 rop)'
    );
    SetStretchBltMode = gdi32.func('int __stdcall SetStretchBltMode(intptr_t hdc, int mode)');
    SetBrushOrgEx = gdi32.func('bool __stdcall SetBrushOrgEx(intptr_t hdc, int x, int y, void *lppt)');
    StretchBlt = gdi32.func(
      'bool __stdcall StretchBlt(intptr_t hdcDest, int xDest, int yDest, int wDest, int hDest, intptr_t hdcSrc, int xSrc, int ySrc, int wSrc, int hSrc, uint32 rop)'
    );
    GetDIBits = gdi32.func(
      'int __stdcall GetDIBits(intptr_t hdc, intptr_t hbm, uint32 start, uint32 cLines, void *lpvBits, void *lpbmi, uint32 usage)'
    );
  } catch (e) {
    gdi32 = null;
  }
} catch (err) {
  console.error('[Win32] Failed to load native DLLs:', err);
}

// Virtual key codes & constants
const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;
const WH_KEYBOARD_LL = 13;
const WM_KEYDOWN = 0x0100;
const WM_KEYUP = 0x0101;
const WM_SYSKEYDOWN = 0x0104;
const WM_SYSKEYUP = 0x0105;
const LLKHF_LOWER_IL_INJECTED = 0x02;
const LLKHF_INJECTED = 0x10;

const VK_LBUTTON = 0x01;
const VK_RBUTTON = 0x02;
const VK_MBUTTON = 0x04;
const VK_BACK = 0x08;
const VK_TAB = 0x09;
const VK_RETURN = 0x0D;
const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12; // Alt
const VK_CAPITAL = 0x14;
const VK_ESCAPE = 0x1B;
const VK_PRIOR = 0x21;
const VK_NEXT = 0x22;
const VK_END = 0x23;
const VK_HOME = 0x24;
const VK_LEFT = 0x25;
const VK_UP = 0x26;
const VK_RIGHT = 0x27;
const VK_DOWN = 0x28;
const VK_DELETE = 0x2E;
const VK_V = 0x56;
const VK_LWIN = 0x5B;
const VK_RWIN = 0x5C;
const VK_LSHIFT = 0xA0;
const VK_RSHIFT = 0xA1;
const VK_LCONTROL = 0xA2;
const VK_RCONTROL = 0xA3;
const VK_LMENU = 0xA4;
const VK_RMENU = 0xA5;

let lastForegroundHwnd = 0;

function captureForegroundWindow(excludeHwnds = []) {
  if (GetForegroundWindow) {
    const hwnd = GetForegroundWindow();
    const excluded = Array.isArray(excludeHwnds) ? excludeHwnds : [excludeHwnds];
    if (hwnd && !excluded.includes(hwnd)) {
      lastForegroundHwnd = hwnd;
    }
  }
  return lastForegroundHwnd;
}

function setLastForegroundWindow(hwnd) {
  if (hwnd) {
    lastForegroundHwnd = hwnd;
  }
}

function getLastForegroundWindow() {
  return lastForegroundHwnd;
}

/**
 * Returns the physical screen center point of the given window if it is a normal visible app window.
 * Ignores minimized windows and Windows shell surfaces (Progman, WorkerW, Shell_TrayWnd).
 */
function getWindowCenterPhysical(hwnd = lastForegroundHwnd) {
  if (!hwnd || !GetWindowRect) return null;
  try {
    if (IsWindowVisible && !IsWindowVisible(hwnd)) return null;
    if (IsIconic && IsIconic(hwnd)) return null;

    if (GetClassNameW) {
      const clsBuf = new Uint16Array(64);
      const len = GetClassNameW(hwnd, clsBuf, 64);
      if (len > 0) {
        const clsName = String.fromCharCode(...clsBuf.subarray(0, len));
        if (
          clsName === 'Progman' ||
          clsName === 'WorkerW' ||
          clsName === 'Shell_TrayWnd' ||
          clsName === 'Shell_SecondaryTrayWnd'
        ) {
          return null;
        }
      }
    }

    const rect = {};
    if (!GetWindowRect(hwnd, rect)) return null;
    const w = rect.right - rect.left;
    const h = rect.bottom - rect.top;
    if (w <= 16 || h <= 16) return null;

    return {
      x: Math.round(rect.left + w / 2),
      y: Math.round(rect.top + h / 2),
    };
  } catch (e) {
    return null;
  }
}

function activateWindowCleanly(hwnd) {
  if (!hwnd || !SetForegroundWindow) return false;
  try {
    if (GetForegroundWindow && GetForegroundWindow() === hwnd) {
      return true;
    }
    if (SetForegroundWindow(hwnd)) {
      if (!GetForegroundWindow || GetForegroundWindow() === hwnd) {
        return true;
      }
    }

    // Silent thread-input handoff fallback (never taps Alt / VK_MENU, avoiding menu bar activation in target apps)
    const fgHwnd = GetForegroundWindow ? GetForegroundWindow() : 0;
    const fgThread = fgHwnd && GetWindowThreadProcessId ? GetWindowThreadProcessId(fgHwnd, null) : 0;
    const curThread = GetCurrentThreadId ? GetCurrentThreadId() : 0;
    let attached = false;
    if (fgThread && curThread && fgThread !== curThread && AttachThreadInput) {
      attached = AttachThreadInput(curThread, fgThread, true);
    }
    try {
      if (BringWindowToTop) BringWindowToTop(hwnd);
      return SetForegroundWindow(hwnd);
    } finally {
      if (attached && AttachThreadInput) {
        AttachThreadInput(curThread, fgThread, false);
      }
    }
  } catch (e) {
    console.error('[Win32] activateWindowCleanly error:', e);
    return false;
  }
}

function restoreForegroundWindow(hwnd = lastForegroundHwnd) {
  return activateWindowCleanly(hwnd);
}

function focusOverlayWindow(hwnd) {
  return activateWindowCleanly(hwnd);
}

function waitForWindowFocused(hwnd = lastForegroundHwnd, maxWaitMs = 135) {
  return new Promise((resolve) => {
    if (!hwnd || !GetForegroundWindow) {
      setTimeout(resolve, 25);
      return;
    }
    if (GetForegroundWindow() === hwnd) {
      resolve(true);
      return;
    }

    const start = Date.now();
    const poll = () => {
      if (GetForegroundWindow() === hwnd) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= maxWaitMs) {
        resolve(false);
        return;
      }
      setTimeout(poll, 5);
    };
    setTimeout(poll, 5);
  });
}

/**
 * Marks current clipboard content as private (Windows Win+V & Cloud Clipboard exclusion)
 */
function setClipboardPrivate() {
  if (!OpenClipboard || !CloseClipboard) return;

  let opened = false;
  for (let i = 0; i < 4; i++) {
    if (OpenClipboard(0)) {
      opened = true;
      break;
    }
  }

  if (!opened) return;

  try {
    const cfExclude = RegisterClipboardFormatA('ExcludeClipboardContentFromMonitorProcessing');
    if (cfExclude) SetClipboardData(cfExclude, 0);

    const cfHistory = RegisterClipboardFormatA('CanIncludeInClipboardHistory');
    if (cfHistory) {
      const hMem = GlobalAlloc(0x0042, 4);
      if (hMem) {
        const ptr = GlobalLock(hMem);
        if (ptr) {
          koffi.encode(ptr, 'uint32_t', 0);
          GlobalUnlock(hMem);
        }
        const ok = SetClipboardData(cfHistory, hMem);
        if (!ok && GlobalFree) {
          GlobalFree(hMem);
        }
      }
    }

    const cfIgnore = RegisterClipboardFormatA('Clipboard Viewer Ignore');
    if (cfIgnore) SetClipboardData(cfIgnore, 0);
  } catch (err) {
    console.error('[Win32] setClipboardPrivate error:', err);
  } finally {
    CloseClipboard();
  }
}

function makeKeyInput(vk, isKeyUp = false) {
  const scan = MapVirtualKeyW ? (MapVirtualKeyW(vk, 0) & 0xffff) : 0;
  return {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: vk,
        wScan: scan,
        dwFlags: isKeyUp ? KEYEVENTF_KEYUP : 0,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };
}

function sendKeyboardInputs(inputs) {
  if (!inputs || inputs.length === 0) return false;
  if (SendInput && INPUT_STRUCT) {
    const sent = SendInput(inputs.length, inputs, koffi.sizeof(INPUT_STRUCT));
    if (sent > 0) return true;
  }
  if (keybd_event) {
    for (const ev of inputs) {
      keybd_event(ev.u.ki.wVk, 0, ev.u.ki.dwFlags, 0);
    }
    return true;
  }
  return false;
}

function waitForModifiersReleased(maxWaitMs = 220) {
  return new Promise((resolve) => {
    if (!GetAsyncKeyState) {
      resolve();
      return;
    }

    const start = Date.now();
    const check = () => {
      const altDown = (GetAsyncKeyState(VK_MENU) & 0x8000) !== 0;
      const shiftDown = (GetAsyncKeyState(VK_SHIFT) & 0x8000) !== 0;
      const winDown =
        (GetAsyncKeyState(VK_LWIN) & 0x8000) !== 0 ||
        (GetAsyncKeyState(VK_RWIN) & 0x8000) !== 0;

      if (!altDown && !shiftDown && !winDown) {
        resolve();
        return;
      }

      if (Date.now() - start >= maxWaitMs) {
        sendKeyboardInputs([
          makeKeyInput(VK_MENU, true),
          makeKeyInput(VK_LMENU, true),
          makeKeyInput(VK_RMENU, true),
          makeKeyInput(VK_SHIFT, true),
          makeKeyInput(VK_LSHIFT, true),
          makeKeyInput(VK_RSHIFT, true),
        ]);
        resolve();
        return;
      }

      setTimeout(check, 15);
    };

    check();
  });
}

function simulatePaste() {
  sendKeyboardInputs([
    makeKeyInput(VK_CONTROL, false),
    makeKeyInput(VK_V, false),
    makeKeyInput(VK_V, true),
    makeKeyInput(VK_CONTROL, true),
  ]);
}

function simulateBackspaces(count) {
  if (count <= 0) return;
  const inputs = [];
  for (let i = 0; i < count; i++) {
    inputs.push(makeKeyInput(VK_BACK, false));
    inputs.push(makeKeyInput(VK_BACK, true));
  }
  sendKeyboardInputs(inputs);
}

function simulateLeftArrows(count) {
  if (count <= 0) return;
  const inputs = [];
  for (let i = 0; i < count; i++) {
    inputs.push(makeKeyInput(VK_LEFT, false));
    inputs.push(makeKeyInput(VK_LEFT, true));
  }
  sendKeyboardInputs(inputs);
}

// ============================================================================
// Unified Low-Level Keyboard Hook (Double-Tap Ctrl + Global Hotstrings)
// ============================================================================
let keyboardHookHandle = 0;
let keyboardCallbackPtr = null;
let typedBuffer = '';
let lastTypedHwnd = 0;
let isExpandingHotstring = false;

// Double-Tap Ctrl state
let ctrlDownTime = 0;
let ctrlInvalidated = false;
let lastValidCtrlTapUpTime = 0;

const IGNORED_MODIFIER_VKS = new Set([
  VK_SHIFT, VK_LSHIFT, VK_RSHIFT,
  VK_CONTROL, VK_LCONTROL, VK_RCONTROL,
  VK_MENU, VK_LMENU, VK_RMENU,
  VK_CAPITAL,
]);

const BUFFER_RESET_VKS = new Set([
  VK_RETURN, VK_TAB, VK_ESCAPE,
  VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN,
  VK_HOME, VK_END, VK_PRIOR, VK_NEXT, VK_DELETE,
]);

function isCtrlKey(vk) {
  return vk === VK_CONTROL || vk === VK_LCONTROL || vk === VK_RCONTROL;
}

function isAnyMouseButtonDown() {
  if (!GetAsyncKeyState) return false;
  return (
    (GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0 ||
    (GetAsyncKeyState(VK_RBUTTON) & 0x8000) !== 0 ||
    (GetAsyncKeyState(VK_MBUTTON) & 0x8000) !== 0
  );
}

function resetHotstringBuffer() {
  typedBuffer = '';
}

/**
 * Starts the unified non-blocking WH_KEYBOARD_LL hook when either Double-Tap Ctrl or Hotstrings are active.
 * @param {{
 *   doubleTapCtrlEnabled: () => boolean,
 *   onDoubleTapCtrl: () => void,
 *   hotstringsEnabled: () => boolean,
 *   getTriggers: () => Array,
 *   onHotstringMatch: (match: object, fgHwnd: number) => void,
 *   getExcludeHwnds: () => number[],
 * }} options
 */
function startKeyboardHook(options) {
  stopKeyboardHook();

  const wantDoubleTap = options && typeof options.doubleTapCtrlEnabled === 'function' && options.doubleTapCtrlEnabled();
  const wantHotstrings = options && typeof options.hotstringsEnabled === 'function' && options.hotstringsEnabled();

  if (!wantDoubleTap && !wantHotstrings) {
    return false;
  }

  if (!SetWindowsHookExW || !CallNextHookEx || !KBDLLHOOKSTRUCT) {
    console.warn('[Win32] Keyboard hook APIs unavailable.');
    return false;
  }

  typedBuffer = '';
  lastTypedHwnd = 0;
  ctrlDownTime = 0;
  ctrlInvalidated = false;
  lastValidCtrlTapUpTime = 0;

  const keyState = new Uint8Array(256);
  const charBuf = new Uint16Array(8);

  keyboardCallbackPtr = koffi.register((nCode, wParam, lParam) => {
    try {
      if (nCode >= 0 && lParam && !isExpandingHotstring) {
        const info = koffi.decode(lParam, KBDLLHOOKSTRUCT);

        // Ignore synthetic/injected keystrokes
        if ((info.flags & (LLKHF_INJECTED | LLKHF_LOWER_IL_INJECTED)) === 0) {
          const vk = info.vkCode;
          const isKeyDown = wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN;
          const isKeyUp = wParam === WM_KEYUP || wParam === WM_SYSKEYUP;
          const now = Date.now();

          // ------------------------------------------------------------------
          // 1. Double-Tap Ctrl Detector (2x quick solo Ctrl taps within 380ms)
          // ------------------------------------------------------------------
          if (options.doubleTapCtrlEnabled && options.doubleTapCtrlEnabled()) {
            if (isKeyDown) {
              if (isCtrlKey(vk)) {
                if (ctrlDownTime === 0) {
                  const otherMod =
                    (GetAsyncKeyState(VK_SHIFT) & 0x8000) !== 0 ||
                    (GetAsyncKeyState(VK_MENU) & 0x8000) !== 0 ||
                    (GetAsyncKeyState(VK_LWIN) & 0x8000) !== 0 ||
                    (GetAsyncKeyState(VK_RWIN) & 0x8000) !== 0 ||
                    isAnyMouseButtonDown();
                  ctrlDownTime = now;
                  ctrlInvalidated = otherMod;
                } else if (now - ctrlDownTime > 320 || isAnyMouseButtonDown()) {
                  ctrlInvalidated = true;
                }
              } else {
                // Any non-Ctrl key cancels current Ctrl tap and resets double-tap chain
                ctrlInvalidated = true;
                lastValidCtrlTapUpTime = 0;
              }
            } else if (isKeyUp && isCtrlKey(vk)) {
              const duration = ctrlDownTime > 0 ? now - ctrlDownTime : 9999;
              const hadOtherModOrMouse =
                (GetAsyncKeyState(VK_SHIFT) & 0x8000) !== 0 ||
                (GetAsyncKeyState(VK_MENU) & 0x8000) !== 0 ||
                isAnyMouseButtonDown();

              ctrlDownTime = 0;

              if (!ctrlInvalidated && !hadOtherModOrMouse && duration <= 320) {
                if (lastValidCtrlTapUpTime > 0 && now - lastValidCtrlTapUpTime <= 380) {
                  lastValidCtrlTapUpTime = 0;
                  typedBuffer = '';
                  if (typeof options.onDoubleTapCtrl === 'function') {
                    setTimeout(() => {
                      try {
                        options.onDoubleTapCtrl();
                      } catch (e) {
                        console.error('[Win32] onDoubleTapCtrl error:', e);
                      }
                    }, 10);
                  }
                } else {
                  lastValidCtrlTapUpTime = now;
                }
              } else {
                lastValidCtrlTapUpTime = 0;
              }
              ctrlInvalidated = false;
            }
          }

          // ------------------------------------------------------------------
          // 2. Global Hotstring Detector (e.g. ;;mfg)
          // ------------------------------------------------------------------
          if (isKeyDown && options.hotstringsEnabled && options.hotstringsEnabled() && ToUnicodeEx) {
            if (!IGNORED_MODIFIER_VKS.has(vk)) {
              const fgHwnd = GetForegroundWindow ? GetForegroundWindow() : 0;
              const excluded = typeof options.getExcludeHwnds === 'function' ? options.getExcludeHwnds() : [];

              if (!fgHwnd || excluded.includes(fgHwnd)) {
                typedBuffer = '';
              } else {
                if (fgHwnd !== lastTypedHwnd) {
                  typedBuffer = '';
                  lastTypedHwnd = fgHwnd;
                }

                const isShift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) !== 0;
                const isCtrl = (GetAsyncKeyState(VK_CONTROL) & 0x8000) !== 0;
                const isAlt = (GetAsyncKeyState(VK_MENU) & 0x8000) !== 0;
                const isRightAlt = (GetAsyncKeyState(VK_RMENU) & 0x8000) !== 0;
                const isWin =
                  (GetAsyncKeyState(VK_LWIN) & 0x8000) !== 0 ||
                  (GetAsyncKeyState(VK_RWIN) & 0x8000) !== 0;

                const isAltGr = isCtrl && isRightAlt;
                const isCommandShortcut = (isCtrl && !isAltGr) || (isAlt && !isAltGr) || isWin;

                if (isCommandShortcut || BUFFER_RESET_VKS.has(vk)) {
                  typedBuffer = '';
                } else if (vk === VK_BACK) {
                  if (typedBuffer.length > 0) {
                    const chars = Array.from(typedBuffer);
                    chars.pop();
                    typedBuffer = chars.join('');
                  }
                } else {
                  const triggers = typeof options.getTriggers === 'function' ? options.getTriggers() : null;
                  if (triggers && triggers.length > 0) {
                    keyState.fill(0);
                    if (isShift) {
                      keyState[VK_SHIFT] = 0x80;
                      keyState[VK_LSHIFT] = 0x80;
                    }
                    if (GetKeyState && (GetKeyState(VK_CAPITAL) & 0x0001) !== 0) {
                      keyState[VK_CAPITAL] = 0x01;
                    }
                    if (isAltGr) {
                      keyState[VK_CONTROL] = 0x80;
                      keyState[VK_LCONTROL] = 0x80;
                      keyState[VK_MENU] = 0x80;
                      keyState[VK_RMENU] = 0x80;
                    }

                    const tid = GetWindowThreadProcessId ? GetWindowThreadProcessId(fgHwnd, null) : 0;
                    const hkl = GetKeyboardLayout ? GetKeyboardLayout(tid) : 0;

                    const len = ToUnicodeEx(vk, info.scanCode, keyState, charBuf, charBuf.length, 0x04, hkl);
                    if (len > 0) {
                      const ch = String.fromCharCode(...charBuf.subarray(0, len));
                      if (ch >= ' ') {
                        typedBuffer += ch;
                        if (typedBuffer.length > 48) {
                          typedBuffer = typedBuffer.slice(-48);
                        }

                        const bufLower = typedBuffer.toLowerCase();
                        for (let i = 0; i < triggers.length; i++) {
                          const t = triggers[i];
                          if (bufLower.endsWith(t.triggerLower)) {
                            typedBuffer = '';
                            isExpandingHotstring = true;
                            lastForegroundHwnd = fgHwnd;
                            setTimeout(() => {
                              try {
                                options.onHotstringMatch(t, fgHwnd);
                              } finally {
                                setTimeout(() => {
                                  isExpandingHotstring = false;
                                }, 80);
                              }
                            }, 18);
                            break;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[Win32] Keyboard hook callback error:', err);
    }

    return CallNextHookEx(0, nCode, wParam, lParam);
  }, koffi.pointer(LowLevelKeyboardProc));

  keyboardHookHandle = SetWindowsHookExW(WH_KEYBOARD_LL, keyboardCallbackPtr, 0, 0);
  if (!keyboardHookHandle) {
    console.warn('[Win32] Failed to install WH_KEYBOARD_LL hook.');
    try {
      koffi.unregister(keyboardCallbackPtr);
    } catch (e) {}
    keyboardCallbackPtr = null;
    return false;
  }

  console.log(`[Win32] Keyboard hook active (DoubleTapCtrl=${wantDoubleTap}, Hotstrings=${wantHotstrings}).`);
  return true;
}

function stopKeyboardHook() {
  if (keyboardHookHandle && UnhookWindowsHookEx) {
    try {
      UnhookWindowsHookEx(keyboardHookHandle);
    } catch (e) {}
    keyboardHookHandle = 0;
  }
  if (keyboardCallbackPtr) {
    try {
      koffi.unregister(keyboardCallbackPtr);
    } catch (e) {}
    keyboardCallbackPtr = null;
  }
  typedBuffer = '';
  ctrlDownTime = 0;
  ctrlInvalidated = false;
  lastValidCtrlTapUpTime = 0;
  isExpandingHotstring = false;
}

// ============================================================================
// Desktop Work Area & Window Docking
// ============================================================================
const SPI_GETWORKAREA = 0x0030;
const SPI_SETWORKAREA = 0x002F;
const SW_RESTORE = 9;
const SW_MAXIMIZE = 3;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;

let originalWorkArea = null;
let savedTargetWindowState = null;

function setDesktopWorkArea(leftOffset = 0, rightOffset = 0) {
  if (!SystemParametersInfoW) return;
  try {
    const current = {};
    if (!SystemParametersInfoW(SPI_GETWORKAREA, 0, current, 0)) return;
    if (!originalWorkArea) {
      originalWorkArea = { ...current };
    }
    const newWa = {
      left: originalWorkArea.left + leftOffset,
      top: originalWorkArea.top,
      right: originalWorkArea.right - rightOffset,
      bottom: originalWorkArea.bottom,
    };
    SystemParametersInfoW(SPI_SETWORKAREA, 0, newWa, 0);
  } catch (err) {
    console.error('[Win32] setDesktopWorkArea error:', err);
  }
}

function restoreDesktopWorkArea() {
  if (!SystemParametersInfoW || !originalWorkArea) return;
  try {
    SystemParametersInfoW(SPI_SETWORKAREA, 0, originalWorkArea, 0);
    originalWorkArea = null;
  } catch (err) {
    console.error('[Win32] restoreDesktopWorkArea error:', err);
  }
}

function alignWindowsToDock(mode, width, targetHwnd = lastForegroundHwnd, displayInfo = null) {
  if (mode === 'center') {
    restoreWindowsFromDock();
    return;
  }

  const isPrimary = !displayInfo || displayInfo.isPrimary !== false;

  if (isPrimary) {
    if (mode === 'sidebar_left') {
      setDesktopWorkArea(width, 0);
    } else if (mode === 'sidebar_right') {
      setDesktopWorkArea(0, width);
    }
  } else {
    restoreDesktopWorkArea();
  }

  if (!targetHwnd || !SetWindowPos || !GetWindowRect) return;

  try {
    const rect = {};
    if (!GetWindowRect(targetHwnd, rect)) return;

    const zoomed = IsZoomed ? IsZoomed(targetHwnd) : false;
    if (!savedTargetWindowState) {
      savedTargetWindowState = {
        hwnd: targetHwnd,
        rect: { ...rect },
        wasZoomed: zoomed,
      };
    }

    const baseWa = displayInfo && displayInfo.workArea
      ? {
          left: displayInfo.workArea.x,
          top: displayInfo.workArea.y,
          width: displayInfo.workArea.width,
          height: displayInfo.workArea.height,
        }
      : {
          left: originalWorkArea ? originalWorkArea.left : 0,
          top: originalWorkArea ? originalWorkArea.top : 0,
          width: originalWorkArea ? (originalWorkArea.right - originalWorkArea.left) : 1920,
          height: originalWorkArea ? (originalWorkArea.bottom - originalWorkArea.top) : 1032,
        };

    if (zoomed && ShowWindow) {
      ShowWindow(targetHwnd, SW_RESTORE);
    }

    if (mode === 'sidebar_left') {
      SetWindowPos(
        targetHwnd,
        0,
        baseWa.left + width,
        baseWa.top,
        baseWa.width - width,
        baseWa.height,
        SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED
      );
    } else if (mode === 'sidebar_right') {
      SetWindowPos(
        targetHwnd,
        0,
        baseWa.left,
        baseWa.top,
        baseWa.width - width,
        baseWa.height,
        SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED
      );
    }
  } catch (err) {
    console.error('[Win32] alignWindowsToDock error:', err);
  }
}

function restoreWindowsFromDock() {
  restoreDesktopWorkArea();

  if (savedTargetWindowState && savedTargetWindowState.hwnd) {
    try {
      const { hwnd, rect, wasZoomed } = savedTargetWindowState;
      if (wasZoomed && ShowWindow) {
        ShowWindow(hwnd, SW_MAXIMIZE);
      } else if (SetWindowPos) {
        SetWindowPos(
          hwnd,
          0,
          rect.left,
          rect.top,
          rect.right - rect.left,
          rect.bottom - rect.top,
          SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED
        );
      }
    } catch (err) {
      console.error('[Win32] restoreWindowsFromDock error:', err);
    }
    savedTargetWindowState = null;
  }
}

// ============================================================================
// 6. Full-Screen Overlay Geometry, Live Desktop Blur Capture & DWM Backdrop
// ============================================================================
const HWND_TOPMOST = -1;
const SWP_NOSENDCHANGING = 0x0400;
const WCA_ACCENT_POLICY = 19;
const ACCENT_DISABLED = 0;
const ACCENT_ENABLE_ACRYLICBLURBEHIND = 4;
const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWA_BORDER_COLOR = 34;
const DWMWCP_DEFAULT = 0;
const DWMWCP_DONOTROUND = 1;
const DWMWA_COLOR_NONE = 0xfffffffe;
const SRCCOPY = 0x00cc0020;
const STRETCH_HALFTONE = 4;

/**
 * Captures a fast (~2ms) hardware-downsampled 24-bit BMP snapshot of the target physical monitor
 * right before the overlay opens so CSS/GPU Gaussian blur renders strong, reliable frosted glass
 * across Windows 10 & Windows 11 (immune to Win11 24H2 DWM black-surface / Energy Saver quirks).
 * Returns null if the interactive desktop surface cannot be sampled.
 */
function captureDisplayBackdrop(physicalBounds) {
  if (
    !physicalBounds ||
    !GetDC ||
    !ReleaseDC ||
    !CreateCompatibleDC ||
    !CreateCompatibleBitmap ||
    !BitBlt ||
    !StretchBlt ||
    !GetDIBits
  ) {
    return null;
  }

  const srcX = Math.round(physicalBounds.x || 0);
  const srcY = Math.round(physicalBounds.y || 0);
  const srcW = Math.round(physicalBounds.width || 0);
  const srcH = Math.round(physicalBounds.height || 0);
  if (srcW < 32 || srcH < 32) return null;

  // 1/3 resolution width (max 640px) rounded to a multiple of 4 -> fast IPC decode, silky blur + 4-byte aligned 24-bit BGR stride
  const dstW = Math.max(320, Math.min(640, Math.round(srcW / 12) * 4));
  const dstH = Math.max(180, Math.min(420, Math.round((srcH * dstW) / srcW)));

  let hdcScreen = 0;
  let hdcFull = 0;
  let hbmFull = 0;
  let oldFull = 0;
  let hdcSmall = 0;
  let hbmSmall = 0;
  let oldSmall = 0;

  try {
    hdcScreen = GetDC(0);
    if (!hdcScreen) return null;

    hdcFull = CreateCompatibleDC(hdcScreen);
    hbmFull = CreateCompatibleBitmap(hdcScreen, srcW, srcH);
    if (!hdcFull || !hbmFull) return null;
    oldFull = SelectObject(hdcFull, hbmFull);

    if (!BitBlt(hdcFull, 0, 0, srcW, srcH, hdcScreen, srcX, srcY, SRCCOPY)) {
      return null;
    }

    hdcSmall = CreateCompatibleDC(hdcScreen);
    hbmSmall = CreateCompatibleBitmap(hdcScreen, dstW, dstH);
    if (!hdcSmall || !hbmSmall) return null;
    oldSmall = SelectObject(hdcSmall, hbmSmall);

    if (SetStretchBltMode) {
      SetStretchBltMode(hdcSmall, STRETCH_HALFTONE);
    }
    if (SetBrushOrgEx) {
      SetBrushOrgEx(hdcSmall, 0, 0, null);
    }
    if (!StretchBlt(hdcSmall, 0, 0, dstW, dstH, hdcFull, 0, 0, srcW, srcH, SRCCOPY)) {
      return null;
    }

    // Deselect bitmaps from memory DCs BEFORE calling GetDIBits (strict MSDN contract)
    SelectObject(hdcSmall, oldSmall);
    oldSmall = 0;
    SelectObject(hdcFull, oldFull);
    oldFull = 0;

    const pixelBytes = dstW * dstH * 3;
    const bmpBuf = Buffer.allocUnsafe(54 + pixelBytes);

    // 14-byte BITMAPFILEHEADER
    bmpBuf.write('BM', 0, 2, 'ascii');
    bmpBuf.writeUInt32LE(54 + pixelBytes, 2);
    bmpBuf.writeUInt32LE(0, 6);
    bmpBuf.writeUInt32LE(54, 10);

    // 40-byte BITMAPINFOHEADER (24-bit opaque BGR, top-down)
    bmpBuf.writeUInt32LE(40, 14);
    bmpBuf.writeInt32LE(dstW, 18);
    bmpBuf.writeInt32LE(-dstH, 22);
    bmpBuf.writeUInt16LE(1, 26);
    bmpBuf.writeUInt16LE(24, 28);
    bmpBuf.writeUInt32LE(0, 30);
    bmpBuf.writeUInt32LE(pixelBytes, 34);
    bmpBuf.writeInt32LE(2835, 38);
    bmpBuf.writeInt32LE(2835, 42);
    bmpBuf.writeUInt32LE(0, 46);
    bmpBuf.writeUInt32LE(0, 50);

    const bmiSlice = bmpBuf.subarray(14, 54);
    const pixelSlice = bmpBuf.subarray(54);
    const lines = GetDIBits(hdcSmall, hbmSmall, 0, dstH, pixelSlice, bmiSlice, 0);
    if (!lines) return null;

    // Ensure top-down negative height remains intact after GetDIBits
    bmpBuf.writeInt32LE(-dstH, 22);

    // Quick sample check to detect non-interactive / locked sessions returning all-zero black
    let nonZeroFound = false;
    const step = Math.max(3, Math.floor(pixelBytes / 128));
    for (let i = 0; i < pixelBytes; i += step) {
      if (pixelSlice[i] !== 0) {
        nonZeroFound = true;
        break;
      }
    }
    if (!nonZeroFound) return null;

    return 'data:image/bmp;base64,' + bmpBuf.toString('base64');
  } catch (err) {
    console.error('[Win32] captureDisplayBackdrop error:', err);
    return null;
  } finally {
    if (hdcSmall && oldSmall) SelectObject(hdcSmall, oldSmall);
    if (hbmSmall) DeleteObject(hbmSmall);
    if (hdcSmall) DeleteDC(hdcSmall);
    if (hdcFull && oldFull) SelectObject(hdcFull, oldFull);
    if (hbmFull) DeleteObject(hbmFull);
    if (hdcFull) DeleteDC(hdcFull);
    if (hdcScreen) ReleaseDC(0, hdcScreen);
  }
}

const DWMWA_TRANSITIONS_FORCEDISABLED = 3;
const GWLP_WNDPROC = -4;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_POPUP = 0x80000000;
const STRIP_FRAME_STYLES = 0x00cf0000; // WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU | WS_BORDER | WS_DLGFRAME
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const WM_QUERYENDSESSION = 0x0011;
const WM_ERASEBKGND = 0x0014;
const WM_ENDSESSION = 0x0016;
const WM_MOUSEACTIVATE = 0x0021;
const WM_STYLECHANGING = 0x007c;
const WM_NCDESTROY = 0x0082;
const WM_NCCALCSIZE = 0x0083;
const WM_NCPAINT = 0x0085;
const WM_NCACTIVATE = 0x0086;
const WM_NCLBUTTONDBLCLK = 0x00a3;
const MA_NOACTIVATE = 3;

const framelessWindowGuards = new Map();

function sanitizePopupStyle(rawStyle) {
  return ((rawStyle & ~STRIP_FRAME_STYLES) | WS_POPUP) | 0;
}

/**
 * Disables DWM animations, rounded corner bounding box, and window border on frameless transparent overlay/handle windows.
 */
function suppressOverlayWindowFrame(hwnd) {
  if (!hwnd || !DwmSetWindowAttribute) return false;
  try {
    const transBuf = Buffer.alloc(4);
    transBuf.writeInt32LE(1, 0);
    DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, transBuf, 4);

    const cornerBuf = Buffer.alloc(4);
    cornerBuf.writeInt32LE(DWMWCP_DONOTROUND, 0);
    DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, cornerBuf, 4);

    const borderBuf = Buffer.alloc(4);
    borderBuf.writeUInt32LE(DWMWA_COLOR_NONE, 0);
    DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, borderBuf, 4);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Installs a native Win32 WS_POPUP + WndProc guard on a frameless transparent BrowserWindow so Windows
 * can never paint a white GDI non-client title bar / erase brush on click, focus, blur, or show transitions.
 */
function installFramelessWindowGuard(hwnd, options = {}) {
  if (!hwnd || !SetWindowLongPtrW || !GetWindowLongPtrW || !CallWindowProcW || !WndProcProto) {
    return false;
  }
  if (framelessWindowGuards.has(hwnd)) {
    return true;
  }

  const { noActivate = false, onSessionEnd = null } = options;

  try {
    const curStyle = Number(BigInt(GetWindowLongPtrW(hwnd, GWL_STYLE)) & 0xffffffffn);
    SetWindowLongPtrW(hwnd, GWL_STYLE, sanitizePopupStyle(curStyle));

    if (noActivate) {
      const curEx = Number(BigInt(GetWindowLongPtrW(hwnd, GWL_EXSTYLE)) & 0xffffffffn);
      SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (curEx | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) | 0);
    }

    suppressOverlayWindowFrame(hwnd);

    const origProc = GetWindowLongPtrW(hwnd, GWLP_WNDPROC);
    const cb = koffi.register((h, msg, wp, lp) => {
      try {
        if (msg === WM_NCACTIVATE) {
          return 1;
        }
        if (msg === WM_NCPAINT) {
          return 0;
        }
        if (msg === WM_ERASEBKGND) {
          return 1;
        }
        if (msg === WM_NCCALCSIZE) {
          return 0;
        }
        if (msg === WM_NCLBUTTONDBLCLK) {
          return 0;
        }
        if (noActivate && msg === WM_MOUSEACTIVATE) {
          return MA_NOACTIVATE;
        }
        if (msg === WM_STYLECHANGING && lp && STYLESTRUCT) {
          const idx = Number(BigInt.asIntN(32, BigInt(wp)));
          if (idx === GWL_STYLE) {
            const s = koffi.decode(lp, STYLESTRUCT);
            const cleaned = sanitizePopupStyle(s.styleNew) >>> 0;
            if (cleaned !== s.styleNew) {
              koffi.encode(lp, STYLESTRUCT, { styleOld: s.styleOld, styleNew: cleaned });
            }
          } else if (noActivate && idx === GWL_EXSTYLE) {
            const s = koffi.decode(lp, STYLESTRUCT);
            const cleaned = (s.styleNew | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) >>> 0;
            if (cleaned !== s.styleNew) {
              koffi.encode(lp, STYLESTRUCT, { styleOld: s.styleOld, styleNew: cleaned });
            }
          }
          return 0;
        }
        if (msg === WM_NCDESTROY) {
          framelessWindowGuards.delete(h);
          try {
            SetWindowLongPtrW(h, GWLP_WNDPROC, origProc);
          } catch (e) {}
          return CallWindowProcW(origProc, h, msg, wp, lp);
        }
        if ((msg === WM_QUERYENDSESSION || msg === WM_ENDSESSION) && typeof onSessionEnd === 'function') {
          onSessionEnd();
        }
      } catch (err) {
        console.error('[Win32] WndProc guard error:', err);
      }
      return CallWindowProcW(origProc, h, msg, wp, lp);
    }, koffi.pointer(WndProcProto));

    framelessWindowGuards.set(hwnd, { origProc, cb });
    SetWindowLongPtrW(hwnd, GWLP_WNDPROC, koffi.address(cb));

    if (SetWindowPos) {
      SetWindowPos(
        hwnd,
        0,
        0,
        0,
        0,
        0,
        SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_NOSENDCHANGING
      );
    }
    return true;
  } catch (err) {
    console.error('[Win32] installFramelessWindowGuard error:', err);
    return false;
  }
}

function removeFramelessWindowGuard(hwnd) {
  if (!hwnd) return;
  const entry = framelessWindowGuards.get(hwnd);
  if (!entry) return;
  framelessWindowGuards.delete(hwnd);
  try {
    if (SetWindowLongPtrW && entry.origProc && (!IsWindow || IsWindow(hwnd))) {
      SetWindowLongPtrW(hwnd, GWLP_WNDPROC, entry.origProc);
    }
  } catch (e) {}
  // Intentionally keep the 2 lightweight koffi callbacks pinned until process exit so no in-flight Win32 message unwind can fault.
}

function removeAllFramelessWindowGuards() {
  for (const hwnd of Array.from(framelessWindowGuards.keys())) {
    removeFramelessWindowGuard(hwnd);
  }
}

/**
 * Stretches the overlay HWND across the physical monitor minus 1 physical pixel in height so:
 * 1) Windows DWM never classifies the `transparent: true` popup as an exclusive fullscreen window (which strips alpha to black), and
 * 2) It never extends off-screen (avoiding the Windows 11 24H2 off-screen black surface bug).
 */
function applyFullscreenOverlayBounds(hwnd, physicalBounds) {
  if (!hwnd || !SetWindowPos || !physicalBounds) return false;
  try {
    suppressOverlayWindowFrame(hwnd);

    return SetWindowPos(
      hwnd,
      HWND_TOPMOST,
      Math.round(physicalBounds.x),
      Math.round(physicalBounds.y),
      Math.max(1, Math.round(physicalBounds.width)),
      Math.max(1, Math.round(physicalBounds.height) - 1),
      SWP_NOACTIVATE | SWP_NOSENDCHANGING
    );
  } catch (err) {
    console.error('[Win32] applyFullscreenOverlayBounds error:', err);
    return false;
  }
}

/**
 * Ensures any legacy Windows DWM accent policy and outer DWM border are disabled on our `transparent: true` overlay HWND
 * so Chromium DirectComposition retains clean per-pixel alpha across Windows 10 & Windows 11 24H2.
 */
function setWindowBackdropEffect(hwnd) {
  if (!hwnd) return false;

  try {
    suppressOverlayWindowFrame(hwnd);

    if (!SetWindowCompositionAttribute) return true;
    const policyBuf = Buffer.alloc(16);
    policyBuf.writeInt32LE(ACCENT_DISABLED, 0);
    policyBuf.writeInt32LE(0, 4);
    policyBuf.writeUInt32LE(0, 8);
    policyBuf.writeInt32LE(0, 12);

    return SetWindowCompositionAttribute(hwnd, {
      Attrib: WCA_ACCENT_POLICY,
      pvData: policyBuf,
      cbData: 16,
    });
  } catch (err) {
    console.error('[Win32] setWindowBackdropEffect error:', err);
    return false;
  }
}

// ============================================================================
// 7. Native Windows Autostart Registry Engine (Run + StartupApproved\Run)
// ============================================================================
const HKEY_CURRENT_USER = -0x7fffffff; // (LONG)0x80000001 sign-extended to intptr_t
const KEY_READ = 0x20019;
const KEY_WRITE = 0x20006;
const REG_SZ = 1;
const REG_EXPAND_SZ = 2;
const REG_BINARY = 3;

const RUN_SUBKEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const STARTUP_APPROVED_SUBKEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const AUTOSTART_VALUE_NAME = 'SnapPhrase';
const LEGACY_AUTOSTART_VALUE_NAMES = [
  'SatzTresor',
  'electron.app.SatzTresor',
  'electron.app.SnapPhrase',
];

function buildAutostartCommand({ isPackaged = true, execPath = '', portableExecPath = '', appDir = '' } = {}) {
  if (isPackaged) {
    const targetExe = String(portableExecPath || execPath || '').trim();
    return targetExe ? `"${targetExe}" --hidden` : '';
  }
  const cleanExe = String(execPath || '').trim();
  const cleanDir = String(appDir || '').trim();
  if (!cleanExe || !cleanDir) return '';
  return `"${cleanExe}" "${cleanDir}" --hidden`;
}

function readRegistryStringValue(subKey, valueName) {
  if (!RegOpenKeyExW || !RegQueryValueExW || !RegCloseKey) return null;
  const phk = [0];
  const rcOpen = RegOpenKeyExW(HKEY_CURRENT_USER, subKey, 0, KEY_READ, phk);
  if (rcOpen !== 0 || !phk[0]) return null;
  try {
    const typeOut = [0];
    const buf = Buffer.alloc(2048);
    const lenInOut = [buf.length];
    const rcQ = RegQueryValueExW(phk[0], valueName, null, typeOut, buf, lenInOut);
    if (rcQ !== 0) return null;
    if (typeOut[0] !== REG_SZ && typeOut[0] !== REG_EXPAND_SZ) return null;
    const byteLen = Math.max(0, Math.min(buf.length, lenInOut[0]));
    return buf.subarray(0, byteLen).toString('utf16le').replace(/\0+$/, '').trim();
  } finally {
    RegCloseKey(phk[0]);
  }
}

function isStartupApprovedDisabled(valueName) {
  if (!RegOpenKeyExW || !RegQueryValueExW || !RegCloseKey) return false;
  const phk = [0];
  const rcOpen = RegOpenKeyExW(HKEY_CURRENT_USER, STARTUP_APPROVED_SUBKEY, 0, KEY_READ, phk);
  if (rcOpen !== 0 || !phk[0]) return false;
  try {
    const typeOut = [0];
    const buf = Buffer.alloc(64);
    const lenInOut = [buf.length];
    const rcQ = RegQueryValueExW(phk[0], valueName, null, typeOut, buf, lenInOut);
    if (rcQ !== 0 || lenInOut[0] < 1) return false;
    // In Windows StartupApproved\Run, odd status byte (0x01, 0x03, 0x05) means disabled in Task Manager / Settings
    return (buf[0] & 1) !== 0;
  } finally {
    RegCloseKey(phk[0]);
  }
}

function getWindowsAutostart(options = {}) {
  try {
    const primaryVal = readRegistryStringValue(RUN_SUBKEY, AUTOSTART_VALUE_NAME);
    if (primaryVal) {
      if (isStartupApprovedDisabled(AUTOSTART_VALUE_NAME)) return false;
      if (!options.isPackaged && options.appDir) {
        return primaryVal.toLowerCase().includes(String(options.appDir).toLowerCase());
      }
      return true;
    }

    for (const legacyName of LEGACY_AUTOSTART_VALUE_NAMES) {
      const legacyVal = readRegistryStringValue(RUN_SUBKEY, legacyName);
      if (legacyVal) {
        if (isStartupApprovedDisabled(legacyName)) return false;
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('[Win32] getWindowsAutostart error:', err);
    return false;
  }
}

function setWindowsAutostart(enabled, options = {}) {
  if (!RegCreateKeyExW || !RegOpenKeyExW || !RegSetValueExW || !RegDeleteValueW || !RegCloseKey) {
    return { success: false, enabled: false };
  }

  try {
    if (enabled) {
      const cmd = buildAutostartCommand(options);
      if (!cmd) return { success: false, enabled: false };

      const phkRun = [0];
      const disp = [0];
      const rcOpen = RegCreateKeyExW(
        HKEY_CURRENT_USER,
        RUN_SUBKEY,
        0,
        null,
        0,
        KEY_READ | KEY_WRITE,
        null,
        phkRun,
        disp
      );
      if (rcOpen !== 0 || !phkRun[0]) {
        return { success: false, enabled: false };
      }

      let rcSet = -1;
      try {
        const utf16 = Buffer.from(cmd + '\0', 'utf16le');
        rcSet = RegSetValueExW(phkRun[0], AUTOSTART_VALUE_NAME, 0, REG_SZ, utf16, utf16.length);
        // Clean up any legacy entries so there are never duplicate/broken Run items
        for (const legacyName of LEGACY_AUTOSTART_VALUE_NAMES) {
          RegDeleteValueW(phkRun[0], legacyName);
        }
      } finally {
        RegCloseKey(phkRun[0]);
      }

      // Ensure Windows Task Manager StartupApproved\Run marks SnapPhrase as approved/enabled
      const phkApp = [0];
      const rcApp = RegOpenKeyExW(HKEY_CURRENT_USER, STARTUP_APPROVED_SUBKEY, 0, KEY_READ | KEY_WRITE, phkApp);
      if (rcApp === 0 && phkApp[0]) {
        try {
          for (const legacyName of LEGACY_AUTOSTART_VALUE_NAMES) {
            RegDeleteValueW(phkApp[0], legacyName);
          }
          const approvedBytes = Buffer.alloc(12, 0);
          approvedBytes[0] = 0x02;
          RegSetValueExW(phkApp[0], AUTOSTART_VALUE_NAME, 0, REG_BINARY, approvedBytes, approvedBytes.length);
        } finally {
          RegCloseKey(phkApp[0]);
        }
      }

      return { success: rcSet === 0, enabled: getWindowsAutostart(options) };
    }

    // Disable autostart: delete canonical and all legacy values cleanly
    const phkRun = [0];
    if (RegOpenKeyExW(HKEY_CURRENT_USER, RUN_SUBKEY, 0, KEY_WRITE, phkRun) === 0 && phkRun[0]) {
      try {
        RegDeleteValueW(phkRun[0], AUTOSTART_VALUE_NAME);
        for (const legacyName of LEGACY_AUTOSTART_VALUE_NAMES) {
          RegDeleteValueW(phkRun[0], legacyName);
        }
      } finally {
        RegCloseKey(phkRun[0]);
      }
    }

    const phkApp = [0];
    if (RegOpenKeyExW(HKEY_CURRENT_USER, STARTUP_APPROVED_SUBKEY, 0, KEY_WRITE, phkApp) === 0 && phkApp[0]) {
      try {
        RegDeleteValueW(phkApp[0], AUTOSTART_VALUE_NAME);
        for (const legacyName of LEGACY_AUTOSTART_VALUE_NAMES) {
          RegDeleteValueW(phkApp[0], legacyName);
        }
      } finally {
        RegCloseKey(phkApp[0]);
      }
    }

    return { success: true, enabled: false };
  } catch (err) {
    console.error('[Win32] setWindowsAutostart error:', err);
    return { success: false, enabled: getWindowsAutostart(options) };
  }
}

/**
 * Self-heals existing autostart entries on packaged launch (e.g. migrates legacy `SatzTresor`
 * to `SnapPhrase` `"<exe>" --hidden`, or updates path if the user moved the Portable EXE or reinstalled).
 */
function syncWindowsAutostartOnLaunch(options = {}) {
  if (!options.isPackaged) return;
  try {
    const hasPrimary = Boolean(readRegistryStringValue(RUN_SUBKEY, AUTOSTART_VALUE_NAME));
    const activeLegacyName = LEGACY_AUTOSTART_VALUE_NAMES.find((name) =>
      Boolean(readRegistryStringValue(RUN_SUBKEY, name))
    );
    const hasLegacy = Boolean(activeLegacyName);
    if (!hasPrimary && !hasLegacy) return;

    // Respect user's explicit disable in Windows Task Manager
    if (hasPrimary && isStartupApprovedDisabled(AUTOSTART_VALUE_NAME)) return;
    if (!hasPrimary && activeLegacyName && isStartupApprovedDisabled(activeLegacyName)) return;

    const desiredCmd = buildAutostartCommand(options);
    const currentPrimary = readRegistryStringValue(RUN_SUBKEY, AUTOSTART_VALUE_NAME);
    if (desiredCmd && (currentPrimary !== desiredCmd || hasLegacy)) {
      setWindowsAutostart(true, options);
    }
  } catch (err) {
    console.error('[Win32] syncWindowsAutostartOnLaunch error:', err);
  }
}

module.exports = {
  captureForegroundWindow,
  setLastForegroundWindow,
  getLastForegroundWindow,
  getWindowCenterPhysical,
  restoreForegroundWindow,
  focusOverlayWindow,
  waitForWindowFocused,
  setClipboardPrivate,
  waitForModifiersReleased,
  simulatePaste,
  simulateBackspaces,
  simulateLeftArrows,
  startKeyboardHook,
  stopKeyboardHook,
  resetHotstringBuffer,
  setDesktopWorkArea,
  restoreDesktopWorkArea,
  alignWindowsToDock,
  restoreWindowsFromDock,
  captureDisplayBackdrop,
  suppressOverlayWindowFrame,
  installFramelessWindowGuard,
  removeFramelessWindowGuard,
  removeAllFramelessWindowGuards,
  applyFullscreenOverlayBounds,
  setWindowBackdropEffect,
  getWindowsAutostart,
  setWindowsAutostart,
  syncWindowsAutostartOnLaunch,
};
