import { defineConfig } from 'vite';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Builds ONE classic (IIFE) script per run: SCRIPT_ENTRY=content | player-bridge.
const ENTRIES = {
    content: 'src/content.ts',
    'player-bridge': 'src/player-bridge.ts',
};

const entry = process.env.SCRIPT_ENTRY;
if (!entry || !(entry in ENTRIES)) {
    throw new Error(`SCRIPT_ENTRY must be one of: ${Object.keys(ENTRIES).join(', ')}`);
}

export default defineConfig({
    resolve: {
        alias: {
            '@watch-party/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
        },
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    publicDir: false,
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        copyPublicDir: false,
        lib: {
            entry: path.resolve(__dirname, ENTRIES[entry]),
            formats: ['iife'],
            name: `wpp_${entry.replace(/-/g, '_')}`,
            fileName: () => `${entry}.js`,
        },
    },
});
