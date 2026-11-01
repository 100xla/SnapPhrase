/**
 * SatzTresor v1.3.0 — Renderer Application Logic
 * Raycast-style UI with token search, smart template prompts, hotstring configuration,
 * non-blocking confirmation modals, custom context menu, favorites, and encryption management.
 */

(function () {
  const state = {
    version: '1.3.0',
    layoutMode: 'sidebar_left',
    sidebarWidth: 440,
    isPinned: false,
    isEncrypted: false,
    isLocked: false,
    theme: 'dark',
    autostart: false,
    doubleTapCtrlEnabled: true,
    edgeTabEnabled: true,
    hotstringsEnabled: true,
    hotstringPrefix: ';;',
    restoreClipboard: true,
    activeHotkeys: ['Control+Space'],
    isRecordingHotkey: false,
    snippets: [],
    categories: ['[ Alle ]', '[ ⭐ Favoriten ]', '[ 🕒 Zuletzt ]'],
    activeCategory: '[ Alle ]',
    selectedIndex: 0,
    filteredSnippets: [],
    contextMenuSnippet: null,
    currentPromptSnippet: null,
    cryptoMode: 'encrypt', // 'encrypt' | 'change' | 'remove'
  };

  // DOM Elements
  const searchInput = document.getElementById('searchInput');
  const snippetList = document.getElementById('snippetList');
  const categoriesBar = document.getElementById('categoriesBar');
  const matchCountBadge = document.getElementById('matchCountBadge');
  const toastMsg = document.getElementById('toastMsg');
  const versionTag = document.getElementById('versionTag');
  const hotstringStatusPill = document.getElementById('hotstringStatusPill');

  // Top buttons
  const btnLockNow = document.getElementById('btnLockNow');
  const btnPinWindow = document.getElementById('btnPinWindow');
  const btnToggleWidth = document.getElementById('btnToggleWidth');
  const btnNewSnippetQuick = document.getElementById('btnNewSnippetQuick');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCollapseWindow = document.getElementById('btnCollapseWindow');
  const layoutButtons = document.querySelectorAll('.btn-layout');

  // Variable Prompt Modal
  const promptModal = document.getElementById('promptModal');
  const promptTitle = document.getElementById('promptTitle');
  const promptFieldsContainer = document.getElementById('promptFieldsContainer');
  const btnCancelPrompt = document.getElementById('btnCancelPrompt');
  const btnConfirmPrompt = document.getElementById('btnConfirmPrompt');

  // Snippet Manager Modal
  const managerModal = document.getElementById('managerModal');
  const managerTitle = document.getElementById('managerTitle');
  const editOriginalTitle = document.getElementById('editOriginalTitle');
  const editTitle = document.getElementById('editTitle');
  const editKuerzel = document.getElementById('editKuerzel');
  const editCategory = document.getElementById('editCategory');
  const editContent = document.getElementById('editContent');
  const editFavorite = document.getElementById('editFavorite');
  const categoriesDatalist = document.getElementById('categoriesDatalist');
  const btnDuplicateFromManager = document.getElementById('btnDuplicateFromManager');
  const btnDeleteSnippet = document.getElementById('btnDeleteSnippet');
  const btnCancelManager = document.getElementById('btnCancelManager');
  const btnSaveSnippet = document.getElementById('btnSaveSnippet');

  // Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  const settingAutostart = document.getElementById('settingAutostart');
  const settingTheme = document.getElementById('settingTheme');
  const settingRestoreClipboard = document.getElementById('settingRestoreClipboard');
  const settingHotstringsEnabled = document.getElementById('settingHotstringsEnabled');
  const settingHotstringPrefix = document.getElementById('settingHotstringPrefix');
  const hotstringPrefixRow = document.getElementById('hotstringPrefixRow');
  const hotstringDescPreview = document.getElementById('hotstringDescPreview');
  const settingDoubleTapCtrl = document.getElementById('settingDoubleTapCtrl');
  const settingEdgeTab = document.getElementById('settingEdgeTab');
  const activeHotkeysList = document.getElementById('activeHotkeysList');
  const btnRecordHotkey = document.getElementById('btnRecordHotkey');
  const btnImportData = document.getElementById('btnImportData');
  const btnExportIni = document.getElementById('btnExportIni');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnOpenCryptoFromSettings = document.getElementById('btnOpenCryptoFromSettings');
  const btnLockFromSettings = document.getElementById('btnLockFromSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');

  // Unlock Modal
  const unlockModal = document.getElementById('unlockModal');
  const unlockPassword = document.getElementById('unlockPassword');
  const unlockError = document.getElementById('unlockError');
  const btnExitUnlock = document.getElementById('btnExitUnlock');
  const btnSubmitUnlock = document.getElementById('btnSubmitUnlock');

  // Crypto Modal
  const cryptoModal = document.getElementById('cryptoModal');
  const cryptoModalTitle = document.getElementById('cryptoModalTitle');
  const cryptoModeTabs = document.getElementById('cryptoModeTabs');
  const tabChangePw = document.getElementById('tabChangePw');
  const tabRemoveCrypto = document.getElementById('tabRemoveCrypto');
  const cryptoStatusDesc = document.getElementById('cryptoStatusDesc');
  const encryptFields = document.getElementById('encryptFields');
  const changePwFields = document.getElementById('changePwFields');
  const decryptFields = document.getElementById('decryptFields');
  const cryptoNewPw = document.getElementById('cryptoNewPw');
  const cryptoConfirmPw = document.getElementById('cryptoConfirmPw');
  const cryptoOldPw = document.getElementById('cryptoOldPw');
  const cryptoChangeNewPw = document.getElementById('cryptoChangeNewPw');
  const cryptoChangeConfirmPw = document.getElementById('cryptoChangeConfirmPw');
  const cryptoCurrentPw = document.getElementById('cryptoCurrentPw');
  const cryptoError = document.getElementById('cryptoError');
  const btnCancelCrypto = document.getElementById('btnCancelCrypto');
  const btnApplyCrypto = document.getElementById('btnApplyCrypto');

  // In-App Confirm / Alert Modal
  const confirmModal = document.getElementById('confirmModal');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmMessage = document.getElementById('confirmMessage');
  const btnConfirmCancel = document.getElementById('btnConfirmCancel');
  const btnConfirmOk = document.getElementById('btnConfirmOk');
  let confirmResolver = null;

  // Custom Context Menu
  const contextMenu = document.getElementById('contextMenu');
  const ctxCopy = document.getElementById('ctxCopy');
  const ctxFavorite = document.getElementById('ctxFavorite');
  const ctxDuplicate = document.getElementById('ctxDuplicate');
  const ctxEdit = document.getElementById('ctxEdit');
  const ctxDelete = document.getElementById('ctxDelete');

  // IPC Helper
  const ipcBridge = window.satztresorApi || window.quicktabApi;
  function sendIPC(action, payload = {}) {
    const msg = { action, ...payload };
    if (ipcBridge) {
      ipcBridge.send(msg);
    } else if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage(msg);
    }
  }

  if (ipcBridge) {
    ipcBridge.onMessage(handleIncomingMessage);
  } else if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', (event) => {
      handleIncomingMessage(event.data);
    });
  }

  function computeEffectiveHotstring(rawKuerzel, prefix) {
    const k = String(rawKuerzel || '').trim();
    if (!k) return '';
    if (prefix && k.startsWith(prefix)) return k;
    if (/^([;/:!#$~]{1,2})/.test(k)) return k;
    return (prefix || '') + k;
  }

  function showConfirmDialog({
    title = 'Bestätigen',
    message = '',
    confirmText = 'OK',
    cancelText = 'Abbrechen',
    showCancel = true,
    danger = false,
  }) {
    return new Promise((resolve) => {
      confirmResolver = resolve;
      confirmTitle.textContent = title;
      confirmMessage.textContent = message;
      btnConfirmOk.textContent = confirmText;
      btnConfirmOk.className = danger ? 'btn btn-danger' : 'btn btn-primary';
      btnConfirmCancel.textContent = cancelText;
      btnConfirmCancel.style.display = showCancel ? 'inline-flex' : 'none';
      confirmModal.classList.add('active');
      setTimeout(() => btnConfirmOk.focus(), 30);
    });
  }

  function resolveConfirmModal(result) {
    confirmModal.classList.remove('active');
    if (confirmResolver) {
      const fn = confirmResolver;
      confirmResolver = null;
      fn(result);
    }
  }

  btnConfirmOk.addEventListener('click', () => resolveConfirmModal(true));
  btnConfirmCancel.addEventListener('click', () => resolveConfirmModal(false));

  function handleIncomingMessage(data) {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {}
    }
    if (!data || !data.type) return;

    switch (data.type) {
      case 'init':
      case 'updateData':
        if (data.version) {
          state.version = data.version;
          versionTag.textContent = 'v' + data.version;
        }
        if (data.layoutMode) {
          state.layoutMode = data.layoutMode;
          updateLayoutUI();
        }
        if (typeof data.isPinned !== 'undefined') {
          state.isPinned = !!data.isPinned;
          updatePinUI();
        }
        if (typeof data.sidebarWidth !== 'undefined') {
          state.sidebarWidth = data.sidebarWidth;
          updatePinUI();
        }
        if (typeof data.isEncrypted !== 'undefined') {
          state.isEncrypted = !!data.isEncrypted;
        }
        if (typeof data.isLocked !== 'undefined') {
          state.isLocked = !!data.isLocked;
          if (state.isLocked) {
            openUnlockModal();
          }
        }
        if (typeof data.theme !== 'undefined') {
          state.theme = data.theme;
          applyTheme(state.theme);
        }
        if (typeof data.autostart !== 'undefined') {
          state.autostart = !!data.autostart;
          if (settingAutostart) settingAutostart.checked = state.autostart;
        }
        if (typeof data.restoreClipboard !== 'undefined') {
          state.restoreClipboard = !!data.restoreClipboard;
          if (settingRestoreClipboard) settingRestoreClipboard.checked = state.restoreClipboard;
        }
        if (typeof data.hotstringsEnabled !== 'undefined') {
          state.hotstringsEnabled = !!data.hotstringsEnabled;
        }
        if (typeof data.hotstringPrefix === 'string') {
          state.hotstringPrefix = data.hotstringPrefix;
        }
        if (typeof data.doubleTapCtrlEnabled !== 'undefined') {
          state.doubleTapCtrlEnabled = !!data.doubleTapCtrlEnabled;
          if (settingDoubleTapCtrl) settingDoubleTapCtrl.checked = state.doubleTapCtrlEnabled;
        }
        if (typeof data.edgeTabEnabled !== 'undefined') {
          state.edgeTabEnabled = !!data.edgeTabEnabled;
          if (settingEdgeTab) settingEdgeTab.checked = state.edgeTabEnabled;
        }
        if (Array.isArray(data.activeHotkeys)) {
          state.activeHotkeys = data.activeHotkeys;
        }
        if (data.snippets) {
          state.snippets = data.snippets;
        }
        if (data.categories) {
          state.categories = data.categories;
          renderCategories();
        }
        updateSecurityButtonsUI();
        updateHotstringUI();
        renderActiveHotkeys();
        filterAndRender();
        break;

      case 'openUnlock':
        openUnlockModal();
        break;

      case 'unlockSuccess':
        unlockModal.classList.remove('active');
        state.isLocked = false;
        updateSecurityButtonsUI();
        showToast('✓ Entsperrt');
        searchInput.value = '';
        searchInput.focus();
        break;

      case 'unlockError':
        unlockError.textContent = data.message || 'Falsches Master-Passwort!';
        unlockPassword.select();
        break;

      case 'cryptoSuccess':
        cryptoModal.classList.remove('active');
        showToast(data.message || '✓ Gespeichert');
        searchInput.focus();
        break;

      case 'cryptoError':
        cryptoError.textContent = data.message || 'Fehler bei der Verschlüsselung.';
        break;

      case 'manageEncryption':
        openCryptoModal();
        break;

      case 'openSettings':
        openSettingsModal();
        break;

      case 'openPromptForSnippet':
        if (!state.isLocked && data.snippet) {
          closeAllModals();
          closeContextMenu();
          openPromptModal(data.snippet);
        }
        break;

      case 'focusSearch':
        if (!state.isLocked) {
          closeAllModals();
          closeContextMenu();
          searchInput.value = '';
          state.selectedIndex = 0;
          filterAndRender();
          searchInput.focus();
        }
        break;

      case 'openManager':
        if (!state.isLocked) {
          openManager(data.snippet || null);
        }
        break;

      case 'hotkeyRecorded':
        stopHotkeyRecording(false);
        showToast(data.message || (data.success ? '✓ Gespeichert' : '⚠️ Nicht verfügbar'));
        break;

      case 'showToast':
        showToast(data.message || '✓ Fertig');
        break;
    }
  }

  function updateSecurityButtonsUI() {
    const canLock = state.isEncrypted && !state.isLocked;
    if (btnLockNow) {
      btnLockNow.style.display = canLock ? 'flex' : 'none';
    }
    if (btnLockFromSettings) {
      btnLockFromSettings.style.display = canLock ? 'inline-flex' : 'none';
    }
  }

  function updateHotstringUI() {
    const ex = computeEffectiveHotstring('mfg', state.hotstringPrefix);
    if (hotstringStatusPill) {
      hotstringStatusPill.classList.toggle('active', state.hotstringsEnabled);
      hotstringStatusPill.textContent = state.hotstringsEnabled ? '⚡ Auto' : '⏸ Auto aus';
      hotstringStatusPill.title = state.hotstringsEnabled
        ? `Automatisches Ersetzen aktiv (z. B. ${ex}) — Klicken zum Ausschalten`
        : 'Automatisches Ersetzen beim Tippen ist deaktiviert — Klicken zum Einschalten';
    }
    if (settingHotstringsEnabled) {
      settingHotstringsEnabled.checked = state.hotstringsEnabled;
    }
    if (settingHotstringPrefix) {
      settingHotstringPrefix.value = state.hotstringPrefix;
    }
    if (hotstringPrefixRow) {
      hotstringPrefixRow.style.opacity = state.hotstringsEnabled ? '1' : '0.5';
    }
    if (hotstringDescPreview) {
      hotstringDescPreview.textContent = `Tippe z. B. ${ex} in einem beliebigen Programm zum direkten Ersetzen`;
    }
    if (editKuerzel) {
      editKuerzel.placeholder = state.hotstringPrefix
        ? `z. B. mfg (löst aus bei ${ex})`
        : 'z. B. ;;mfg';
    }
  }

  function formatHotkeyLabel(acc) {
    return String(acc || '')
      .split('+')
      .map((part) => {
        const p = part.trim();
        if (p === 'Control' || p === 'CommandOrControl') return 'Strg';
        if (p === 'Shift') return 'Umschalt';
        if (p === 'Super' || p === 'Meta') return 'Win';
        if (p === 'Space') return 'Leertaste';
        if (p === 'ScrollLock') return 'Rollen';
        if (p === 'Insert') return 'Einfg';
        if (p === 'Delete') return 'Entf';
        if (p === 'Plus') return '+';
        if (p === 'Up') return '↑';
        if (p === 'Down') return '↓';
        if (p === 'Left') return '←';
        if (p === 'Right') return '→';
        return p;
      })
      .join(' + ');
  }

  function renderActiveHotkeys() {
    if (!activeHotkeysList) return;
    activeHotkeysList.innerHTML = '';

    if (!state.activeHotkeys || state.activeHotkeys.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'hotkey-empty-hint';
      empty.textContent = 'Kein Tastenkürzel aktiv';
      activeHotkeysList.appendChild(empty);
      return;
    }

    for (const acc of state.activeHotkeys) {
      const chip = document.createElement('span');
      chip.className = 'hotkey-chip';

      const label = document.createElement('span');
      label.textContent = formatHotkeyLabel(acc);
      chip.appendChild(label);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'hotkey-chip-remove';
      removeBtn.title = `${formatHotkeyLabel(acc)} entfernen`;
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        sendIPC('removeHotkey', { accelerator: acc });
      });
      chip.appendChild(removeBtn);

      activeHotkeysList.appendChild(chip);
    }
  }

  function startHotkeyRecording() {
    state.isRecordingHotkey = true;
    if (btnRecordHotkey) {
      btnRecordHotkey.classList.add('recording');
      btnRecordHotkey.textContent = '🔴 Taste / Kombi drücken… (Esc = Abbruch)';
      btnRecordHotkey.focus();
    }
    sendIPC('pauseHotkeys', { paused: true });
  }

  function stopHotkeyRecording(notifyBackend = true) {
    const wasRecording = state.isRecordingHotkey;
    state.isRecordingHotkey = false;
    if (btnRecordHotkey) {
      btnRecordHotkey.classList.remove('recording');
      btnRecordHotkey.textContent = '⌨️ + Eigenes Kürzel aufnehmen…';
    }
    if (wasRecording && notifyBackend) {
      sendIPC('pauseHotkeys', { paused: false });
    }
  }

  function buildAcceleratorFromKeyEvent(e) {
    const ignored = new Set([
      'Control',
      'Shift',
      'Alt',
      'Meta',
      'AltGraph',
      'OS',
      'CapsLock',
      'NumLock',
      'Dead',
      'Unidentified',
    ]);
    if (ignored.has(e.key)) {
      return { status: 'modifier_only' };
    }

    const hasCtrl = e.ctrlKey;
    const hasAlt = e.altKey;
    const hasShift = e.shiftKey;
    const hasMeta = e.metaKey;

    if (e.key === 'Escape' && !hasCtrl && !hasAlt && !hasShift && !hasMeta) {
      return { status: 'cancel' };
    }

    if (e.key === 'Pause') {
      return {
        status: 'invalid',
        reason: '⚠️ Die Pause-Taste wird unter Windows nicht als globales Kürzel unterstützt.',
      };
    }

    let mainKey = null;
    const rawKey = e.key;
    const code = e.code || '';

    if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(rawKey)) {
      mainKey = rawKey.toUpperCase();
    } else if (/^Digit[0-9]$/.test(code)) {
      mainKey = code.slice(5);
    } else if (/^[a-zA-Z]$/.test(rawKey)) {
      mainKey = rawKey.toUpperCase();
    } else {
      const keyMap = {
        ' ': 'Space',
        Spacebar: 'Space',
        ScrollLock: 'ScrollLock',
        Insert: 'Insert',
        Delete: 'Delete',
        Backspace: 'Backspace',
        Tab: 'Tab',
        Enter: 'Enter',
        Home: 'Home',
        End: 'End',
        PageUp: 'PageUp',
        PageDown: 'PageDown',
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
        '+': 'Plus',
        '-': '-',
        '#': '#',
        '<': '<',
        '>': '<',
        '.': '.',
        ',': ',',
      };
      mainKey = keyMap[rawKey] || null;
    }

    if (!mainKey) {
      return {
        status: 'invalid',
        reason: '⚠️ Diese Sondertaste kann nicht als globales Kürzel verwendet werden.',
      };
    }

    const safeStandalone =
      /^F([1-9]|1[0-9]|2[0-4])$/.test(mainKey) ||
      mainKey === 'ScrollLock' ||
      mainKey === 'Insert';

    if (!safeStandalone && !hasCtrl && !hasAlt && !hasMeta) {
      return {
        status: 'needs_modifier',
        reason: '⚠️ Bitte mit Strg oder Alt kombinieren (oder F-Taste / Rollen nutzen).',
      };
    }

    const parts = [];
    if (hasCtrl) parts.push('Control');
    if (hasAlt) parts.push('Alt');
    if (hasShift) parts.push('Shift');
    if (hasMeta) parts.push('Super');
    parts.push(mainKey);

    return { status: 'ok', accelerator: parts.join('+') };
  }

  function applyTheme(theme) {
    document.documentElement.className = theme === 'light' ? 'light' : 'dark';
    if (settingTheme) settingTheme.value = theme;
  }

  function updateLayoutUI() {
    document.body.className = 'mode-' + state.layoutMode;
    layoutButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.layout === state.layoutMode);
    });
  }

  layoutButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.layout;
      state.layoutMode = mode;
      updateLayoutUI();
      sendIPC('setLayoutMode', { mode });
    });
  });

  function updatePinUI() {
    if (btnPinWindow) {
      btnPinWindow.classList.toggle('active', !!state.isPinned);
      btnPinWindow.title = state.isPinned
        ? '📌 SatzTresor ist fixiert (Desktop angepasst — Klicken zum Lösen)'
        : 'SatzTresor fixieren (Desktop passt sich an / Fenster bleibt dauerhaft offen)';
    }
    if (btnToggleWidth) {
      const isCompact = state.sidebarWidth === 320;
      btnToggleWidth.classList.toggle('active', isCompact);
      btnToggleWidth.title = isCompact
        ? 'Standardbreite (440px) wiederherstellen'
        : 'Tab verkleinern (Kompakt: 320px)';
    }
  }

  if (btnLockNow) {
    btnLockNow.addEventListener('click', () => sendIPC('lockDatabase'));
  }

  if (hotstringStatusPill) {
    hotstringStatusPill.addEventListener('click', () => {
      sendIPC('setHotstringsEnabled', { enabled: !state.hotstringsEnabled });
    });
  }

  if (btnPinWindow) {
    btnPinWindow.addEventListener('click', () => sendIPC('togglePin'));
  }

  if (btnToggleWidth) {
    btnToggleWidth.addEventListener('click', () => sendIPC('toggleCompactWidth'));
  }

  if (btnNewSnippetQuick) {
    btnNewSnippetQuick.addEventListener('click', () => openManager(null));
  }

  if (btnOpenSettings) {
    btnOpenSettings.addEventListener('click', openSettingsModal);
  }

  if (btnCollapseWindow) {
    btnCollapseWindow.addEventListener('click', () => sendIPC('collapseWindow'));
  }

  let toastTimer = null;
  function showToast(msg) {
    toastMsg.textContent = msg;
    toastMsg.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMsg.classList.remove('visible'), 2500);
  }

  function formatRelativeTime(ts) {
    if (!ts || ts.length < 14) return '';
    const y = parseInt(ts.substring(0, 4), 10);
    const m = parseInt(ts.substring(4, 6), 10) - 1;
    const d = parseInt(ts.substring(6, 8), 10);
    const h = parseInt(ts.substring(8, 10), 10);
    const min = parseInt(ts.substring(10, 12), 10);
    const date = new Date(y, m, d, h, min);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return 'Gerade eben';
    if (diffSec < 3600) return `vor ${Math.floor(diffSec / 60)} Min`;
    if (diffSec < 86400) return `vor ${Math.floor(diffSec / 3600)} Std`;
    if (diffSec < 172800) return 'Gestern';
    const days = Math.floor(diffSec / 86400);
    if (days < 30) return `vor ${days} Tagen`;
    return `${String(d).padStart(2, '0')}.${String(m + 1).padStart(2, '0')}.${y}`;
  }

  // Categories rendering
  function renderCategories() {
    categoriesBar.innerHTML = '';
    const baseIcons = {
      '[ Alle ]': '🌐 Alle',
      '[ ⭐ Favoriten ]': '⭐ Favoriten',
      '[ 🕒 Zuletzt ]': '🕒 Zuletzt',
    };

    if (!state.categories.includes(state.activeCategory)) {
      state.activeCategory = '[ Alle ]';
    }

    state.categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'category-pill' + (cat === state.activeCategory ? ' active' : '');
      btn.dataset.cat = cat;
      btn.textContent = baseIcons[cat] || '📁 ' + cat;
      btn.addEventListener('click', () => {
        state.activeCategory = cat;
        document.querySelectorAll('.category-pill').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        state.selectedIndex = 0;
        filterAndRender();
      });
      categoriesBar.appendChild(btn);
    });

    if (categoriesDatalist) {
      categoriesDatalist.innerHTML = '';
      state.categories.forEach((cat) => {
        if (!cat.startsWith('[')) {
          const opt = document.createElement('option');
          opt.value = cat;
          categoriesDatalist.appendChild(opt);
        }
      });
    }
  }

  // Token-based multi-term search & filtering
  function filterAndRender() {
    const rawQuery = searchInput.value.trim().toLowerCase();
    let list = state.snippets.slice();

    // 1. Category filter
    if (state.activeCategory === '[ ⭐ Favoriten ]') {
      list = list.filter((s) => s.favorite);
    } else if (state.activeCategory === '[ 🕒 Zuletzt ]') {
      list = list
        .filter((s) => s.lastUsed && s.lastUsed !== '')
        .sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || ''));
    } else if (state.activeCategory !== '[ Alle ]') {
      list = list.filter((s) => (s.category || '') === state.activeCategory);
    }

    // 2. Query filter (All space-separated terms must match)
    if (rawQuery !== '') {
      const terms = rawQuery.split(/\s+/).filter(Boolean);

      list = list.filter((s) => {
        const title = (s.title || '').toLowerCase();
        const kuerzel = (s.kuerzel || '').toLowerCase();
        const effectiveKuerzel = computeEffectiveHotstring(s.kuerzel, state.hotstringPrefix).toLowerCase();
        const category = (s.category || '').toLowerCase();
        const content = (s.content || '').toLowerCase();

        return terms.every(
          (term) =>
            title.includes(term) ||
            kuerzel.includes(term) ||
            effectiveKuerzel.includes(term) ||
            category.includes(term) ||
            content.includes(term)
        );
      });

      list.sort((a, b) => {
        const aEff = computeEffectiveHotstring(a.kuerzel, state.hotstringPrefix).toLowerCase();
        const bEff = computeEffectiveHotstring(b.kuerzel, state.hotstringPrefix).toLowerCase();
        const aExact =
          (a.kuerzel || '').toLowerCase() === rawQuery ||
          aEff === rawQuery ||
          (a.title || '').toLowerCase().startsWith(rawQuery);
        const bExact =
          (b.kuerzel || '').toLowerCase() === rawQuery ||
          bEff === rawQuery ||
          (b.title || '').toLowerCase().startsWith(rawQuery);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        return (b.usageCount || 0) - (a.usageCount || 0);
      });
    } else if (state.activeCategory === '[ Alle ]') {
      list.sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        return (b.usageCount || 0) - (a.usageCount || 0);
      });
    }

    state.filteredSnippets = list;
    matchCountBadge.textContent = list.length;

    if (state.selectedIndex >= list.length) {
      state.selectedIndex = Math.max(0, list.length - 1);
    }

    renderList();
  }

  function renderList() {
    snippetList.innerHTML = '';

    if (state.filteredSnippets.length === 0) {
      snippetList.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">Keine Bausteine gefunden</div>
          <div class="empty-hint">Drücke <kbd class="badge-kbd">Strg+N</kbd> oder klicke <kbd class="badge-kbd">+ Neu</kbd>, um einen Baustein anzulegen</div>
        </div>
      `;
      return;
    }

    state.filteredSnippets.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'snippet-card' + (index === state.selectedIndex ? ' selected' : '');
      card.dataset.index = index;

      // Favorite Star Button
      const starBtn = document.createElement('button');
      starBtn.className = 'card-fav-btn' + (item.favorite ? ' active' : '');
      starBtn.title = item.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen';
      starBtn.innerHTML = item.favorite
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sendIPC('toggleFavorite', { title: item.title });
      });
      card.appendChild(starBtn);

      // Card Content Column
      const contentCol = document.createElement('div');
      contentCol.className = 'card-content-col';

      const topRow = document.createElement('div');
      topRow.className = 'card-top';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'card-title';
      titleSpan.textContent = item.title;
      topRow.appendChild(titleSpan);

      const badgesDiv = document.createElement('div');
      badgesDiv.className = 'card-badges';

      if (item.kuerzel) {
        const effTrigger = computeEffectiveHotstring(item.kuerzel, state.hotstringPrefix);
        const kBadge = document.createElement('span');
        kBadge.className = 'hotstring-tag' + (state.hotstringsEnabled ? '' : ' inactive');
        kBadge.textContent = state.hotstringsEnabled ? effTrigger : item.kuerzel;
        kBadge.title = state.hotstringsEnabled
          ? `Tippe "${effTrigger}" zum automatischen Ersetzen`
          : `Suchkürzel "${item.kuerzel}" (Auto-Ersetzen deaktiviert)`;
        badgesDiv.appendChild(kBadge);
      }

      if (index < 9) {
        const numBadge = document.createElement('span');
        numBadge.className = 'badge-kbd';
        numBadge.textContent = 'Alt+' + (index + 1);
        badgesDiv.appendChild(numBadge);
      }

      if (item.category && !item.category.startsWith('[')) {
        const cBadge = document.createElement('span');
        cBadge.className = 'category-tag';
        cBadge.textContent = item.category;
        badgesDiv.appendChild(cBadge);
      }

      topRow.appendChild(badgesDiv);
      contentCol.appendChild(topRow);

      const bottomRow = document.createElement('div');
      bottomRow.className = 'card-bottom';

      const previewSpan = document.createElement('span');
      previewSpan.className = 'card-preview';
      previewSpan.textContent = (item.content || '').replace(/[\r\n]+/g, ' ');
      bottomRow.appendChild(previewSpan);

      const metaDiv = document.createElement('div');
      metaDiv.className = 'card-meta';

      const relTime = formatRelativeTime(item.lastUsed);
      if (relTime) {
        const timeSpan = document.createElement('span');
        timeSpan.textContent = relTime;
        metaDiv.appendChild(timeSpan);
      }

      if (item.usageCount && item.usageCount > 0) {
        const countSpan = document.createElement('span');
        countSpan.textContent = item.usageCount + '×';
        metaDiv.appendChild(countSpan);
      }

      bottomRow.appendChild(metaDiv);
      contentCol.appendChild(bottomRow);
      card.appendChild(contentCol);

      card.addEventListener('click', () => {
        state.selectedIndex = index;
        updateCardSelection();
        handleSnippetAction(item);
      });

      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        state.selectedIndex = index;
        updateCardSelection();
        openContextMenu(e.clientX, e.clientY, item);
      });

      snippetList.appendChild(card);
    });

    scrollSelectedIntoView();
  }

  function updateCardSelection() {
    const cards = snippetList.querySelectorAll('.snippet-card');
    cards.forEach((c, idx) => {
      c.classList.toggle('selected', idx === state.selectedIndex);
    });
    scrollSelectedIntoView();
  }

  function scrollSelectedIntoView() {
    const selected = snippetList.querySelector('.snippet-card.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Snippet Action (delegates clipboard writing strictly to main process so {clipboard} & Win+V privacy stay intact)
  function handleSnippetAction(item) {
    const rawContent = item.content || '';
    const hasPlaceholders = /\{\?([^}]+)\}/.test(rawContent);

    if (hasPlaceholders) {
      openPromptModal(item);
    } else {
      sendIPC('paste', {
        title: item.title,
        text: rawContent,
      });
      showToast('✓ Eingefügt');
    }
  }

  // Template Prompt Modal with deduplication & default values
  function extractVariables(content) {
    const regex = /\{\?([^}]+)\}/g;
    let match;
    const fieldMap = new Map();

    while ((match = regex.exec(content)) !== null) {
      const fullExpr = match[0];
      const inside = match[1];
      let name = inside;
      let options = null;
      let defaultValue = '';

      if (inside.includes('=')) {
        const parts = inside.split('=');
        name = parts[0].trim();
        const right = parts.slice(1).join('=');
        if (right.includes('|')) {
          options = right.split('|').map((s) => s.trim());
        } else {
          defaultValue = right.trim();
        }
      } else if (inside.includes(':')) {
        const parts = inside.split(':');
        name = parts[0].trim();
        defaultValue = parts.slice(1).join(':').trim();
      }

      if (!fieldMap.has(name)) {
        fieldMap.set(name, {
          name,
          options,
          defaultValue,
          occurrences: [fullExpr],
        });
      } else {
        fieldMap.get(name).occurrences.push(fullExpr);
      }
    }
    return Array.from(fieldMap.values());
  }

  function openPromptModal(item) {
    state.currentPromptSnippet = item;
    promptTitle.textContent = item.title;
    promptFieldsContainer.innerHTML = '';

    const fields = extractVariables(item.content);

    fields.forEach((f, idx) => {
      const group = document.createElement('div');
      group.className = 'form-group';

      const label = document.createElement('label');
      label.className = 'form-label';
      label.textContent = f.name;
      group.appendChild(label);

      let inputElem;
      if (f.options) {
        inputElem = document.createElement('select');
        inputElem.className = 'form-select';
        f.options.forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          inputElem.appendChild(o);
        });
      } else {
        const isMultiline = /text|nachricht|inhalt|grund|multi/i.test(f.name);
        if (isMultiline) {
          inputElem = document.createElement('textarea');
          inputElem.className = 'form-textarea';
          inputElem.rows = 3;
        } else {
          inputElem = document.createElement('input');
          inputElem.type = 'text';
          inputElem.className = 'form-input';
        }
        inputElem.value = f.defaultValue || '';
        inputElem.placeholder = `${f.name} eingeben...`;
      }

      inputElem.dataset.varName = f.name;
      inputElem.dataset.fieldIndex = idx;

      inputElem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          if (inputElem.tagName === 'TEXTAREA' && e.ctrlKey) {
            e.preventDefault();
            submitPrompt();
            return;
          }
          if (inputElem.tagName !== 'TEXTAREA') {
            e.preventDefault();
            const inputs = promptFieldsContainer.querySelectorAll('input, select, textarea');
            if (idx < inputs.length - 1) {
              inputs[idx + 1].focus();
              if (inputs[idx + 1].select) inputs[idx + 1].select();
            } else {
              submitPrompt();
            }
          }
        }
      });

      group.appendChild(inputElem);
      promptFieldsContainer.appendChild(group);
    });

    promptModal.classList.add('active');
    const firstInput = promptFieldsContainer.querySelector('input, select, textarea');
    if (firstInput) {
      setTimeout(() => {
        firstInput.focus();
        if (firstInput.select) firstInput.select();
      }, 45);
    }
  }

  function submitPrompt() {
    if (!state.currentPromptSnippet) return;
    let text = state.currentPromptSnippet.content;

    const fields = extractVariables(text);
    const inputs = promptFieldsContainer.querySelectorAll('input, select, textarea');

    inputs.forEach((inp) => {
      const varName = inp.dataset.varName;
      const val = inp.value;
      const fieldData = fields.find((f) => f.name === varName);
      if (fieldData) {
        fieldData.occurrences.forEach((occ) => {
          text = text.replaceAll(occ, val);
        });
      }
    });

    promptModal.classList.remove('active');
    sendIPC('paste', {
      title: state.currentPromptSnippet.title,
      text,
    });
    showToast('✓ Eingefügt');
    state.currentPromptSnippet = null;
  }

  function cancelPrompt() {
    promptModal.classList.remove('active');
    state.currentPromptSnippet = null;
    sendIPC('cancelPrompt');
    searchInput.focus();
  }

  btnCancelPrompt.addEventListener('click', cancelPrompt);
  btnConfirmPrompt.addEventListener('click', submitPrompt);

  // Context Menu
  function openContextMenu(x, y, item) {
    state.contextMenuSnippet = item;
    ctxFavorite.textContent = item.favorite ? '☆ Aus Favoriten entfernen' : '⭐ Zu Favoriten hinzufügen';
    contextMenu.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
    contextMenu.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
    contextMenu.classList.add('active');
  }

  function closeContextMenu() {
    contextMenu.classList.remove('active');
    state.contextMenuSnippet = null;
  }

  window.addEventListener('click', () => {
    if (contextMenu.classList.contains('active')) {
      closeContextMenu();
    }
  });

  ctxCopy.addEventListener('click', () => {
    if (state.contextMenuSnippet) {
      sendIPC('copyToClipboardOnly', {
        title: state.contextMenuSnippet.title,
        text: state.contextMenuSnippet.content,
      });
    }
    closeContextMenu();
  });

  ctxFavorite.addEventListener('click', () => {
    if (state.contextMenuSnippet) {
      sendIPC('toggleFavorite', { title: state.contextMenuSnippet.title });
    }
    closeContextMenu();
  });

  ctxDuplicate.addEventListener('click', () => {
    if (state.contextMenuSnippet) {
      sendIPC('duplicateSnippet', { title: state.contextMenuSnippet.title });
    }
    closeContextMenu();
  });

  ctxEdit.addEventListener('click', () => {
    if (state.contextMenuSnippet) {
      openManager(state.contextMenuSnippet);
    }
    closeContextMenu();
  });

  ctxDelete.addEventListener('click', async () => {
    const target = state.contextMenuSnippet;
    closeContextMenu();
    if (!target) return;
    const confirmed = await showConfirmDialog({
      title: 'Baustein löschen',
      message: `Möchtest du den Baustein „${target.title}“ wirklich unwiderruflich löschen?`,
      confirmText: 'Löschen',
      danger: true,
    });
    if (confirmed) {
      sendIPC('deleteSnippet', { title: target.title });
    }
  });

  // Manager Modal
  function openManager(snippet = null) {
    closeContextMenu();
    updateHotstringUI();
    if (snippet) {
      managerTitle.textContent = 'Baustein bearbeiten';
      editOriginalTitle.value = snippet.title;
      editTitle.value = snippet.title;
      editKuerzel.value = snippet.kuerzel || '';
      editCategory.value = snippet.category || '';
      editContent.value = snippet.content || '';
      editFavorite.checked = !!snippet.favorite;
      btnDeleteSnippet.style.display = 'inline-flex';
      btnDuplicateFromManager.style.display = 'inline-flex';
    } else {
      managerTitle.textContent = 'Neuen Baustein anlegen';
      editOriginalTitle.value = '';
      editTitle.value = '';
      editKuerzel.value = '';
      editCategory.value = state.activeCategory.startsWith('[') ? '' : state.activeCategory;
      editContent.value = '';
      editFavorite.checked = false;
      btnDeleteSnippet.style.display = 'none';
      btnDuplicateFromManager.style.display = 'none';
    }

    managerModal.classList.add('active');
    setTimeout(() => editTitle.focus(), 50);
  }

  btnDuplicateFromManager.addEventListener('click', () => {
    const title = editOriginalTitle.value;
    if (title) {
      sendIPC('duplicateSnippet', { title });
      managerModal.classList.remove('active');
      searchInput.focus();
    }
  });

  btnDeleteSnippet.addEventListener('click', async () => {
    const title = editOriginalTitle.value;
    if (!title) return;
    const confirmed = await showConfirmDialog({
      title: 'Baustein löschen',
      message: `Möchtest du den Baustein „${title}“ wirklich unwiderruflich löschen?`,
      confirmText: 'Löschen',
      danger: true,
    });
    if (confirmed) {
      sendIPC('deleteSnippet', { title });
      managerModal.classList.remove('active');
      searchInput.focus();
    }
  });

  btnCancelManager.addEventListener('click', () => {
    managerModal.classList.remove('active');
    searchInput.focus();
  });

  btnSaveSnippet.addEventListener('click', async () => {
    const cleanTitle = editTitle.value.replace(/[\r\n\[\]]/g, ' ').trim();
    if (!cleanTitle) {
      await showConfirmDialog({
        title: 'Titel fehlt',
        message: 'Bitte gib einen Titel für den Satzbaustein ein.',
        confirmText: 'Verstanden',
        showCancel: false,
      });
      editTitle.focus();
      return;
    }

    const oldTitle = editOriginalTitle.value;
    const collision = state.snippets.find(
      (s) => s.title.toLowerCase() === cleanTitle.toLowerCase() && s.title !== oldTitle
    );

    if (collision) {
      const overwrite = await showConfirmDialog({
        title: 'Baustein überschreiben?',
        message: `Ein Baustein mit dem Namen „${collision.title}“ existiert bereits. Möchtest du ihn überschreiben?`,
        confirmText: 'Überschreiben',
        danger: true,
      });
      if (!overwrite) {
        editTitle.focus();
        return;
      }
    }

    sendIPC('saveSnippet', {
      oldTitle,
      title: cleanTitle,
      kuerzel: editKuerzel.value.trim(),
      category: editCategory.value.trim(),
      content: editContent.value,
      favorite: editFavorite.checked,
    });

    managerModal.classList.remove('active');
    searchInput.focus();
  });

  // Template chips insertion
  document.querySelectorAll('.template-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const toInsert = chip.dataset.insert;
      const textarea = editContent;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      textarea.value = text.substring(0, start) + toInsert + text.substring(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + toInsert.length;
    });
  });

  // Settings Modal
  function openSettingsModal() {
    closeContextMenu();
    stopHotkeyRecording(true);
    if (settingAutostart) settingAutostart.checked = state.autostart;
    if (settingTheme) settingTheme.value = state.theme;
    if (settingRestoreClipboard) settingRestoreClipboard.checked = state.restoreClipboard;
    if (settingDoubleTapCtrl) settingDoubleTapCtrl.checked = state.doubleTapCtrlEnabled;
    if (settingEdgeTab) settingEdgeTab.checked = state.edgeTabEnabled;
    updateHotstringUI();
    renderActiveHotkeys();
    updateSecurityButtonsUI();
    settingsModal.classList.add('active');
  }

  if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
      stopHotkeyRecording(true);
      settingsModal.classList.remove('active');
      searchInput.focus();
    });
  }

  if (settingAutostart) {
    settingAutostart.addEventListener('change', (e) => {
      sendIPC('setAutostart', { enabled: e.target.checked });
    });
  }

  if (settingTheme) {
    settingTheme.addEventListener('change', (e) => {
      sendIPC('setTheme', { theme: e.target.value });
    });
  }

  if (settingRestoreClipboard) {
    settingRestoreClipboard.addEventListener('change', (e) => {
      sendIPC('setRestoreClipboard', { enabled: e.target.checked });
    });
  }

  if (settingHotstringsEnabled) {
    settingHotstringsEnabled.addEventListener('change', (e) => {
      sendIPC('setHotstringsEnabled', { enabled: e.target.checked });
    });
  }

  if (settingHotstringPrefix) {
    settingHotstringPrefix.addEventListener('change', (e) => {
      sendIPC('setHotstringPrefix', { prefix: e.target.value });
    });
  }

  if (settingDoubleTapCtrl) {
    settingDoubleTapCtrl.addEventListener('change', (e) => {
      sendIPC('setDoubleTapCtrlEnabled', { enabled: e.target.checked });
    });
  }

  if (settingEdgeTab) {
    settingEdgeTab.addEventListener('change', (e) => {
      sendIPC('setEdgeTabEnabled', { enabled: e.target.checked });
    });
  }

  if (btnRecordHotkey) {
    btnRecordHotkey.addEventListener('click', () => {
      if (state.isRecordingHotkey) {
        stopHotkeyRecording(true);
      } else {
        startHotkeyRecording();
      }
    });
  }

  if (btnImportData) btnImportData.addEventListener('click', () => sendIPC('importDialog'));
  if (btnExportIni) btnExportIni.addEventListener('click', () => sendIPC('exportDialog', { format: 'ini' }));
  if (btnExportJson) btnExportJson.addEventListener('click', () => sendIPC('exportDialog', { format: 'json' }));
  if (btnExportCsv) btnExportCsv.addEventListener('click', () => sendIPC('exportDialog', { format: 'csv' }));

  if (btnOpenCryptoFromSettings) {
    btnOpenCryptoFromSettings.addEventListener('click', () => {
      stopHotkeyRecording(true);
      settingsModal.classList.remove('active');
      openCryptoModal();
    });
  }

  if (btnLockFromSettings) {
    btnLockFromSettings.addEventListener('click', () => {
      stopHotkeyRecording(true);
      settingsModal.classList.remove('active');
      sendIPC('lockDatabase');
    });
  }

  // Unlock Modal
  function openUnlockModal() {
    closeAllModals();
    unlockPassword.value = '';
    unlockError.textContent = '';
    unlockModal.classList.add('active');
    setTimeout(() => unlockPassword.focus(), 50);
  }

  function submitUnlock() {
    const pw = unlockPassword.value;
    if (!pw) {
      unlockError.textContent = 'Bitte Passwort eingeben!';
      unlockPassword.focus();
      return;
    }
    unlockError.textContent = '';
    sendIPC('unlock', { password: pw });
  }

  btnSubmitUnlock.addEventListener('click', submitUnlock);
  btnExitUnlock.addEventListener('click', () => {
    unlockModal.classList.remove('active');
    sendIPC('close');
  });

  // Crypto Modal (Encrypt / Change Password / Remove Encryption)
  function renderCryptoModalMode(mode) {
    state.cryptoMode = mode;
    cryptoError.textContent = '';

    encryptFields.style.display = mode === 'encrypt' ? 'block' : 'none';
    changePwFields.style.display = mode === 'change' ? 'block' : 'none';
    decryptFields.style.display = mode === 'remove' ? 'block' : 'none';

    if (tabChangePw) tabChangePw.classList.toggle('active', mode === 'change');
    if (tabRemoveCrypto) tabRemoveCrypto.classList.toggle('active', mode === 'remove');

    if (mode === 'encrypt') {
      cryptoModalTitle.textContent = 'Datenbank verschlüsseln';
      cryptoStatusDesc.textContent =
        'Schütze deine Satzbausteine mit starker AES-256-CBC PBKDF2 Verschlüsselung:';
      cryptoNewPw.value = '';
      cryptoConfirmPw.value = '';
      setTimeout(() => cryptoNewPw.focus(), 40);
    } else if (mode === 'change') {
      cryptoModalTitle.textContent = 'Verschlüsselung verwalten';
      cryptoStatusDesc.textContent = 'Ändere dein Master-Passwort ohne Entschlüsselung auf der Festplatte:';
      cryptoOldPw.value = '';
      cryptoChangeNewPw.value = '';
      cryptoChangeConfirmPw.value = '';
      setTimeout(() => cryptoOldPw.focus(), 40);
    } else {
      cryptoModalTitle.textContent = 'Verschlüsselung aufheben';
      cryptoStatusDesc.textContent =
        'Gib dein aktuelles Master-Passwort ein, um den Passwortschutz dauerhaft zu entfernen:';
      cryptoCurrentPw.value = '';
      setTimeout(() => cryptoCurrentPw.focus(), 40);
    }
  }

  if (tabChangePw) {
    tabChangePw.addEventListener('click', () => renderCryptoModalMode('change'));
  }
  if (tabRemoveCrypto) {
    tabRemoveCrypto.addEventListener('click', () => renderCryptoModalMode('remove'));
  }

  function openCryptoModal() {
    if (state.isEncrypted) {
      cryptoModeTabs.style.display = 'flex';
      renderCryptoModalMode('change');
    } else {
      cryptoModeTabs.style.display = 'none';
      renderCryptoModalMode('encrypt');
    }
    cryptoModal.classList.add('active');
  }

  function submitCrypto() {
    cryptoError.textContent = '';

    if (state.cryptoMode === 'encrypt') {
      const p1 = cryptoNewPw.value;
      const p2 = cryptoConfirmPw.value;
      if (!p1) {
        cryptoError.textContent = 'Passwort darf nicht leer sein!';
        cryptoNewPw.focus();
        return;
      }
      if (p1 !== p2) {
        cryptoError.textContent = 'Passwörter stimmen nicht überein!';
        cryptoConfirmPw.focus();
        return;
      }
      sendIPC('encryptDatabase', { password: p1 });
    } else if (state.cryptoMode === 'change') {
      const oldPw = cryptoOldPw.value;
      const newPw = cryptoChangeNewPw.value;
      const confirmPw = cryptoChangeConfirmPw.value;
      if (!oldPw) {
        cryptoError.textContent = 'Bitte aktuelles Passwort eingeben!';
        cryptoOldPw.focus();
        return;
      }
      if (!newPw) {
        cryptoError.textContent = 'Neues Passwort darf nicht leer sein!';
        cryptoChangeNewPw.focus();
        return;
      }
      if (newPw !== confirmPw) {
        cryptoError.textContent = 'Neue Passwörter stimmen nicht überein!';
        cryptoChangeConfirmPw.focus();
        return;
      }
      sendIPC('changePassword', { currentPassword: oldPw, newPassword: newPw });
    } else {
      const pw = cryptoCurrentPw.value;
      if (!pw) {
        cryptoError.textContent = 'Bitte Passwort eingeben!';
        cryptoCurrentPw.focus();
        return;
      }
      sendIPC('decryptDatabase', { password: pw });
    }
  }

  btnCancelCrypto.addEventListener('click', () => {
    cryptoModal.classList.remove('active');
    searchInput.focus();
  });
  btnApplyCrypto.addEventListener('click', submitCrypto);

  function closeAllModals() {
    stopHotkeyRecording(true);
    if (confirmModal.classList.contains('active')) {
      resolveConfirmModal(false);
    }
    promptModal.classList.remove('active');
    managerModal.classList.remove('active');
    settingsModal.classList.remove('active');
    cryptoModal.classList.remove('active');
    state.currentPromptSnippet = null;
  }

  window.addEventListener('blur', () => {
    if (state.isRecordingHotkey) {
      stopHotkeyRecording(false);
    }
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (state.isRecordingHotkey) {
      e.preventDefault();
      e.stopPropagation();
      const parsed = buildAcceleratorFromKeyEvent(e);
      if (parsed.status === 'modifier_only') {
        return;
      }
      if (parsed.status === 'cancel') {
        stopHotkeyRecording(true);
        showToast('Aufnahme abgebrochen');
        return;
      }
      if (parsed.status === 'needs_modifier') {
        showToast(parsed.reason);
        return;
      }
      if (parsed.status === 'invalid') {
        stopHotkeyRecording(true);
        showToast(parsed.reason);
        return;
      }
      if (parsed.status === 'ok') {
        stopHotkeyRecording(false);
        sendIPC('addCustomHotkey', { accelerator: parsed.accelerator });
        return;
      }
      return;
    }

    if (confirmModal.classList.contains('active')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        resolveConfirmModal(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirmModal(false);
      }
      return;
    }

    if (unlockModal.classList.contains('active')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitUnlock();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        btnExitUnlock.click();
      }
      return;
    }

    if (cryptoModal.classList.contains('active')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitCrypto();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        btnCancelCrypto.click();
      }
      return;
    }

    if (promptModal.classList.contains('active')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelPrompt();
      }
      return;
    }

    if (managerModal.classList.contains('active')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        btnCancelManager.click();
      } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        btnSaveSnippet.click();
      }
      return;
    }

    if (settingsModal.classList.contains('active')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        btnCloseSettings.click();
      }
      return;
    }

    // Ctrl+L: Lock database immediately if encrypted
    if (e.key.toLowerCase() === 'l' && (e.ctrlKey || e.metaKey) && state.isEncrypted && !state.isLocked) {
      e.preventDefault();
      sendIPC('lockDatabase');
      return;
    }

    // Ctrl+N: Create new snippet
    if (e.key.toLowerCase() === 'n' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openManager(null);
      return;
    }

    // Ctrl+D: Duplicate selected snippet
    if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const sel = state.filteredSnippets[state.selectedIndex];
      if (sel) {
        sendIPC('duplicateSnippet', { title: sel.title });
      }
      return;
    }

    // Alt+F or Ctrl+F (when list focused): Toggle favorite for selected
    if (
      (e.key.toLowerCase() === 'f' && e.altKey) ||
      (e.key.toLowerCase() === 'f' && e.ctrlKey && document.activeElement !== searchInput)
    ) {
      e.preventDefault();
      const sel = state.filteredSnippets[state.selectedIndex];
      if (sel) {
        sendIPC('toggleFavorite', { title: sel.title });
      }
      return;
    }

    // Quick paste with Alt + 1..9
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      const slot = parseInt(e.key, 10) - 1;
      if (slot < state.filteredSnippets.length) {
        e.preventDefault();
        handleSnippetAction(state.filteredSnippets[slot]);
      }
      return;
    }

    // Palette navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.filteredSnippets.length > 0) {
        state.selectedIndex = (state.selectedIndex + 1) % state.filteredSnippets.length;
        updateCardSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.filteredSnippets.length > 0) {
        state.selectedIndex =
          (state.selectedIndex - 1 + state.filteredSnippets.length) % state.filteredSnippets.length;
        updateCardSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (state.filteredSnippets.length > 0) {
        handleSnippetAction(state.filteredSnippets[state.selectedIndex]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const sel = state.filteredSnippets[state.selectedIndex];
      openManager(sel || null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (contextMenu.classList.contains('active')) {
        closeContextMenu();
      } else if (searchInput.value !== '') {
        searchInput.value = '';
        filterAndRender();
      } else {
        sendIPC('close');
      }
    }
  });

  searchInput.addEventListener('input', () => {
    state.selectedIndex = 0;
    filterAndRender();
  });

  function initApp() {
    sendIPC('ready');
    renderCategories();
    filterAndRender();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
