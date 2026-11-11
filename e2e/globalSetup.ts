import { execSync } from 'child_process';
import * as path from 'path';
import { pathToFileURL } from 'url';

export const E2E_PORT = 3105;
const root = path.resolve(import.meta.dirname, '..');

export default async function globalSetup() {
    const run = (cmd: string, env: Record<string, string> = {}) =>
        execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    run('npm run build:server');
    run('npm run build:extension', { VITE_SERVER_URL: `http://127.0.0.1:${E2E_PORT}` });

    const { createApp } = await import(pathToFileURL(path.join(root, 'apps/server/dist/app.js')).href);
    const app = createApp({});
    await new Promise<void>((resolve) => app.httpServer.listen(E2E_PORT, '127.0.0.1', resolve));
    return async () => {
        await app.close();
    };
}
