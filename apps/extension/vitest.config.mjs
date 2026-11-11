import { defineConfig } from 'vitest/config';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@watch-party/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
        },
    },
    test: {
        include: ['src/**/*.test.{ts,tsx}'],
        passWithNoTests: true,
        setupFiles: ['src/test/setup.ts'],
    },
});
