
import Decimal from 'decimal.js';
import { catalog as defaultCatalog } from './catalog.js';

Decimal.set({ precision: 40 });

const D = x => new Decimal(x);
const add = (a, b) => D(a).plus(b).toString();

export function initial(now = Date.now(), c = defaultCatalog) {
    return {
        cash: c.startingCash,
        at: now,
        businesses: [],
        holdings: {},
        costBasis: {},
        properties: {},
        assets: {},
        boosts: [],
        pending: null,
        slots: c.startingSlots,
        slotJob: null,
        storage: { ...(c.startingStorage || { garage: 4, hangar: 2, marina: 2 }) },
        merger: null,
        tickets: 0,
        history: [],
        earned: { business: '0', property: '0', dividend: '0', project: '0' },
        premium: false,
        premiumUntil: null,
        level: 1
    };
}

// Restore empty objects removed by older Mongoose saves.
export function normalizeState(state) {
    const s = structuredClone(state);

    for (const key of ["holdings", "costBasis", "properties", "assets"]) {
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

export function businessRate(s, b, t, c = defaultCatalog) {
    const x = find(c.businesses, b.type);

    let rate = D(x.income)
        .times(D(1.16).pow(b.level - 1))
        .times(
            1 +
            (b.fleet || 0) * .15 +
            (b.staff || 0) * .08 +
            (b.players || 0) * .1
        );

    if (x.kind === 'bank') {
        rate = rate
            .times(Math.max(.1, (b.loan - b.deposit) / 5))
            .times(1 + (b.vault || 0) * .2);
    }

    for (const q of s.boosts) {
        if (
            active(q, t) &&
            (q.target === b.id || q.target === 'global')
        ) {
            rate = rate.times(q.mult);
        }
    }

    return rate;
}

export function hourlyBreakdown(s, t = s.at, c = defaultCatalog) {
    let business = D(0), property = D(0), dividend = D(0);

    for (const b of s.businesses) {
        business = business.plus(businessRate(s, b, t, c));
    }

    for (const p of c.properties) {
        property = property.plus(
            D(p.income).times(s.properties?.[p.id] || 0)
        );
    }

    for (const p of c.stocks) {
        dividend = dividend.plus(
            D(p.dividend).times(s.holdings?.[p.id] || 0)
        );
    }

    return { business, property, dividend };
}

export function hourly(s, t = s.at, c = defaultCatalog) {
    const { business, property, dividend } = hourlyBreakdown(s, t, c);
    return business.plus(property).plus(dividend).toString();
}

function finish(s, t, c) {
    if (s.pending && s.pending.end <= t) {
        const p = s.pending;
        s.pending = null;
        reward(s, p.action, t, c);
    }

    for (const b of s.businesses) {
        if (b.job && b.job.end <= t) {
            if (b.job.kind === 'upgrade') {
                b.level++;
            } else {
                s.cash = add(s.cash, b.job.reward);
                s.earned.project = add(s.earned.project, b.job.reward);
            }

            b.job = null;
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

        s.businesses.push(newBusiness(m.type, m.id));
        s.merger = null;
    }

    s.boosts = s.boosts.filter(b => b.end > t);
}

export function settle(state, t, c = defaultCatalog) {
    const s = normalizeState(state);

    if (!Number.isSafeInteger(t) || t < s.at) {
        throw Error('Invalid time');
    }

    let cursor = s.at;

    finish(s, cursor, c);

    while (cursor < t) {
        const boundaries = [
            t,
            ...s.boosts.flatMap(b => [b.start, b.end]),
            ...s.businesses.map(b => b.job?.end),
            s.slotJob,
            s.merger?.end,
            s.pending?.end
        ].filter(x => x > cursor);

        const next = Math.min(...boundaries);
        const dt = next - cursor;
        const rates = hourlyBreakdown(s, cursor, c);
        const stepBiz = rates.business.times(dt).div(3600000);
        const stepProp = rates.property.times(dt).div(3600000);
        const stepDiv = rates.dividend.times(dt).div(3600000);

        s.earned.business = add(s.earned.business, stepBiz);
        s.earned.property = add(s.earned.property, stepProp);
        s.earned.dividend = add(s.earned.dividend, stepDiv);
        s.cash = add(s.cash, stepBiz.plus(stepProp).plus(stepDiv));

        cursor = next;

        finish(s, cursor, c);
    }

    s.at = t;

    return s;
}

const newBusiness = (type, id, name) => ({
    id,
    type,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 32) : undefined,
    level: 1,
    fleet: 0,
    staff: 0,
    players: 0,
    vault: 0,
    deposit: 3,
    loan: 8,
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
                D(find(c.businesses, b.type).price)
                    .times(.7)
            );

            s.businesses = s.businesses.filter(
                x => x.id !== b.id
            );

            s.boosts = s.boosts.filter(
                x => x.target !== b.id
            );

            break;
        }

        case 'upgrade': {
            if (!b || b.job) {
                throw Error('Business busy');
            }

            const x = find(c.businesses, b.type);

            if (b.level >= x.maxLevel) {
                throw Error('Maximum level');
            }

            spend(
                s,
                D(x.price)
                    .times(.4)
                    .times(D(1.2).pow(b.level - 1))
            );

            b.job = {
                kind: 'upgrade',
                end: t + 60000 * b.level
            };

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

            const key = {
                fleet: 'fleet',
                project: 'staff',
                sports: 'players',
                bank: 'vault'
            }[x.kind];

            if (!key) {
                throw Error('Not available');
            }

            spend(s, D(x.price).times(.15));

            b[key]++;

            break;
        }

        case 'bankRates': {
            if (
                !b ||
                find(c.businesses, b.type).kind !== 'bank' ||
                !Number.isFinite(a.deposit) ||
                !Number.isFinite(a.loan) ||
                a.deposit < 1 ||
                a.deposit > 10 ||
                a.loan < 2 ||
                a.loan > 15 ||
                a.loan <= a.deposit
            ) {
                throw Error('Invalid bank rates');
            }

            b.deposit = a.deposit;
            b.loan = a.loan;

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

    return s;
}

export function netWorth(s, c = defaultCatalog) {
    let n = D(s.cash);

    for (const b of s.businesses) {
        n = n.plus(
            find(c.businesses, b.type).price
        );
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
