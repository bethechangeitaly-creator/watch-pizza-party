import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: { '@watch-party/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') },
    },
    test: { include: ['test/**/*.test.ts'], testTimeout: 10_000 },
});
