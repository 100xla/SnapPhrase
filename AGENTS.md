# SnapPhrase (ehemals SatzTresor) — Projektregeln

## Pflicht-Workflow bei jedem Update (Version & Build)

1. **Versionsnummer bei jedem Update erhöhen:**
   - Bei **jeder** Code-, Funktions- oder UI-Änderung an SnapPhrase MUSS die Versionsnummer vor Abschluss der Aufgabe erhöht werden:
     ```powershell
     node build/bump-version.js patch
     ```
     *(bzw. `minor` oder `major`, falls vom Nutzer gewünscht).*
   - Niemals Versionsnummern manuell nur an einer einzelnen Stelle ändern — immer `build/bump-version.js` verwenden, damit `package.json`, `package-lock.json`, `src/*`, `ui/*`, `README.md` und `STORE_GUIDE.md` synchron bleiben.

2. **Installations- & Portable-EXE in `dist/` aktuell halten & auf GitHub veröffentlichen:**
   - Da SnapPhrase als gepackte `.exe` genutzt wird, MUSS nach dem Versions-Bump auch das Release-Paket neu gebaut werden:
     ```powershell
     npm run build:exe
     ```
   - Dadurch liegen `dist/SnapPhrase-Setup-<version>.exe` und `dist/SnapPhrase-Portable-<version>.exe` immer passend zur neuen Versionsnummer bereit (veraltete `.exe`-Dateien in `dist/` werden vom Build-Skript automatisch entfernt).
   - Zum Veröffentlichen als Online-Auto-Update auf GitHub (`100xla/SnapPhrase`) anschließend `git push` + `npm run publish:github` ausführen.

3. **Datenschutz & Sicherheit lokaler Nutzerdaten:**
   - Niemals die persönliche `bausteine.ini` des Nutzers überschreiben oder verändern. Bei automatisierten Electron-Tests immer ein isoliertes `--user-data-dir=<tempDir>` übergeben.
