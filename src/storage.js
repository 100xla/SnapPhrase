/**
 * SatzTresor v1.3.0 — Storage & INI Database Engine
 * Handles atomic file operations, smart hash-verified rolling backups, INI serialization,
 * AES-256-CBC database encryption (lock & password change), JSON/CSV/INI import/export,
 * debounced usage persistence, and application settings.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AES256 = require('./crypto');

const SETTINGS_SECTION = '__SatzTresorSettings__';
const LEGACY_QT_SECTION = '__QuickTabSettings__';
const LEGACY_SECTION = '__TabsmartSettings__';

const UI_SETTING_KEYS = [
  'LayoutMode',
  'IsPinned',
  'SidebarWidth',
  'Theme',
  'DoubleTapCtrlEnabled',
  'EdgeTabEnabled',
  'EdgeTabYPercent',
  'HotstringsEnabled',
  'HotstringPrefix',
  'RestoreClipboard',
  'ActiveHotkeys',
];

function escapeIniValue(str) {
  if (typeof str !== 'string') str = String(str || '');
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

function unescapeIniValue(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\\\/g, '\u0000')
    .replace(/\\n/g, '\n')
    .replace(/\u0000/g, '\\')
    .replace(/\{n\}/gi, '\n');
}

function hashBufferOrString(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Strips leaked legacy INI metadata attributes ONLY when repairing old unescaped INI sections.
 */
function repairLegacyLeakedMetadata(rawContent, sectionMap = null) {
  if (!rawContent || typeof rawContent !== 'string' || !sectionMap) return rawContent || '';
  const lines = rawContent.split(/\r?\n/);
  const cleanLines = [];
  const metadataKeys = [
    'usagecount', 'aufrufe', 'workspace', 'arbeitsbereich', 'kategorie',
    'lastused', 'zuletzt', 'favorit', 'kuerzel', 'hotstring', 'shortcut',
  ];

  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const possibleKey = line.slice(0, eqIdx).trim();
      const lowerKey = possibleKey.toLowerCase();
      if (metadataKeys.includes(lowerKey) && !sectionMap.has(possibleKey)) {
        sectionMap.set(possibleKey, line.slice(eqIdx + 1).trim());
        continue;
      }
    }
    cleanLines.push(line);
  }
  return cleanLines.join('\n');
}

class Storage {
  constructor(filePath) {
    this.filePath = filePath;
    this.backupDir = path.join(path.dirname(filePath), 'backups');
    this.data = new Map(); // Section -> Map(Key -> Value)
    this.cachedSettings = new Map(); // Preserves UI layout/theme settings while locked
    this.isEncrypted = false;
    this.encryptionVersion = 2;
    this.rawCipher = null;
    this.masterPassword = '';
    this.isLocked = false;
    this._saveTimer = null;
  }

  init() {
    if (!fs.existsSync(this.filePath)) {
      this.createDefaultDatabase();
      this.save();
      return;
    }

    this.createRollingBackup();

    const raw = fs.readFileSync(this.filePath, 'utf8');

    if (raw.startsWith('STENC2:') || raw.startsWith('QTENC2:') || raw.startsWith('TSENC2:')) {
      this.isEncrypted = true;
      this.isLocked = true;
      this.encryptionVersion = 2;
      this.rawCipher = raw.substring(7).trim();
    } else if (raw.startsWith('STENC:') || raw.startsWith('QTENC:') || raw.startsWith('TSENC:')) {
      this.isEncrypted = true;
      this.isLocked = true;
      this.encryptionVersion = 1;
      this.rawCipher = raw.substring(6).trim();
    } else {
      this.isEncrypted = false;
      this.isLocked = false;
      this.parseIni(raw);
    }
  }

  createDefaultDatabase() {
    this.data.clear();

    const addSnippet = (title, kuerzel, category, content, fav = '0') => {
      const map = new Map();
      map.set('Inhalt', content);
      map.set('Kuerzel', kuerzel);
      map.set('Arbeitsbereich', category);
      map.set('Aufrufe', '0');
      map.set('Zuletzt', '');
      map.set('Favorit', fav);
      this.data.set(title, map);
    };

    addSnippet(
      'Mit freundlichen Grüßen',
      'mfg',
      'E-Mail',
      'Mit freundlichen Grüßen,\n{cursor}',
      '1'
    );
    addSnippet(
      'Terminbestätigung',
      'termin',
      'E-Mail',
      'Sehr geehrte/r {?Anrede=Frau|Herr|Guten Tag} {?Name},\n\nvielen Dank für das Gespräch. Hiermit bestätige ich unseren Termin am {?Datum} um {?Uhrzeit} Uhr.\n\nMit freundlichen Grüßen,\n{cursor}',
      '1'
    );
    addSnippet(
      'Standard-Signatur',
      'sig',
      'Signatur',
      'Dein Name\nTelefon: +49 123 456789\nE-Mail: name@beispiel.de',
      '0'
    );

    // Default settings for fresh installations
    const settings = new Map();
    settings.set('LayoutMode', 'sidebar_left');
    settings.set('Theme', 'dark');
    settings.set('DoubleTapCtrlEnabled', '1');
    settings.set('EdgeTabEnabled', '1');
    settings.set('EdgeTabYPercent', '42');
    settings.set('HotstringsEnabled', '1');
    settings.set('HotstringPrefix', ';;');
    settings.set('RestoreClipboard', '1');
    settings.set('ActiveHotkeys', 'Control+Space');
    this.data.set(SETTINGS_SECTION, settings);
    this._syncCachedSettings();
  }

  _syncCachedSettings() {
    for (const key of UI_SETTING_KEYS) {
      const val = this._readRawSetting(key);
      if (val !== null) {
        this.cachedSettings.set(key, val);
      }
    }
  }

  _readRawSetting(key) {
    if (this.data.has(SETTINGS_SECTION) && this.data.get(SETTINGS_SECTION).has(key)) {
      return this.data.get(SETTINGS_SECTION).get(key);
    }
    if (this.data.has(LEGACY_QT_SECTION) && this.data.get(LEGACY_QT_SECTION).has(key)) {
      return this.data.get(LEGACY_QT_SECTION).get(key);
    }
    if (this.data.has(LEGACY_SECTION) && this.data.get(LEGACY_SECTION).has(key)) {
      return this.data.get(LEGACY_SECTION).get(key);
    }
    return null;
  }

  createRollingBackup() {
    try {
      if (!fs.existsSync(this.filePath)) return;

      const currentRaw = fs.readFileSync(this.filePath);
      if (currentRaw.length === 0) return;
      const currentHash = hashBufferOrString(currentRaw);

      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      const existingBackups = fs.readdirSync(this.backupDir)
        .filter((f) => f.startsWith('bausteine_') && f.endsWith('.bak'))
        .sort();

      // Skip backup if content is identical to latest rolling backup
      if (existingBackups.length > 0) {
        const latestPath = path.join(this.backupDir, existingBackups[existingBackups.length - 1]);
        try {
          const latestRaw = fs.readFileSync(latestPath);
          if (hashBufferOrString(latestRaw) === currentHash) {
            return;
          }
        } catch (e) {}
      }

      // 1. Direct .bak copy
      fs.copyFileSync(this.filePath, this.filePath + '.bak');

      // 2. Timestamped backup in backups/
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const bakName = `bausteine_${timestamp}.bak`;
      fs.copyFileSync(this.filePath, path.join(this.backupDir, bakName));
      existingBackups.push(bakName);

      // 3. Keep maximum 5 rolling backups
      while (existingBackups.length > 5) {
        const oldest = existingBackups.shift();
        try {
          fs.unlinkSync(path.join(this.backupDir, oldest));
        } catch (e) {}
      }
    } catch (err) {
      console.error('[Storage] Backup error:', err);
    }
  }

  unlock(password) {
    if (!this.isEncrypted || !this.isLocked) {
      return { success: true };
    }

    try {
      const decrypted = AES256.decrypt(this.rawCipher, password, this.encryptionVersion);
      const isSatzTresor = decrypted.startsWith('SatzTresorVerifiedMasterKey:');
      const isQuickTab = decrypted.startsWith('QuickTabVerifiedMasterKey:');
      const isTabsmart = decrypted.startsWith('TabsmartVerifiedMasterKey:');

      if (!isSatzTresor && !isQuickTab && !isTabsmart) {
        return { success: false, error: 'Falsches Master-Passwort!' };
      }

      this.masterPassword = password;
      this.isLocked = false;

      const prefixLen = isSatzTresor ? 28 : 26;
      const plainIni = decrypted.substring(prefixLen);
      this.parseIni(plainIni);

      // Upgrade legacy encryption to STENC2 automatically
      if (this.encryptionVersion !== 2 || !isSatzTresor) {
        this.encryptionVersion = 2;
        this.save();
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Falsches Master-Passwort!' };
    }
  }

  lock() {
    if (!this.isEncrypted) {
      return { success: false, error: 'Datenbank ist nicht verschlüsselt.' };
    }
    if (this.isLocked) {
      return { success: true };
    }

    this.flushSave();
    this._syncCachedSettings();
    this.masterPassword = '';
    this.data.clear();
    this.isLocked = true;
    return { success: true };
  }

  changePassword(currentPassword, newPassword) {
    if (!this.isEncrypted || this.isLocked) {
      return { success: false, error: 'Datenbank muss entsperrt und verschlüsselt sein.' };
    }
    if (!currentPassword || currentPassword !== this.masterPassword) {
      return { success: false, error: 'Aktuelles Master-Passwort ist falsch!' };
    }
    if (!newPassword || newPassword.length < 1) {
      return { success: false, error: 'Neues Passwort darf nicht leer sein!' };
    }

    this.masterPassword = newPassword;
    this.encryptionVersion = 2;
    this.save();
    return { success: true };
  }

  parseIni(iniStr) {
    this.data.clear();
    let currentSection = null;
    let lastKey = null;
    let hadLegacyContinuation = false;

    const lines = iniStr.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) continue;

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1).trim();
        lastKey = null;
        if (!this.data.has(currentSection)) {
          this.data.set(currentSection, new Map());
        }
      } else if (currentSection) {
        const eqIndex = line.indexOf('=');
        if (eqIndex !== -1) {
          const key = line.slice(0, eqIndex).trim();
          const val = line.slice(eqIndex + 1);
          this.data.get(currentSection).set(key, unescapeIniValue(val));
          lastKey = key;
        } else if (lastKey && (lastKey.toLowerCase() === 'inhalt' || lastKey.toLowerCase() === 'content')) {
          hadLegacyContinuation = true;
          const prev = this.data.get(currentSection).get(lastKey) || '';
          this.data.get(currentSection).set(lastKey, prev + '\n' + unescapeIniValue(line));
        }
      }
    }

    if (hadLegacyContinuation) {
      this._repairLegacySnippets();
    }
    this._syncCachedSettings();
  }

  _repairLegacySnippets() {
    let changed = false;
    for (const [section, keys] of this.data.entries()) {
      if (!section || this.isReservedSection(section)) continue;
      const contentKey = keys.has('Inhalt') ? 'Inhalt' : (keys.has('Content') ? 'Content' : null);
      if (contentKey) {
        const raw = keys.get(contentKey);
        const cleaned = repairLegacyLeakedMetadata(raw, keys);
        if (cleaned !== raw) {
          keys.set(contentKey, cleaned);
          changed = true;
        }
      }
    }
    if (changed) {
      this.save();
    }
  }

  serializeIni() {
    let out = '';
    for (const [section, keys] of this.data.entries()) {
      const safeSection = String(section).replace(/[\r\n\[\]]/g, ' ').trim();
      if (!safeSection) continue;
      out += `[${safeSection}]\r\n`;
      for (const [k, v] of keys.entries()) {
        out += `${k}=${escapeIniValue(v)}\r\n`;
      }
      out += '\r\n';
    }
    return out;
  }

  scheduleSave(delayMs = 2000) {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save();
    }, delayMs);
  }

  flushSave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this.save();
    }
  }

  save() {
    if (this.isLocked) return;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }

    this._syncCachedSettings();
    const plain = this.serializeIni();
    let fileContent = plain;

    if (this.isEncrypted && this.masterPassword) {
      const cipher = AES256.encrypt('SatzTresorVerifiedMasterKey:' + plain, this.masterPassword);
      fileContent = 'STENC2:' + cipher;
      this.rawCipher = cipher;
    }

    const parentDir = path.dirname(this.filePath);
    if (!fs.existsSync(parentDir)) {
      try {
        fs.mkdirSync(parentDir, { recursive: true });
      } catch (e) {}
    }

    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tmpPath, fileContent, 'utf8');

      let renamed = false;
      try {
        fs.renameSync(tmpPath, this.filePath);
        renamed = true;
      } catch (renameErr) {
        // Fallback direct write if cloud-sync temporarily locks target rename
        fs.writeFileSync(this.filePath, fileContent, 'utf8');
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (e) {}
        renamed = true;
      }
    } catch (err) {
      console.error('[Storage] Save error:', err);
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch (e) {}
    }
  }

  isReservedSection(name) {
    return name === SETTINGS_SECTION || name === LEGACY_QT_SECTION || name === LEGACY_SECTION;
  }

  hasSnippet(title) {
    const clean = String(title || '').replace(/[\r\n\[\]]/g, ' ').trim();
    return !!clean && !this.isReservedSection(clean) && this.data.has(clean);
  }

  getSnippets() {
    if (this.isLocked) return [];
    const list = [];
    for (const [section, keys] of this.data.entries()) {
      if (!section || this.isReservedSection(section)) continue;

      const content = keys.get('Inhalt') || keys.get('Content') || '';
      const kuerzel = keys.get('Kuerzel') || keys.get('Hotstring') || keys.get('Shortcut') || '';
      const category = keys.get('Arbeitsbereich') || keys.get('Kategorie') || keys.get('Workspace') || '';
      const usageCount = parseInt(keys.get('Aufrufe') || keys.get('UsageCount') || '0', 10);
      const lastUsed = keys.get('Zuletzt') || keys.get('LastUsed') || '';
      const favorite = keys.get('Favorit') === '1';

      list.push({
        title: section,
        content,
        kuerzel,
        category,
        usageCount: isNaN(usageCount) ? 0 : usageCount,
        lastUsed,
        favorite,
      });
    }
    return list;
  }

  getCategories() {
    const categories = ['[ Alle ]', '[ ⭐ Favoriten ]', '[ 🕒 Zuletzt ]'];
    if (this.isLocked) return categories;
    const seen = new Set(categories);

    for (const [section, keys] of this.data.entries()) {
      if (!section || this.isReservedSection(section)) continue;
      const cat = keys.get('Arbeitsbereich') || keys.get('Kategorie') || keys.get('Workspace') || '';
      if (cat && !seen.has(cat)) {
        seen.add(cat);
        categories.push(cat);
      }
    }
    return categories;
  }

  saveSnippet({ oldTitle, title, kuerzel = '', category = '', content = '', favorite = undefined }) {
    if (this.isLocked) return false;
    const cleanTitle = String(title || '').replace(/[\r\n\[\]]/g, ' ').trim();
    if (!cleanTitle || this.isReservedSection(cleanTitle)) return false;

    let existingFav = favorite !== undefined ? (favorite ? '1' : '0') : '0';
    let existingAufrufe = '0';
    let existingZuletzt = '';

    if (oldTitle && oldTitle !== cleanTitle && this.data.has(oldTitle)) {
      const oldMap = this.data.get(oldTitle);
      if (favorite === undefined) existingFav = oldMap.get('Favorit') || '0';
      existingAufrufe = oldMap.get('Aufrufe') || oldMap.get('UsageCount') || '0';
      existingZuletzt = oldMap.get('Zuletzt') || oldMap.get('LastUsed') || '';
      this.data.delete(oldTitle);
    } else if (this.data.has(cleanTitle)) {
      const currentMap = this.data.get(cleanTitle);
      if (favorite === undefined) existingFav = currentMap.get('Favorit') || '0';
      existingAufrufe = currentMap.get('Aufrufe') || currentMap.get('UsageCount') || '0';
      existingZuletzt = currentMap.get('Zuletzt') || currentMap.get('LastUsed') || '';
    }

    const map = new Map();
    map.set('Inhalt', String(content || ''));
    map.set('Kuerzel', String(kuerzel || '').trim());
    map.set('Arbeitsbereich', String(category || '').trim());
    map.set('Aufrufe', existingAufrufe);
    map.set('Zuletzt', existingZuletzt);
    map.set('Favorit', existingFav);

    this.data.set(cleanTitle, map);
    this.save();
    return true;
  }

  deleteSnippet(title) {
    if (this.isLocked) return false;
    const cleanTitle = (title || '').trim();
    if (cleanTitle && this.data.has(cleanTitle)) {
      this.data.delete(cleanTitle);
      this.save();
      return true;
    }
    return false;
  }

  toggleFavorite(title) {
    if (this.isLocked) return false;
    const cleanTitle = (title || '').trim();
    if (!cleanTitle || !this.data.has(cleanTitle)) return false;

    const map = this.data.get(cleanTitle);
    const isFav = map.get('Favorit') === '1';
    const next = isFav ? '0' : '1';
    map.set('Favorit', next);
    this.save();
    return next === '1';
  }

  duplicateSnippet(title) {
    if (this.isLocked) return null;
    const cleanTitle = (title || '').trim();
    if (!cleanTitle || !this.data.has(cleanTitle)) return null;

    const source = this.data.get(cleanTitle);
    let newTitle = `${cleanTitle} (Kopie)`;
    let counter = 2;
    while (this.data.has(newTitle)) {
      newTitle = `${cleanTitle} (Kopie ${counter})`;
      counter++;
    }

    const baseKuerzel = source.get('Kuerzel') || source.get('Shortcut') || '';
    const copyMap = new Map();
    copyMap.set('Inhalt', source.get('Inhalt') || source.get('Content') || '');
    copyMap.set('Kuerzel', baseKuerzel ? `${baseKuerzel}_2` : '');
    copyMap.set('Arbeitsbereich', source.get('Arbeitsbereich') || source.get('Workspace') || source.get('Kategorie') || '');
    copyMap.set('Aufrufe', '0');
    copyMap.set('Zuletzt', '');
    copyMap.set('Favorit', source.get('Favorit') || '0');

    this.data.set(newTitle, copyMap);
    this.save();
    return newTitle;
  }

  incrementUsage(title) {
    if (this.isLocked) return;
    const cleanTitle = (title || '').trim();
    if (!cleanTitle || !this.data.has(cleanTitle)) return;

    const map = this.data.get(cleanTitle);
    const currentCount = parseInt(map.get('Aufrufe') || map.get('UsageCount') || '0', 10);
    map.set('Aufrufe', String((isNaN(currentCount) ? 0 : currentCount) + 1));

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    map.set('Zuletzt', ts);

    // Debounce disk write & encryption so pasting stays instantaneous
    this.scheduleSave(2000);
  }

  getSetting(key, defaultVal = '') {
    if (!this.isLocked) {
      const val = this._readRawSetting(key);
      if (val !== null) return val;
    }
    if (this.cachedSettings.has(key)) {
      return this.cachedSettings.get(key);
    }
    return defaultVal;
  }

  setSetting(key, val) {
    const strVal = String(val);
    this.cachedSettings.set(key, strVal);
    if (this.isLocked) return;

    if (!this.data.has(SETTINGS_SECTION)) {
      this.data.set(SETTINGS_SECTION, new Map());
    }
    this.data.get(SETTINGS_SECTION).set(key, strVal);
    this.save();
  }

  getLayoutMode() {
    return this.getSetting('LayoutMode', 'sidebar_left');
  }

  setLayoutMode(mode) {
    this.setSetting('LayoutMode', mode);
  }

  getDoubleTapCtrlEnabled() {
    return this.getSetting('DoubleTapCtrlEnabled', '1') === '1';
  }

  setDoubleTapCtrlEnabled(enabled) {
    this.setSetting('DoubleTapCtrlEnabled', enabled ? '1' : '0');
  }

  getEdgeTabEnabled() {
    return this.getSetting('EdgeTabEnabled', '1') === '1';
  }

  setEdgeTabEnabled(enabled) {
    this.setSetting('EdgeTabEnabled', enabled ? '1' : '0');
  }

  getEdgeTabYPercent() {
    const val = parseFloat(this.getSetting('EdgeTabYPercent', '42'));
    if (isNaN(val)) return 42;
    return Math.max(8, Math.min(92, val));
  }

  setEdgeTabYPercent(pct) {
    const clamped = Math.max(8, Math.min(92, Math.round(Number(pct) || 42)));
    this.setSetting('EdgeTabYPercent', String(clamped));
  }

  isPinned() {
    return this.getSetting('IsPinned', '0') === '1';
  }

  setPinned(pinned) {
    this.setSetting('IsPinned', pinned ? '1' : '0');
  }

  getSidebarWidth() {
    const val = parseInt(this.getSetting('SidebarWidth', '440'), 10);
    return isNaN(val) || val < 280 || val > 800 ? 440 : val;
  }

  setSidebarWidth(width) {
    this.setSetting('SidebarWidth', String(width));
  }

  getTheme() {
    return this.getSetting('Theme', 'dark');
  }

  setTheme(theme) {
    this.setSetting('Theme', theme);
  }

  getHotstringsEnabled() {
    return this.getSetting('HotstringsEnabled', '1') === '1';
  }

  setHotstringsEnabled(enabled) {
    this.setSetting('HotstringsEnabled', enabled ? '1' : '0');
  }

  getHotstringPrefix() {
    return this.getSetting('HotstringPrefix', ';;');
  }

  setHotstringPrefix(prefix) {
    const allowed = [';;', '//', '::', '#', ''];
    const clean = allowed.includes(prefix) ? prefix : ';;';
    this.setSetting('HotstringPrefix', clean);
  }

  getRestoreClipboard() {
    return this.getSetting('RestoreClipboard', '1') === '1';
  }

  setRestoreClipboard(enabled) {
    this.setSetting('RestoreClipboard', enabled ? '1' : '0');
  }

  getActiveHotkeys() {
    const raw = this.getSetting('ActiveHotkeys', 'Control+Space');
    if (!raw.trim()) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  setActiveHotkeys(hotkeysArray) {
    const clean = Array.isArray(hotkeysArray)
      ? hotkeysArray.map((s) => String(s).trim()).filter(Boolean).join(',')
      : String(hotkeysArray || '');
    this.setSetting('ActiveHotkeys', clean);
  }

  encryptDatabase(newPassword) {
    if (!newPassword || this.isLocked) return false;
    this.masterPassword = newPassword;
    this.isEncrypted = true;
    this.isLocked = false;
    this.encryptionVersion = 2;

    // Purge unencrypted plaintext backups for security
    try {
      if (fs.existsSync(this.backupDir)) {
        const files = fs.readdirSync(this.backupDir);
        for (const f of files) {
          const p = path.join(this.backupDir, f);
          try {
            const head = fs.readFileSync(p, 'utf8').substring(0, 10);
            if (!head.startsWith('STENC') && !head.startsWith('QTENC') && !head.startsWith('TSENC')) {
              fs.unlinkSync(p);
            }
          } catch (e) {}
        }
      }
      if (fs.existsSync(this.filePath + '.bak')) {
        const bakHead = fs.readFileSync(this.filePath + '.bak', 'utf8').substring(0, 10);
        if (!bakHead.startsWith('STENC') && !bakHead.startsWith('QTENC') && !bakHead.startsWith('TSENC')) {
          fs.unlinkSync(this.filePath + '.bak');
        }
      }
    } catch (e) {
      console.error('[Storage] Error cleaning plaintext backups:', e);
    }

    this.save();
    return true;
  }

  decryptDatabase(password) {
    if (this.isLocked) return false;
    if (this.masterPassword && password !== this.masterPassword) {
      return false;
    }
    this.isEncrypted = false;
    this.isLocked = false;
    this.masterPassword = '';
    this.save();
    return true;
  }

  exportSnippets(targetPath) {
    if (this.isLocked) return false;
    const ext = path.extname(targetPath).toLowerCase();
    if (ext === '.json') {
      return this.exportSnippetsJson(targetPath);
    }
    if (ext === '.csv') {
      return this.exportSnippetsCsv(targetPath);
    }
    try {
      // Export snippets only (exclude internal settings section)
      let out = '';
      for (const [section, keys] of this.data.entries()) {
        if (!section || this.isReservedSection(section)) continue;
        out += `[${section}]\r\n`;
        for (const [k, v] of keys.entries()) {
          out += `${k}=${escapeIniValue(v)}\r\n`;
        }
        out += '\r\n';
      }
      fs.writeFileSync(targetPath, out, 'utf8');
      return true;
    } catch (err) {
      console.error('[Storage] Export error:', err);
      return false;
    }
  }

  exportSnippetsJson(targetPath) {
    try {
      const list = this.getSnippets();
      fs.writeFileSync(targetPath, JSON.stringify(list, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('[Storage] Export JSON error:', err);
      return false;
    }
  }

  exportSnippetsCsv(targetPath) {
    try {
      const list = this.getSnippets();
      const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
      let csv = 'Titel,Kuerzel,Kategorie,Inhalt,Favorit,Aufrufe\r\n';
      for (const item of list) {
        csv += `${escapeCsv(item.title)},${escapeCsv(item.kuerzel)},${escapeCsv(item.category)},${escapeCsv(item.content)},${item.favorite ? '1' : '0'},${item.usageCount || 0}\r\n`;
      }
      fs.writeFileSync(targetPath, '\uFEFF' + csv, 'utf8');
      return true;
    } catch (err) {
      console.error('[Storage] Export CSV error:', err);
      return false;
    }
  }

  importSnippets(sourcePath) {
    if (this.isLocked) {
      return { success: false, error: 'Bitte entsperre SatzTresor zuerst.' };
    }
    const ext = path.extname(sourcePath).toLowerCase();
    if (ext === '.json') {
      return this.importSnippetsJson(sourcePath);
    }
    if (ext === '.csv') {
      return this.importSnippetsCsv(sourcePath);
    }

    try {
      const raw = fs.readFileSync(sourcePath, 'utf8');
      if (
        raw.startsWith('STENC2:') ||
        raw.startsWith('QTENC2:') ||
        raw.startsWith('TSENC2:') ||
        raw.startsWith('STENC:') ||
        raw.startsWith('QTENC:') ||
        raw.startsWith('TSENC:')
      ) {
        throw new Error(
          'Diese INI-Datei ist mit AES-256 verschlüsselt. Bitte exportiere die Bausteine zuerst im entsperrten SatzTresor als unverschlüsselte Datei (JSON/INI/CSV).'
        );
      }
      const tempStorage = new Storage(sourcePath);
      tempStorage.parseIni(raw);

      let count = 0;
      for (const [sec, keys] of tempStorage.data.entries()) {
        if (!sec || this.isReservedSection(sec)) continue;
        if (!keys.has('Inhalt') && !keys.has('Content')) continue;
        this.data.set(sec, new Map(keys));
        count++;
      }

      this.save();
      return { success: true, count };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  importSnippetsJson(sourcePath) {
    try {
      const raw = fs.readFileSync(sourcePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Ungültiges Format: JSON-Array erwartet');

      let count = 0;
      for (const item of parsed) {
        const title = String(item.title || '').replace(/[\r\n\[\]]/g, ' ').trim();
        if (!title || this.isReservedSection(title)) continue;

        const map = new Map();
        map.set('Inhalt', String(item.content || ''));
        map.set('Kuerzel', String(item.kuerzel || '').trim());
        map.set('Arbeitsbereich', String(item.category || '').trim());
        map.set('Aufrufe', String(item.usageCount || 0));
        map.set('Zuletzt', String(item.lastUsed || ''));
        map.set('Favorit', item.favorite ? '1' : '0');

        this.data.set(title, map);
        count++;
      }
      this.save();
      return { success: true, count };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  importSnippetsCsv(sourcePath) {
    try {
      let raw = fs.readFileSync(sourcePath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) {
        raw = raw.slice(1);
      }

      const rows = [];
      let currentRow = [];
      let currentField = '';
      let insideQuotes = false;

      for (let i = 0; i < raw.length; i++) {
        const char = raw[i];
        const nextChar = raw[i + 1];

        if (insideQuotes) {
          if (char === '"' && nextChar === '"') {
            currentField += '"';
            i++;
          } else if (char === '"') {
            insideQuotes = false;
          } else {
            currentField += char;
          }
        } else {
          if (char === '"') {
            insideQuotes = true;
          } else if (char === ',' || char === ';') {
            currentRow.push(currentField);
            currentField = '';
          } else if (char === '\r') {
            // ignore
          } else if (char === '\n') {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
          } else {
            currentField += char;
          }
        }
      }
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
      }

      if (rows.length < 2) throw new Error('CSV-Datei enthält keine Datenzeilen');

      let count = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const title = String(row[0] || '').replace(/[\r\n\[\]]/g, ' ').trim();
        if (!title || this.isReservedSection(title)) continue;

        const kuerzel = String(row[1] || '').trim();
        const category = String(row[2] || '').trim();
        const content = String(row[3] || '');
        const favorite = String(row[4] || '').trim() === '1';

        const map = new Map();
        map.set('Inhalt', content);
        map.set('Kuerzel', kuerzel);
        map.set('Arbeitsbereich', category);
        map.set('Aufrufe', '0');
        map.set('Zuletzt', '');
        map.set('Favorit', favorite ? '1' : '0');

        this.data.set(title, map);
        count++;
      }

      this.save();
      return { success: true, count };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = Storage;
