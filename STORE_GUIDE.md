# SnapPhrase — Anleitung zur Weitergabe & Microsoft-Store-Veröffentlichung

Du hast zwei sich perfekt ergänzende Wege, um **SnapPhrase** kostenlos, international (DE/EN) und vertrauenswürdig anzubieten:

---

## Weg A: Veröffentlichung auf GitHub (Open Source + Direkt-Download)

1. Baue die fertigen Pakete lokal (oder lass sie automatisch durch GitHub Actions bauen):
   ```bash
   npm run build:exe
   ```
2. Im Ordner `dist/` entstehen zwei fertige Dateien (komplett **ohne** deine persönlichen Satzbausteine — jeder Nutzer startet frisch mit 3 Beispielen in seiner Systemsprache):
   * **`SnapPhrase-Setup-1.7.0.exe`** — Klassischer Windows-Installer (legt Startmenü- & Desktop-Verknüpfung an, benötigt keine Admin-Rechte).
   * **`SnapPhrase-Portable-1.7.0.exe`** — Einzeldatei zum direkten Starten ohne Installation (ideal für gesperrte Büro-PCs ohne Microsoft Store oder für USB-Sticks; legt man daneben einen Ordner `SnapPhrase-Daten` an, speichert die Portable-Version ihre Daten direkt dort).
3. **Veröffentlichung auf GitHub Releases (`100xla/SnapPhrase`):**
   ```bash
   npm run publish:github
   ```

---

## Weg B: Im Microsoft Store veröffentlichen (0 € Gebühr, ohne SmartScreen-Warnung)

Für normale Nutzer weltweit ist der **Microsoft Store** der beste Weg, da Microsoft dein Paket kostenlos signiert (**keine blaue Windows-SmartScreen-Warnung**, 1-Klick-Installation, automatische Updates über den Store).

### 1. Kostenloses Microsoft Partner Center Konto erstellen

1. Öffne **[partner.microsoft.com/dashboard/registration](https://partner.microsoft.com/dashboard/registration)** (bzw. `storedeveloper.microsoft.com`) und melde dich mit deinem privaten Microsoft-Konto an.
2. Wähle als Kontotyp **Individual (Einzelperson)**.
3. **Gebühr: 0 €** (Microsoft hat die Registrierungsgebühr für Einzelentwickler weltweit auf 0 € gesenkt; keine Kreditkarte erforderlich).
4. Führe die kurze Identitätsprüfung (Ausweis + Selfie per Smartphone) durch.

### 2. App-Namen reservieren & Produktidentität abrufen

1. Gehe im Partner Center Dashboard auf **Apps and games** -> **New product** -> **MSIX or PWA app** und reserviere den Namen **`SnapPhrase`**.
2. Öffne links **Product management** -> **Product identity** (*Produktidentität*) und kopiere diese drei Werte:
   * **Package/Identity/Name** (`identityName`), z. B. `12345DeinName.SnapPhrase`
   * **Package/Identity/Publisher** (`publisher`), z. B. `CN=A1B2C3D4-E5F6-7890-ABCD-1234567890EF`
   * **Package/Properties/PublisherDisplayName** (`publisherDisplayName`), z. B. `Dein Name`

### 3. Identitätswerte in `package.json` eintragen & Store-Paket bauen

Trage deine drei Werte im Abschnitt `"build" -> "appx"` der [`package.json`](./package.json) ein und führe aus:

```bash
npm run build:store
```

`electron-builder` erstellt im Ordner `dist/` die fertige Datei `SnapPhrase-Store-1.7.0.appx` (inklusive der vorbereiteten Store-Kachel-Icons aus `build/appx/`).

### 4. Paket im Partner Center hochladen & ausfüllen

1. **Packages:** Ziehe `dist/SnapPhrase-Store-1.7.0.appx` per Drag & Drop in das Feld *Packages*.
2. **Properties:**
   * Category: **Productivity** (*Produktivität*)
   * Privacy Policy URL: `https://raw.githubusercontent.com/100xla/SnapPhrase/main/PRIVACY.md`
3. **Age ratings:** Alle Fragen mit **No / Nein** beantworten -> ergibt `USK 0` / `PEGI 3` / `ESRB Everyone`.
4. **Store listings:** Du kannst im Partner Center direkt **English** und **German** anlegen (SnapPhrase schaltet seine Sprache beim Nutzer automatisch passend zu Windows um).
5. **Notes for certification (Hinweise für den Microsoft-Prüfer):**
   Kopiere diesen Text in das Feld *Notes for certification*:

> *"SnapPhrase is a 100% local, offline text-snippet and template manager for Windows. You can open the search window anytime by pressing Ctrl+Space, double-tapping Ctrl, or clicking the SnapPhrase tray icon in the Windows system tray. It uses keyboard shortcuts and an optional user-toggleable hotstring listener (e.g. typing ;;br or ;;mfg) strictly locally in RAM to expand user-defined text templates via clipboard paste. Self-updating is disabled in the Microsoft Store build (`process.windowsStore`), no network connections are made, and no user data ever leaves the device."*
