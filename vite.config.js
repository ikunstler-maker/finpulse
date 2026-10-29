import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The site is served from https://ikunstler-maker.github.io/finpulse/
export default defineConfig({
    base: '/finpulse/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, 'index.html'),
                prototype: resolve(import.meta.dirname, 'prototype.html'),
            },
        },
    },
    test: {
        include: ['tests/unit/**/*.test.js'],
    },
});
