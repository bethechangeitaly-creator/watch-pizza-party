import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Extension pages and the module service worker. Content scripts are classic scripts and
// are built separately by vite.scripts.config.mjs so no shared chunk can leak into them.
export default defineConfig({
    plugins: [
        react(),
        viteStaticCopy({
            targets: [
                { src: 'manifest.json', dest: '.' },
                { src: 'offscreen.html', dest: '.' },
            ],
        }),
    ],
    resolve: {
        alias: {
            '@watch-party/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                popup: path.resolve(__dirname, 'popup.html'),
                background: path.resolve(__dirname, 'src/background/index.ts'),
                offscreen: path.resolve(__dirname, 'src/offscreen.ts'),
            },
            output: {
                entryFileNames: (chunk) =>
                    chunk.name === 'background' || chunk.name === 'offscreen' ? '[name].js' : 'assets/[name]-[hash].js',
            },
        },
    },
});
