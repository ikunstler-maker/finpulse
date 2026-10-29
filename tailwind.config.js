/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.js'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                darkbg: '#0b1120',
                darkcard: '#131d31',
                darkborder: '#1e293b',
            },
        },
    },
};
