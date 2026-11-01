# Datenschutzerklärung für SatzTresor

**SatzTresor** ist eine freie Open-Source-Desktop-Anwendung für Windows zur lokalen Verwaltung und schnellen Eingabe von Satzbausteinen und Textvorlagen.

## 1. 100 % Lokale Datenverarbeitung (Zero Cloud)
Alle Satzbausteine, Kategorien, Einstellungen, Backups und optionalen Verschlüsselungsdaten werden **ausschließlich lokal** auf dem Computer des Nutzers gespeichert:
- **Standard-Installation:** `%APPDATA%\satztresor\bausteine.ini`
- **Portable-Version:** Im lokalen Unterordner `SatzTresor-Daten\bausteine.ini` direkt neben der ausführbaren Datei (sofern angelegt) oder im lokalen Benutzerprofil.

## 2. Keine Datenübertragung & Keine Telemetrie
SatzTresor erfasst, speichert oder überträgt **keinerlei** personenbezogene Daten, Nutzungsstatistiken, Diagnosedaten, Telemetriedaten oder Tastatureingaben an externe Server oder Dritte.
- Die Anwendung enthält keinen Netzwerk-Code und lädt keine externen Ressourcen aus dem Internet (abgesichert durch eine strikte Content-Security-Policy `default-src 'self'`).
- Die optionale automatische Kürzel-Ersetzung (*Hotstrings*, z. B. `;;mfg`) sowie der *2× Strg*-Aufruf arbeiten ausschließlich lokal im flüchtigen Arbeitsspeicher (RAM) des eigenen Geräts und lassen sich jederzeit in den Einstellungen oder über das System-Tray deaktivieren.

## 3. Schutz der Zwischenablage
Beim Einfügen eines Satzbausteins wird dieser kurzzeitig in die lokale Windows-Zwischenablage übertragen, über offizielle Windows-Markierungen (`ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory=0`, `CanUploadToCloudClipboard=0`) vom Windows-Zwischenablageverlauf (`Win + V`) sowie der Microsoft-Cloud-Synchronisation ausgeschlossen und auf Wunsch unmittelbar nach dem Einfügen wieder mit dem vorherigen Inhalt der Zwischenablage überschrieben.

## 4. Optionale AES-256-Verschlüsselung
Wird in SatzTresor ein Master-Passwort vergeben, wird die lokale Datenbank mit `AES-256-CBC`, `PBKDF2-SHA256` (100.000 Iterationen) und `HMAC-SHA256` verschlüsselt. Es existiert keine Hintertür und keine Passwort-Wiederherstellung über das Internet.

## 5. Kontakt
Bei Fragen zum Datenschutz oder zum Quellcode nutzen Sie bitte den Issue-Bereich des öffentlichen GitHub-Repositories dieses Projekts.
