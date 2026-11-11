import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: /.*\.spec\.ts/,
    timeout: 180_000,
    expect: { timeout: 10_000 },
    retries: 1, // YouTube ads make single runs flaky.
    workers: 1,
    reporter: [['list']],
    globalSetup: './globalSetup.ts',
    use: { trace: 'retain-on-failure' },
});
