# SatzTresor — Anleitung zur Weitergabe & Veröffentlichung

Du hast zwei sich perfekt ergänzende Wege, um **SatzTresor** kostenlos und vertrauenswürdig anzubieten:

---

## Weg A: Veröffentlichung auf GitHub (Open Source + Direkt-Download)

1. Baue die fertigen Pakete lokal zum Testen (oder lass sie automatisch durch GitHub Actions bauen):
   ```bash
   npm run build:exe
   ```
2. Im Ordner `dist/` entstehen zwei fertige Dateien (komplett **ohne** deine persönlichen Satzbausteine — jeder Nutzer startet frisch mit 3 Beispielen):
   * **`SatzTresor-Setup-1.3.0.exe`** — Klassischer Windows-Installer (legt Startmenü- & Desktop-Verknüpfung an, benötigt keine Admin-Rechte).
   * **`SatzTresor-Portable-1.3.0.exe`** — Einzeldatei zum direkten Starten ohne Installation (ideal für gesperrte Büro-PCs ohne Microsoft Store oder für USB-Sticks; legt man daneben einen Ordner `SatzTresor-Daten` an, speichert die Portable-Version ihre Daten direkt dort).
3. **Automatische GitHub Releases:** Sobald du auf GitHub einen Versions-Tag wie `v1.3.0` anlegst, baut die mitgelieferte Workflow-Datei [`.github/workflows/release.yml`](./.github/workflows/release.yml) beide `.exe`-Dateien samt `SHA256SUMS.txt` öffentlich nachvollziehbar aus dem Quellcode.

---

## Weg B: Im Microsoft Store veröffentlichen (0 € Gebühr, ohne SmartScreen-Warnung)

Für normale Nutzer ist der **Microsoft Store** der beste Weg, da Microsoft dein Paket kostenlos signiert (**keine blaue Windows-SmartScreen-Warnung**, 1-Klick-Installation, automatische Updates).

### 1. Kostenloses Microsoft Partner Center Konto erstellen

1. Öffne **[storedeveloper.microsoft.com](https://storedeveloper.microsoft.com/)** und melde dich mit deinem Microsoft-Konto an.
2. Wähle als Kontotyp **Einzelperson (Individual)**.
3. **Gebühr: 0 €** (Microsoft hat die frühere Registrierungsgebühr für Einzelentwickler abgeschafft; eine Kreditkarte ist nicht erforderlich).
4. Führe die kurze Identitätsprüfung per Smartphone durch. *Hinweis: Im Store wird dein verifizierter Name als Herausgeber angezeigt.*

### 2. App-Namen reservieren & Produktidentität abrufen

1. Gehe im Partner Center Dashboard auf **Apps und Spiele** > **Neue App erstellen** und reserviere den Namen (z. B. `SatzTresor — Satzbaustein-Manager`).
2. Öffne links **Produktverwaltung** > **Produktidentität** und kopiere diese drei Werte:
   * **Paket/Identitätsname** (`identityName`), z. B. `12345DeinName.SatzTresor`
   * **Herausgeber-ID** (`publisher`), z. B. `CN=A1B2C3D4-E5F6-7890-ABCD-1234567890EF`
   * **Anzeigename des Herausgebers** (`publisherDisplayName`), z. B. `Max Mustermann`

### 3. Identitätswerte in `package.json` eintragen & Store-Paket bauen

Trage deine drei Werte im Abschnitt `"build" -> "appx"` der [`package.json`](./package.json) ein und führe aus:

```bash
npm run build:store
```

`electron-builder` erstellt im Ordner `dist/` die fertige Datei `SatzTresor-Store-1.3.0.appx`.

### 4. Datenschutzerklärung & Zertifizierungshinweis

Nutze als Datenschutzerklärungs-URL einfach den Link zur Datei [`PRIVACY.md`](./PRIVACY.md) in deinem öffentlichen GitHub-Repository und füge bei der Einreichung im Feld **Notes for certification (Hinweise zur Zertifizierung)** kurz ein:

> *"SatzTresor is a 100% local, offline text-snippet productivity tool. It uses keyboard shortcuts and an optional user-toggleable hotstring listener (e.g. typing ;;mfg) strictly locally in RAM to expand user-defined text templates via clipboard paste. No network connections exist and no data ever leaves the device."*
