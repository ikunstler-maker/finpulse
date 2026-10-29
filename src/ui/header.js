import { CATEGORIES, INCOME_CATEGORIES } from '../data/categories.js';
import { renderAll } from './render.js';

export function updateLiveClock() {
    const now = new Date();
    const monthsUa = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
    const day = now.getDate();
    const month = monthsUa[now.getMonth()];
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const dateStr = `${day} ${month} ${year}, ${hours}:${minutes}`;
    const el = document.getElementById('header-today-date');
    if (el) el.textContent = dateStr;
}

export function initTheme() {
    const savedTheme = localStorage.getItem('finpulse_theme') || 'dark';
    if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.getElementById('theme-icon').textContent = '☀️';
    } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.getElementById('theme-icon').textContent = '🌙';
    }
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        localStorage.setItem('finpulse_theme', 'light');
        document.getElementById('theme-icon').textContent = '☀️';
    } else {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
        localStorage.setItem('finpulse_theme', 'dark');
        document.getElementById('theme-icon').textContent = '🌙';
    }
    renderAll();
}

export function populateCategoryDropdowns() {
    const filterSelect = document.getElementById('category-filter');
    const modalSelect = document.getElementById('modal-category');
    const incomeCatSelect = document.getElementById('modal-income-category');

    filterSelect.innerHTML = '<option value="all">Усі категорії</option>';
    modalSelect.innerHTML = '';
    if (incomeCatSelect) incomeCatSelect.innerHTML = '';

    CATEGORIES.forEach(cat => {
        filterSelect.innerHTML += `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`;
        modalSelect.innerHTML += `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`;
    });

    if (incomeCatSelect) {
        INCOME_CATEGORIES.forEach(cat => {
            incomeCatSelect.innerHTML += `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`;
        });
    }
}
