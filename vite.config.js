import { defineConfig } from 'vite';

// The site is served from https://ikunstler-maker.github.io/finpulse/
export default defineConfig({
    base: '/finpulse/',
    test: {
        include: ['tests/unit/**/*.test.js'],
    },
});
