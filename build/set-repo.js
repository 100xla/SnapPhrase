/**
 * Configure GitHub Repository for SnapPhrase Auto-Updates
 * Usage: npm run repo -- 100xla/SnapPhrase
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
  console.error('Usage:   npm run repo -- <github-owner>/<repository>');
  console.error('Example: npm run repo -- 100xla/SnapPhrase');
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
console.log(`[SnapPhrase Repo] Update target in package.json set to: ${owner}/${repo}`);
