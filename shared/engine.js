
import Decimal from 'decimal.js';
import { catalog as defaultCatalog, stockTotalShares, getOwnershipTier } from './catalog.js';
import { getBusinessModel } from './business-models.js';
import { normalizeBusiness, simulateBusiness, upgradeSpec, businessValuation } from './business-sim.js';
import { currentEconomyEvent } from './economy-events.js';
import { getChain, MAX_SUPPLIER_CONTRACTS } from './supply-chain.js';
import { RESEARCH_NODES, WORLD_REGIONS, ACHIEVEMENTS, evaluateAchievements } from './engagement.js';

Decimal.set({ precision: 40 });

export const FINANCIAL_TIME = {
    REAL_SECONDS_PER_FINANCIAL_YEAR: 86400, // 24 real-world hours = 1 financial game year (360 days)
    FINANCIAL_DAYS_PER_YEAR: 360,
    TIME_SCALE: 360 // 1 real second = 6 financial minutes
};

export function savingsApy(s) {
    return (s.research?.completed || []).includes('fintech') ? 4.5 : 4.0;
}

const D = x => new Decimal(x);
const add = (a, b) => D(a).plus(b).toString();

export function initial(now = Date.now(), c = defaultCatalog) {
    return {
        cash: c.startingCash,
        at: now,
        businesses: [],
        holdings: {},
        costBasis: {},
        watchlist: [],
        orders: [],
        contracts: [],
        properties: {},
        propState: {},
        assets: {},
        boosts: [],
        pending: null,
        slots: c.startingSlots,
        slotJob: null,
        storage: { ...(c.startingStorage || { garage: 4, hangar: 2, marina: 2 }) },
        banking: { savings: '0', loans: [], creditScore: 680, repaidCount: 0, interestEarned: '0', interestPaid: '0', lastScoreBoostAt: null },
        merger: null,
        research: { completed: [], active: null },
        achievements: [],
        notifications: [],
        tickets: 0,
        history: [],
        ledger: [],
        earned: { business: '0', property: '0', dividend: '0', project: '0' },
        premium: false,
        premiumUntil: null,
        level: 1
    };
}

// Restore empty objects removed by older Mongoose saves.
export function normalizeState(state) {
    const s = structuredClone(state);

    for (const key of ["holdings", "costBasis", "properties", "propState", "assets"]) {
        s[key] ??= {};
    }

    s.storage ??= { garage: 4, hangar: 2, marina: 2 };
    s.storage.garage ??= 4;
    s.storage.hangar ??= 2;
    s.storage.marina ??= 2;

    s.earned ??= { business: '0', property: '0', dividend: '0', project: '0' };
    for (const k of ['business', 'property', 'dividend', 'project']) {
        s.earned[k] ??= '0';
    }

    s.ledger ??= [];
    s.watchlist ??= [];
    s.orders ??= [];
    s.contracts ??= [];
    s.research ??= { completed: [], active: null };
    s.research.completed ??= [];
    s.research.active ??= null;
    s.achievements ??= [];
    s.notifications ??= [];
    s.banking ??= { savings: '0', loans: [], creditScore: 680, repaidCount: 0, interestEarned: '0', interestPaid: '0', lastScoreBoostAt: null };
    s.banking.savings ??= '0';
    s.banking.loans = (s.banking.loans || []).map(l => ({
        ...l,
        principal: l.principal ?? l.remaining ?? '0',
        remaining: l.remaining ?? '0',
        accruedInterest: l.accruedInterest ?? '0'
    }));
    s.banking.creditScore ??= 680;
    s.banking.repaidCount ??= 0;
    s.banking.interestEarned ??= '0';
    s.banking.interestPaid ??= '0';
    s.banking.lastScoreBoostAt ??= null;
    s.businesses = (s.businesses || []).map(normalizeBusiness);

    return s;
}

const find = (arr, id) => {
    const x = arr.find(x => x.id === id);

    if (!x) throw Error('Unknown item');

    return x;
};

const active = (b, t) => b.start <= t && b.end > t;

export function price(item, t) {
    const h = Math.floor(t / 3600000);
    let hash = 0;

    for (const ch of item.id) {
        hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    }

    return D(item.price)
        .times(
            1 +
            0.15 * Math.sin(h * .13 + hash) +
            0.07 * Math.sin(h * .71 + hash)
        )
        .toDecimalPlaces(2)
        .toString();
}

export function propertyMetrics(p, qty, rawState, t) {
    const ps = rawState || {};
    const rentMult = Math.max(0.6, Math.min(1.8, Number(ps.rentMult ?? 1)));
    const condition = Math.max(20, Math.min(100, Number(ps.condition ?? 100)));
    const occupancy = Math.max(0.25, Math.min(1, 1.08 - (rentMult - 0.85) * 0.55 - (100 - condition) * 0.004));
    const evPropMult = currentEconomyEvent(t).mods.property;
    const netIncome = D(p.income).times(qty).times(rentMult).times(occupancy).times(evPropMult);
    return { rentMult, condition, occupancy, netIncome };
}

export function businessRate(s, b, t, c = defaultCatalog) {
    return D(simulateBusiness(s, b, t, c).netProfit);
}

export function hourlyBreakdown(s, t = s.at, c = defaultCatalog) {
    let business = D(0), property = D(0), dividend = D(0);

    for (const b of s.businesses) {
        business = business.plus(businessRate(s, b, t, c));
    }

    for (const p of c.properties) {
        const qty = s.properties?.[p.id] || 0;
        if (qty > 0) {
            property = property.plus(propertyMetrics(p, qty, s.propState?.[p.id], t).netIncome);
        }
    }

    for (const p of c.stocks) {
        const qty = s.holdings?.[p.id] || 0;
        if (qty > 0) {
            const pct = (qty / stockTotalShares(p)) * 100;
            const bonus = 1 + getOwnershipTier(pct).divBonus;
            dividend = dividend.plus(D(p.dividend).times(qty).times(bonus));
        }
    }

    return { business, property, dividend };
}

export function hourly(s, t = s.at, c = defaultCatalog) {
    const { business, property, dividend } = hourlyBreakdown(s, t, c);
    return business.plus(property).plus(dividend).toString();
}

const pushNotif = (s, type, title, detail, t) => {
    s.notifications = [{ id: `${type}-${t}-${(s.notifications || []).length}`, type, title, detail, at: t, read: false }, ...(s.notifications || [])].slice(0, 50);
};

function finish(s, t, c) {
    if (s.pending && s.pending.end <= t) {
        const p = s.pending;
        s.pending = null;
        reward(s, p.action, t, c);
    }

    for (const b of s.businesses) {
        if (b.job && b.job.end <= t) {
            if (b.job.kind === 'upgrade') {
                const key = b.job.key || 'level';
                b.upgrades ??= { level: b.level, infra: 1, efficiency: 1 };
                b.upgrades[key] = (b.upgrades[key] || 1) + 1;
                if (key === 'level') b.level = b.upgrades.level;
                if (b.type === 'bank' && key === 'infra') b.vault = b.upgrades.infra - 1;
                b.history = [{ type: 'upgrade', detail: `${key} Lv ${b.upgrades[key]}`, at: t }, ...(b.history || [])].slice(0, 25);
            } else {
                s.cash = add(s.cash, b.job.reward);
                s.earned.project = add(s.earned.project, b.job.reward);
                b.earned = add(b.earned || '0', b.job.reward);
                b.history = [{ type: 'project', detail: `Completed (+$${Math.round(Number(b.job.reward)).toLocaleString()})`, at: t }, ...(b.history || [])].slice(0, 25);
            }

            b.job = null;
        }

        if (
            b.manager &&
            b.manager !== 'paused' &&
            !b.job &&
            !s.merger?.inputs.includes(b.id)
        ) {
            const x = find(c.businesses, b.type);
            if (b.manager === 'upgrade' && b.level < x.maxLevel) {
                const info = upgradeSpec(x, b, 'level');
                if (D(s.cash).gte(info.cost)) {
                    s.cash = D(s.cash).minus(info.cost).toString();
                    b.job = { kind: 'upgrade', key: 'level', end: t + info.duration };
                }
            } else if (b.manager === 'project' && ['project', 'sports'].includes(x.kind)) {
                const cost = D(x.price).times(.2);
                if (D(s.cash).gte(cost)) {
                    s.cash = D(s.cash).minus(cost).toString();
                    b.job = { kind: 'project', end: t + 300000, reward: cost.times(1.5).toString() };
                }
            }
        }
    }

    if (s.slotJob && s.slotJob <= t) {
        s.slots++;
        s.slotJob = null;
    }

    if (s.merger && s.merger.end <= t) {
        const m = s.merger;

        s.businesses = s.businesses.filter(
            b => !m.inputs.includes(b.id)
        );
        s.contracts = (s.contracts || []).filter(
            ct => !m.inputs.includes(ct.supplierId) && !m.inputs.includes(ct.buyerId)
        );

        s.businesses.push(newBusiness(m.type, m.id));
        pushNotif(s, 'merger', 'Merger Completed', `${m.name || m.id} is now operational.`, t);
        s.merger = null;
    }

    if (s.research?.active && s.research.active.end <= t) {
        const nodeId = s.research.active.id;
        if (!s.research.completed.includes(nodeId)) {
            s.research.completed.push(nodeId);
        }
        const node = RESEARCH_NODES.find(n => n.id === nodeId);
        pushNotif(s, 'research', 'Research Complete', `${node?.name || nodeId} unlocked across your empire.`, t);
        s.research.active = null;
    }

    s.boosts = s.boosts.filter(b => b.end > t);

    // Process pending limit / stop orders deterministically
    if (s.orders?.length) {
        const remainingOrders = [];
        for (const ord of s.orders) {
            const list = c[ord.category];
            const item = list?.find(x => x.id === ord.item);
            if (!item) continue;
            const curPrice = D(price(item, t));
            const targetP = D(ord.targetPrice);
            const triggered = ord.side === 'buy'
                ? (ord.kind === 'limit' ? curPrice.lte(targetP) : curPrice.gte(targetP))
                : (ord.kind === 'limit' ? curPrice.gte(targetP) : curPrice.lte(targetP));
            if (triggered) {
                if (ord.side === 'buy') {
                    const actualCost = curPrice.times(ord.qty);
                    const reserved = targetP.times(ord.qty);
                    const refund = reserved.minus(actualCost);
                    if (refund.gt(0)) s.cash = add(s.cash, refund);
                    s.holdings[item.id] = (s.holdings[item.id] || 0) + ord.qty;
                    s.costBasis[item.id] = add(s.costBasis[item.id] || '0', actualCost);
                } else {
                    const proceeds = curPrice.times(ord.qty);
                    s.cash = add(s.cash, proceeds);
                }
                s.ledger = [{
                    id: `ord-${ord.id}`,
                    at: t,
                    type: `order_${ord.side}`,
                    category: 'invest',
                    source: item.name,
                    amount: ord.side === 'buy' ? '0' : curPrice.times(ord.qty).toString(),
                    prevCash: s.cash,
                    newCash: s.cash
                }, ...(s.ledger || [])].slice(0, 200);
            } else {
                remainingOrders.push(ord);
            }
        }
        s.orders = remainingOrders;
    }
}

export function settle(state, t, c = defaultCatalog) {
    const s = normalizeState(state);

    if (!Number.isSafeInteger(t) || t < s.at) {
        throw Error('Invalid time');
    }

    let cursor = s.at;

    finish(s, cursor, c);

    while (cursor < t) {
        const nextHour = (Math.floor(cursor / 3600000) + 1) * 3600000;
        const nextEcon = (Math.floor(cursor / 7200000) + 1) * 7200000;
        const boundaries = [
            t,
            nextHour,
            nextEcon,
            ...s.boosts.flatMap(b => [b.start, b.end]),
            ...s.businesses.map(b => b.job?.end),
            s.slotJob,
            s.merger?.end,
            s.research?.active?.end,
            s.pending?.end
        ].filter(x => x > cursor);

        const next = Math.min(...boundaries);
        const dt = next - cursor;
        let stepBiz = D(0);
        for (const b of s.businesses) {
            const bEarn = D(simulateBusiness(s, b, cursor, c).netProfit).times(dt).div(3600000);
            b.earned = add(b.earned || '0', bEarn);
            stepBiz = stepBiz.plus(bEarn);
        }
        const rates = hourlyBreakdown(s, cursor, c);
        const stepProp = rates.property.times(dt).div(3600000);
        const stepDiv = rates.dividend.times(dt).div(3600000);

        // Accelerated financial time: 24 real hours (86400s) = 1 financial year (360 days)
        const finYears = D(dt).div(1000).div(FINANCIAL_TIME.REAL_SECONDS_PER_FINANCIAL_YEAR);
        if (D(s.banking.savings).gt(0)) {
            const apy = savingsApy(s);
            const savFactor = D(1).plus(D(apy).div(100)).pow(finYears).minus(1);
            const savInt = D(s.banking.savings).times(savFactor);
            s.banking.savings = add(s.banking.savings, savInt);
            s.banking.interestEarned = add(s.banking.interestEarned || '0', savInt);
        }
        for (const ln of s.banking.loans) {
            if (D(ln.remaining).gt(0)) {
                const lnInt = D(ln.remaining).times(D(ln.rate).div(100)).times(finYears);
                ln.accruedInterest = add(ln.accruedInterest || '0', lnInt);
            }
        }

        s.earned.business = add(s.earned.business, stepBiz);
        s.earned.property = add(s.earned.property, stepProp);
        s.earned.dividend = add(s.earned.dividend, stepDiv);
        s.cash = add(s.cash, stepBiz.plus(stepProp).plus(stepDiv));

        cursor = next;

        if (next === nextHour) {
            for (const [pid, qty] of Object.entries(s.properties || {})) {
                if (qty > 0) {
                    const cur = s.propState[pid] || { rentMult: 1, condition: 100 };
                    const wear = cur.rentMult > 1.2 ? 0.35 : 0.25;
                    s.propState[pid] = {
                        rentMult: cur.rentMult ?? 1,
                        condition: Math.max(20, Number(((cur.condition ?? 100) - wear).toFixed(2)))
                    };
                }
            }
        }

        finish(s, cursor, c);
    }

    for (const b of s.businesses) {
        const lastAt = b.statsHistory?.[0]?.at ?? -Infinity;
        if (t - lastAt >= 60000) {
            const sim = simulateBusiness(s, b, t, c);
            b.statsHistory = [{ at: t, rev: Number(sim.revenue), exp: Number(sim.expenses), net: Number(sim.netProfit) }, ...(b.statsHistory || [])].slice(0, 24);
        }
    }

    s.at = t;

    s.level = Math.max(
        s.level,
        1 + s.businesses.reduce((n, b) => n + b.level, 0)
    );

    return s;
}

const newBusiness = (type, id, name) => normalizeBusiness({
    id,
    type,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 32) : undefined,
    level: 1,
    fleet: 0,
    staff: 0,
    players: 0,
    vault: 0,
    deposit: 4.5,
    loan: 10.5,
    manager: null,
    job: null
});

const spend = (s, n) => {
    if (D(n).lt(0) || D(s.cash).lt(n)) {
        throw Error('Insufficient funds');
    }

    s.cash = D(s.cash).minus(n).toString();
};

const target = (s, id) => find(s.businesses, id);

function checkReward(s, a, c) {
    if (a.kind === 'boost') {
        const b = find(c.boosters, a.booster);

        const id = b.scope === 'global'
            ? 'global'
            : target(s, a.target).id;

        if (
            s.boosts.some(
                q => q.id === b.id && q.target === id
            )
        ) {
            throw Error('Booster already active');
        }

        return;
    }

    if (a.kind === 'slotSkip' && s.slotJob) return;

    if (a.kind === 'mergerSkip' && s.merger) return;

    if (
        a.kind === 'jobSkip' &&
        target(s, a.target).job
    ) {
        return;
    }

    throw Error('No eligible action');
}

function reward(s, a, t, c) {
    try {
        checkReward(s, a, c);
    } catch {
        return;
    }

    if (a.kind === 'boost') {
        const b = find(c.boosters, a.booster);

        s.boosts.push({
            id: b.id,
            target: b.scope === 'global'
                ? 'global'
                : a.target,
            mult: b.mult,
            start: t,
            end: t + b.duration
        });
    } else if (a.kind === 'slotSkip') {
        s.slotJob = t;
    } else if (a.kind === 'mergerSkip') {
        s.merger.end = t;
    } else {
        target(s, a.target).job.end = t;
    }
}

export function apply(state, a, t, c = defaultCatalog) {
    const s = settle(state, t, c);
    const cashBeforeAction = s.cash;

    const b = a.target
        ? s.businesses.find(x => x.id === a.target)
        : null;

    const qty = a.qty ?? 1;

    if (
        !Number.isSafeInteger(qty) ||
        qty < 1 ||
        qty > 1000000
    ) {
        throw Error('Invalid quantity');
    }

    if (
        b &&
        s.merger?.inputs.includes(b.id) &&
        !['reward'].includes(a.type)
    ) {
        throw Error('Business reserved for merger');
    }

    switch (a.type) {
        case 'buyBusiness': {
            const x = find(c.businesses, a.item);

            if (x.mergedOnly) {
                throw Error('Available via business merger only');
            }

            if (s.businesses.length >= s.slots) {
                throw Error('No business slots');
            }

            spend(s, x.price);

            s.businesses.push(newBusiness(x.id, a.id, a.name));

            break;
        }

        case 'sellBusiness': {
            if (
                !b ||
                b.job ||
                s.pending?.action.target === b.id
            ) {
                throw Error('Business unavailable');
            }

            s.cash = add(
                s.cash,
                D(businessValuation(b, c))
                    .times(.7)
            );

            s.businesses = s.businesses.filter(
                x => x.id !== b.id
            );

            s.boosts = s.boosts.filter(
                x => x.target !== b.id
            );

            s.contracts = (s.contracts || []).filter(
                ct => ct.supplierId !== b.id && ct.buyerId !== b.id
            );

            break;
        }

        case 'upgrade':
        case 'upgradeBiz': {
            if (!b || b.job) {
                throw Error('Business busy');
            }

            const x = find(c.businesses, b.type);
            const key = a.key || 'level';
            const info = upgradeSpec(x, b, key);

            if (info.curLv >= info.spec.max) {
                throw Error('Maximum level');
            }

            spend(s, info.cost);

            b.job = {
                kind: 'upgrade',
                key: info.spec.key,
                end: t + info.duration
            };
            b.history = [{ type: 'upgrade_start', detail: `Started ${info.spec.name} → Lv ${info.nextLv}`, at: t }, ...(b.history || [])].slice(0, 25);

            break;
        }

        case 'expand': {
            if (s.slotJob) {
                throw Error('Expansion pending');
            }

            spend(s, 10000 * s.slots);

            s.slotJob = t + 120000;

            break;
        }

        case 'buyExtra': {
            if (!b || b.job) {
                throw Error('Business unavailable');
            }

            const x = find(c.businesses, b.type);
            const m = getBusinessModel(b.type);
            const key = a.kind || m.extra?.key || {
                fleet: 'fleet',
                project: 'staff',
                sports: 'players',
                bank: 'vault'
            }[x.kind];

            if (!['fleet', 'staff', 'players', 'vault'].includes(key)) {
                throw Error('Not available');
            }

            const pct = key === 'staff' && m.staff ? m.staff.costPct : (m.extra?.costPct ?? 0.15);
            spend(s, D(x.price).times(pct));

            b[key] = (b[key] || 0) + 1;
            if (b.type === 'bank' && key === 'vault') {
                b.upgrades.infra = (b.upgrades.infra || 1) + 1;
            }
            b.history = [{ type: 'resource', detail: `Added ${key} (${b[key]})`, at: t }, ...(b.history || [])].slice(0, 25);

            break;
        }

        case 'manageBiz': {
            if (!b || !a.settings || typeof a.settings !== 'object') {
                throw Error('Invalid management settings');
            }
            const m = getBusinessModel(b.type);
            b.settings ??= {};
            const changed = [];
            for (const ctrl of m.controls) {
                if (a.settings[ctrl.key] !== undefined) {
                    const v = Number(a.settings[ctrl.key]);
                    if (!Number.isFinite(v) || v < ctrl.min || v > ctrl.max) {
                        throw Error(`Invalid ${ctrl.label}`);
                    }
                    b.settings[ctrl.key] = v;
                    changed.push(`${ctrl.label}: ${v}${ctrl.unit}`);
                }
            }
            if (b.type === 'bank') {
                b.deposit = b.settings.deposit;
                b.loan = b.settings.loan;
            }
            if (changed.length) {
                b.history = [{ type: 'manage', detail: changed.join(', '), at: t }, ...(b.history || [])].slice(0, 25);
            }

            break;
        }

        case 'bankRates': {
            if (
                !b ||
                find(c.businesses, b.type).kind !== 'bank' ||
                !Number.isFinite(a.deposit) ||
                !Number.isFinite(a.loan) ||
                a.deposit < 1 ||
                a.deposit > 12 ||
                a.loan < 2 ||
                a.loan > 22
            ) {
                throw Error('Invalid bank rates');
            }

            b.deposit = a.deposit;
            b.loan = a.loan;
            b.settings ??= {};
            b.settings.deposit = a.deposit;
            b.settings.loan = a.loan;
            b.history = [{ type: 'manage', detail: `Deposit ${a.deposit}% / Loan ${a.loan}%`, at: t }, ...(b.history || [])].slice(0, 25);

            break;
        }

        case 'project': {
            if (
                !b ||
                b.job ||
                !['project', 'sports'].includes(
                    find(c.businesses, b.type).kind
                )
            ) {
                throw Error('Project unavailable');
            }

            const cost = D(
                find(c.businesses, b.type).price
            ).times(.2);

            spend(s, cost);

            b.job = {
                kind: 'project',
                end: t + 300000,
                reward: cost.times(1.5).toString()
            };

            break;
        }

        case 'hireManager': {
            if (!b) {
                throw Error('Business unavailable');
            }
            if (b.manager) {
                throw Error('Manager already hired');
            }
            const x = find(c.businesses, b.type);
            spend(s, D(x.price).times(1.5));
            b.manager = 'upgrade';

            break;
        }

        case 'managerMode': {
            if (!b || !b.manager) {
                throw Error('Hire a manager first');
            }
            const x = find(c.businesses, b.type);
            if (a.mode === 'project' && !['project', 'sports'].includes(x.kind)) {
                throw Error('Not available for this business');
            }
            if (!['upgrade', 'project', 'paused'].includes(a.mode)) {
                throw Error('Invalid manager mode');
            }
            b.manager = a.mode;

            break;
        }

        case 'trade': {
            const list = c[a.category];

            if (
                ![
                    'stocks',
                    'crypto',
                    'properties',
                    'assets'
                ].includes(a.category)
            ) {
                throw Error('Invalid market');
            }

            const x = find(list, a.item);

            const map = ['stocks', 'crypto'].includes(
                a.category
            )
                ? s.holdings
                : s[a.category];

            const p = ['stocks', 'crypto'].includes(
                a.category
            )
                ? price(x, t)
                : x.price;

            const n = map[x.id] || 0;

            if (a.sell) {
                if (n < qty) {
                    throw Error('Not enough owned');
                }

                map[x.id] = n - qty;

                if (['stocks', 'crypto'].includes(a.category)) {
                    const prevCost = D(s.costBasis[x.id] || '0');
                    s.costBasis[x.id] = n - qty === 0
                        ? '0'
                        : prevCost.times(n - qty).div(n).toString();
                }

                s.cash = add(s.cash, D(p).times(qty));
            } else {
                if (a.category === 'stocks') {
                    const total = stockTotalShares(x);
                    const reservedBuy = (s.orders || []).filter(o => o.item === x.id && o.side === 'buy').reduce((sum, o) => sum + o.qty, 0);
                    if (n + reservedBuy + qty > total) {
                        throw Error(`Only ${Math.max(0, total - n - reservedBuy)} shares available`);
                    }
                }

                if (a.category === 'assets' && n + qty > 1) {
                    throw Error('You can only own 1 of each asset');
                }

                const storageKey = a.category === 'assets'
                    ? ({ cars: 'garage', aircraft: 'hangar', yachts: 'marina' }[x.category])
                    : null;

                if (storageKey) {
                    const used = c.assets
                        .filter(item => item.category === x.category)
                        .reduce((sum, item) => sum + (s.assets[item.id] || 0), 0);
                    const cap = s.storage?.[storageKey] || 0;
                    if (used + qty > cap) {
                        throw Error(`Not enough ${storageKey} space; upgrade storage first`);
                    }
                }

                const tradeCost = D(p).times(qty);
                spend(s, tradeCost);

                if (['stocks', 'crypto'].includes(a.category)) {
                    s.costBasis[x.id] = add(s.costBasis[x.id] || '0', tradeCost);
                }

                map[x.id] = n + qty;
            }

            break;
        }

        case 'upgradeStorage': {
            const rules = {
                garage: { cost: 15000, add: 2 },
                hangar: { cost: 250000, add: 1 },
                marina: { cost: 500000, add: 1 }
            };
            const rule = rules[a.kind];
            if (!rule) {
                throw Error('Invalid storage type');
            }
            const cap = s.storage[a.kind] || 0;
            spend(s, rule.cost * cap);
            s.storage[a.kind] = cap + rule.add;

            break;
        }

        case 'merge': {
            if (s.merger) {
                throw Error('Merger pending');
            }

            const m = find(c.mergers, a.item);

            const inputs = m.requires.map(type =>
                s.businesses.find(
                    b =>
                        b.type === type &&
                        b.level >= m.level &&
                        !b.job
                )
            );

            if (inputs.some(x => !x)) {
                throw Error('Requirements not met');
            }

            spend(s, m.cost);

            s.merger = {
                type: m.id,
                id: a.id,
                inputs: inputs.map(b => b.id),
                end: t + m.duration
            };

            break;
        }

        case 'reward': {
            if (s.pending) {
                throw Error('Reward already pending');
            }

            checkReward(s, a, c);

            const premium =
                s.premium &&
                (!s.premiumUntil || t < s.premiumUntil);

            if (a.ticket || premium) {
                reward(s, a, t, c);
            } else {
                s.pending = {
                    action: a,
                    end: t + c.wait
                };
            }

            break;
        }

        case 'cancelReward': {
            s.pending = null;

            break;
        }

        case 'bankDeposit': {
            const amt = D(a.amount || 0);
            if (amt.lte(0)) throw Error('Invalid deposit amount');
            spend(s, amt);
            s.banking.savings = add(s.banking.savings, amt);
            break;
        }

        case 'bankWithdraw': {
            const amt = D(a.amount || 0);
            if (amt.lte(0) || D(s.banking.savings).lt(amt)) throw Error('Insufficient savings');
            s.banking.savings = D(s.banking.savings).minus(amt).toString();
            s.cash = add(s.cash, amt);
            break;
        }

        case 'takeLoan': {
            const amt = D(a.amount || 0);
            if (amt.lt(1000)) {
                throw Error('Minimum loan amount is $1,000');
            }
            const score = s.banking.creditScore || 680;
            const nw = D(netWorth(s, c));
            const maxLoan = D(Math.max(50000, nw.toNumber() * 0.5 * (score / 650)));
            const currentDebt = s.banking.loans.reduce(
                (sum, l) => sum.plus(l.remaining || '0').plus(l.accruedInterest || '0'),
                D(0)
            );
            if (currentDebt.plus(amt).gt(maxLoan)) {
                throw Error('Exceeds credit limit');
            }
            if (s.banking.loans.length >= 5) {
                throw Error('Maximum 5 active loans');
            }
            const rate = Math.max(5.5, Math.min(20, 22 - (score - 300) * 0.03));
            s.cash = add(s.cash, amt);
            s.banking.loans.push({
                id: a.id,
                principal: amt.toString(),
                remaining: amt.toString(),
                accruedInterest: '0',
                rate: Number(rate.toFixed(2)),
                at: t
            });
            break;
        }

        case 'repayLoan': {
            const ln = s.banking.loans.find(l => l.id === a.target);
            if (!ln) throw Error('Loan not found');
            const accrued = D(ln.accruedInterest || '0');
            const totalOwed = D(ln.remaining).plus(accrued);
            const amt = a.full ? totalOwed : D(a.amount || 0);
            const pay = amt.gt(totalOwed) ? totalOwed : amt;
            if (pay.lte(0)) throw Error('Invalid repayment');
            spend(s, pay);
            const intPaid = pay.gt(accrued) ? accrued : pay;
            const prinPaid = pay.minus(intPaid);
            ln.accruedInterest = accrued.minus(intPaid).toString();
            ln.remaining = D(ln.remaining).minus(prinPaid).toString();
            s.banking.interestPaid = add(s.banking.interestPaid || '0', intPaid);
            if (D(ln.remaining).plus(ln.accruedInterest).lte('0.01')) {
                s.banking.loans = s.banking.loans.filter(l => l.id !== ln.id);
                s.banking.repaidCount = (s.banking.repaidCount || 0) + 1;
                const canBoostScore = D(ln.principal || '0').gte(5000) &&
                    (s.banking.lastScoreBoostAt === null || (t - s.banking.lastScoreBoostAt) >= 600000);
                if (canBoostScore) {
                    s.banking.creditScore = Math.min(850, (s.banking.creditScore || 680) + 12);
                    s.banking.lastScoreBoostAt = t;
                }
            }
            break;
        }

        case 'toggleWatchlist': {
            if (!a.item) throw Error('Unknown item');
            const exists = s.watchlist.includes(a.item);
            s.watchlist = exists ? s.watchlist.filter(x => x !== a.item) : [...s.watchlist, a.item];
            break;
        }

        case 'placeOrder': {
            if (!['stocks', 'crypto'].includes(a.category)) throw Error('Invalid market');
            const item = find(c[a.category], a.item);
            const targetP = D(a.targetPrice || 0);
            if (targetP.lte(0) || !['buy', 'sell'].includes(a.side) || !['limit', 'stop'].includes(a.kind)) {
                throw Error('Invalid order');
            }
            if (s.orders.length >= 20) throw Error('Maximum 20 open orders');
            if (a.side === 'buy') {
                if (a.category === 'stocks') {
                    const total = stockTotalShares(item);
                    const owned = s.holdings[item.id] || 0;
                    const reservedBuy = (s.orders || []).filter(o => o.item === item.id && o.side === 'buy').reduce((sum, o) => sum + o.qty, 0);
                    if (owned + reservedBuy + qty > total) {
                        throw Error(`Exceeds available share supply (${total})`);
                    }
                }
                spend(s, targetP.times(qty));
            } else {
                const owned = s.holdings[item.id] || 0;
                if (owned < qty) throw Error('Not enough owned');
                s.holdings[item.id] = owned - qty;
                const prevCost = D(s.costBasis[item.id] || '0');
                s.costBasis[item.id] = owned - qty === 0 ? '0' : prevCost.times(owned - qty).div(owned).toString();
            }
            s.orders.push({ id: a.id, category: a.category, item: item.id, side: a.side, kind: a.kind, targetPrice: targetP.toString(), qty, at: t });
            break;
        }

        case 'cancelOrder': {
            const ord = s.orders.find(o => o.id === a.target);
            if (!ord) throw Error('Order not found');
            if (ord.side === 'buy') {
                s.cash = add(s.cash, D(ord.targetPrice).times(ord.qty));
            } else {
                s.holdings[ord.item] = (s.holdings[ord.item] || 0) + ord.qty;
            }
            s.orders = s.orders.filter(o => o.id !== ord.id);
            break;
        }

        case 'signContract': {
            const ch = getChain(a.chainId);
            if (!ch) throw Error('Unknown supply chain');
            const sup = s.businesses.find(x => x.id === a.supplierId);
            const buy = s.businesses.find(x => x.id === a.buyerId);
            if (!sup || !buy || sup.id === buy.id) throw Error('Select two different owned businesses');
            if (!ch.suppliers.includes(sup.type) || !ch.buyers.includes(buy.type)) {
                throw Error('Businesses incompatible for this contract');
            }
            const supCount = (s.contracts || []).filter(ct => ct.supplierId === sup.id).length;
            if (supCount >= MAX_SUPPLIER_CONTRACTS) {
                throw Error(`Supplier already has max ${MAX_SUPPLIER_CONTRACTS} active contracts`);
            }
            const dup = (s.contracts || []).some(ct => ct.chainId === ch.id && ct.buyerId === buy.id);
            if (dup) throw Error('Buyer already has an active contract in this chain');
            s.contracts.push({ id: a.id, chainId: ch.id, supplierId: sup.id, buyerId: buy.id, at: t });
            break;
        }

        case 'cancelContract': {
            const exists = (s.contracts || []).some(ct => ct.id === a.target);
            if (!exists) throw Error('Contract not found');
            s.contracts = s.contracts.filter(ct => ct.id !== a.target);
            break;
        }

        case 'setPropertyRent': {
            const p = find(c.properties, a.item);
            if ((s.properties?.[p.id] || 0) <= 0) throw Error('Property not owned');
            const rm = Number(a.rentMult);
            if (!Number.isFinite(rm) || rm < 0.6 || rm > 1.8) throw Error('Rent multiplier must be 0.6x–1.8x');
            const cur = s.propState[p.id] || { rentMult: 1, condition: 100 };
            s.propState[p.id] = { ...cur, rentMult: Number(rm.toFixed(2)) };
            break;
        }

        case 'renovateProperty': {
            const p = find(c.properties, a.item);
            const qty = s.properties?.[p.id] || 0;
            if (qty <= 0) throw Error('Property not owned');
            const cur = s.propState[p.id] || { rentMult: 1, condition: 100 };
            const cond = Number(cur.condition ?? 100);
            if (cond >= 100) throw Error('Property already in 100% condition');
            const cost = D(p.price).times(qty).times(0.05).times((100 - cond) / 100).toDecimalPlaces(2);
            const finalCost = cost.lt(500) ? D(500) : cost;
            spend(s, finalCost);
            s.propState[p.id] = { rentMult: cur.rentMult ?? 1, condition: 100 };
            break;
        }

        case 'startResearch': {
            if (s.research?.active) throw Error('Research already in progress');
            const node = RESEARCH_NODES.find(n => n.id === a.item);
            if (!node) throw Error('Unknown research node');
            if ((s.research?.completed || []).includes(node.id)) throw Error('Already researched');
            for (const req of node.requires) {
                if (!(s.research?.completed || []).includes(req)) throw Error(`Requires ${req} first`);
            }
            spend(s, node.cost);
            s.research.active = { id: node.id, start: t, end: t + node.duration };
            break;
        }

        case 'openBranch': {
            if (!b) throw Error('Business not found');
            const reg = WORLD_REGIONS.find(r => r.id === a.region);
            if (!reg) throw Error('Unknown region');
            b.branches ??= [];
            if (b.branches.includes(reg.id)) throw Error('Branch already open in this city');
            const x = find(c.businesses, b.type);
            spend(s, D(x.price).times(reg.costMult));
            b.branches.push(reg.id);
            b.history = [{ type: 'branch', detail: `Opened ${reg.name} branch`, at: t }, ...(b.history || [])].slice(0, 25);
            pushNotif(s, 'branch', 'Global Expansion', `${b.name || x.name} opened a branch in ${reg.name}.`, t);
            break;
        }

        case 'brandBusiness': {
            if (!b) throw Error('Business not found');
            if (typeof a.name === 'string') {
                const trimmed = a.name.trim().slice(0, 32);
                if (trimmed) b.name = trimmed;
            }
            if (typeof a.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.color)) {
                b.color = a.color;
            }
            break;
        }

        case 'claimAchievement': {
            const ach = ACHIEVEMENTS.find(x => x.id === a.item);
            if (!ach) throw Error('Unknown achievement');
            if ((s.achievements || []).includes(ach.id)) throw Error('Achievement already claimed');
            const evalList = evaluateAchievements(s, c, Number(netWorth(s, c)));
            const status = evalList.find(x => x.id === ach.id);
            if (!status?.done) throw Error('Achievement requirements not yet met');
            s.achievements.push(ach.id);
            s.cash = add(s.cash, ach.rewardCash);
            pushNotif(s, 'achievement', 'Achievement Claimed', `${ach.title} (+$${ach.rewardCash.toLocaleString()})`, t);
            break;
        }

        case 'markNotifsRead': {
            s.notifications = (s.notifications || []).map(n => ({ ...n, read: true }));
            break;
        }

        default:
            throw Error('Unknown action');
    }

    finish(s, t, c);

    s.level = Math.max(
        s.level,
        1 + s.businesses.reduce(
            (n, b) => n + b.level,
            0
        )
    );

    const deltaCash = D(s.cash).minus(cashBeforeAction);
    if (!deltaCash.isZero()) {
        const catMap = {
            buyBusiness: 'business', sellBusiness: 'business', upgrade: 'business', upgradeBiz: 'business',
            buyExtra: 'business', project: 'business', merge: 'business', hireManager: 'business', expand: 'business',
            upgradeStorage: 'asset',
            trade: a.category === 'properties' ? 'property' : a.category === 'assets' ? 'asset' : 'invest'
        };
        s.ledger = [{
            id: a.id || `${a.type}-${t}`,
            at: t,
            type: a.type,
            category: catMap[a.type] || 'operation',
            source: a.item || a.kind || a.target || a.type,
            amount: deltaCash.toString(),
            prevCash: cashBeforeAction,
            newCash: s.cash
        }, ...(s.ledger || [])].slice(0, 200);
    }

    return s;
}

export function financialStatement(state, c = defaultCatalog) {
    const s = normalizeState(state);
    const cash = D(s.cash);
    let bizVal = D(0), bizRev = D(0), bizExp = D(0), bizNet = D(0);
    const businessRows = s.businesses.map(b => {
        const sim = simulateBusiness(s, b, s.at, c);
        const val = D(businessValuation(b, c));
        bizVal = bizVal.plus(val);
        bizRev = bizRev.plus(sim.revenue);
        bizExp = bizExp.plus(sim.expenses);
        bizNet = bizNet.plus(sim.netProfit);
        return { id: b.id, type: b.type, name: b.name, level: b.level, val: val.toString(), ...sim };
    });

    let investVal = D(0), divRev = D(0);
    for (const x of [...c.stocks, ...c.crypto]) {
        const qty = s.holdings?.[x.id] || 0;
        if (qty > 0) {
            investVal = investVal.plus(D(price(x, s.at)).times(qty));
            if (x.dividend) {
                const pct = (qty / stockTotalShares(x)) * 100;
                const bonus = 1 + getOwnershipTier(pct).divBonus;
                divRev = divRev.plus(D(x.dividend).times(qty).times(bonus));
            }
        }
    }

    let propVal = D(0), propRev = D(0);
    for (const p of c.properties) {
        const qty = s.properties?.[p.id] || 0;
        if (qty > 0) {
            propVal = propVal.plus(D(p.price).times(qty));
            propRev = propRev.plus(propertyMetrics(p, qty, s.propState?.[p.id], s.at).netIncome);
        }
    }

    let assetVal = D(0);
    for (const x of c.assets) {
        const qty = s.assets?.[x.id] || 0;
        if (qty > 0) assetVal = assetVal.plus(D(x.price).times(qty));
    }

    const savBal = D(s.banking?.savings || '0');
    const apy = savingsApy(s);
    const hourYears = D(3600).div(FINANCIAL_TIME.REAL_SECONDS_PER_FINANCIAL_YEAR);
    const savHourly = savBal.gt(0)
        ? savBal.times(D(1).plus(D(apy).div(100)).pow(hourYears).minus(1))
        : D(0);

    let loanPrincipal = D(0), loanAccrued = D(0), loanHourly = D(0);
    for (const ln of (s.banking?.loans || [])) {
        const rem = D(ln.remaining || '0');
        const acc = D(ln.accruedInterest || '0');
        loanPrincipal = loanPrincipal.plus(rem);
        loanAccrued = loanAccrued.plus(acc);
        loanHourly = loanHourly.plus(rem.times(D(ln.rate).div(100)).times(hourYears));
    }

    const totalAssets = cash.plus(savBal).plus(bizVal).plus(investVal).plus(propVal).plus(assetVal);
    const liabilities = loanPrincipal.plus(loanAccrued);
    const netWorthVal = totalAssets.minus(liabilities);
    const grossRev = bizRev.plus(propRev).plus(divRev).plus(savHourly);
    const totalExp = bizExp.plus(loanHourly);
    const netHourly = bizNet.plus(propRev).plus(divRev).plus(savHourly).minus(loanHourly);

    return {
        cash: cash.toString(),
        savings: savBal.toString(),
        apy,
        savHourly: savHourly.toString(),
        loanPrincipal: loanPrincipal.toString(),
        loanAccrued: loanAccrued.toString(),
        loanHourly: loanHourly.toString(),
        netBankingHourly: savHourly.minus(loanHourly).toString(),
        interestEarned: s.banking?.interestEarned || '0',
        interestPaid: s.banking?.interestPaid || '0',
        bizVal: bizVal.toString(),
        investVal: investVal.toString(),
        propVal: propVal.toString(),
        assetVal: assetVal.toString(),
        totalAssets: totalAssets.toString(),
        liabilities: liabilities.toString(),
        netWorth: netWorthVal.toString(),
        grossRev: grossRev.toString(),
        expenses: totalExp.toString(),
        netHourly: netHourly.toString(),
        businessRows
    };
}

export function netWorth(s, c = defaultCatalog) {
    let n = D(s.cash).plus(s.banking?.savings || '0');

    for (const ln of (s.banking?.loans || [])) {
        n = n.minus(ln.remaining || '0').minus(ln.accruedInterest || '0');
    }

    for (const b of s.businesses) {
        n = n.plus(businessValuation(b, c));
    }

    for (const x of [...c.stocks, ...c.crypto]) {
        n = n.plus(
            D(price(x, s.at))
                .times(s.holdings?.[x.id] || 0)
        );
    }

    for (const k of ['properties', 'assets']) {
        for (const x of c[k]) {
            n = n.plus(
                D(x.price).times(s[k]?.[x.id] || 0)
            );
        }
    }

    return n.toString();
}
