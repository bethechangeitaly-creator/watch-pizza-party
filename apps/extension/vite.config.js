"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vite_1 = require("vite");
var plugin_react_1 = require("@vitejs/plugin-react");
var vite_plugin_static_copy_1 = require("vite-plugin-static-copy");
var path_1 = require("path");
exports.default = (0, vite_1.defineConfig)({
    plugins: [
        (0, plugin_react_1.default)(),
        (0, vite_plugin_static_copy_1.viteStaticCopy)({
            targets: [
                {
                    src: 'manifest.json',
                    dest: '.',
                },
            ],
        }),
    ],
    resolve: {
        alias: {
            '@watch-party/shared': path_1.default.resolve(__dirname, '../../packages/shared/src/index.ts'),
        },
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: path_1.default.resolve(__dirname, 'index.html'),
            },
        },
    },
});
