<div align="center">

<img src="./logo.png" alt="SnapPhrase Banner" width="680" />

### Your Local, Encrypted Text Expander & Snippet Vault for Windows
**Instant text templates & automatic hotstring expansion — 100% Offline. 0% Cloud. $0 Subscription.**

*Dein lokaler, verschlüsselter Satzbaustein-Manager für Windows — 100 % Offline. 0 % Cloud. 0 € Abo.*

[![Version](https://img.shields.io/badge/Version-1.6.0-2563eb?style=for-the-badge)](./package.json)
[![Platform](https://img.shields.io/badge/Windows-10%20%2F%2011%20(x64)-0078d4?style=for-the-badge&logo=windows)](./package.json)
[![Privacy](https://img.shields.io/badge/100%25%20Local-Zero%20Cloud-10b981?style=for-the-badge)](./PRIVACY.md)
[![Encryption](https://img.shields.io/badge/AES--256-PBKDF2%20%2B%20HMAC-8b5cf6?style=for-the-badge)](./src/crypto.js)
[![License](https://img.shields.io/badge/License-MIT-f59e0b?style=for-the-badge)](./LICENSE)

</div>

---

## Why SnapPhrase? / Warum SnapPhrase?

Many modern text expanders force users into **cloud accounts, mandatory sign-ups, or monthly subscriptions** — a dealbreaker for anyone writing sensitive emails, legal notes, medical documentation, or customer support replies who wants their data to stay strictly on their own PC.

**SnapPhrase** (*formerly SatzTresor*) solves this:
* **100% Local & Private:** All snippets stay exclusively on your computer. No account, no cloud, zero telemetry.
* **Optional AES-256 Vault:** Encrypt your entire snippet database with a master password (`AES-256-CBC` + `PBKDF2-SHA256` with 100,000 iterations + `HMAC-SHA256`).
* **Automatic Bilingual UI (English & Deutsch):** Automatically detects your Windows display language or lets you switch between `Auto`, `Deutsch`, and `English` anytime in Settings.

---

## 📥 Download & Installation (Free)

| 🟢 Option 1: Microsoft Store *(Recommended)* | 🔵 Option 2: Direct Download *(Portable & Setup)* |
| :--- | :--- |
| **1-Click install without Windows SmartScreen warning**<br>*(Signed by Microsoft + automatic Store updates)* | **No Store login & no admin rights required**<br>*(Ideal for locked-down office PCs or USB drives)* |
| 👉 **[Open in Microsoft Store](#)** *(Coming soon)* | 👉 **[SnapPhrase-Portable-1.6.0.exe](../../releases/latest)** *(Run directly without installation)*<br>👉 **[SnapPhrase-Setup-1.6.0.exe](../../releases/latest)** *(Classic Windows installer)* |

<details>
<summary>💡 <b>Note on Direct Download (.exe): Why does Windows show a blue SmartScreen prompt on first launch?</b> (Click to expand)</summary>
<br>

When downloading the `.exe` directly from GitHub (instead of the Microsoft Store), Windows Defender SmartScreen may show **"Windows protected your PC"** (*„Der PC wurde durch Windows geschützt"*) on the very first launch.

**Why?**
SnapPhrase is a free open-source project without commercial revenue. A commercial EV Code Signing certificate costs $200–$400/year. Without a paid certificate, Windows displays this notice for any new `.exe`.

**How to launch in 2 seconds:**
1. Click **"More info"** (*„Weitere Informationen"*).
2. Click **"Run anyway"** (*„Trotzdem ausführen"*).
*(From the second launch onward, SnapPhrase opens immediately without prompts.)*

</details>

---

## ✨ Key Features / Die wichtigsten Funktionen

### 1. Three Instant Ways to Open
* **Double-tap `Ctrl` (`2× Strg`):** Tap the `Ctrl` key twice quickly to open SnapPhrase from any application without interrupting your typing flow.
* **Custom Global Hotkeys:** Defaults to `Ctrl + Space` — or record your own shortcut in Settings (e.g., `F9`, `ScrollLock`, `Ctrl + #`).
* **System Tray Quick Access:** Single-click the SnapPhrase icon in the Windows system tray.

### 2. ⚡ Automatic Text Expansion (Hotstrings) While Typing
Type your short trigger in **any Windows app** (Outlook, Word, browser, CRM, IDE) — e.g. `;;br` or `;;mfg` — and SnapPhrase expands it into your full text snippet in real time.
* Customizable trigger prefix (`;;`, `//`, `::`, `#`, or no prefix).
* Pause or resume anytime with 1 click in the bottom bar (`Auto-Type` / `Auto-Tippen`).

### 3. Smart Placeholders & Interactive Form Variables
Snippets support both English and German dynamic variables:
* `{date}` / `{datum}` & `{date:+1d}` / `{datum:+1d}` / `{date:+7d}` — Today's or relative date
* `{weekday}` / `{wochentag}` & `{time}` / `{zeit}` — Current weekday & time
* `{clipboard}` — Current clipboard text
* `{cursor}` — Places the typing cursor at this exact position after pasting
* `{?Name}` — Opens a quick input prompt for `Name` before pasting
* `{?Salutation=Ms.|Mr.|Hello}` / `{?Anrede=Frau|Herr|Guten Tag}` — Opens a dropdown menu before pasting

### 4. Keyboard-First Spotlight Palette & Pin Mode
* `Enter` (`↵`) — Insert selected snippet into active window
* `Shift + Enter` (`Shift+↵`) or `Ctrl + C` — Copy snippet to clipboard without pasting
* `Alt + 1..9` — Instant paste of the top 1–9 matches
* `Tab` — Edit selected snippet
* `Ctrl + N` — Create new snippet
* `Ctrl + D` — Duplicate selected snippet
* `Alt + F` — Toggle favorite star
* `Ctrl + P` — Toggle **Pin Mode** (keeps SnapPhrase floating on top)
* `Ctrl + L` — Lock encrypted database immediately

---

## 🛡️ Security & Auditable Privacy

| Security Feature | Source Code Verification |
| :--- | :--- |
| **Isolated UI & Zero Telemetry** | [`ui/index.html`](./ui/index.html) enforces `default-src 'self'`. No snippets or analytics ever leave your machine. In Microsoft Store builds, even the GitHub update check ([`src/updater.js`](./src/updater.js)) is completely disabled (`process.windowsStore`). |
| **Audited AES-256 Encryption** | [`src/crypto.js`](./src/crypto.js) uses Node's native `crypto` module with `AES-256-CBC`, `PBKDF2-SHA256` (100,000 iterations, 16-byte random salt) and `HMAC-SHA256` (Encrypt-then-MAC with `timingSafeEqual`). |
| **Windows Clipboard History Protection (`Win + V`)** | [`src/win32.js`](./src/win32.js) marks pasted snippets with `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory=0`, and `CanUploadToCloudClipboard=0` so sensitive text never leaks into `Win + V` or cloud clipboard sync. |
| **Seamless Upgrade from SatzTresor** | Existing `%APPDATA%\satztresor\bausteine.ini` databases, encrypted `STENC2:` vaults, and UI settings are automatically migrated on first launch. |

---

## 💻 Build from Source

Requirements: **Windows 10/11 (x64)** and **[Node.js](https://nodejs.org/) (LTS)**.

```bash
# 1. Clone repository
git clone https://github.com/100xla/SnapPhrase.git
cd SnapPhrase

# 2. Install dependencies
npm install

# 3. Run in development mode
npm start

# 4. Build Setup & Portable .exe in dist/
npm run build:exe

# 5. Build Microsoft Store .appx package in dist/
npm run build:store
```

---

## ℹ️ License & Privacy

* **Platform:** Built specifically for **Windows 10 & Windows 11 (64-bit)** using native Win32 APIs (`user32.dll`).
* **License:** Released under the **[MIT License](./LICENSE)**.
* **Privacy Policy:** See **[PRIVACY.md](./PRIVACY.md)**.
