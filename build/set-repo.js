/**
 * Configure GitHub Repository for SatzTresor Auto-Updates
 * Usage: npm run repo -- deinname/satztresor
 */

const fs = require('fs');
const path = require('path');

const raw = String(process.argv[2] || '')
  .trim()
  .replace(/^https?:\/\/github\.com\//i, '')
  .replace(/\.git$/i, '')
  .replace(/^\/+|\/+$/g, '');

const parts = raw.split('/').filter(Boolean);
if (parts.length !== 2) {
  console.error('Verwendung: npm run repo -- <github-name>/<repository>');
  console.error('Beispiel:   npm run repo -- xavi/satztresor');
  process.exit(1);
}

const [owner, repo] = parts;
const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

pkg.build = pkg.build || {};
pkg.build.publish = [
  {
    provider: 'github',
    owner,
    repo,
    releaseType: 'release',
  },
];

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`[SatzTresor Repo] Update-Quelle in package.json gesetzt auf: ${owner}/${repo}`);
