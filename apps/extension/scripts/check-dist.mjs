// Post-build guard for the extension package. Exits 1 with a reason when a rule is broken.
import { readFileSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const src = path.join(root, 'src');
const problems = [];

const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
});

// 1. No TypeScript sources in the package.
for (const file of walk(dist)) {
    if (file.endsWith('.ts')) problems.push(`dist contains a .ts file: ${path.relative(root, file)}`);
}

// 2. Content scripts must be classic scripts.
for (const name of ['content.js', 'player-bridge.js']) {
    const code = readFileSync(path.join(dist, name), 'utf8');
    if (/^\s*(import|export)\s/m.test(code)) problems.push(`${name} is not a classic script (top-level import/export)`);
}

// 3. No new permissions: Chrome disables an extension on update when new warnings appear.
const BASELINE_PERMISSIONS = ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs', 'tabCapture', 'offscreen'];
const BASELINE_HOSTS = ['https://*.netflix.com/*', 'https://*.youtube.com/*', 'https://youtu.be/*', 'https://watch-pizza-party.onrender.com/*'];
const manifest = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
for (const p of manifest.permissions ?? []) {
    if (!BASELINE_PERMISSIONS.includes(p)) problems.push(`new permission not allowed: ${p}`);
}
for (const h of manifest.host_permissions ?? []) {
    if (!BASELINE_HOSTS.includes(h)) problems.push(`new host permission not allowed: ${h}`);
}

// 3b. Prime Video is optional access only (asked on first use), never a manifest content script.
for (const h of manifest.optional_host_permissions ?? []) {
    if (!/^https:\/\/\*\.(primevideo\.com|amazon\.[a-z.]+)\/\*$/.test(h)) problems.push(`unexpected optional host permission: ${h}`);
}
if (/amazon|primevideo/.test(JSON.stringify(manifest.content_scripts ?? []))) problems.push('Prime Video must not be in manifest content_scripts');

// 4. Never steal focus by activating a tab.
for (const file of walk(src)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const code = readFileSync(file, 'utf8');
    if (/chrome\.tabs\.update\([^)]*active\s*:\s*true/s.test(code)) {
        problems.push(`${path.relative(root, file)} activates a tab with chrome.tabs.update(..., { active: true })`);
    }
}

if (problems.length) {
    console.error(`dist check failed:\n- ${problems.join('\n- ')}`);
    process.exit(1);
}
console.log('dist ok');
