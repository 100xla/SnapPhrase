/**
 * SatzTresor v1.5.4 — Automatic Update Engine (GitHub Releases + Delta Updates + Self-Update)
 * - Installed NSIS builds: Silent background delta-downloads (.blockmap + SHA-512 verification)
 *   via electron-updater, installable with 1 click or automatically on next app quit,
 *   plus automatic direct-download silent installer (/S) fallback.
 * - Portable builds: Background download of the new Portable EXE + 1-click self-replacement & restart.
 * - Dev / Unconfigured graceful handling + deterministic mock mode for E2E tests.
 */

const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const INITIAL_CHECK_DELAY_MS = 8000;
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const DEFAULT_GITHUB_REPO = '100xla/satztresor';
const PLACEHOLDER_OWNERS = new Set(['', 'dein-github-name', '<dein_github_name>', 'your-github-username']);

function parseSemverParts(versionStr) {
  const clean = String(versionStr || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

function compareSemver(a, b) {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function readDefaultRepoFromPackageJson() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const publishCfg = Array.isArray(pkg?.build?.publish)
      ? pkg.build.publish[0]
      : pkg?.build?.publish;
    if (publishCfg && publishCfg.provider === 'github' && publishCfg.owner && publishCfg.repo) {
      const owner = String(publishCfg.owner).trim();
      const repo = String(publishCfg.repo).trim();
      if (!PLACEHOLDER_OWNERS.has(owner.toLowerCase())) {
        return `${owner}/${repo}`;
      }
    }
  } catch (e) {}
  return DEFAULT_GITHUB_REPO;
}

function fetchLatestGitHubRelease(owner, repo, currentVersion) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`,
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `SatzTresor/${currentVersion}`,
        },
        timeout: 12000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (body.length < 1024 * 512) body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 404) {
            return resolve(null);
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error('Ungültige Antwort von GitHub Releases'));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Zeitüberschreitung bei der Update-Prüfung'));
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

function downloadFileWithRedirects(url, destPath, onProgress, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    const visit = (targetUrl, redirectsLeft) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(targetUrl);
      } catch (err) {
        return reject(new Error('Ungültige Download-URL'));
      }

      const req = https.get(
        {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: {
            'User-Agent': 'SatzTresor-Updater',
            Accept: 'application/octet-stream,*/*',
          },
          timeout: 30000,
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            res.resume();
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            return visit(nextUrl, redirectsLeft - 1);
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            return reject(new Error(`Download HTTP ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10) || 0;
          let receivedBytes = 0;
          const fileStream = fs.createWriteStream(destPath);

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            if (totalBytes > 0 && typeof onProgress === 'function') {
              const pct = Math.max(1, Math.min(99, Math.round((receivedBytes / totalBytes) * 100)));
              onProgress(pct);
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              if (receivedBytes < 1024 * 100) {
                try {
                  fs.unlinkSync(destPath);
                } catch (e) {}
                return reject(new Error('Heruntergeladene Datei ist unvollständig'));
              }
              resolve(destPath);
            });
          });

          fileStream.on('error', (err) => {
            try {
              fs.unlinkSync(destPath);
            } catch (e) {}
            reject(err);
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Zeitüberschreitung beim Update-Download'));
      });
      req.on('error', (err) => {
        try {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        } catch (e) {}
        reject(err);
      });
    };

    visit(url, maxRedirects);
  });
}

class SatzTresorUpdater {
  constructor({ app, shell, storage, currentVersion, onStateChange, onToast, onBeforeQuitAndInstall }) {
    this.app = app;
    this.shell = shell;
    this.storage = storage;
    this.currentVersion = currentVersion;
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : () => {};
    this.onToast = typeof onToast === 'function' ? onToast : () => {};
    this.onBeforeQuitAndInstall =
      typeof onBeforeQuitAndInstall === 'function' ? onBeforeQuitAndInstall : () => {};

    this.defaultRepoSlug = readDefaultRepoFromPackageJson();
    this.isPackaged = Boolean(app && app.isPackaged);
    this.isPortable = Boolean(
      process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR
    );
    this.mockMode = String(process.env.SATZTRESOR_MOCK_UPDATE || '').trim();

    this.autoUpdater = null;
    this.isChecking = false;
    this.isDirectDownloading = false;
    this.lastManualCheck = false;
    this.lastProgressEmit = 0;
    this.initialTimer = null;
    this.periodicTimer = null;
    this.directDownloadedFile = null;
    this.directDownloadedMode = null; // 'nsis' | 'portable'
    this.usedElectronUpdaterForCurrentDownload = false;

    this.state = {
      status: 'idle', // 'idle' | 'unconfigured' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'portable-available' | 'up-to-date' | 'error'
      currentVersion: this.currentVersion,
      availableVersion: null,
      percent: 0,
      downloadUrl: null,
      errorMessage: null,
      lastCheckedAt: null,
    };

    this._initUpdaterInstance();
    this._refreshConfigurationStatus();
  }

  getEffectiveRepoSlug() {
    const custom = this.storage.getUpdateRepo();
    return custom || this.defaultRepoSlug || DEFAULT_GITHUB_REPO;
  }

  getParsedRepo() {
    const slug = this.getEffectiveRepoSlug();
    if (!slug) return null;
    const parts = slug.split('/').map((s) => s.trim()).filter(Boolean);
    if (parts.length !== 2) return null;
    if (PLACEHOLDER_OWNERS.has(parts[0].toLowerCase())) return null;
    return { owner: parts[0], repo: parts[1], slug: `${parts[0]}/${parts[1]}` };
  }

  _refreshConfigurationStatus() {
    if (this.mockMode) return;
    const parsed = this.getParsedRepo();
    if (!parsed) {
      this.state.status = 'unconfigured';
      this.state.errorMessage = null;
    } else if (this.state.status === 'unconfigured') {
      this.state.status = 'idle';
    }
    if (this.autoUpdater && parsed) {
      try {
        this.autoUpdater.setFeedURL({
          provider: 'github',
          owner: parsed.owner,
          repo: parsed.repo,
        });
      } catch (e) {}
    }
  }

  _initUpdaterInstance() {
    if (!this.isPackaged || this.isPortable || this.mockMode) {
      return;
    }

    try {
      const { autoUpdater } = require('electron-updater');
      this.autoUpdater = autoUpdater;

      autoUpdater.logger = {
        info: () => {},
        warn: (...args) => console.warn('[Updater]', ...args),
        error: (...args) => console.error('[Updater]', ...args),
        debug: () => {},
      };

      autoUpdater.disableWebInstaller = true;
      autoUpdater.allowDowngrade = false;
      autoUpdater.autoDownload = this.storage.getAutoUpdateEnabled();
      autoUpdater.autoInstallOnAppQuit = true;
      // Preserve HTTPS + SHA-512 hash verification from latest.yml without requiring paid Authenticode cert
      autoUpdater.verifyUpdateCodeSignature = async () => null;

      autoUpdater.on('checking-for-update', () => {
        this._setState({
          status: 'checking',
          errorMessage: null,
        });
      });

      autoUpdater.on('update-available', (info) => {
        const nextVersion = info?.version || null;
        const willAutoDownload = Boolean(autoUpdater.autoDownload);
        this.usedElectronUpdaterForCurrentDownload = true;
        this._setState({
          status: willAutoDownload ? 'downloading' : 'available',
          availableVersion: nextVersion,
          percent: willAutoDownload ? 1 : 0,
          errorMessage: null,
          lastCheckedAt: Date.now(),
        });
        if (this.lastManualCheck && !willAutoDownload && nextVersion) {
          this.onToast(`Update v${nextVersion} verfügbar`);
        }
      });

      autoUpdater.on('update-not-available', () => {
        this.isChecking = false;
        this._setState({
          status: 'up-to-date',
          availableVersion: null,
          percent: 0,
          errorMessage: null,
          lastCheckedAt: Date.now(),
        });
        if (this.lastManualCheck) {
          this.onToast(`✓ SatzTresor v${this.currentVersion} ist aktuell`);
          this.lastManualCheck = false;
        }
      });

      autoUpdater.on('download-progress', (prog) => {
        const now = Date.now();
        const pct = Math.max(1, Math.min(99, Math.round(prog?.percent || 0)));
        if (now - this.lastProgressEmit < 180 && pct < 99) return;
        this.lastProgressEmit = now;
        this._setState({
          status: 'downloading',
          percent: pct,
          errorMessage: null,
        });
      });

      autoUpdater.on('update-downloaded', (info) => {
        this.isChecking = false;
        this.usedElectronUpdaterForCurrentDownload = true;
        const nextVersion = info?.version || this.state.availableVersion;
        this._setState({
          status: 'downloaded',
          availableVersion: nextVersion,
          percent: 100,
          errorMessage: null,
          lastCheckedAt: Date.now(),
        });
        if (this.lastManualCheck) {
          this.onToast(`✓ Update v${nextVersion} bereit zum Neustart`);
          this.lastManualCheck = false;
        }
      });

      autoUpdater.on('error', (err) => {
        const parsed = this.getParsedRepo();
        if (parsed && !this.isDirectDownloading) {
          // Seamlessly fall back to direct GitHub Releases check + download
          this._checkDirectGitHubRelease(parsed, this.lastManualCheck).catch(() => {});
          return;
        }
        this.isChecking = false;
        const rawMsg = String(err?.message || err || 'Unbekannter Update-Fehler');
        const friendlyMsg = rawMsg.includes('404')
          ? 'Noch kein veröffentlichtes Release auf GitHub gefunden.'
          : rawMsg.includes('ERR_INTERNET_DISCONNECTED') || rawMsg.includes('ENOTFOUND')
            ? 'Keine Internetverbindung für Update-Prüfung.'
            : 'Update-Prüfung fehlgeschlagen.';
        this._setState({
          status: 'error',
          errorMessage: friendlyMsg,
        });
        if (this.lastManualCheck) {
          this.onToast(friendlyMsg);
          this.lastManualCheck = false;
        }
      });
    } catch (err) {
      console.error('[Updater] Failed to initialize electron-updater:', err);
    }
  }

  _setState(patch) {
    Object.assign(this.state, patch);
    this.onStateChange(this.getState());
  }

  getState() {
    const parsed = this.getParsedRepo();
    return {
      ...this.state,
      currentVersion: this.currentVersion,
      autoUpdateEnabled: this.storage.getAutoUpdateEnabled(),
      repoSlug: parsed ? parsed.slug : '',
      isConfigured: Boolean(parsed) || Boolean(this.mockMode),
      isPortable: this.isPortable,
      isPackaged: this.isPackaged,
    };
  }

  setAutoUpdateEnabled(enabled) {
    const flag = Boolean(enabled);
    this.storage.setAutoUpdateEnabled(flag);
    if (this.autoUpdater) {
      this.autoUpdater.autoDownload = flag;
    }
    this.onStateChange(this.getState());
    if (flag && (this.state.status === 'idle' || this.state.status === 'available')) {
      if (this.state.status === 'available') {
        this.downloadUpdate();
      } else {
        this.checkForUpdates({ manual: false });
      }
    }
  }

  setUpdateRepo(repoSlug) {
    const saved = this.storage.setUpdateRepo(repoSlug);
    this._refreshConfigurationStatus();
    this.onStateChange(this.getState());
    return saved;
  }

  startSchedule() {
    this.stopSchedule();

    if (this.mockMode) {
      this.initialTimer = setTimeout(() => {
        this.checkForUpdates({ manual: false });
      }, 300);
      if (this.initialTimer.unref) this.initialTimer.unref();
      return;
    }

    this.initialTimer = setTimeout(() => {
      if (this.storage.getAutoUpdateEnabled() && this.getParsedRepo()) {
        this.checkForUpdates({ manual: false });
      }
    }, INITIAL_CHECK_DELAY_MS);
    if (this.initialTimer.unref) this.initialTimer.unref();

    this.periodicTimer = setInterval(() => {
      if (
        this.storage.getAutoUpdateEnabled() &&
        this.getParsedRepo() &&
        this.state.status !== 'downloaded' &&
        this.state.status !== 'downloading'
      ) {
        this.checkForUpdates({ manual: false });
      }
    }, PERIODIC_CHECK_INTERVAL_MS);
    if (this.periodicTimer.unref) this.periodicTimer.unref();
  }

  stopSchedule() {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  async _checkDirectGitHubRelease(parsed, manual = false) {
    this._setState({ status: 'checking', errorMessage: null });
    try {
      const release = await fetchLatestGitHubRelease(parsed.owner, parsed.repo, this.currentVersion);
      this.isChecking = false;
      if (!release || !release.tag_name) {
        this._setState({
          status: 'up-to-date',
          lastCheckedAt: Date.now(),
          errorMessage: null,
        });
        if (manual) {
          this.onToast('Noch kein veröffentlichtes Release auf GitHub gefunden.');
          this.lastManualCheck = false;
        }
        return;
      }

      const remoteVersion = String(release.tag_name).replace(/^v/i, '').trim();
      if (compareSemver(remoteVersion, this.currentVersion) > 0) {
        const assets = Array.isArray(release.assets) ? release.assets : [];
        const portableAsset = assets.find(
          (a) =>
            typeof a.name === 'string' &&
            a.name.toLowerCase().includes('portable') &&
            a.name.toLowerCase().endsWith('.exe')
        );
        const setupAsset = assets.find(
          (a) =>
            typeof a.name === 'string' &&
            a.name.toLowerCase().includes('setup') &&
            a.name.toLowerCase().endsWith('.exe')
        );
        const preferredAsset = this.isPortable ? portableAsset || setupAsset : setupAsset || portableAsset;
        const downloadUrl =
          preferredAsset?.browser_download_url ||
          release.html_url ||
          `https://github.com/${parsed.owner}/${parsed.repo}/releases/latest`;

        const canSelfInstall = Boolean(preferredAsset?.browser_download_url && this.isPackaged);
        if (canSelfInstall) {
          this.directDownloadedMode =
            preferredAsset === portableAsset && this.isPortable ? 'portable' : 'nsis';
          this._setState({
            status: 'available',
            availableVersion: remoteVersion,
            downloadUrl,
            percent: 0,
            errorMessage: null,
            lastCheckedAt: Date.now(),
          });
          if (this.storage.getAutoUpdateEnabled()) {
            await this._downloadDirectAsset(downloadUrl, remoteVersion);
          } else if (manual) {
            this.onToast(`Update v${remoteVersion} verfügbar!`);
            this.lastManualCheck = false;
          }
        } else {
          this._setState({
            status: 'portable-available',
            availableVersion: remoteVersion,
            downloadUrl,
            percent: 100,
            errorMessage: null,
            lastCheckedAt: Date.now(),
          });
          if (manual) {
            this.onToast(`Update v${remoteVersion} auf GitHub verfügbar!`);
            this.lastManualCheck = false;
          }
        }
      } else {
        this._setState({
          status: 'up-to-date',
          availableVersion: null,
          downloadUrl: null,
          percent: 0,
          errorMessage: null,
          lastCheckedAt: Date.now(),
        });
        if (manual) {
          this.onToast(`✓ SatzTresor v${this.currentVersion} ist aktuell`);
          this.lastManualCheck = false;
        }
      }
    } catch (err) {
      this.isChecking = false;
      const msg = err?.message || 'Update-Prüfung fehlgeschlagen.';
      this._setState({
        status: 'error',
        errorMessage: msg,
      });
      if (manual) {
        this.onToast(msg);
        this.lastManualCheck = false;
      }
    }
  }

  async _downloadDirectAsset(downloadUrl, version) {
    if (this.isDirectDownloading || !downloadUrl) return;
    this.isDirectDownloading = true;
    this.usedElectronUpdaterForCurrentDownload = false;

    const targetDir =
      this.directDownloadedMode === 'portable' && process.env.PORTABLE_EXECUTABLE_DIR
        ? process.env.PORTABLE_EXECUTABLE_DIR
        : os.tmpdir();
    const fileName =
      this.directDownloadedMode === 'portable'
        ? `SatzTresor-Portable-${version}.update.exe`
        : `SatzTresor-Setup-${version}.update.exe`;
    const destPath = path.join(targetDir, fileName);

    this._setState({
      status: 'downloading',
      availableVersion: version,
      percent: 1,
      errorMessage: null,
    });

    try {
      await downloadFileWithRedirects(downloadUrl, destPath, (pct) => {
        const now = Date.now();
        if (now - this.lastProgressEmit < 180 && pct < 99) return;
        this.lastProgressEmit = now;
        this._setState({
          status: 'downloading',
          percent: pct,
          errorMessage: null,
        });
      });

      this.directDownloadedFile = destPath;
      this.isDirectDownloading = false;
      this._setState({
        status: 'downloaded',
        availableVersion: version,
        percent: 100,
        errorMessage: null,
        lastCheckedAt: Date.now(),
      });
      if (this.lastManualCheck) {
        this.onToast(`✓ Update v${version} bereit zum Neustart`);
        this.lastManualCheck = false;
      }
    } catch (err) {
      this.isDirectDownloading = false;
      this._setState({
        status: 'error',
        errorMessage: err?.message || 'Update-Download fehlgeschlagen.',
      });
      if (this.lastManualCheck) {
        this.onToast('Update-Download fehlgeschlagen.');
        this.lastManualCheck = false;
      }
    }
  }

  async checkForUpdates({ manual = false } = {}) {
    if (this.isChecking || this.isDirectDownloading) return;

    // Deterministic E2E / UI test simulation mode
    if (this.mockMode) {
      this.isChecking = true;
      this._setState({ status: 'checking', errorMessage: null });
      await new Promise((r) => setTimeout(r, 80));
      if (this.mockMode === 'downloaded') {
        this._setState({ status: 'downloading', availableVersion: '9.9.0', percent: 55 });
        await new Promise((r) => setTimeout(r, 80));
        this.isChecking = false;
        this._setState({
          status: 'downloaded',
          availableVersion: '9.9.0',
          percent: 100,
          lastCheckedAt: Date.now(),
        });
      } else if (this.mockMode === 'up-to-date') {
        this.isChecking = false;
        this._setState({
          status: 'up-to-date',
          availableVersion: null,
          percent: 0,
          lastCheckedAt: Date.now(),
        });
      }
      return;
    }

    const parsed = this.getParsedRepo();
    if (!parsed) {
      this._setState({
        status: 'unconfigured',
        errorMessage: null,
      });
      if (manual) {
        this.onToast('Bitte zuerst ein GitHub-Repository (z. B. 100xla/satztresor) hinterlegen.');
      }
      return;
    }

    if (this.state.status === 'downloaded') {
      if (manual) {
        this.onToast(`✓ Update v${this.state.availableVersion} ist bereits bereit zum Neustart`);
      }
      return;
    }

    this.isChecking = true;
    this.lastManualCheck = Boolean(manual);

    // Installed NSIS mode -> full electron-updater differential download pipeline
    if (this.autoUpdater && this.isPackaged && !this.isPortable) {
      try {
        this.autoUpdater.autoDownload = this.storage.getAutoUpdateEnabled();
        this.autoUpdater.setFeedURL({
          provider: 'github',
          owner: parsed.owner,
          repo: parsed.repo,
        });
        await this.autoUpdater.checkForUpdates();
      } catch (err) {
        await this._checkDirectGitHubRelease(parsed, manual);
      }
      return;
    }

    await this._checkDirectGitHubRelease(parsed, manual);
  }

  async downloadUpdate() {
    if (this.state.status !== 'available') return;
    if (this.autoUpdater && this.usedElectronUpdaterForCurrentDownload) {
      try {
        this._setState({ status: 'downloading', percent: 1, errorMessage: null });
        await this.autoUpdater.downloadUpdate();
        return;
      } catch (err) {}
    }
    if (this.state.downloadUrl && this.state.availableVersion) {
      await this._downloadDirectAsset(this.state.downloadUrl, this.state.availableVersion);
    }
  }

  _installDirectDownloadedUpdate() {
    if (!this.directDownloadedFile || !fs.existsSync(this.directDownloadedFile)) {
      return false;
    }

    const downloadedFile = this.directDownloadedFile;
    this.stopSchedule();
    this.onBeforeQuitAndInstall();

    if (this.directDownloadedMode === 'portable' && process.env.PORTABLE_EXECUTABLE_FILE) {
      const targetExe = process.env.PORTABLE_EXECUTABLE_FILE;
      const psScript = [
        'Start-Sleep -Milliseconds 1200;',
        `for ($i = 0; $i -lt 15; $i++) {`,
        `  try { Move-Item -LiteralPath '${downloadedFile.replace(/'/g, "''")}' -Destination '${targetExe.replace(/'/g, "''")}' -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 500 }`,
        `}`,
        `Start-Process -FilePath '${targetExe.replace(/'/g, "''")}'`,
      ].join(' ');

      try {
        const child = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
          { detached: true, stdio: 'ignore', windowsHide: true }
        );
        child.unref();
      } catch (err) {
        console.error('[Updater] Portable self-replace failed:', err);
      }
      setImmediate(() => this.app.quit());
      return true;
    }

    // NSIS Silent Installer (/S) + automatic relaunch of installed executable
    const currentExe = process.execPath;
    const psScript = [
      'Start-Sleep -Milliseconds 900;',
      `$p = Start-Process -FilePath '${downloadedFile.replace(/'/g, "''")}' -ArgumentList '/S' -Wait -PassThru;`,
      `try { Remove-Item -LiteralPath '${downloadedFile.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue } catch {};`,
      `if (Test-Path -LiteralPath '${currentExe.replace(/'/g, "''")}') { Start-Process -FilePath '${currentExe.replace(/'/g, "''")}' }`,
    ].join(' ');

    try {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
        { detached: true, stdio: 'ignore', windowsHide: true }
      );
      child.unref();
    } catch (err) {
      console.error('[Updater] Direct NSIS silent install failed:', err);
    }
    setImmediate(() => this.app.quit());
    return true;
  }

  installNow() {
    if (this.mockMode && this.state.status === 'downloaded') {
      this.onToast('Simulierter Update-Neustart ausgelöst');
      return true;
    }

    if (this.state.status === 'available') {
      this.downloadUpdate();
      return true;
    }

    if (this.state.status === 'portable-available' && this.state.downloadUrl) {
      if (this.shell && typeof this.shell.openExternal === 'function') {
        this.shell.openExternal(this.state.downloadUrl);
      }
      return true;
    }

    if (this.state.status === 'downloaded') {
      if (this.directDownloadedFile && fs.existsSync(this.directDownloadedFile)) {
        return this._installDirectDownloadedUpdate();
      }
      if (this.autoUpdater) {
        this.stopSchedule();
        this.onBeforeQuitAndInstall();
        setImmediate(() => {
          try {
            // isSilent = true (/S), isForceRunAfter = true (--force-run)
            this.autoUpdater.quitAndInstall(true, true);
          } catch (err) {
            console.error('[Updater] quitAndInstall failed:', err);
            this.app.quit();
          }
        });
        return true;
      }
    }

    return false;
  }
}

module.exports = {
  SatzTresorUpdater,
  compareSemver,
  parseSemverParts,
};
