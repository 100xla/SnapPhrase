/**
 * SnapPhrase — Automated GitHub Release Publisher
 * Uploads dist/latest.yml, dist/*.blockmap, dist/SnapPhrase-Setup-<version>.exe,
 * and dist/SnapPhrase-Portable-<version>.exe to GitHub Releases (100xla/SnapPhrase)
 * so all installed & portable SnapPhrase instances receive the update automatically.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;

const publishCfg = Array.isArray(pkg?.build?.publish) ? pkg.build.publish[0] : pkg?.build?.publish;
const owner = publishCfg?.owner || '100xla';
const repo = publishCfg?.repo || 'SnapPhrase';

function getGitHubToken() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
    return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  }
  const credOut = execSync('git credential fill', {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  for (const line of credOut.trim().split(/\r?\n/)) {
    if (line.startsWith('password=')) {
      return line.slice('password='.length).trim();
    }
  }
  throw new Error('Kein GitHub-Token im Git Credential Manager gefunden.');
}

function ghJsonRequest(token, method, apiPath, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const payload = bodyObj ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: apiPath,
        method,
        headers: {
          'User-Agent': `SnapPhrase-Publisher/${version}`,
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': payload.length,
              }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch (e) {
            parsed = { raw: data };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function uploadReleaseAsset(token, releaseId, filePath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const contentType =
      ext === '.yml' || ext === '.txt' ? 'text/plain; charset=utf-8' : 'application/octet-stream';

    const req = https.request(
      {
        hostname: 'uploads.github.com',
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`,
        method: 'POST',
        headers: {
          'User-Agent': `SnapPhrase-Publisher/${version}`,
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': contentType,
          'Content-Length': stat.size,
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data || '{}'));
          } else {
            reject(new Error(`Asset-Upload fehlgeschlagen (${fileName}): HTTP ${res.statusCode} ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.pipe(req);
  });
}

function generateSha256SumsFile() {
  const exeFiles = [
    `SnapPhrase-Setup-${version}.exe`,
    `SnapPhrase-Portable-${version}.exe`,
  ];
  const lines = [];
  for (const name of exeFiles) {
    const p = path.join(distDir, name);
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      lines.push(`${hash}  ${name}`);
    }
  }
  const sumsPath = path.join(distDir, 'SHA256SUMS.txt');
  fs.writeFileSync(sumsPath, lines.join('\n') + '\n', 'utf8');
  return sumsPath;
}

async function main() {
  const requiredAssets = [
    path.join(distDir, 'latest.yml'),
    path.join(distDir, `SnapPhrase-Setup-${version}.exe`),
    path.join(distDir, `SnapPhrase-Setup-${version}.exe.blockmap`),
    path.join(distDir, `SnapPhrase-Portable-${version}.exe`),
  ];

  for (const f of requiredAssets) {
    if (!fs.existsSync(f)) {
      throw new Error(`Fehlendes Build-Artefakt: ${f}. Bitte zuerst 'npm run build:exe' ausführen.`);
    }
  }

  const sumsPath = generateSha256SumsFile();
  const allAssets = [...requiredAssets, sumsPath];

  const token = getGitHubToken();
  console.log(`[GitHub Release] Prüfe Release ${tag} auf ${owner}/${repo}...`);

  let relRes = await ghJsonRequest(
    token,
    'GET',
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(tag)}`
  );

  let release = relRes.status === 200 ? relRes.body : null;

  if (!release) {
    console.log(`[GitHub Release] Erstelle neues Release ${tag}...`);
    const createRes = await ghJsonRequest(
      token,
      'POST',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,
      {
        tag_name: tag,
        target_commitish: 'main',
        name: `SnapPhrase v${version}`,
        body: [
          `## SnapPhrase v${version}`,
          '',
          '### Downloads (Windows 10 / 11 x64)',
          `- **Windows Installer (Recommended, with Auto-Update / Empfohlen, mit Auto-Update):** \`SnapPhrase-Setup-${version}.exe\``,
          `- **Portable Edition (No install / USB stick / Ohne Installation):** \`SnapPhrase-Portable-${version}.exe\``,
          '',
          '*Automatic background updates (`latest.yml` + `.blockmap`) are active for all installed versions.*',
        ].join('\n'),
        draft: false,
        prerelease: false,
      }
    );

    if (createRes.status !== 201) {
      throw new Error(`Konnte Release nicht erstellen: HTTP ${createRes.status} ${JSON.stringify(createRes.body)}`);
    }
    release = createRes.body;
  }

  const existingAssets = Array.isArray(release.assets) ? release.assets : [];
  for (const assetPath of allAssets) {
    const fileName = path.basename(assetPath);
    const oldAsset = existingAssets.find((a) => a.name === fileName);
    if (oldAsset) {
      console.log(`[GitHub Release] Entferne vorhandenes Asset ${fileName}...`);
      await ghJsonRequest(
        token,
        'DELETE',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/assets/${oldAsset.id}`
      );
    }
    const sizeMb = (fs.statSync(assetPath).size / (1024 * 1024)).toFixed(2);
    console.log(`[GitHub Release] Lade hoch: ${fileName} (${sizeMb} MB)...`);
    await uploadReleaseAsset(token, release.id, assetPath);
  }

  console.log(`[GitHub Release] Fertig! Release veröffentlicht unter: ${release.html_url}`);
}

main().catch((err) => {
  console.error('[GitHub Release] Fehler:', err.message || err);
  process.exit(1);
});
