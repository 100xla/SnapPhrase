/**
 * SnapPhrase Version Synchronizer
 * Usage:
 *   node build/bump-version.js 1.6.0
 *   node build/bump-version.js patch | minor | major
 *
 * Updates the version number unambiguously across package.json, src/*, ui/*, and README.md.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const pkgPath = path.join(projectRoot, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

const arg = String(process.argv[2] || '').trim();
if (!arg) {
  console.error('Usage: node build/bump-version.js <x.y.z | patch | minor | major>');
  process.exit(1);
}

function computeNextVersion(cur, bumpArg) {
  const parts = cur.split('.').map((n) => parseInt(n, 10));
  if (bumpArg === 'patch') return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  if (bumpArg === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
  if (bumpArg === 'major') return `${parts[0] + 1}.0.0`;
  const clean = bumpArg.replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+$/.test(clean)) {
    throw new Error(`Invalid version "${bumpArg}". Expected semver like 1.6.0 or patch/minor/major.`);
  }
  return clean;
}

const nextVersion = computeNextVersion(currentVersion, arg);

// 1. Update package.json & package-lock.json top-level version
pkg.version = nextVersion;
pkg.description = pkg.description.replace(/(?:SnapPhrase|SatzTresor) v\d+\.\d+\.\d+/, `SnapPhrase v${nextVersion}`);
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

const lockPath = path.join(projectRoot, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.name = 'snapphrase';
    lock.version = nextVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].name = 'snapphrase';
      lock.packages[''].version = nextVersion;
    }
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  } catch (e) {}
}

// 2. Synchronize source, UI, and documentation headers/tags
const genericHeaderFiles = [
  'src/main.js',
  'src/storage.js',
  'src/win32.js',
  'src/crypto.js',
  'src/preload.js',
  'src/updater.js',
  'ui/app.js',
  'ui/style.css',
];

for (const rel of genericHeaderFiles) {
  const fullPath = path.join(projectRoot, rel);
  if (!fs.existsSync(fullPath)) continue;
  const before = fs.readFileSync(fullPath, 'utf8');
  const after = before.replace(/(?:SnapPhrase|SatzTresor) v\d+\.\d+\.\d+ —/g, `SnapPhrase v${nextVersion} —`);
  if (after !== before) {
    fs.writeFileSync(fullPath, after, 'utf8');
  }
}

const replacements = [
  {
    rel: 'src/main.js',
    apply: (txt) => txt.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${nextVersion}';`),
  },
  {
    rel: 'ui/app.js',
    apply: (txt) => txt.replace(/version:\s*'\d+\.\d+\.\d+'/, `version: '${nextVersion}'`),
  },
  {
    rel: 'ui/index.html',
    apply: (txt) =>
      txt
        .replace(
          /<span id="versionTag" class="version-pill">v\d+\.\d+\.\d+<\/span>/,
          `<span id="versionTag" class="version-pill">v${nextVersion}</span>`
        )
        .replace(
          /<span class="settings-title" id="updateStatusHeadline">(?:SnapPhrase|SatzTresor) v\d+\.\d+\.\d+<\/span>/,
          `<span class="settings-title" id="updateStatusHeadline">SnapPhrase v${nextVersion}</span>`
        ),
  },
  {
    rel: 'README.md',
    apply: (txt) =>
      txt
        .replace(/Version-\d+\.\d+\.\d+-2563eb/g, `Version-${nextVersion}-2563eb`)
        .replace(/(?:SnapPhrase|SatzTresor)-Portable-\d+\.\d+\.\d+\.exe/g, `SnapPhrase-Portable-${nextVersion}.exe`)
        .replace(/(?:SnapPhrase|SatzTresor)-Setup-\d+\.\d+\.\d+\.exe/g, `SnapPhrase-Setup-${nextVersion}.exe`),
  },
  {
    rel: 'STORE_GUIDE.md',
    apply: (txt) =>
      txt
        .replace(/(?:SnapPhrase|SatzTresor)-Portable-\d+\.\d+\.\d+\.exe/g, `SnapPhrase-Portable-${nextVersion}.exe`)
        .replace(/(?:SnapPhrase|SatzTresor)-Setup-\d+\.\d+\.\d+\.exe/g, `SnapPhrase-Setup-${nextVersion}.exe`)
        .replace(/(?:SnapPhrase|SatzTresor)-Store-\d+\.\d+\.\d+\.appx/g, `SnapPhrase-Store-${nextVersion}.appx`),
  },
];

for (const item of replacements) {
  const fullPath = path.join(projectRoot, item.rel);
  if (!fs.existsSync(fullPath)) continue;
  const before = fs.readFileSync(fullPath, 'utf8');
  const after = item.apply(before);
  if (after !== before) {
    fs.writeFileSync(fullPath, after, 'utf8');
  }
}

console.log(`[SnapPhrase Version] Updated ${currentVersion} -> ${nextVersion} across all project files.`);
