/**
 * SatzTresor v1.3.0 — Win32 Native Integration (Koffi FFI)
 * Handles window focus, clipboard protection (Win+V history exclusion),
 * atomic SendInput keyboard simulation, unified Low-Level Keyboard Hook (WH_KEYBOARD_LL)
 * for Double-Tap Ctrl trigger + automatic Hotstring expansion,
 * and multi-monitor aware desktop work area / window docking.
 */

const koffi = require('koffi');

let user32, kernel32;
let GetForegroundWindow, SetForegroundWindow, ShowWindow;
let OpenClipboard, CloseClipboard, RegisterClipboardFormatA, SetClipboardData;
let GlobalAlloc, GlobalLock, GlobalUnlock, GlobalFree;
let keybd_event, SendInput, GetAsyncKeyState, GetKeyState;
let GetWindowThreadProcessId, GetKeyboardLayout, ToUnicodeEx;
let SetWindowsHookExW, UnhookWindowsHookEx, CallNextHookEx;
let LowLevelKeyboardProc, KBDLLHOOKSTRUCT, INPUT_STRUCT, RECT_STRUCT;
let SystemParametersInfoW, GetWindowRect, SetWindowPos, IsZoomed;

try {
  user32 = koffi.load('user32.dll');
  kernel32 = koffi.load('kernel32.dll');

  GetForegroundWindow = user32.func('GetForegroundWindow', 'intptr_t', []);
  SetForegroundWindow = user32.func('SetForegroundWindow', 'bool', ['intptr_t']);
  ShowWindow = user32.func('ShowWindow', 'bool', ['intptr_t', 'int']);

  OpenClipboard = user32.func('OpenClipboard', 'bool', ['intptr_t']);
  CloseClipboard = user32.func('CloseClipboard', 'bool', []);
  RegisterClipboardFormatA = user32.func('RegisterClipboardFormatA', 'uint32_t', ['string']);
  SetClipboardData = user32.func('SetClipboardData', 'intptr_t', ['uint32_t', 'intptr_t']);

  GlobalAlloc = kernel32.func('GlobalAlloc', 'intptr_t', ['uint32_t', 'size_t']);
  GlobalLock = kernel32.func('GlobalLock', 'void *', ['intptr_t']);
  GlobalUnlock = kernel32.func('GlobalUnlock', 'bool', ['intptr_t']);
  GlobalFree = kernel32.func('GlobalFree', 'intptr_t', ['intptr_t']);

  keybd_event = user32.func('keybd_event', 'void', ['uint8_t', 'uint8_t', 'uint32_t', 'uintptr_t']);
  GetAsyncKeyState = user32.func('GetAsyncKeyState', 'int16_t', ['int']);
  GetKeyState = user32.func('GetKeyState', 'int16_t', ['int']);

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

  SystemParametersInfoW = user32.func('bool __stdcall SystemParametersInfoW(uint32 uiAction, uint32 uiParam, _Inout_ RECT *pvParam, uint32 fWinIni)');
  GetWindowRect = user32.func('GetWindowRect', 'bool', ['intptr_t', '_Out_ RECT *']);
  SetWindowPos = user32.func('SetWindowPos', 'bool', ['intptr_t', 'intptr_t', 'int', 'int', 'int', 'int', 'uint']);
  IsZoomed = user32.func('IsZoomed', 'bool', ['intptr_t']);
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

function restoreForegroundWindow(hwnd = lastForegroundHwnd) {
  if (!hwnd || !SetForegroundWindow) return false;
  try {
    if (keybd_event) {
      keybd_event(VK_MENU, 0, 0, 0);
      keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
    }
    return SetForegroundWindow(hwnd);
  } catch (e) {
    console.error('[Win32] restoreForegroundWindow error:', e);
    return false;
  }
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
  return {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: vk,
        wScan: 0,
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

module.exports = {
  captureForegroundWindow,
  setLastForegroundWindow,
  getLastForegroundWindow,
  restoreForegroundWindow,
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
};
