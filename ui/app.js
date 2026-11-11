/**
 * SnapPhrase v1.6.0 — Renderer Application Logic
 * Apple-inspired Spotlight UI with token search, smart template prompts, hotstring configuration,
 * automatic DE/EN localization, background software updates, non-blocking confirmation modals,
 * custom context menu, favorites, and encryption management.
 */

(function () {
  function detectBrowserLanguage() {
    try {
      const nav = String(navigator.language || 'en').toLowerCase();
      return nav.startsWith('de') ? 'de' : 'en';
    } catch (e) {
      return 'en';
    }
  }

  const state = {
    version: '1.6.0',
    language: 'auto', // 'auto' | 'de' | 'en'
    effectiveLanguage: detectBrowserLanguage(), // 'de' | 'en'
    isWindowsStore: false,
    layoutMode: 'center',
    centerCompact: false,
    backdropMode: 'blur', // 'blur' | 'solid' | 'off'
    backdropBlurPercent: 65,
    backdropDimPercent: 60,
    backdropSnapshot: null,
    dimBackground: true,
    isPinned: false,
    isEncrypted: false,
    isLocked: false,
    theme: 'dark',
    autostart: false,
    doubleTapCtrlEnabled: true,
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
    managerInitialSnapshot: null,
    updateState: null,
  };

  function isEn() {
    return state.effectiveLanguage === 'en';
  }

  // DOM Elements
  const screenBackdrop = document.getElementById('screenBackdrop');
  const screenBackdropImg = document.getElementById('screenBackdropImg');
  const screenStage = document.getElementById('screenStage');
  const appShell = document.getElementById('appShell');
  const searchInput = document.getElementById('searchInput');
  const snippetList = document.getElementById('snippetList');
  const categoriesBar = document.getElementById('categoriesBar');
  const matchCountBadge = document.getElementById('matchCountBadge');
  const toastMsg = document.getElementById('toastMsg');
  const versionTag = document.getElementById('versionTag');
  const updateReadyPill = document.getElementById('updateReadyPill');
  const updateReadyLabel = document.getElementById('updateReadyLabel');
  const hotstringStatusPill = document.getElementById('hotstringStatusPill');
  const hotstringStatusLabel = document.getElementById('hotstringStatusLabel');

  // Top buttons
  const btnLockNow = document.getElementById('btnLockNow');
  const btnPinWindow = document.getElementById('btnPinWindow');
  const btnToggleWidth = document.getElementById('btnToggleWidth');
  const iconShrinkWindow = document.getElementById('iconShrinkWindow');
  const iconExpandWindow = document.getElementById('iconExpandWindow');
  const btnNewSnippetQuick = document.getElementById('btnNewSnippetQuick');
  const btnNewSnippetLabel = document.getElementById('btnNewSnippetLabel');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCollapseWindow = document.getElementById('btnCollapseWindow');

  // Variable Prompt Modal
  const promptModal = document.getElementById('promptModal');
  const promptTitle = document.getElementById('promptTitle');
  const promptFieldsContainer = document.getElementById('promptFieldsContainer');
  const btnCancelPrompt = document.getElementById('btnCancelPrompt');
  const btnConfirmPrompt = document.getElementById('btnConfirmPrompt');
  const btnConfirmPromptLabel = document.getElementById('btnConfirmPromptLabel');

  // Snippet Manager Modal
  const managerModal = document.getElementById('managerModal');
  const managerTitle = document.getElementById('managerTitle');
  const managerSaveShortcutBadge = document.getElementById('managerSaveShortcutBadge');
  const editOriginalTitle = document.getElementById('editOriginalTitle');
  const editTitle = document.getElementById('editTitle');
  const editKuerzel = document.getElementById('editKuerzel');
  const editKuerzelLiveBadge = document.getElementById('editKuerzelLiveBadge');
  const editCategory = document.getElementById('editCategory');
  const editContent = document.getElementById('editContent');
  const editFavorite = document.getElementById('editFavorite');
  const btnToggleEditFavorite = document.getElementById('btnToggleEditFavorite');
  const editFavoriteLabel = document.getElementById('editFavoriteLabel');
  const categoriesDatalist = document.getElementById('categoriesDatalist');
  const btnDuplicateFromManager = document.getElementById('btnDuplicateFromManager');
  const btnDeleteSnippet = document.getElementById('btnDeleteSnippet');
  const btnCancelManager = document.getElementById('btnCancelManager');
  const btnSaveSnippet = document.getElementById('btnSaveSnippet');

  // Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  const languageSegmented = document.getElementById('languageSegmented');
  const settingAutostart = document.getElementById('settingAutostart');
  const settingTheme = document.getElementById('settingTheme');
  const themeSegmented = document.getElementById('themeSegmented');
  const settingBackdropMode = document.getElementById('settingBackdropMode');
  const backdropSegmented = document.getElementById('backdropSegmented');
  const backdropBlurConfigPanel = document.getElementById('backdropBlurConfigPanel');
  const settingBackdropBlurPercent = document.getElementById('settingBackdropBlurPercent');
  const backdropBlurPercentValue = document.getElementById('backdropBlurPercentValue');
  const settingBackdropDimPercent = document.getElementById('settingBackdropDimPercent');
  const backdropDimPercentValue = document.getElementById('backdropDimPercentValue');
  const settingDimBackground = document.getElementById('settingDimBackground');
  const settingRestoreClipboard = document.getElementById('settingRestoreClipboard');
  const settingHotstringsEnabled = document.getElementById('settingHotstringsEnabled');
  const settingHotstringPrefix = document.getElementById('settingHotstringPrefix');
  const hotstringPrefixRow = document.getElementById('hotstringPrefixRow');
  const hotstringDescPreview = document.getElementById('hotstringDescPreview');
  const settingDoubleTapCtrl = document.getElementById('settingDoubleTapCtrl');
  const activeHotkeysList = document.getElementById('activeHotkeysList');
  const btnRecordHotkey = document.getElementById('btnRecordHotkey');
  const btnImportData = document.getElementById('btnImportData');
  const btnExportData = document.getElementById('btnExportData');
  const btnOpenDataFolder = document.getElementById('btnOpenDataFolder');
  const cryptoSettingsStatusDesc = document.getElementById('cryptoSettingsStatusDesc');
  const cryptoSettingsBtnLabel = document.getElementById('cryptoSettingsBtnLabel');
  const btnOpenCryptoFromSettings = document.getElementById('btnOpenCryptoFromSettings');
  const btnLockFromSettings = document.getElementById('btnLockFromSettings');
  const updateStatusHeadline = document.getElementById('updateStatusHeadline');
  const updateStatusDesc = document.getElementById('updateStatusDesc');
  const updateProgressWrap = document.getElementById('updateProgressWrap');
  const updateProgressBar = document.getElementById('updateProgressBar');
  const btnUpdateAction = document.getElementById('btnUpdateAction');
  const autoUpdateToggleRow = document.getElementById('autoUpdateToggleRow');
  const settingAutoUpdate = document.getElementById('settingAutoUpdate');
  const settingUpdateRepo = document.getElementById('settingUpdateRepo');
  const btnSaveUpdateRepo = document.getElementById('btnSaveUpdateRepo');
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
  const ctxInsert = document.getElementById('ctxInsert');
  const ctxCopy = document.getElementById('ctxCopy');
  const ctxFavorite = document.getElementById('ctxFavorite');
  const ctxFavoriteLabel = document.getElementById('ctxFavoriteLabel');
  const ctxDuplicate = document.getElementById('ctxDuplicate');
  const ctxEdit = document.getElementById('ctxEdit');
  const ctxDelete = document.getElementById('ctxDelete');

  // IPC Helper
  const ipcBridge = window.snapphraseApi || window.satztresorApi || window.quicktabApi;
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

  function setTextById(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function applyLanguageUI() {
    const en = isEn();
    document.documentElement.lang = en ? 'en' : 'de';

    if (searchInput) {
      searchInput.placeholder = en ? 'Search snippets...' : 'Satzbaustein suchen...';
    }
    if (btnNewSnippetLabel) {
      btnNewSnippetLabel.textContent = en ? 'New' : 'Neu';
    }
    if (btnNewSnippetQuick) {
      btnNewSnippetQuick.title = en
        ? 'Create new snippet (Ctrl+N)'
        : 'Neuen Satzbaustein anlegen (Strg+N)';
    }
    if (btnLockNow) {
      btnLockNow.title = en ? 'Lock database now (Ctrl+L)' : 'Datenbank jetzt sperren (Strg+L)';
    }
    if (btnOpenSettings) {
      btnOpenSettings.title = en ? 'Open settings' : 'Einstellungen öffnen';
    }
    if (btnCollapseWindow) {
      btnCollapseWindow.title = en ? 'Hide window (Esc)' : 'Ausblenden (Esc)';
    }
    if (updateReadyPill) {
      updateReadyPill.title = en
        ? 'Install update now and restart'
        : 'Update jetzt installieren und neu starten';
    }

    // Footer hints
    setTextById('hintInsert', en ? 'Insert' : 'Einfügen');
    setTextById('hintCopyKbd', en ? 'Shift+↵' : 'Umschalt+↵');
    setTextById('hintCopy', en ? 'Copy' : 'Kopieren');
    setTextById('hintEdit', en ? 'Edit' : 'Bearbeiten');
    setTextById('hintNewKbd', en ? 'Ctrl+N' : 'Strg+N');
    setTextById('hintNew', en ? 'New' : 'Neu');
    setTextById('hintClose', en ? 'Close' : 'Schließen');

    // Context menu
    setTextById('ctxInsertLabel', en ? 'Insert' : 'Einfügen');
    setTextById('ctxCopyLabel', en ? 'Copy only' : 'Nur kopieren');
    setTextById('ctxEditLabel', en ? 'Edit…' : 'Bearbeiten…');
    setTextById('ctxDuplicateLabel', en ? 'Duplicate' : 'Duplizieren');
    setTextById('ctxDeleteLabel', en ? 'Delete…' : 'Löschen…');

    // Prompt modal
    if (btnCancelPrompt) btnCancelPrompt.textContent = en ? 'Cancel' : 'Abbrechen';
    if (btnConfirmPromptLabel) btnConfirmPromptLabel.textContent = en ? 'Insert' : 'Einfügen';

    // Manager modal
    if (managerSaveShortcutBadge) {
      managerSaveShortcutBadge.textContent = en ? 'Ctrl+S' : 'Strg+S';
    }
    setTextById('editTitleLabel', en ? 'Title' : 'Titel');
    if (editTitle) {
      editTitle.placeholder = en ? 'e.g. Friendly sign-off' : 'z. B. Freundliche Grußformel';
    }
    setTextById('editKuerzelLabel', en ? 'Trigger' : 'Kürzel');
    setTextById('editCategoryLabelText', en ? 'Category' : 'Kategorie');
    setTextById('editCategoryOptionalLabel', '(optional)');
    if (editCategory) {
      editCategory.placeholder = en
        ? 'e.g. Email, Sales, Support'
        : 'z. B. E-Mail, Angebot, Support';
    }
    setTextById('quickAccessLabel', en ? 'Quick Access' : 'Schnellzugriff');
    setTextById('editContentLabel', en ? 'Snippet Content' : 'Textinhalt');
    setTextById(
      'editContentHint',
      en ? 'Click to insert dynamic placeholders' : 'Dynamische Platzhalter per Klick einfügen'
    );
    if (editContent) {
      editContent.placeholder = en
        ? 'Write or paste your text snippet here…'
        : 'Schreibe oder kopiere hier deinen Textbaustein hinein…';
    }

    // Template chips
    const chipConfigs = [
      {
        id: 'chipCursor',
        insert: '{cursor}',
        label: en ? 'Cursor Position' : 'Cursor-Position',
        title: en
          ? 'Places the typing cursor at this exact position after pasting ({cursor})'
          : 'Setzt den Schreibcursor nach dem Einfügen exakt an diese Stelle ({cursor})',
      },
      {
        id: 'chipDateToday',
        insert: en ? '{date}' : '{datum}',
        label: en ? 'Today' : 'Datum heute',
        title: en ? 'Insert current date ({date})' : 'Aktuelles Datum einfügen ({datum})',
      },
      {
        id: 'chipDateTomorrow',
        insert: en ? '{date:+1d}' : '{datum:+1d}',
        label: en ? 'Tomorrow' : 'Morgen',
        title: en ? "Insert tomorrow's date ({date:+1d})" : 'Morgiges Datum einfügen ({datum:+1d})',
      },
      {
        id: 'chipWeekday',
        insert: en ? '{weekday}' : '{wochentag}',
        label: en ? 'Weekday' : 'Wochentag',
        title: en ? 'Insert current weekday ({weekday})' : 'Aktuellen Wochentag einfügen ({wochentag})',
      },
      {
        id: 'chipTime',
        insert: en ? '{time}' : '{zeit}',
        label: en ? 'Time' : 'Uhrzeit',
        title: en ? 'Insert current time ({time})' : 'Aktuelle Uhrzeit einfügen ({zeit})',
      },
      {
        id: 'chipClipboard',
        insert: '{clipboard}',
        label: en ? 'Clipboard' : 'Zwischenablage',
        title: en
          ? 'Insert previously copied clipboard text ({clipboard})'
          : 'Vorher kopierten Text aus der Zwischenablage einfügen ({clipboard})',
      },
      {
        id: 'chipPromptField',
        insert: '{?Name}',
        label: en ? 'Input Prompt' : 'Eingabefeld',
        title: en
          ? 'Prompts for a custom text value before pasting ({?Name})'
          : 'Fragt beim Einfügen einen freien Textwert ab ({?Name})',
      },
      {
        id: 'chipSelectField',
        insert: en ? '{?Salutation=Ms.|Mr.|Hello}' : '{?Anrede=Frau|Herr|Guten Tag}',
        label: en ? 'Dropdown Menu' : 'Auswahlmenü',
        title: en
          ? 'Shows a selection dropdown before pasting ({?Salutation=Ms.|Mr.|Hello})'
          : 'Zeigt beim Einfügen ein Auswahlmenü ({?Anrede=Frau|Herr|Guten Tag})',
      },
    ];
    chipConfigs.forEach((cfg) => {
      const chip = document.getElementById(cfg.id);
      if (chip) {
        chip.dataset.insert = cfg.insert;
        chip.textContent = cfg.label;
        chip.title = cfg.title;
      }
    });

    if (btnDeleteSnippet) btnDeleteSnippet.textContent = en ? 'Delete' : 'Löschen';
    if (btnDuplicateFromManager) btnDuplicateFromManager.textContent = en ? 'Duplicate' : 'Duplizieren';
    if (btnCancelManager) btnCancelManager.textContent = en ? 'Cancel' : 'Abbrechen';
    if (btnSaveSnippet) btnSaveSnippet.textContent = en ? 'Save' : 'Speichern';

    // Settings Modal
    setTextById('settingsModalTitle', en ? 'Settings' : 'Einstellungen');
    setTextById('settingsHeaderAppearance', en ? 'Appearance & System' : 'Darstellung & System');
    setTextById('settingLanguageTitle', en ? 'Language' : 'Sprache');
    setTextById(
      'settingLanguageDesc',
      en
        ? 'Automatic by Windows language or select manually'
        : 'Automatisch nach Windows-Sprache oder manuell wählen'
    );
    setTextById('settingAutostartTitle', en ? 'Start with Windows' : 'Mit Windows starten');
    setTextById(
      'settingAutostartDesc',
      en
        ? 'Launch automatically in the background when signing in'
        : 'Beim Anmelden automatisch im Hintergrund bereitstellen'
    );
    setTextById('settingThemeTitle', en ? 'Theme' : 'Erscheinungsbild');
    setTextById('settingThemeDesc', en ? 'Interface color scheme' : 'Farbschema der Oberfläche');
    setTextById('themeBtnDark', en ? 'Dark' : 'Dunkel');
    setTextById('themeBtnLight', en ? 'Light' : 'Hell');
    setTextById('settingBackdropTitle', en ? 'Background Focus' : 'Hintergrund-Fokus');
    setTextById(
      'settingBackdropDesc',
      en
        ? 'Calmly dim or blur the desktop behind the search window'
        : 'Desktop hinter dem Suchfenster ruhig ausblenden'
    );
    setTextById('backdropBtnBlur', en ? 'Acrylic' : 'Milchglas');
    setTextById('backdropBtnSolid', en ? 'Dimmed' : 'Dunkel');
    setTextById('backdropBtnOff', en ? 'Off' : 'Aus');
    setTextById('labelBlurStrength', en ? 'Blur' : 'Unschärfe');
    setTextById('labelDimStrength', en ? 'Dimming' : 'Abdunklung');
    setTextById('settingRestoreClipTitle', en ? 'Preserve Clipboard' : 'Zwischenablage beibehalten');
    setTextById(
      'settingRestoreClipDesc',
      en
        ? 'Restore previously copied clipboard content after pasting'
        : 'Vorher kopierten Inhalt nach dem Einfügen wiederherstellen'
    );

    setTextById('settingsHeaderTriggers', en ? 'Shortcuts & Auto-Type' : 'Aufruf & Textersetzung');
    setTextById('settingDoubleTapTitle', en ? 'Double-tap Ctrl' : '2× kurz Strg drücken');
    setTextById(
      'settingDoubleTapDesc',
      en ? 'Opens SnapPhrase instantly from any app' : 'Öffnet SnapPhrase sofort aus jedem Programm'
    );
    setTextById('settingHotkeysTitle', en ? 'Global Hotkeys' : 'Tastenkürzel');
    setTextById(
      'settingHotkeysDesc',
      en
        ? 'Additional global keyboard shortcuts to open SnapPhrase'
        : 'Zusätzliche globale Tastenkombination zum Öffnen'
    );
    setTextById('settingHotstringsTitle', en ? 'Automatic Text Expansion' : 'Automatische Textersetzung');
    setTextById('settingPrefixTitle', en ? 'Trigger Prefix' : 'Auslöse-Präfix');
    setTextById(
      'settingPrefixDesc',
      en
        ? 'Prevents accidental expansion inside normal words'
        : 'Verhindert versehentliches Ersetzen mitten im Wort'
    );
    setTextById('prefixOpt1', en ? ';; (e.g. ;;br)' : ';; (z. B. ;;mfg)');
    setTextById('prefixOpt2', en ? '// (e.g. //br)' : '// (z. B. //mfg)');
    setTextById('prefixOpt3', en ? ':: (e.g. ::br)' : ':: (z. B. ::mfg)');
    setTextById('prefixOpt4', en ? '# (e.g. #br)' : '# (z. B. #mfg)');
    setTextById('prefixOptNone', en ? 'No prefix' : 'Ohne Präfix');

    setTextById('settingsHeaderVault', en ? 'Data & Security' : 'Daten & Tresor');
    setTextById('settingBackupTitle', en ? 'Backup & Restore Snippets' : 'Bausteine sichern & laden');
    setTextById(
      'settingBackupDesc',
      en
        ? 'Export all snippets to a backup file or import an existing one'
        : 'Alle Bausteine in einer Datei sichern oder wiederherstellen'
    );
    setTextById('btnImportLabel', en ? 'Import' : 'Importieren');
    setTextById('btnExportLabel', en ? 'Export' : 'Exportieren');
    if (btnOpenDataFolder) {
      btnOpenDataFolder.title = en
        ? 'Open local storage folder in Explorer'
        : 'Lokalen Speicherordner im Explorer öffnen';
    }
    setTextById('settingCryptoTitle', en ? 'Password Protection (AES-256)' : 'Passwortschutz (AES-256)');
    setTextById('btnLockFromSettingsLabel', en ? 'Lock' : 'Sperren');

    setTextById('settingsHeaderUpdate', en ? 'Software Update' : 'Softwareupdate');
    setTextById('settingAutoUpdateTitle', en ? 'Update automatically' : 'Automatisch aktualisieren');
    setTextById(
      'settingAutoUpdateDesc',
      en
        ? 'Download new versions in the background and install on exit'
        : 'Neue Versionen im Hintergrund laden und beim Beenden installieren'
    );
    if (btnCloseSettings) btnCloseSettings.textContent = en ? 'Done' : 'Fertig';

    // Unlock Modal
    setTextById('unlockModalTitle', en ? 'Unlock SnapPhrase' : 'SnapPhrase entsperren');
    setTextById(
      'unlockModalDesc',
      en
        ? 'Your database is encrypted. Please enter your master password:'
        : 'Die Datenbank ist verschlüsselt. Bitte gib dein Master-Passwort ein:'
    );
    if (unlockPassword) {
      unlockPassword.placeholder = en ? 'Enter master password...' : 'Master-Passwort eingeben...';
    }
    if (btnExitUnlock) btnExitUnlock.textContent = en ? 'Close' : 'Schließen';
    if (btnSubmitUnlock) btnSubmitUnlock.textContent = en ? 'Unlock' : 'Entsperren';

    // Crypto Modal
    if (tabChangePw) tabChangePw.textContent = en ? 'Change Password' : 'Passwort ändern';
    if (tabRemoveCrypto) tabRemoveCrypto.textContent = en ? 'Remove Protection' : 'Schutz aufheben';
    setTextById('labelCryptoNewPw', en ? 'New Master Password' : 'Neues Master-Passwort');
    if (cryptoNewPw) cryptoNewPw.placeholder = en ? 'Enter password...' : 'Passwort eingeben...';
    setTextById('labelCryptoConfirmPw', en ? 'Confirm Password' : 'Passwort wiederholen');
    if (cryptoConfirmPw) cryptoConfirmPw.placeholder = en ? 'Confirm password...' : 'Passwort bestätigen...';
    setTextById('labelCryptoOldPw', en ? 'Current Master Password' : 'Aktuelles Master-Passwort');
    if (cryptoOldPw) cryptoOldPw.placeholder = en ? 'Current password...' : 'Bisheriges Passwort...';
    setTextById('labelCryptoChangeNewPw', en ? 'New Master Password' : 'Neues Master-Passwort');
    if (cryptoChangeNewPw) cryptoChangeNewPw.placeholder = en ? 'New password...' : 'Neues Passwort...';
    setTextById('labelCryptoChangeConfirmPw', en ? 'Confirm New Password' : 'Neues Passwort wiederholen');
    if (cryptoChangeConfirmPw) {
      cryptoChangeConfirmPw.placeholder = en ? 'Confirm new password...' : 'Neues Passwort bestätigen...';
    }
    setTextById('labelCryptoCurrentPw', en ? 'Current Master Password' : 'Aktuelles Master-Passwort');
    if (cryptoCurrentPw) {
      cryptoCurrentPw.placeholder = en
        ? 'Enter master password to remove encryption...'
        : 'Master-Passwort zum Entfernen eingeben...';
    }
    if (btnCancelCrypto) btnCancelCrypto.textContent = en ? 'Cancel' : 'Abbrechen';
    if (btnApplyCrypto) btnApplyCrypto.textContent = en ? 'Confirm' : 'Bestätigen';

    if (!state.isRecordingHotkey && btnRecordHotkey) {
      btnRecordHotkey.textContent = en ? '+ Record shortcut' : '+ Kürzel aufnehmen';
    }

    syncSegmentedControls();
    updatePinUI();
    updateSecurityButtonsUI();
    updateHotstringUI();
    syncEditFavoriteButtonUI();
    renderActiveHotkeys();
    renderUpdateUI();
    renderedCategoriesKey = '';
    lastRenderedListKey = '';
    renderCategories();
    filterAndRender();
  }

  function computeEffectiveHotstring(rawKuerzel, prefix) {
    const k = String(rawKuerzel || '').trim();
    if (!k) return '';
    if (prefix && k.startsWith(prefix)) return k;
    if (/^([;/:!#$~]{1,2})/.test(k)) return k;
    return (prefix || '') + k;
  }

  function showConfirmDialog({
    title = isEn() ? 'Confirm' : 'Bestätigen',
    message = '',
    confirmText = 'OK',
    cancelText = isEn() ? 'Cancel' : 'Abbrechen',
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
      case 'updateData': {
        if (data.version) {
          state.version = data.version;
          versionTag.textContent = 'v' + data.version;
        }
        let langChanged = false;
        if (typeof data.language === 'string') {
          state.language = data.language;
        }
        if (typeof data.effectiveLanguage === 'string') {
          if (state.effectiveLanguage !== data.effectiveLanguage) {
            langChanged = true;
          }
          state.effectiveLanguage = data.effectiveLanguage;
        } else if (state.language === 'de' || state.language === 'en') {
          state.effectiveLanguage = state.language;
        }
        if (typeof data.isWindowsStore !== 'undefined') {
          state.isWindowsStore = !!data.isWindowsStore;
        }
        state.layoutMode = 'center';
        if (typeof data.isPinned !== 'undefined') {
          state.isPinned = !!data.isPinned;
        }
        if (typeof data.centerCompact !== 'undefined') {
          state.centerCompact = !!data.centerCompact;
        }
        if (typeof data.backdropMode === 'string') {
          state.backdropMode = data.backdropMode;
          state.dimBackground = data.backdropMode !== 'off';
          if (settingBackdropMode) settingBackdropMode.value = state.backdropMode;
        } else if (typeof data.dimBackground !== 'undefined') {
          state.dimBackground = !!data.dimBackground;
          state.backdropMode = state.dimBackground ? 'blur' : 'off';
          if (settingBackdropMode) settingBackdropMode.value = state.backdropMode;
        }
        if (settingDimBackground) settingDimBackground.checked = state.dimBackground;
        if (typeof data.backdropBlurPercent === 'number') {
          state.backdropBlurPercent = data.backdropBlurPercent;
        }
        if (typeof data.backdropDimPercent === 'number') {
          state.backdropDimPercent = data.backdropDimPercent;
        }
        if (typeof data.backdropSnapshot !== 'undefined') {
          applyBackdropSnapshot(data.backdropSnapshot);
        }
        if (data.insets) {
          applyWorkAreaInsets(data.insets);
        }
        updateLayoutUI();
        updatePinUI();
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
        if (Array.isArray(data.activeHotkeys)) {
          state.activeHotkeys = data.activeHotkeys;
        }
        if (data.snippets) {
          state.snippets = data.snippets;
          snippetsDataRevision++;
        }
        if (data.categories) {
          state.categories = data.categories;
          renderCategories();
        }
        if (data.updateState) {
          state.updateState = data.updateState;
          renderUpdateUI();
        }
        if (langChanged || data.type === 'init') {
          applyLanguageUI();
        } else {
          syncSegmentedControls();
          updateSecurityButtonsUI();
          updateHotstringUI();
          renderActiveHotkeys();
          filterAndRender();
        }
        break;
      }

      case 'updateStatus':
        if (data.updateState) {
          state.updateState = data.updateState;
          renderUpdateUI();
        }
        break;

      case 'updateInsets':
        if (typeof data.backdropBlurPercent === 'number') {
          state.backdropBlurPercent = data.backdropBlurPercent;
        }
        if (typeof data.backdropDimPercent === 'number') {
          state.backdropDimPercent = data.backdropDimPercent;
        }
        if (typeof data.backdropSnapshot !== 'undefined') {
          applyBackdropSnapshot(data.backdropSnapshot);
        }
        if (data.insets) {
          applyWorkAreaInsets(data.insets);
        }
        break;

      case 'prepareShow': {
        state.layoutMode = 'center';
        if (typeof data.isPinned !== 'undefined') state.isPinned = !!data.isPinned;
        if (typeof data.backdropMode === 'string') {
          state.backdropMode = data.backdropMode;
          state.dimBackground = data.backdropMode !== 'off';
          if (settingBackdropMode) settingBackdropMode.value = state.backdropMode;
        } else if (typeof data.dimBackground !== 'undefined') {
          state.dimBackground = !!data.dimBackground;
          state.backdropMode = state.dimBackground ? 'blur' : 'off';
          if (settingBackdropMode) settingBackdropMode.value = state.backdropMode;
        }
        if (settingDimBackground) settingDimBackground.checked = state.dimBackground;
        if (typeof data.backdropBlurPercent === 'number') {
          state.backdropBlurPercent = data.backdropBlurPercent;
        }
        if (typeof data.backdropDimPercent === 'number') {
          state.backdropDimPercent = data.backdropDimPercent;
        }
        if (typeof data.backdropSnapshot !== 'undefined') {
          applyBackdropSnapshot(data.backdropSnapshot);
        }
        if (typeof data.centerCompact !== 'undefined') state.centerCompact = !!data.centerCompact;
        if (typeof data.isLocked !== 'undefined') state.isLocked = !!data.isLocked;
        if (data.insets) applyWorkAreaInsets(data.insets);

        updateLayoutUI();
        updatePinUI();

        if (!state.isLocked && !data.skipDefaultFocus && !state.isPinned && !data.wasEffectivelyVisible) {
          closeAllModals();
          closeContextMenu();
          if (searchInput.value !== '') {
            searchInput.value = '';
          }
          state.selectedIndex = 0;
          filterAndRender();
        }

        if (data.waitAck) {
          document.body.classList.add('no-anim');
          document.body.classList.remove('window-visible', 'window-closing');
          if (appShell) {
            void appShell.offsetWidth;
          }
          const notifyReady = () => sendIPC('showPrepared', { seq: data.seq });
          if (
            state.backdropSnapshot &&
            state.backdropMode === 'blur' &&
            screenBackdropImg &&
            typeof screenBackdropImg.decode === 'function'
          ) {
            screenBackdropImg.decode().then(notifyReady, notifyReady);
          } else {
            notifyReady();
          }
        } else {
          triggerEntranceAnimation({
            shouldFocusDefault: !data.skipDefaultFocus,
            wasHidden: data.wasHidden !== false,
            wasEffectivelyVisible: !!data.wasEffectivelyVisible,
          });
        }
        break;
      }

      case 'startEntrance':
        requestAnimationFrame(() => {
          void document.body.offsetWidth;
          document.body.classList.remove('no-anim', 'window-closing');
          document.body.classList.add('window-visible');
          focusDefaultControl(!data.skipDefaultFocus);
        });
        break;

      case 'resetHiddenState':
        document.body.classList.add('no-anim');
        document.body.classList.remove('window-visible', 'window-closing');
        applyBackdropSnapshot(null);
        syncBodyClasses();
        break;

      case 'animateOut':
        document.body.classList.remove('no-anim');
        document.body.classList.add('window-closing');
        closeContextMenu();
        break;

      case 'openUnlock':
        openUnlockModal();
        break;

      case 'unlockSuccess':
        unlockModal.classList.remove('active');
        state.isLocked = false;
        updateSecurityButtonsUI();
        showToast(isEn() ? '✓ Unlocked' : '✓ Entsperrt');
        searchInput.value = '';
        searchInput.focus();
        break;

      case 'unlockError':
        unlockError.textContent =
          data.message || (isEn() ? 'Incorrect master password!' : 'Falsches Master-Passwort!');
        unlockPassword.select();
        break;

      case 'cryptoSuccess':
        cryptoModal.classList.remove('active');
        showToast(data.message || (isEn() ? '✓ Saved' : '✓ Gespeichert'));
        searchInput.focus();
        break;

      case 'cryptoError':
        cryptoError.textContent =
          data.message || (isEn() ? 'Encryption error.' : 'Fehler bei der Verschlüsselung.');
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
        showToast(
          data.message ||
            (data.success
              ? isEn()
                ? '✓ Saved'
                : '✓ Gespeichert'
              : isEn()
                ? 'Unavailable'
                : 'Nicht verfügbar')
        );
        break;

      case 'showToast':
        showToast(data.message || (isEn() ? '✓ Done' : '✓ Fertig'));
        break;

      case 'showAppAlert':
        showConfirmDialog({
          title: data.title || (isEn() ? 'Notice' : 'Hinweis'),
          message: data.message || '',
          confirmText: isEn() ? 'Got it' : 'Verstanden',
          showCancel: false,
        });
        break;
    }
  }

  function updateSecurityButtonsUI() {
    const en = isEn();
    const canLock = state.isEncrypted && !state.isLocked;
    if (btnLockNow) {
      btnLockNow.style.display = canLock ? 'flex' : 'none';
    }
    if (btnLockFromSettings) {
      btnLockFromSettings.style.display = canLock ? 'inline-flex' : 'none';
    }
    if (cryptoSettingsStatusDesc) {
      cryptoSettingsStatusDesc.textContent = state.isEncrypted
        ? en
          ? 'Active — Database is protected locally with a master password'
          : 'Aktiv — Datenbank ist lokal mit Master-Passwort geschützt'
        : en
          ? 'Encrypt your local snippet database with a master password'
          : 'Datenbank lokal mit einem Master-Passwort verschlüsseln';
      cryptoSettingsStatusDesc.classList.toggle('status-active', !!state.isEncrypted);
    }
    if (cryptoSettingsBtnLabel) {
      cryptoSettingsBtnLabel.textContent = state.isEncrypted
        ? en
          ? 'Manage…'
          : 'Verwalten…'
        : en
          ? 'Set up…'
          : 'Einrichten…';
    }
  }

  function updateEditKuerzelLiveBadge() {
    if (!editKuerzelLiveBadge || !editKuerzel) return;
    const en = isEn();
    const raw = editKuerzel.value.trim();
    if (!raw) {
      editKuerzelLiveBadge.textContent = 'Optional';
      editKuerzelLiveBadge.classList.remove('active');
      return;
    }
    if (state.hotstringsEnabled) {
      const eff = computeEffectiveHotstring(raw, state.hotstringPrefix);
      editKuerzelLiveBadge.textContent = en ? `Type ${eff}` : `Tippe ${eff}`;
      editKuerzelLiveBadge.classList.add('active');
    } else {
      editKuerzelLiveBadge.textContent = en ? `Search keyword: ${raw}` : `Suchkürzel: ${raw}`;
      editKuerzelLiveBadge.classList.add('active');
    }
  }

  function updateHotstringUI() {
    const en = isEn();
    const sampleShort = en ? 'br' : 'mfg';
    const ex = computeEffectiveHotstring(sampleShort, state.hotstringPrefix);
    if (hotstringStatusPill) {
      hotstringStatusPill.classList.toggle('active', state.hotstringsEnabled);
      const pillText = state.hotstringsEnabled
        ? en
          ? 'Auto-Type'
          : 'Auto-Tippen'
        : en
          ? 'Auto-Type off'
          : 'Auto-Tippen aus';
      if (hotstringStatusLabel) {
        hotstringStatusLabel.textContent = pillText;
      } else {
        hotstringStatusPill.textContent = pillText;
      }
      hotstringStatusPill.title = state.hotstringsEnabled
        ? en
          ? `Automatic text expansion active (e.g. ${ex}) — Click to pause`
          : `Automatische Textersetzung aktiv (z. B. ${ex}) — Klicken zum Pausieren`
        : en
          ? 'Automatic text expansion is paused — Click to enable'
          : 'Automatische Textersetzung ist pausiert — Klicken zum Aktivieren';
    }
    if (settingHotstringsEnabled) {
      settingHotstringsEnabled.checked = state.hotstringsEnabled;
    }
    if (settingHotstringPrefix) {
      settingHotstringPrefix.value = state.hotstringPrefix;
    }
    if (hotstringPrefixRow) {
      hotstringPrefixRow.style.opacity = state.hotstringsEnabled ? '1' : '0.45';
      hotstringPrefixRow.style.pointerEvents = state.hotstringsEnabled ? 'auto' : 'none';
    }
    if (hotstringDescPreview) {
      hotstringDescPreview.textContent = en
        ? `Expands triggers like ${ex} automatically while typing`
        : `Ersetzt Kürzel wie ${ex} direkt während des Tippens`;
    }
    if (editKuerzel) {
      editKuerzel.placeholder = state.hotstringPrefix
        ? en
          ? `e.g. ${sampleShort} (becomes ${ex})`
          : `z. B. ${sampleShort} (wird zu ${ex})`
        : en
          ? `e.g. ;;${sampleShort}`
          : `z. B. ;;${sampleShort}`;
    }
    updateEditKuerzelLiveBadge();
  }

  function formatHotkeyLabel(acc) {
    const en = isEn();
    return String(acc || '')
      .split('+')
      .map((part) => {
        const p = part.trim();
        if (p === 'Control' || p === 'CommandOrControl') return en ? 'Ctrl' : 'Strg';
        if (p === 'Shift') return en ? 'Shift' : 'Umschalt';
        if (p === 'Super' || p === 'Meta') return 'Win';
        if (p === 'Space') return en ? 'Space' : 'Leertaste';
        if (p === 'ScrollLock') return en ? 'ScrollLock' : 'Rollen';
        if (p === 'Insert') return en ? 'Ins' : 'Einfg';
        if (p === 'Delete') return en ? 'Del' : 'Entf';
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
    const en = isEn();

    if (!state.activeHotkeys || state.activeHotkeys.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'hotkey-empty-hint';
      empty.textContent = en ? 'No shortcut active' : 'Kein Tastenkürzel aktiv';
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
      removeBtn.title = en ? `Remove ${formatHotkeyLabel(acc)}` : `${formatHotkeyLabel(acc)} entfernen`;
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
      btnRecordHotkey.textContent = isEn()
        ? 'Press keys… (Esc = Cancel)'
        : 'Taste drücken… (Esc = Abbruch)';
      btnRecordHotkey.focus();
    }
    sendIPC('pauseHotkeys', { paused: true });
  }

  function stopHotkeyRecording(notifyBackend = true) {
    const wasRecording = state.isRecordingHotkey;
    state.isRecordingHotkey = false;
    if (btnRecordHotkey) {
      btnRecordHotkey.classList.remove('recording');
      btnRecordHotkey.textContent = isEn() ? '+ Record shortcut' : '+ Kürzel aufnehmen';
    }
    if (wasRecording && notifyBackend) {
      sendIPC('pauseHotkeys', { paused: false });
    }
  }

  function buildAcceleratorFromKeyEvent(e) {
    const en = isEn();
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
        reason: en
          ? '⚠️ The Pause key is not supported as a global hotkey on Windows.'
          : '⚠️ Die Pause-Taste wird unter Windows nicht als globales Kürzel unterstützt.',
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
        reason: en
          ? '⚠️ This special key cannot be used as a global shortcut.'
          : '⚠️ Diese Sondertaste kann nicht als globales Kürzel verwendet werden.',
      };
    }

    const safeStandalone =
      /^F([1-9]|1[0-9]|2[0-4])$/.test(mainKey) ||
      mainKey === 'ScrollLock' ||
      mainKey === 'Insert';

    if (!safeStandalone && !hasCtrl && !hasAlt && !hasMeta) {
      return {
        status: 'needs_modifier',
        reason: en
          ? '⚠️ Please combine with Ctrl or Alt (or use an F-key / ScrollLock).'
          : '⚠️ Bitte mit Strg oder Alt kombinieren (oder F-Taste / Rollen nutzen).',
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

  function syncSegmentedControls() {
    if (languageSegmented) {
      const langVal = state.language || 'auto';
      languageSegmented.querySelectorAll('[data-lang-val]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.langVal === langVal);
      });
    }
    if (themeSegmented) {
      themeSegmented.querySelectorAll('[data-theme-val]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.themeVal === state.theme);
      });
    }
    const bMode = state.backdropMode || (state.dimBackground ? 'blur' : 'off');
    if (backdropSegmented) {
      backdropSegmented.querySelectorAll('[data-backdrop-val]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.backdropVal === bMode);
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.className = theme === 'light' ? 'light' : 'dark';
    if (settingTheme) settingTheme.value = theme;
    syncSegmentedControls();
  }

  function applyWorkAreaInsets(insets) {
    if (!insets) return;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--wa-top', `${Math.max(0, Number(insets.top) || 0)}px`);
    rootStyle.setProperty('--wa-right', `${Math.max(0, Number(insets.right) || 0)}px`);
    rootStyle.setProperty('--wa-bottom', `${Math.max(0, Number(insets.bottom) || 0)}px`);
    rootStyle.setProperty('--wa-left', `${Math.max(0, Number(insets.left) || 0)}px`);
  }

  function applyBackdropSnapshot(snapshotUrl) {
    state.backdropSnapshot = snapshotUrl || null;
    if (screenBackdropImg) {
      if (state.backdropSnapshot) {
        if (screenBackdropImg.getAttribute('src') !== state.backdropSnapshot) {
          screenBackdropImg.setAttribute('src', state.backdropSnapshot);
        }
      } else {
        screenBackdropImg.removeAttribute('src');
      }
    }
  }

  function renderBackdropTuneUI() {
    const rawBlur = Number(state.backdropBlurPercent);
    const blurPct = Math.max(0, Math.min(100, Math.round(Number.isNaN(rawBlur) ? 65 : rawBlur)));
    const blurPx = blurPct <= 0 ? 0 : Math.round((blurPct / 100) * 36 * 10) / 10;
    const rawDim = Number(state.backdropDimPercent);
    const dimPct = Math.max(0, Math.min(90, Math.round(Number.isNaN(rawDim) ? 60 : rawDim)));
    const dimAlpha = dimPct / 100;
    const dimEdgeAlpha = Math.min(0.94, dimAlpha * 1.14);
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--backdrop-blur-px', `${blurPx}px`);
    rootStyle.setProperty('--backdrop-scale', (1 + blurPx * 0.0045).toFixed(4));
    rootStyle.setProperty('--backdrop-dim-alpha', dimAlpha.toFixed(3));
    rootStyle.setProperty('--backdrop-dim-edge-alpha', dimEdgeAlpha.toFixed(3));

    if (backdropBlurConfigPanel) {
      const showTune = (state.backdropMode || 'blur') === 'blur';
      backdropBlurConfigPanel.classList.toggle('hidden', !showTune);
    }
    if (settingBackdropBlurPercent && document.activeElement !== settingBackdropBlurPercent) {
      settingBackdropBlurPercent.value = String(blurPct);
    }
    if (backdropBlurPercentValue) {
      backdropBlurPercentValue.textContent = `${blurPct} %`;
    }
    if (settingBackdropDimPercent && document.activeElement !== settingBackdropDimPercent) {
      settingBackdropDimPercent.value = String(dimPct);
    }
    if (backdropDimPercentValue) {
      backdropDimPercentValue.textContent = `${dimPct} %`;
    }
  }

  function syncBodyClasses() {
    const cl = document.body.classList;
    cl.add('mode-center');
    cl.remove('backdrop-blur', 'backdrop-solid', 'backdrop-off');
    const bMode = state.backdropMode || (state.dimBackground ? 'blur' : 'off');
    cl.add('backdrop-' + bMode);
    cl.toggle('has-backdrop-snapshot', Boolean(state.backdropSnapshot));
    cl.toggle('is-pinned', !!state.isPinned);
    cl.toggle('no-dim', bMode === 'off');
    cl.toggle('center-compact', !!state.centerCompact);
    syncSegmentedControls();
    renderBackdropTuneUI();
  }

  function updateWidthToggleButtonUI() {
    if (!btnToggleWidth) return;
    const en = isEn();
    const isCompact = !!state.centerCompact;
    btnToggleWidth.classList.remove('active');
    if (iconShrinkWindow) iconShrinkWindow.style.display = isCompact ? 'none' : 'block';
    if (iconExpandWindow) iconExpandWindow.style.display = isCompact ? 'block' : 'none';
    btnToggleWidth.title = isCompact
      ? en
        ? 'Switch to large view (1120×780)'
        : 'Großansicht (1120×780) aktivieren'
      : en
        ? 'Switch to compact view (580×380)'
        : 'Kompaktansicht (580×380) aktivieren';
  }

  function updateLayoutUI() {
    syncBodyClasses();
    updateWidthToggleButtonUI();
  }

  function updatePinUI() {
    syncBodyClasses();
    const en = isEn();
    if (btnPinWindow) {
      btnPinWindow.classList.toggle('active', !!state.isPinned);
      btnPinWindow.title = state.isPinned
        ? en
          ? '📌 SnapPhrase is pinned on top (Ctrl+P or click to unpin)'
          : '📌 SnapPhrase ist im Vordergrund fixiert (Strg+P oder Klicken zum Lösen)'
        : en
          ? 'Pin SnapPhrase on top (Ctrl+P)'
          : 'SnapPhrase dauerhaft im Vordergrund fixieren (Strg+P)';
    }
    updateWidthToggleButtonUI();
  }

  function focusDefaultControl(shouldFocusDefault) {
    if (!shouldFocusDefault) return;
    if (state.isLocked || unlockModal.classList.contains('active')) {
      unlockPassword.focus();
    } else if (
      !promptModal.classList.contains('active') &&
      !managerModal.classList.contains('active') &&
      !settingsModal.classList.contains('active') &&
      !cryptoModal.classList.contains('active') &&
      !confirmModal.classList.contains('active')
    ) {
      searchInput.focus();
    }
  }

  function triggerEntranceAnimation({
    shouldFocusDefault = true,
    wasHidden = true,
    wasEffectivelyVisible = false,
  } = {}) {
    if (state.isPinned || wasEffectivelyVisible || !wasHidden) {
      document.body.classList.remove('no-anim', 'window-closing');
      document.body.classList.add('window-visible');
      focusDefaultControl(shouldFocusDefault);
      return;
    }

    document.body.classList.add('no-anim');
    document.body.classList.remove('window-visible', 'window-closing');
    if (appShell) {
      void appShell.offsetWidth;
    }

    requestAnimationFrame(() => {
      document.body.classList.remove('no-anim');
      document.body.classList.add('window-visible');
      focusDefaultControl(shouldFocusDefault);
    });
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
    const en = isEn();
    const y = parseInt(ts.substring(0, 4), 10);
    const m = parseInt(ts.substring(4, 6), 10) - 1;
    const d = parseInt(ts.substring(6, 8), 10);
    const h = parseInt(ts.substring(8, 10), 10);
    const min = parseInt(ts.substring(10, 12), 10);
    const date = new Date(y, m, d, h, min);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return en ? 'Just now' : 'Gerade eben';
    if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      return en ? `${mins}m ago` : `vor ${mins} Min`;
    }
    if (diffSec < 86400) {
      const hrs = Math.floor(diffSec / 3600);
      return en ? `${hrs}h ago` : `vor ${hrs} Std`;
    }
    if (diffSec < 172800) return en ? 'Yesterday' : 'Gestern';
    const days = Math.floor(diffSec / 86400);
    if (days < 30) return en ? `${days}d ago` : `vor ${days} Tagen`;
    return en
      ? `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : `${String(d).padStart(2, '0')}.${String(m + 1).padStart(2, '0')}.${y}`;
  }

  // Categories rendering
  let renderedCategoriesKey = '';
  if (categoriesBar) {
    categoriesBar.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          categoriesBar.scrollLeft += e.deltaY;
        }
      },
      { passive: false }
    );
  }

  function renderCategories() {
    const en = isEn();
    const baseCategoryConfig = {
      '[ Alle ]': {
        label: en ? 'All' : 'Alle',
        svg: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect></svg>',
      },
      '[ ⭐ Favoriten ]': {
        label: en ? 'Favorites' : 'Favoriten',
        svg: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
      },
      '[ 🕒 Zuletzt ]': {
        label: en ? 'Recent' : 'Zuletzt',
        svg: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>',
      },
    };

    if (!state.categories.includes(state.activeCategory)) {
      state.activeCategory = '[ Alle ]';
    }

    const nextKey = `${state.effectiveLanguage}|${JSON.stringify(state.categories)}`;
    if (nextKey === renderedCategoriesKey && categoriesBar.children.length > 0) {
      Array.from(categoriesBar.children).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.cat === state.activeCategory);
      });
      return;
    }
    renderedCategoriesKey = nextKey;

    const pillFrag = document.createDocumentFragment();
    state.categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'category-pill' + (cat === state.activeCategory ? ' active' : '');
      btn.dataset.cat = cat;
      const preset = baseCategoryConfig[cat];
      if (preset) {
        btn.innerHTML = preset.svg;
        const lbl = document.createElement('span');
        lbl.textContent = preset.label;
        btn.appendChild(lbl);
      } else {
        btn.textContent = cat;
      }
      btn.addEventListener('click', () => {
        state.activeCategory = cat;
        Array.from(categoriesBar.children).forEach((p) =>
          p.classList.toggle('active', p === btn)
        );
        state.selectedIndex = 0;
        filterAndRender();
      });
      pillFrag.appendChild(btn);
    });
    categoriesBar.replaceChildren(pillFrag);

    if (categoriesDatalist) {
      const optFrag = document.createDocumentFragment();
      state.categories.forEach((cat) => {
        if (!cat.startsWith('[')) {
          const opt = document.createElement('option');
          opt.value = cat;
          optFrag.appendChild(opt);
        }
      });
      categoriesDatalist.replaceChildren(optFrag);
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

  let snippetsDataRevision = 0;
  let lastRenderedListKey = '';
  let renderedSelectedCardIndex = -1;

  function renderList() {
    const en = isEn();
    const rawQuery = searchInput.value.trim().toLowerCase();
    const nextListKey = `${snippetsDataRevision}|${state.effectiveLanguage}|${state.activeCategory}|${rawQuery}|${state.hotstringsEnabled ? '1' : '0'}|${state.hotstringPrefix}`;

    if (state.filteredSnippets.length === 0) {
      renderedSelectedCardIndex = -1;
      if (lastRenderedListKey === nextListKey && snippetList.querySelector('.empty-state')) {
        return;
      }
      lastRenderedListKey = nextListKey;

      const wrap = document.createElement('div');
      wrap.className = 'empty-state';

      const titleEl = document.createElement('div');
      titleEl.className = 'empty-title';

      const hintEl = document.createElement('div');
      hintEl.className = 'empty-hint';

      const actionsEl = document.createElement('div');
      actionsEl.className = 'empty-actions';

      if (state.snippets.length === 0) {
        titleEl.textContent = en ? 'No snippets yet' : 'Noch keine Bausteine vorhanden';
        hintEl.textContent = en
          ? 'Create your first text snippet or import an existing backup file.'
          : 'Lege deinen ersten Satzbaustein an oder übernimm eine vorhandene Sicherungsdatei.';

        const btnCreateFirst = document.createElement('button');
        btnCreateFirst.type = 'button';
        btnCreateFirst.className = 'btn btn-primary btn-compact-action';
        btnCreateFirst.textContent = en ? '+ Create snippet' : '+ Baustein anlegen';
        btnCreateFirst.addEventListener('click', () => openManager(null));

        const btnImportFirst = document.createElement('button');
        btnImportFirst.type = 'button';
        btnImportFirst.className = 'btn btn-secondary btn-compact-action';
        btnImportFirst.textContent = en ? 'Import…' : 'Importieren…';
        btnImportFirst.addEventListener('click', () => sendIPC('importDialog'));

        actionsEl.appendChild(btnCreateFirst);
        actionsEl.appendChild(btnImportFirst);
      } else if (rawQuery !== '') {
        titleEl.textContent = en ? 'No matching snippets' : 'Keine passenden Bausteine';
        hintEl.textContent = en
          ? `No matches found for "${searchInput.value.trim()}".`
          : `Für „${searchInput.value.trim()}“ wurden keine Treffer gefunden.`;

        const btnReset = document.createElement('button');
        btnReset.type = 'button';
        btnReset.className = 'btn btn-secondary btn-compact-action';
        btnReset.textContent = en ? 'Reset search' : 'Suche zurücksetzen';
        btnReset.addEventListener('click', () => {
          searchInput.value = '';
          state.activeCategory = '[ Alle ]';
          renderCategories();
          filterAndRender();
          searchInput.focus();
        });
        actionsEl.appendChild(btnReset);
      } else if (state.activeCategory === '[ ⭐ Favoriten ]') {
        titleEl.textContent = en ? 'No favorites marked yet' : 'Noch keine Favoriten markiert';
        hintEl.textContent = en
          ? 'Click the star icon on any snippet to pin it here for quick access.'
          : 'Klicke auf den Stern links neben einem Baustein, um ihn hier für den Schnellzugriff anzuheften.';
      } else if (state.activeCategory === '[ 🕒 Zuletzt ]') {
        titleEl.textContent = en ? 'No recent history yet' : 'Noch kein Verlauf';
        hintEl.textContent = en
          ? 'Recently pasted snippets will appear automatically in this view.'
          : 'Zuletzt eingefügte Bausteine erscheinen automatisch in dieser Ansicht.';
      } else {
        titleEl.textContent = en
          ? 'No snippets in this category'
          : 'Keine Bausteine in dieser Kategorie';
        hintEl.textContent = en
          ? 'Choose another category or click "New" above to create a snippet.'
          : 'Wähle eine andere Kategorie oder lege oben über „Neu“ einen Baustein an.';
      }

      wrap.appendChild(titleEl);
      wrap.appendChild(hintEl);
      if (actionsEl.children.length > 0) {
        wrap.appendChild(actionsEl);
      }
      snippetList.replaceChildren(wrap);
      return;
    }

    if (
      lastRenderedListKey === nextListKey &&
      snippetList.children.length === state.filteredSnippets.length
    ) {
      updateCardSelection(false);
      return;
    }
    lastRenderedListKey = nextListKey;
    renderedSelectedCardIndex = -1;

    const frag = document.createDocumentFragment();

    state.filteredSnippets.forEach((item, index) => {
      const isSelected = index === state.selectedIndex;
      if (isSelected) renderedSelectedCardIndex = index;

      const card = document.createElement('div');
      card.className = 'snippet-card' + (isSelected ? ' selected' : '');
      card.dataset.index = index;

      // Favorite Star Button
      const starBtn = document.createElement('button');
      starBtn.className = 'card-fav-btn' + (item.favorite ? ' active' : '');
      starBtn.title = item.favorite
        ? en
          ? 'Remove from favorites'
          : 'Aus Favoriten entfernen'
        : en
          ? 'Add to favorites'
          : 'Zu Favoriten hinzufügen';
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
          ? en
            ? `Type "${effTrigger}" to expand automatically`
            : `Tippe "${effTrigger}" zum automatischen Ersetzen`
          : en
            ? `Search keyword "${item.kuerzel}" (Auto-Type disabled)`
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
        updateCardSelection(false);
        handleSnippetAction(item);
      });

      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        state.selectedIndex = index;
        updateCardSelection(false);
        openContextMenu(e.clientX, e.clientY, item);
      });

      frag.appendChild(card);
    });

    snippetList.replaceChildren(frag);
    if (state.selectedIndex === 0) {
      snippetList.scrollTop = 0;
    } else {
      scrollSelectedIntoView(false);
    }
  }

  function updateCardSelection(smoothScroll = false) {
    if (
      renderedSelectedCardIndex >= 0 &&
      renderedSelectedCardIndex !== state.selectedIndex &&
      snippetList.children[renderedSelectedCardIndex]
    ) {
      snippetList.children[renderedSelectedCardIndex].classList.remove('selected');
    }

    const nextCard = snippetList.children[state.selectedIndex];
    if (nextCard && nextCard.classList.contains('snippet-card')) {
      nextCard.classList.add('selected');
      renderedSelectedCardIndex = state.selectedIndex;
    }

    scrollSelectedIntoView(smoothScroll);
  }

  function scrollSelectedIntoView(smooth = false) {
    const selected = snippetList.children[state.selectedIndex];
    if (!selected || !selected.classList.contains('snippet-card')) return;

    if (state.selectedIndex === 0) {
      if (snippetList.scrollTop > 0) {
        snippetList.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      }
      return;
    }

    const containerRect = snippetList.getBoundingClientRect();
    const cardRect = selected.getBoundingClientRect();
    const pad = 8;

    if (cardRect.top < containerRect.top + pad) {
      const delta = cardRect.top - (containerRect.top + pad);
      snippetList.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
    } else if (cardRect.bottom > containerRect.bottom - pad) {
      const delta = cardRect.bottom - (containerRect.bottom - pad);
      snippetList.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
    }
  }

  // Snippet Action
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
      showToast(isEn() ? '✓ Inserted' : '✓ Eingefügt');
    }
  }

  function handleSnippetCopyOnly(item) {
    if (!item) return;
    sendIPC('copyToClipboardOnly', {
      title: item.title,
      text: item.content || '',
    });
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
    const en = isEn();
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
        const isMultiline = /text|nachricht|inhalt|grund|multi|message|body|notes|reason/i.test(f.name);
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
        inputElem.placeholder = en ? `Enter ${f.name}...` : `${f.name} eingeben...`;
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
    showToast(isEn() ? '✓ Inserted' : '✓ Eingefügt');
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

  // Context Menu (positioned relative to transformed .app-shell)
  function openContextMenu(clientX, clientY, item) {
    const en = isEn();
    state.contextMenuSnippet = item;
    if (ctxFavoriteLabel) {
      ctxFavoriteLabel.textContent = item.favorite
        ? en
          ? 'Remove from favorites'
          : 'Aus Favoriten entfernen'
        : en
          ? 'Mark as favorite'
          : 'Als Favorit markieren';
    }
    const favSvg = ctxFavorite ? ctxFavorite.querySelector('svg') : null;
    if (favSvg) {
      favSvg.setAttribute('fill', item.favorite ? 'currentColor' : 'none');
    }

    const shellRect = appShell
      ? appShell.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    const menuWidth = contextMenu.offsetWidth || 195;
    const menuHeight = contextMenu.offsetHeight || 225;

    const relX = clientX - shellRect.left;
    const relY = clientY - shellRect.top;

    const clampedX = Math.max(8, Math.min(relX, shellRect.width - menuWidth - 8));
    const clampedY = Math.max(8, Math.min(relY, shellRect.height - menuHeight - 8));

    contextMenu.style.left = `${Math.round(clampedX)}px`;
    contextMenu.style.top = `${Math.round(clampedY)}px`;
    contextMenu.classList.add('active');
  }

  function closeContextMenu() {
    contextMenu.classList.remove('active');
    state.contextMenuSnippet = null;
  }

  // Safe Pointer-Down Tracking
  let lastPointerDownTarget = null;
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastPointerDownTarget = e.target;
    },
    true
  );

  window.addEventListener('click', (e) => {
    if (contextMenu.classList.contains('active') && !contextMenu.contains(e.target)) {
      closeContextMenu();
    }

    if (e.target !== lastPointerDownTarget) return;

    // 1. Click outside .app-shell on the dimmed screen backdrop
    if (e.target === screenStage || e.target === screenBackdrop) {
      if (state.isPinned) return;
      if (managerModal.classList.contains('active') && isManagerDirty()) {
        nudgeModal(managerModal);
        editTitle.focus();
        return;
      }
      stopHotkeyRecording(true);
      closeAllModals();
      sendIPC('dismissOverlay');
      return;
    }

    // 2. Click on internal modal scrim (.modal-overlay around .modal-box)
    if (e.target === confirmModal) {
      resolveConfirmModal(false);
    } else if (e.target === settingsModal) {
      stopHotkeyRecording(true);
      settingsModal.classList.remove('active');
      searchInput.focus();
    } else if (e.target === cryptoModal) {
      cryptoModal.classList.remove('active');
      searchInput.focus();
    } else if (e.target === promptModal) {
      cancelPrompt();
    } else if (e.target === managerModal) {
      if (isManagerDirty()) {
        nudgeModal(managerModal);
      } else {
        managerModal.classList.remove('active');
        searchInput.focus();
      }
    }
  });

  if (ctxInsert) {
    ctxInsert.addEventListener('click', () => {
      const target = state.contextMenuSnippet;
      closeContextMenu();
      if (target) {
        handleSnippetAction(target);
      }
    });
  }

  ctxCopy.addEventListener('click', () => {
    if (state.contextMenuSnippet) {
      handleSnippetCopyOnly(state.contextMenuSnippet);
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
    const en = isEn();
    const confirmed = await showConfirmDialog({
      title: en ? 'Delete snippet' : 'Baustein löschen',
      message: en
        ? `Are you sure you want to permanently delete "${target.title}"?`
        : `Möchtest du den Baustein „${target.title}“ wirklich unwiderruflich löschen?`,
      confirmText: en ? 'Delete' : 'Löschen',
      danger: true,
    });
    if (confirmed) {
      sendIPC('deleteSnippet', { title: target.title });
    }
  });

  // Manager Modal
  function captureManagerSnapshot() {
    return JSON.stringify({
      title: editTitle.value,
      kuerzel: editKuerzel.value,
      category: editCategory.value,
      content: editContent.value,
      favorite: editFavorite.checked,
    });
  }

  function isManagerDirty() {
    if (!managerModal.classList.contains('active') || !state.managerInitialSnapshot) {
      return false;
    }
    return captureManagerSnapshot() !== state.managerInitialSnapshot;
  }

  function nudgeModal(modalEl) {
    if (!modalEl) return;
    const box = modalEl.querySelector('.modal-box');
    if (!box) return;
    box.classList.remove('nudge');
    void box.offsetWidth;
    box.classList.add('nudge');
    setTimeout(() => box.classList.remove('nudge'), 260);
  }

  function syncEditFavoriteButtonUI() {
    if (!btnToggleEditFavorite) return;
    const en = isEn();
    const fav = !!editFavorite.checked;
    btnToggleEditFavorite.classList.toggle('active', fav);
    if (editFavoriteLabel) {
      editFavoriteLabel.textContent = fav
        ? en
          ? 'Favorite active'
          : 'Favorit aktiv'
        : en
          ? 'Mark Favorite'
          : 'Als Favorit';
    }
  }

  if (btnToggleEditFavorite) {
    btnToggleEditFavorite.addEventListener('click', () => {
      editFavorite.checked = !editFavorite.checked;
      syncEditFavoriteButtonUI();
    });
  }

  if (editKuerzel) {
    editKuerzel.addEventListener('input', updateEditKuerzelLiveBadge);
  }

  function openManager(snippet = null) {
    closeContextMenu();
    const en = isEn();
    if (snippet) {
      managerTitle.textContent = en ? 'Edit snippet' : 'Baustein bearbeiten';
      editOriginalTitle.value = snippet.title;
      editTitle.value = snippet.title;
      editKuerzel.value = snippet.kuerzel || '';
      editCategory.value = snippet.category || '';
      editContent.value = snippet.content || '';
      editFavorite.checked = !!snippet.favorite;
      btnDeleteSnippet.style.display = 'inline-flex';
      btnDuplicateFromManager.style.display = 'inline-flex';
    } else {
      managerTitle.textContent = en ? 'Create new snippet' : 'Neuen Baustein anlegen';
      editOriginalTitle.value = '';
      editTitle.value = '';
      editKuerzel.value = '';
      editCategory.value = state.activeCategory.startsWith('[') ? '' : state.activeCategory;
      editContent.value = '';
      editFavorite.checked = false;
      btnDeleteSnippet.style.display = 'none';
      btnDuplicateFromManager.style.display = 'none';
    }

    syncEditFavoriteButtonUI();
    updateHotstringUI();
    state.managerInitialSnapshot = captureManagerSnapshot();
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
    const en = isEn();
    const confirmed = await showConfirmDialog({
      title: en ? 'Delete snippet' : 'Baustein löschen',
      message: en
        ? `Are you sure you want to permanently delete "${title}"?`
        : `Möchtest du den Baustein „${title}“ wirklich unwiderruflich löschen?`,
      confirmText: en ? 'Delete' : 'Löschen',
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
    const en = isEn();
    const cleanTitle = editTitle.value.replace(/[\r\n\[\]]/g, ' ').trim();
    if (!cleanTitle) {
      await showConfirmDialog({
        title: en ? 'Missing title' : 'Titel fehlt',
        message: en
          ? 'Please enter a title for this snippet.'
          : 'Bitte gib einen Titel für den Satzbaustein ein.',
        confirmText: en ? 'Got it' : 'Verstanden',
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
        title: en ? 'Overwrite snippet?' : 'Baustein überschreiben?',
        message: en
          ? `A snippet named "${collision.title}" already exists. Do you want to overwrite it?`
          : `Ein Baustein mit dem Namen „${collision.title}“ existiert bereits. Möchtest du ihn überschreiben?`,
        confirmText: en ? 'Overwrite' : 'Überschreiben',
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
    if (settingBackdropMode) settingBackdropMode.value = state.backdropMode || 'blur';
    if (settingDimBackground) settingDimBackground.checked = state.dimBackground;
    if (settingRestoreClipboard) settingRestoreClipboard.checked = state.restoreClipboard;
    if (settingDoubleTapCtrl) settingDoubleTapCtrl.checked = state.doubleTapCtrlEnabled;
    syncSegmentedControls();
    updateHotstringUI();
    renderActiveHotkeys();
    updateSecurityButtonsUI();
    renderUpdateUI();
    settingsModal.classList.add('active');
  }

  if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
      stopHotkeyRecording(true);
      settingsModal.classList.remove('active');
      searchInput.focus();
    });
  }

  if (languageSegmented) {
    languageSegmented.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lang-val]');
      if (!btn) return;
      const nextLang = btn.dataset.langVal;
      if (!nextLang || nextLang === state.language) return;
      state.language = nextLang;
      state.effectiveLanguage = nextLang === 'auto' ? detectBrowserLanguage() : nextLang;
      applyLanguageUI();
      sendIPC('setLanguage', { language: nextLang });
    });
  }

  if (settingAutostart) {
    settingAutostart.addEventListener('change', (e) => {
      sendIPC('setAutostart', { enabled: e.target.checked });
    });
  }

  if (themeSegmented) {
    themeSegmented.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme-val]');
      if (!btn) return;
      const nextTheme = btn.dataset.themeVal;
      if (!nextTheme || nextTheme === state.theme) return;
      state.theme = nextTheme;
      applyTheme(state.theme);
      sendIPC('setTheme', { theme: nextTheme });
    });
  }

  if (settingTheme) {
    settingTheme.addEventListener('change', (e) => {
      state.theme = e.target.value;
      applyTheme(state.theme);
      sendIPC('setTheme', { theme: e.target.value });
    });
  }

  if (backdropSegmented) {
    backdropSegmented.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-backdrop-val]');
      if (!btn) return;
      const nextMode = btn.dataset.backdropVal;
      if (!nextMode || nextMode === state.backdropMode) return;
      state.backdropMode = nextMode;
      state.dimBackground = state.backdropMode !== 'off';
      syncBodyClasses();
      sendIPC('setBackdropMode', { mode: state.backdropMode });
    });
  }

  if (settingBackdropMode) {
    settingBackdropMode.addEventListener('change', (e) => {
      state.backdropMode = e.target.value;
      state.dimBackground = state.backdropMode !== 'off';
      syncBodyClasses();
      sendIPC('setBackdropMode', { mode: state.backdropMode });
    });
  }

  let blurPctDebounceTimer = null;
  if (settingBackdropBlurPercent) {
    const parseBlurInput = (raw) => {
      const parsed = parseInt(raw, 10);
      return Math.max(0, Math.min(100, Number.isNaN(parsed) ? 65 : parsed));
    };
    settingBackdropBlurPercent.addEventListener('input', (e) => {
      const pct = parseBlurInput(e.target.value);
      state.backdropBlurPercent = pct;
      renderBackdropTuneUI();
      if (blurPctDebounceTimer) clearTimeout(blurPctDebounceTimer);
      blurPctDebounceTimer = setTimeout(() => {
        sendIPC('setBackdropBlurPercent', { blurPercent: pct });
      }, 90);
    });
    settingBackdropBlurPercent.addEventListener('change', (e) => {
      if (blurPctDebounceTimer) clearTimeout(blurPctDebounceTimer);
      const pct = parseBlurInput(e.target.value);
      state.backdropBlurPercent = pct;
      renderBackdropTuneUI();
      sendIPC('setBackdropBlurPercent', { blurPercent: pct });
    });
  }

  let dimPctDebounceTimer = null;
  if (settingBackdropDimPercent) {
    const parseDimInput = (raw) => {
      const parsed = parseInt(raw, 10);
      return Math.max(0, Math.min(90, Number.isNaN(parsed) ? 60 : parsed));
    };
    settingBackdropDimPercent.addEventListener('input', (e) => {
      const pct = parseDimInput(e.target.value);
      state.backdropDimPercent = pct;
      renderBackdropTuneUI();
      if (dimPctDebounceTimer) clearTimeout(dimPctDebounceTimer);
      dimPctDebounceTimer = setTimeout(() => {
        sendIPC('setBackdropDimPercent', { dimPercent: pct });
      }, 90);
    });
    settingBackdropDimPercent.addEventListener('change', (e) => {
      if (dimPctDebounceTimer) clearTimeout(dimPctDebounceTimer);
      const pct = parseDimInput(e.target.value);
      state.backdropDimPercent = pct;
      renderBackdropTuneUI();
      sendIPC('setBackdropDimPercent', { dimPercent: pct });
    });
  }

  if (settingDimBackground) {
    settingDimBackground.addEventListener('change', (e) => {
      state.dimBackground = e.target.checked;
      syncBodyClasses();
      sendIPC('setDimBackground', { enabled: e.target.checked });
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
  if (btnExportData) btnExportData.addEventListener('click', () => sendIPC('exportDialog'));
  if (btnOpenDataFolder) btnOpenDataFolder.addEventListener('click', () => sendIPC('openDataFolder'));

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

  function renderUpdateUI() {
    const en = isEn();
    const u = state.updateState;
    const ver = (u && u.currentVersion) || state.version;
    if (updateStatusHeadline) {
      updateStatusHeadline.textContent = `SnapPhrase v${ver}`;
    }

    if (!u) return;

    if (settingAutoUpdate) {
      settingAutoUpdate.checked = !!u.autoUpdateEnabled;
    }
    if (settingUpdateRepo && document.activeElement !== settingUpdateRepo) {
      settingUpdateRepo.value = u.repoSlug || '';
    }

    if (u.status === 'store-managed' || state.isWindowsStore) {
      if (updateReadyPill) updateReadyPill.style.display = 'none';
      if (updateProgressWrap) updateProgressWrap.style.display = 'none';
      if (autoUpdateToggleRow) autoUpdateToggleRow.style.display = 'none';
      if (btnUpdateAction) btnUpdateAction.style.display = 'none';
      if (updateStatusDesc) {
        updateStatusDesc.textContent = en
          ? 'Updates are managed automatically via Microsoft Store'
          : 'Updates erfolgen automatisch über den Microsoft Store';
      }
      return;
    }

    if (autoUpdateToggleRow) autoUpdateToggleRow.style.display = 'flex';
    if (btnUpdateAction) btnUpdateAction.style.display = 'inline-flex';

    const isReadyToInstall = u.status === 'downloaded' || u.status === 'portable-available';
    if (updateReadyPill && updateReadyLabel) {
      if (isReadyToInstall && u.availableVersion) {
        updateReadyLabel.textContent =
          u.status === 'portable-available'
            ? en
              ? `Download v${u.availableVersion}`
              : `Update v${u.availableVersion} laden`
            : en
              ? `Update v${u.availableVersion} – Restart`
              : `Update v${u.availableVersion} – Neu starten`;
        updateReadyPill.style.display = 'inline-flex';
      } else {
        updateReadyPill.style.display = 'none';
      }
    }

    if (updateProgressWrap && updateProgressBar) {
      if (u.status === 'downloading') {
        updateProgressWrap.style.display = 'block';
        updateProgressBar.style.width = `${Math.max(4, Math.min(100, u.percent || 0))}%`;
      } else {
        updateProgressWrap.style.display = 'none';
        updateProgressBar.style.width = '0%';
      }
    }

    if (!updateStatusDesc || !btnUpdateAction) return;

    btnUpdateAction.disabled = false;
    btnUpdateAction.classList.remove('ready');

    switch (u.status) {
      case 'unconfigured':
        updateStatusDesc.textContent = en
          ? 'Configure GitHub repository (owner/SnapPhrase) to enable updates'
          : 'GitHub-Quelle (name/SnapPhrase) hinterlegen, um Updates zu aktivieren';
        btnUpdateAction.textContent = en ? 'Check now' : 'Jetzt prüfen';
        break;
      case 'checking':
        updateStatusDesc.textContent = en
          ? 'Checking GitHub for new releases…'
          : 'Suche nach neuen Versionen auf GitHub…';
        btnUpdateAction.textContent = en ? 'Checking…' : 'Prüfe…';
        btnUpdateAction.disabled = true;
        break;
      case 'available':
        updateStatusDesc.textContent = en
          ? `New version v${u.availableVersion} available`
          : `Neue Version v${u.availableVersion} verfügbar`;
        btnUpdateAction.textContent = en ? 'Download' : 'Herunterladen';
        btnUpdateAction.classList.add('ready');
        break;
      case 'downloading':
        updateStatusDesc.textContent = en
          ? `Downloading update v${u.availableVersion || ''} in background (${u.percent || 0}%)…`
          : `Update v${u.availableVersion || ''} wird im Hintergrund geladen (${u.percent || 0} %)…`;
        btnUpdateAction.textContent = en ? 'Downloading…' : 'Lädt…';
        btnUpdateAction.disabled = true;
        break;
      case 'downloaded':
        updateStatusDesc.textContent = en
          ? `Version v${u.availableVersion} downloaded — ready to install`
          : `Version v${u.availableVersion} geladen — bereit zur sofortigen Installation`;
        btnUpdateAction.textContent = en ? 'Restart now' : 'Jetzt neu starten';
        btnUpdateAction.classList.add('ready');
        break;
      case 'portable-available':
        updateStatusDesc.textContent = en
          ? `New version v${u.availableVersion} available on GitHub`
          : `Neue Version v${u.availableVersion} auf GitHub verfügbar`;
        btnUpdateAction.textContent = en ? 'Download' : 'Herunterladen';
        btnUpdateAction.classList.add('ready');
        break;
      case 'up-to-date':
        updateStatusDesc.textContent = en
          ? `SnapPhrase v${ver} is up to date`
          : `SnapPhrase v${ver} ist auf dem neuesten Stand`;
        btnUpdateAction.textContent = en ? 'Check now' : 'Jetzt prüfen';
        break;
      case 'error':
        updateStatusDesc.textContent =
          u.errorMessage || (en ? 'Update check failed' : 'Update-Prüfung fehlgeschlagen');
        btnUpdateAction.textContent = en ? 'Retry' : 'Erneut prüfen';
        break;
      default:
        updateStatusDesc.textContent = u.autoUpdateEnabled
          ? en
            ? `Automatic background updates active (${u.repoSlug})`
            : `Automatische Hintergrund-Updates aktiv (${u.repoSlug})`
          : en
            ? 'Automatic updates paused'
            : 'Automatische Updates pausiert';
        btnUpdateAction.textContent = en ? 'Check now' : 'Jetzt prüfen';
        break;
    }
  }

  if (updateReadyPill) {
    updateReadyPill.addEventListener('click', () => {
      sendIPC('installUpdateNow');
    });
  }

  if (btnUpdateAction) {
    btnUpdateAction.addEventListener('click', () => {
      const st = state.updateState?.status;
      if (st === 'downloaded' || st === 'portable-available' || st === 'available') {
        sendIPC('installUpdateNow');
      } else {
        sendIPC('checkForUpdates');
      }
    });
  }

  if (settingAutoUpdate) {
    settingAutoUpdate.addEventListener('change', (e) => {
      sendIPC('setAutoUpdateEnabled', { enabled: e.target.checked });
    });
  }

  if (btnSaveUpdateRepo && settingUpdateRepo) {
    const saveRepo = () => {
      sendIPC('setUpdateRepo', { repo: settingUpdateRepo.value.trim() });
    };
    btnSaveUpdateRepo.addEventListener('click', saveRepo);
    settingUpdateRepo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        saveRepo();
      }
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
      unlockError.textContent = isEn() ? 'Please enter your password!' : 'Bitte Passwort eingeben!';
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
    const en = isEn();
    state.cryptoMode = mode;
    cryptoError.textContent = '';

    encryptFields.style.display = mode === 'encrypt' ? 'block' : 'none';
    changePwFields.style.display = mode === 'change' ? 'block' : 'none';
    decryptFields.style.display = mode === 'remove' ? 'block' : 'none';

    if (tabChangePw) tabChangePw.classList.toggle('active', mode === 'change');
    if (tabRemoveCrypto) tabRemoveCrypto.classList.toggle('active', mode === 'remove');

    if (mode === 'encrypt') {
      cryptoModalTitle.textContent = en ? 'Encrypt Database' : 'Datenbank verschlüsseln';
      cryptoStatusDesc.textContent = en
        ? 'Protect your snippets with strong AES-256-CBC PBKDF2 encryption:'
        : 'Schütze deine Satzbausteine mit starker AES-256-CBC PBKDF2 Verschlüsselung:';
      cryptoNewPw.value = '';
      cryptoConfirmPw.value = '';
      setTimeout(() => cryptoNewPw.focus(), 40);
    } else if (mode === 'change') {
      cryptoModalTitle.textContent = en ? 'Manage Encryption' : 'Verschlüsselung verwalten';
      cryptoStatusDesc.textContent = en
        ? 'Change your master password without writing unencrypted data to disk:'
        : 'Ändere dein Master-Passwort ohne Entschlüsselung auf der Festplatte:';
      cryptoOldPw.value = '';
      cryptoChangeNewPw.value = '';
      cryptoChangeConfirmPw.value = '';
      setTimeout(() => cryptoOldPw.focus(), 40);
    } else {
      cryptoModalTitle.textContent = en ? 'Remove Encryption' : 'Verschlüsselung aufheben';
      cryptoStatusDesc.textContent = en
        ? 'Enter your current master password to permanently remove password protection:'
        : 'Gib dein aktuelles Master-Passwort ein, um den Passwortschutz dauerhaft zu entfernen:';
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
    const en = isEn();
    cryptoError.textContent = '';

    if (state.cryptoMode === 'encrypt') {
      const p1 = cryptoNewPw.value;
      const p2 = cryptoConfirmPw.value;
      if (!p1) {
        cryptoError.textContent = en ? 'Password cannot be empty!' : 'Passwort darf nicht leer sein!';
        cryptoNewPw.focus();
        return;
      }
      if (p1 !== p2) {
        cryptoError.textContent = en ? 'Passwords do not match!' : 'Passwörter stimmen nicht überein!';
        cryptoConfirmPw.focus();
        return;
      }
      sendIPC('encryptDatabase', { password: p1 });
    } else if (state.cryptoMode === 'change') {
      const oldPw = cryptoOldPw.value;
      const newPw = cryptoChangeNewPw.value;
      const confirmPw = cryptoChangeConfirmPw.value;
      if (!oldPw) {
        cryptoError.textContent = en
          ? 'Please enter your current password!'
          : 'Bitte aktuelles Passwort eingeben!';
        cryptoOldPw.focus();
        return;
      }
      if (!newPw) {
        cryptoError.textContent = en
          ? 'New password cannot be empty!'
          : 'Neues Passwort darf nicht leer sein!';
        cryptoChangeNewPw.focus();
        return;
      }
      if (newPw !== confirmPw) {
        cryptoError.textContent = en
          ? 'New passwords do not match!'
          : 'Neue Passwörter stimmen nicht überein!';
        cryptoChangeConfirmPw.focus();
        return;
      }
      sendIPC('changePassword', { currentPassword: oldPw, newPassword: newPw });
    } else {
      const pw = cryptoCurrentPw.value;
      if (!pw) {
        cryptoError.textContent = en ? 'Please enter your password!' : 'Bitte Passwort eingeben!';
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
        showToast(isEn() ? 'Recording cancelled' : 'Aufnahme abgebrochen');
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

    // Ctrl+P: Toggle Pin window on top
    if (e.key.toLowerCase() === 'p' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendIPC('togglePin');
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

    // Ctrl+C (when no text is selected in search input): Copy selected snippet to clipboard
    if (e.key.toLowerCase() === 'c' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const hasSearchSelection =
        document.activeElement === searchInput &&
        searchInput.selectionStart !== searchInput.selectionEnd;
      if (!hasSearchSelection && state.filteredSnippets.length > 0) {
        e.preventDefault();
        handleSnippetCopyOnly(state.filteredSnippets[state.selectedIndex]);
        return;
      }
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
        const prev = state.selectedIndex;
        state.selectedIndex = (state.selectedIndex + 1) % state.filteredSnippets.length;
        const wrapped = state.selectedIndex < prev;
        updateCardSelection(!e.repeat && !wrapped);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.filteredSnippets.length > 0) {
        const prev = state.selectedIndex;
        state.selectedIndex =
          (state.selectedIndex - 1 + state.filteredSnippets.length) % state.filteredSnippets.length;
        const wrapped = state.selectedIndex > prev;
        updateCardSelection(!e.repeat && !wrapped);
      }
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      if (state.filteredSnippets.length > 0) {
        handleSnippetCopyOnly(state.filteredSnippets[state.selectedIndex]);
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
    try {
      const params = new URLSearchParams(window.location.search || '');
      const initialTheme = params.get('theme');
      if (initialTheme === 'light' || initialTheme === 'dark') {
        state.theme = initialTheme;
        applyTheme(initialTheme);
      }
      const initialLang = params.get('lang');
      if (initialLang === 'de' || initialLang === 'en') {
        state.effectiveLanguage = initialLang;
      }
    } catch (e) {}
    syncBodyClasses();
    applyLanguageUI();
    sendIPC('ready');
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
