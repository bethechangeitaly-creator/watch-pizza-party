// Builds the extension and zips apps/extension/dist into release/watch-pizza-party-<version>.zip.
// Set VITE_SERVER_URL to point the build at the production server.
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/extension/dist');

execSync('npm run build:extension', { cwd: root, stdio: 'inherit' });

const { version } = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
const releaseDir = path.join(root, 'release');
mkdirSync(releaseDir, { recursive: true });
const zipPath = path.join(releaseDir, `watch-pizza-party-${version}.zip`);
if (existsSync(zipPath)) rmSync(zipPath);

// Store artwork lives in public/ for convenience but is not used by the extension.
const exclude = ['*.DS_Store', 'icon-source-watch-pizza-party.png', 'icon-store-watch-pizza-party-512.png', 'icon-watchparty-retro.png'];
execSync(`zip -r -X -q "${zipPath}" . ${exclude.map((p) => `-x "${p}"`).join(' ')}`, { cwd: dist, stdio: 'inherit' });

console.log(`Packaged ${path.relative(root, zipPath)}${process.env.VITE_SERVER_URL ? ` for ${process.env.VITE_SERVER_URL}` : ' (default server URL)'}`);
