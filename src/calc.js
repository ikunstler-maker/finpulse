/**
 * РОЗРАХУНКИ (без доступу до сторінки)
 *
 * Джерело правди для доходів: зарплата (`incomeUAH`) + статті надходжень (`incomes`).
 * Поля `savingsUAH` / `extraIncomeUAH` — застаріле дзеркало статей «savings» / «extra»,
 * тому в сумах їх не додаємо (інакше заощадження рахуються двічі).
 */

/** Курс за замовчуванням, коли в місяці його ще не задано. */
export const DEFAULT_RATE = 41.5;

export function isExpenseOverdue(expense, curMonth, today = new Date()) {
    const curYear = today.getFullYear();
    const curMonthNum = today.getMonth() + 1;
    const curDay = today.getDate();

    if (curMonth.year < curYear) return true;
    if (curMonth.year === curYear && curMonth.month < curMonthNum) return true;
    if (curMonth.year === curYear && curMonth.month === curMonthNum) {
        return expense.payDay < curDay;
    }
    return false;
}

export function getNextMonthKey(key) {
    const [y, m] = key.split('-').map(Number);
    if (m === 12) return `${y + 1}-01`;
    return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function getPrevMonthKey(key) {
    const [y, m] = key.split('-').map(Number);
    if (m === 1) return `${y - 1}-12`;
    return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function sumUAH(items) {
    return (items || []).reduce((s, i) => s + (i.amountUAH || 0), 0);
}

export function incomeItemsTotal(month, { receivedOnly = false } = {}) {
    const items = (month.incomes || []).filter(i => !receivedOnly || i.isReceived !== false);
    return sumUAH(items);
}

/**
 * Зарплата місяця. З версії даних 4 вона складається з частин (виводів):
 * кожна має суму у своїй валюті та фактичну суму в гривнях (`uah`).
 * Без частин (старі дані) — поле `incomeUAH`, яке вважається отриманим.
 */
export function salaryTotal(month, { receivedOnly = false } = {}) {
    if (!Array.isArray(month.salaryParts)) return month.incomeUAH || 0;
    return month.salaryParts
        .filter(p => !receivedOnly || p.received)
        .reduce((s, p) => s + (p.uah || 0), 0);
}

/** Сума частин зарплати в іноземній валюті (для звітів у $/USDT). */
export function salaryForeignTotal(month) {
    if (!Array.isArray(month.salaryParts)) {
        if (month.incomeUSDT !== undefined) return month.incomeUSDT;
        if (month.incomeUSD !== undefined) return month.incomeUSD;
        return month.rate ? (month.incomeUAH || 0) / month.rate : 0;
    }
    return month.salaryParts.reduce((s, p) => s + (p.currency === 'UAH' ? (month.rate ? p.uah / month.rate : 0) : p.amount || 0), 0);
}

/** Фактичний курс частини: скільки гривень отримано за 1 одиницю валюти. */
export function partRate(part) {
    return part.currency !== 'UAH' && part.amount > 0 ? part.uah / part.amount : 0;
}

/** Середній курс усіх валютних частин зарплати (зважений за сумою). */
export function averageSalaryRate(month) {
    const parts = (month.salaryParts || []).filter(p => p.currency !== 'UAH' && p.amount > 0);
    const amount = parts.reduce((s, p) => s + p.amount, 0);
    return amount > 0 ? parts.reduce((s, p) => s + p.uah, 0) / amount : 0;
}

/** Гривні для суми в валюті за курсом, з округленням до копійок. */
export function toUAH(amount, currency, rate) {
    return currency === 'UAH' ? round2(amount) : round2(amount * rate);
}

export function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

/** Усі доходи місяця: ЗП + статті надходжень. */
export function monthIncomeTotal(month) {
    return salaryTotal(month) + incomeItemsTotal(month);
}

/** Уже отримані доходи: отримані частини ЗП + статті, позначені як отримані. */
export function monthReceivedIncome(month) {
    return salaryTotal(month, { receivedOnly: true }) + incomeItemsTotal(month, { receivedOnly: true });
}

/** Витрати наступного місяця, які треба сплатити до його ЗП («місток»). */
export function bridgeExpenses(nextMonth) {
    if (!nextMonth || !Array.isArray(nextMonth.expenses)) return { items: [], total: 0 };
    const items = nextMonth.expenses.filter(e => e.payDay < nextMonth.salaryDay);
    return { items, total: sumUAH(items) };
}

/** Усі показники вкладки «Бюджет» для місяця `monthKey`. */
export function computeMonthSummary(state, monthKey, today = new Date()) {
    const month = state.months[monthKey];
    const itemsIncomeTotalUAH = incomeItemsTotal(month);
    const totalIncomeUAH = monthIncomeTotal(month);
    const totalReceivedIncomeUAH = monthReceivedIncome(month);

    let totalPlannedUAH = 0;
    let totalPaidUAH = 0;
    let totalPendingUAH = 0;
    let overdueCount = 0;
    month.expenses.forEach(e => {
        totalPlannedUAH += e.amountUAH;
        if (e.isPaid) {
            totalPaidUAH += e.amountUAH;
        } else {
            totalPendingUAH += e.amountUAH;
            if (isExpenseOverdue(e, month, today)) overdueCount++;
        }
    });

    const nextMonth = state.months[getNextMonthKey(monthKey)];
    const bridge = bridgeExpenses(nextMonth);

    const inHandUAH = Math.max(0, totalReceivedIncomeUAH - totalPaidUAH);
    const remainingToPayUAH = totalPendingUAH + bridge.total;
    const goalsAllocatedUAH = goalMovesTotal(month);
    const freeBalanceUAH = totalIncomeUAH - (totalPlannedUAH + bridge.total) - goalsAllocatedUAH;
    const totalObligations = totalPlannedUAH + bridge.total;
    const pctPaid = totalObligations > 0 ? Math.min(100, Math.round((totalPaidUAH / totalObligations) * 100)) : 0;
    const pctPending = totalObligations > 0 ? Math.min(100 - pctPaid, Math.round((remainingToPayUAH / totalObligations) * 100)) : 0;

    return {
        itemsIncomeTotalUAH,
        totalIncomeUAH,
        totalReceivedIncomeUAH,
        totalPlannedUAH,
        totalPaidUAH,
        totalPendingUAH,
        overdueCount,
        nextMonth,
        bridgeItems: bridge.items,
        bridgeTotalUAH: bridge.total,
        inHandUAH,
        inHandUSD: month.rate ? inHandUAH / month.rate : 0,
        remainingToPayUAH,
        goalsAllocatedUAH,
        freeBalanceUAH,
        freeBalanceUSD: month.rate ? freeBalanceUAH / month.rate : 0,
        totalObligations,
        pctPaid,
        pctPending,
        pendingCount: month.expenses.filter(e => !e.isPaid).length,
        paidCount: month.expenses.filter(e => e.isPaid).length,
    };
}

/** Підсумок по категорії витрат ('all' — усі категорії). */
export function categorySummary(expenses, categoryId = 'all') {
    const items = categoryId === 'all' ? expenses : expenses.filter(e => e.category === categoryId);
    const total = items.reduce((s, e) => s + e.amountUAH, 0);
    const spent = items.filter(e => e.isPaid).reduce((s, e) => s + e.amountUAH, 0);
    const remaining = items.filter(e => !e.isPaid).reduce((s, e) => s + e.amountUAH, 0);
    const pct = total > 0 ? Math.round((spent / total) * 100) : 0;
    return { total, spent, remaining, pct };
}

/**
 * Вільний залишок місяця, який переходить у заощадження наступного:
 * доходи − (усі витрати місяця + витрати наступного місяця до ЗП).
 */
export function carryOverBalance(month, nextMonthExpenses, salaryDay) {
    const planned = (month.expenses || []).reduce((s, e) => s + e.amountUAH, 0);
    const bridge = (nextMonthExpenses || []).filter(e => e.payDay < salaryDay).reduce((s, e) => s + e.amountUAH, 0);
    return Math.max(0, monthIncomeTotal(month) - (planned + bridge));
}

/** Калькулятор звірки: скільки безпечно лишається і чи є розбіжність з таблицею. */
export function reconcile(month, nextMonth, actualUAH) {
    let pending = 0;
    let paid = 0;
    month.expenses.forEach(e => {
        if (e.isPaid) paid += e.amountUAH;
        else pending += e.amountUAH;
    });
    const toPay = pending + bridgeExpenses(nextMonth).total;
    const expectedInHand = Math.max(0, monthReceivedIncome(month) - paid);
    const diff = expectedInHand - actualUAH;
    return {
        toPay,
        safeBalance: actualUAH - toPay,
        expectedInHand,
        diff,
        hasDiscrepancy: actualUAH > 0 && Math.abs(diff) > 5,
    };
}

/**
 * Дані для звітів.
 * period: 'custom' (from/to — рядки YYYY-MM-DD), 'current', '3m', '6m', 'year', 'all'.
 */
export function collectAnalytics(state, { period, from, to }) {
    const allKeys = Object.keys(state.months).sort();
    const expenses = [];
    let totalIncome = 0;
    let totalIncomeUSD = 0;
    let selectedMonths = [];

    if (period === 'custom') {
        const fromD = from ? new Date(from + 'T00:00:00') : new Date('2020-01-01');
        const toD = to ? new Date(to + 'T23:59:59') : new Date('2035-12-31');
        allKeys.forEach(k => {
            const m = state.months[k];
            if (!m) return;

            if (Array.isArray(m.salaryParts)) {
                m.salaryParts.forEach(p => {
                    const partD = new Date(m.year, m.month - 1, p.day || m.salaryDay || 8);
                    if (partD >= fromD && partD <= toD) {
                        totalIncome += p.uah || 0;
                        totalIncomeUSD += p.currency === 'UAH' ? (m.rate ? p.uah / m.rate : 0) : p.amount || 0;
                    }
                });
            } else {
                const salD = new Date(m.year, m.month - 1, m.salaryDay || 8);
                if (salD >= fromD && salD <= toD) {
                    totalIncome += m.incomeUAH || 0;
                    totalIncomeUSD += salaryForeignTotal(m);
                }
            }
            (m.incomes || []).forEach(inc => {
                const incD = new Date(m.year, m.month - 1, inc.day || 1);
                if (incD >= fromD && incD <= toD) {
                    totalIncome += inc.amountUAH || 0;
                    if (m.rate > 0) totalIncomeUSD += inc.amountUAH / m.rate;
                }
            });
            (m.expenses || []).forEach(e => {
                const expD = new Date(m.year, m.month - 1, e.payDay);
                if (expD >= fromD && expD <= toD) {
                    expenses.push({ ...e, monthKey: k, monthRate: m.rate, expenseDate: expD });
                }
            });
        });
        return { expenses, totalIncome, totalIncomeUSD, selectedMonths };
    }

    const curIdx = allKeys.indexOf(state.activeMonthKey);
    const activeIdx = curIdx >= 0 ? curIdx : allKeys.length - 1;
    if (period === 'current') {
        selectedMonths = [state.months[state.activeMonthKey]];
    } else if (period === '3m' || period === '6m') {
        const span = period === '3m' ? 3 : 6;
        const start = Math.max(0, activeIdx - (span - 1));
        selectedMonths = allKeys.slice(start, activeIdx + 1).map(k => state.months[k]);
    } else if (period === 'year') {
        const curYear = state.months[state.activeMonthKey]?.year || 2026;
        selectedMonths = allKeys.filter(k => state.months[k].year === curYear).map(k => state.months[k]);
    } else {
        selectedMonths = allKeys.map(k => state.months[k]);
    }

    selectedMonths.filter(Boolean).forEach(m => {
        totalIncome += monthIncomeTotal(m);
        totalIncomeUSD += salaryForeignTotal(m);
        (m.expenses || []).forEach(e => {
            expenses.push({ ...e, monthKey: `${m.year}-${m.month}`, monthRate: m.rate });
        });
    });
    return { expenses, totalIncome, totalIncomeUSD, selectedMonths };
}

/** Суми по категоріях для діаграми, від більшої до меншої. */
export function categoryTotals(expenses, categories) {
    const catMap = {};
    expenses.forEach(e => {
        catMap[e.category] = (catMap[e.category] || 0) + e.amountUAH;
    });
    return categories
        .filter(c => catMap[c.id] > 0)
        .sort((a, b) => catMap[b.id] - catMap[a.id])
        .map(c => ({ category: c, amountUAH: catMap[c.id] }));
}

/**
 * Встановлює загальну суму категорії надходжень (з вікна «Зарплата»).
 * Різниця лягає на статтю-шаблон категорії, інші статті не змінюються.
 * Дзеркальні поля `savingsUAH` / `extraIncomeUAH` оновлюються для сумісності.
 */
export function setIncomeCategoryTotal(month, category, total) {
    const items = (month.incomes || []).filter(i => i.category === category);
    const current = sumUAH(items);
    const target = items.find(i => i.isPreset) || items[0];
    if (target && Math.abs(total - current) >= 0.005) {
        const wasEmpty = !(target.amountUAH > 0);
        target.amountUAH = Math.max(0, +((target.amountUAH || 0) + (total - current)).toFixed(2));
        if (wasEmpty && target.amountUAH > 0) target.isReceived = true;
    }
    const synced = sumUAH((month.incomes || []).filter(i => i.category === category));
    if (category === 'savings') month.savingsUAH = synced;
    if (category === 'extra') month.extraIncomeUAH = synced;
}

/* ---------- Цілі (конверти) ---------- */

/**
 * Цілі — віртуальні конверти: гроші лишаються на картці, але вже «зайняті».
 * Відкладене в місяці зменшує вільний залишок цього місяця; «на руках» не змінює.
 */
export function goalMovesTotal(month, goalId = null) {
    return (month.goalMoves || [])
        .filter(m => !goalId || m.goalId === goalId)
        .reduce((s, m) => s + (m.amount || 0), 0);
}

/** Скільки накопичено в цілі за всі місяці. */
export function goalBalance(state, goalId) {
    return round2(Object.values(state.months).reduce((s, m) => s + goalMovesTotal(m, goalId), 0));
}

export function goalProgress(state, goal) {
    const saved = goalBalance(state, goal.id);
    const pct = goal.target > 0 ? Math.min(100, Math.round(saved / goal.target * 100)) : 0;
    return { saved, pct, left: Math.max(0, round2((goal.target || 0) - saved)) };
}

/* ---------- Дві виплати (аванс + основна) ---------- */

/**
 * Якщо в місяці є друга виплата (secondPayDay > salaryDay), цикл ділиться на два періоди:
 * 1) від першої виплати до дня перед другою; 2) від другої до наступної першої (з «містком»).
 * Залишок першого періоду переходить у другий, тож кінцевий залишок = вільний залишок без цілей.
 */
export function payPeriods(state, monthKey) {
    const m = state.months[monthKey];
    const second = m.secondPayDay;
    if (!(second > m.salaryDay)) return null;
    const next = state.months[getNextMonthKey(monthKey)];
    const bridge = bridgeExpenses(next);
    const before = d => (d || 1) < second;
    const partsSum = pred => (m.salaryParts || []).filter(p => pred(p.day)).reduce((s, p) => s + (p.uah || 0), 0)
        + (Array.isArray(m.salaryParts) ? 0 : (pred(m.salaryDay) ? m.incomeUAH || 0 : 0));
    const itemsSum = pred => (m.incomes || []).filter(i => pred(i.day)).reduce((s, i) => s + (i.amountUAH || 0), 0);
    const expSum = (pred, paidOnly = false) => m.expenses.filter(e => pred(e.payDay) && (!paidOnly || e.isPaid)).reduce((s, e) => s + e.amountUAH, 0);

    const income1 = partsSum(before) + itemsSum(before);
    const income2 = partsSum(d => !before(d)) + itemsSum(d => !before(d));
    const planned1 = expSum(before);
    const planned2 = expSum(d => !before(d)) + bridge.total;
    const balance1 = round2(income1 - planned1);
    return [
        { from: { month: m.month, day: m.salaryDay }, to: { month: m.month, day: second - 1 }, income: round2(income1), planned: round2(planned1), paid: round2(expSum(before, true)), balance: balance1 },
        {
            from: { month: m.month, day: second },
            to: { month: m.month === 12 ? 1 : m.month + 1, day: Math.max(1, (next?.salaryDay || m.salaryDay) - 1) },
            income: round2(income2), planned: round2(planned2), paid: round2(expSum(d => !before(d), true) + sumUAH(bridge.items.filter(e => e.isPaid))),
            balance: round2(balance1 + income2 - planned2),
        },
    ];
}

/** До якого періоду належить день місяця (1 або 2); null — якщо другої виплати немає. */
export function periodOfDay(month, day) {
    if (!(month.secondPayDay > month.salaryDay)) return null;
    return day < month.secondPayDay ? 1 : 2;
}

/* ---------- Фільтри й сортування витрат ---------- */

/**
 * Відбирає й сортує витрати. items — [{ e, month, monthKey, bridge }].
 * status: all | unpaid | overdue | soon | bridge | paid | period1 | period2.
 */
export function filterExpenses(items, { status = 'all', categories = [], card = 'all', min = null, max = null, search = '', sort = 'date' } = {}, today = new Date()) {
    const q = search.trim().toLowerCase();
    const days = x => Math.round((new Date(x.month.year, x.month.month - 1, x.e.payDay) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    const byStatus = {
        all: () => true,
        unpaid: x => !x.e.isPaid,
        overdue: x => !x.bridge && !x.e.isPaid && isExpenseOverdue(x.e, x.month, today),
        soon: x => !x.e.isPaid && !(x.bridge ? false : isExpenseOverdue(x.e, x.month, today)) && days(x) >= 0 && days(x) <= 7,
        bridge: x => x.bridge,
        paid: x => x.e.isPaid,
        period1: x => !x.bridge && periodOfDay(x.month, x.e.payDay) === 1,
        period2: x => x.bridge || periodOfDay(x.month, x.e.payDay) === 2,
    }[status] || (() => true);
    const out = items.filter(x => byStatus(x)
        && (!categories.length || categories.includes(x.e.category))
        && (card === 'all' || (card === 'none' ? !x.e.cardId : x.e.cardId === card))
        && (min == null || x.e.amountUAH >= min)
        && (max == null || x.e.amountUAH <= max)
        && (!q || x.e.title.toLowerCase().includes(q)));
    const dateKey = x => (x.bridge ? 100 : 0) + x.e.payDay;
    const sorters = {
        date: (a, b) => dateKey(a) - dateKey(b),
        amountDesc: (a, b) => b.e.amountUAH - a.e.amountUAH,
        amountAsc: (a, b) => a.e.amountUAH - b.e.amountUAH,
        alpha: (a, b) => a.e.title.localeCompare(b.e.title, 'uk'),
    };
    return out.sort(sorters[sort] || sorters.date);
}

/* ---------- Банківські картки ---------- */

/**
 * Рух по картці за місяць: сплачено й заплановано витрат, отримано й очікується надходжень
 * (частини ЗП і статті надходжень). cardId = null — записи без картки.
 */
export function cardMonthTotals(month, cardId) {
    const match = r => (cardId == null ? !r.cardId : r.cardId === cardId);
    const t = { spent: 0, planned: 0, received: 0, expected: 0, count: 0 };
    (month.expenses || []).filter(match).forEach(e => {
        t.count++;
        if (e.isPaid) t.spent += e.amountUAH || 0;
        else t.planned += e.amountUAH || 0;
    });
    (month.salaryParts || []).filter(match).forEach(p => {
        t.count++;
        if (p.received) t.received += p.uah || 0;
        else t.expected += p.uah || 0;
    });
    (month.incomes || []).filter(i => match(i) && (i.amountUAH || 0) > 0).forEach(i => {
        t.count++;
        if (i.isReceived !== false) t.received += i.amountUAH;
        else t.expected += i.amountUAH;
    });
    for (const k of ['spent', 'planned', 'received', 'expected']) t[k] = round2(t[k]);
    return t;
}

/** Скільки записів у всіх місяцях посилається на картку (перед видаленням). */
export function cardUsage(state, cardId) {
    let n = 0;
    for (const m of Object.values(state.months)) {
        for (const list of [m.expenses, m.incomes, m.salaryParts]) n += (list || []).filter(r => r.cardId === cardId).length;
    }
    return n;
}
