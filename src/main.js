import './styles.css';
import { startApp } from './ui/app.js';

startApp();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* офлайн-режим просто не ввімкнеться */ });
}
