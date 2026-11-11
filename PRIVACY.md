# Privacy Policy / Datenschutzerklärung — SnapPhrase

**SnapPhrase** (*formerly SatzTresor*) is a free, open-source desktop application for Windows for managing and inserting local text snippets and templates.

---

## 🇬🇧 English — Privacy Policy

### 1. 100% Local Data Storage (Zero Cloud)
All text snippets, categories, settings, backups, and optional encryption keys are stored **exclusively locally** on the user's computer:
- **Standard Installation / Microsoft Store:** `%APPDATA%\SnapPhrase\bausteine.ini`
- **Portable Version:** In the local subfolder `SnapPhrase-Daten\bausteine.ini` next to the executable (if created) or in the local user profile.

### 2. No Data Collection & Zero Telemetry
SnapPhrase does **not** collect, store, or transmit any personal data, usage statistics, diagnostics, telemetry, or keystrokes to external servers or third parties.
- The user interface is isolated by a strict Content Security Policy (`default-src 'self'`).
- The optional automatic text expansion (*Hotstrings*, e.g. `;;br`) and the *Double-tap Ctrl* shortcut operate strictly locally in volatile memory (RAM) on the user's device and can be paused or disabled at any time in Settings or via the system tray.
- **Microsoft Store Edition:** In the Microsoft Store version, updates are handled exclusively by the Microsoft Store; the application makes zero network connections.
- **GitHub Direct-Download Edition:** If automatic updates are enabled, the app only queries the public GitHub Releases API (`https://api.github.com/repos/100xla/SnapPhrase/releases/latest`) to check for newer versions. This can be disabled at any time in Settings.

### 3. Clipboard Privacy Protection
When pasting a snippet, SnapPhrase marks the temporary clipboard entry using official Windows clipboard privacy formats (`ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory=0`, `CanUploadToCloudClipboard=0`) so sensitive snippets are excluded from Windows Clipboard History (`Win + V`) and cloud clipboard synchronization, and optionally restores the previous clipboard content immediately after pasting.

### 4. Optional AES-256 Encryption
When a master password is set in SnapPhrase, the local database is encrypted using `AES-256-CBC`, `PBKDF2-SHA256` (100,000 iterations), and `HMAC-SHA256`. There is no backdoor and no cloud password recovery.

### 5. Contact
For questions regarding privacy or the source code, please open an issue in the public GitHub repository: `https://github.com/100xla/SnapPhrase/issues`.

---

## 🇩🇪 Deutsch — Datenschutzerklärung

### 1. 100 % Lokale Datenverarbeitung (Zero Cloud)
Alle Satzbausteine, Kategorien, Einstellungen, Backups und optionalen Verschlüsselungsdaten werden **ausschließlich lokal** auf dem Computer des Nutzers gespeichert:
- **Standard-Installation / Microsoft Store:** `%APPDATA%\SnapPhrase\bausteine.ini`
- **Portable-Version:** Im lokalen Unterordner `SnapPhrase-Daten\bausteine.ini` direkt neben der ausführbaren Datei (sofern angelegt) oder im lokalen Benutzerprofil.

### 2. Keine Datenübertragung & Keine Telemetrie
SnapPhrase erfasst, speichert oder überträgt **keinerlei** personenbezogene Daten, Nutzungsstatistiken, Diagnosedaten, Telemetriedaten oder Tastatureingaben an externe Server oder Dritte.
- Die Oberfläche ist durch eine strikte Content-Security-Policy (`default-src 'self'`) abgesichert.
- Die optionale automatische Kürzel-Ersetzung (*Hotstrings*, z. B. `;;mfg`) sowie der *2× Strg*-Aufruf arbeiten ausschließlich lokal im flüchtigen Arbeitsspeicher (RAM) des eigenen Geräts und lassen sich jederzeit in den Einstellungen oder über das System-Tray deaktivieren.
- **Microsoft-Store-Version:** In der Microsoft-Store-Version erfolgen Updates ausschließlich über den Microsoft Store; die App baut keinerlei Netzwerkverbindungen auf.
- **GitHub-Direkt-Download-Version:** Sofern automatische Updates aktiviert sind, prüft die App lediglich die öffentliche GitHub-Releases-API (`https://api.github.com/repos/100xla/SnapPhrase/releases/latest`) auf neue Versionen (jederzeit in den Einstellungen abschaltbar).

### 3. Schutz der Zwischenablage
Beim Einfügen eines Satzbausteins wird dieser kurzzeitig in die lokale Windows-Zwischenablage übertragen, über offizielle Windows-Markierungen (`ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory=0`, `CanUploadToCloudClipboard=0`) vom Windows-Zwischenablageverlauf (`Win + V`) sowie der Microsoft-Cloud-Synchronisation ausgeschlossen und auf Wunsch unmittelbar nach dem Einfügen wieder mit dem vorherigen Inhalt der Zwischenablage überschrieben.

### 4. Optionale AES-256-Verschlüsselung
Wird in SnapPhrase ein Master-Passwort vergeben, wird die lokale Datenbank mit `AES-256-CBC`, `PBKDF2-SHA256` (100.000 Iterationen) und `HMAC-SHA256` verschlüsselt. Es existiert keine Hintertür und keine Passwort-Wiederherstellung über das Internet.

### 5. Kontakt
Bei Fragen zum Datenschutz oder zum Quellcode nutzen Sie bitte den Issue-Bereich des öffentlichen GitHub-Repositories (`https://github.com/100xla/SnapPhrase/issues`).
