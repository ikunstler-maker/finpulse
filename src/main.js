import './styles.css';
import { getMode, tryRememberedUnlock } from './sync/controller.js';
import { startApp } from './ui/app.js';
import { showLockScreen } from './ui/lock.js';
import { applyTheme } from './ui/more.js';

applyTheme();
if (getMode() === 'locked') {
    tryRememberedUnlock().then(ok => (ok ? startApp() : showLockScreen(startApp)));
} else {
    startApp();
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* офлайн-режим просто не ввімкнеться */ });
}
