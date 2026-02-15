import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [
        react(),
        viteStaticCopy({
            targets: [
                { src: 'manifest.json', dest: '.' },
                { src: 'offscreen.html', dest: '.' },
                { src: 'src/content.ts', dest: '.', rename: 'content.ts' } // Temporary for build
            ],
        }),
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                popup: path.resolve(__dirname, 'popup.html'),
                content: path.resolve(__dirname, 'src/content.ts'),
                background: path.resolve(__dirname, 'src/background.ts'),
                offscreen: path.resolve(__dirname, 'src/offscreen.ts'),
                'player-bridge': path.resolve(__dirname, 'src/player-bridge.ts')
            },
            output: {
                entryFileNames: (chunkInfo) => {
                    if (
                        chunkInfo.name === 'content' ||
                        chunkInfo.name === 'background' ||
                        chunkInfo.name === 'offscreen' ||
                        chunkInfo.name === 'player-bridge'
                    ) {
                        return '[name].js';
                    }
                    return 'assets/[name]-[hash].js';
                }
            }
        },
    },
});
