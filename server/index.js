
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';

import {
    initial,
    apply,
    settle,
    normalizeState,
    netWorth
} from '../shared/engine.js';

import { catalog } from '../shared/catalog.js';

// Environment configuration

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);

dotenv.config({
    path: path.join(root, '.env')
});

const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 32) {
    throw Error(
        'Set JWT_SECRET (32+ characters) in .env'
    );
}

// MongoDB connection & initialization (cached for serverless)

const User = mongoose.model(
    'User',
    new mongoose.Schema(
        {
            username: {
                type: String,
                unique: true
            },

            passwordHash: String,

            role: {
                type: String,
                default: 'player'
            },

            state: mongoose.Schema.Types.Mixed,

            version: {
                type: Number,
                default: 0
            },

            premium: {
                type: Boolean,
                default: false
            },

            premiumUntil: Date,

            request: {
                type: String,
                default: 'none'
            },

            lastBatch: String,

            ticketGrant: {
                type: Number,
                default: 0
            },

            ticketApplied: {
                type: Number,
                default: 0
            },

            redeemedCoupons: {
                type: [String],
                default: []
            }
        },
        {
            // IMPORTANT:
            // Prevent MongoDB saves from losing empty objects.
            minimize: false
        }
    )
);

const Coupon = mongoose.model(
    'Coupon',
    new mongoose.Schema(
        {
            code: {
                type: String,
                unique: true,
                uppercase: true,
                trim: true
            },
            title: {
                type: String,
                default: 'Reward Pack'
            },
            cash: {
                type: Number,
                default: 0
            },
            grantVip: {
                type: Boolean,
                default: false
            },
            vipDays: {
                type: Number,
                default: null
            },
            extraSlots: {
                type: Number,
                default: 0
            },
            maxUses: {
                type: Number,
                default: null
            },
            uses: {
                type: Number,
                default: 0
            },
            active: {
                type: Boolean,
                default: true
            }
        },
        { timestamps: true }
    )
);

let readyPromise;
async function ensureReady() {
    if (!readyPromise) {
        readyPromise = (async () => {
            if (mongoose.connection.readyState === 0) {
                await mongoose.connect(
                    process.env.MONGO_URI ||
                    'mongodb://127.0.0.1:27017/business_dynasty'
                );
            }
            await User.init();
            await Coupon.init();

            if (
                process.env.ADMIN_USERNAME &&
                process.env.ADMIN_PASSWORD
            ) {
                if (process.env.ADMIN_PASSWORD.length < 10) {
                    throw Error(
                        'Admin password must have at least 10 characters'
                    );
                }

                await User.updateOne(
                    {
                        username:
                            process.env.ADMIN_USERNAME.toLowerCase()
                    },
                    {
                        $setOnInsert: {
                            passwordHash: await bcrypt.hash(
                                process.env.ADMIN_PASSWORD,
                                12
                            ),

                            role: 'admin',
                            state: initial()
                        }
                    },
                    {
                        upsert: true
                    }
                );
            }
        })().catch(err => {
            readyPromise = null;
            throw err;
        });
    }
    return readyPromise;
}

// Express setup

const app = express();
app.set('trust proxy', 1);

app.use(
    express.json({
        limit: '2mb'
    })
);

app.use(cookieParser());

app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');

    if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        req.get('sec-fetch-site') === 'cross-site'
    ) {
        return res.status(403).json({
            error: 'Cross-site request'
        });
    }

    next();
});

const wrap = fn => (req, res, next) =>
    Promise.resolve(
        fn(req, res, next)
    ).catch(next);

app.use('/api', wrap(async (req, res, next) => {
    await ensureReady();
    next();
}));

const loginLimit = rateLimit({
    windowMs: 60000,
    limit: 10
});

const couponLimit = rateLimit({
    windowMs: 60000,
    limit: 15
});

// Authentication cookie

function cookie(res, u) {
    res.cookie(
        'session',

        jwt.sign(
            {
                sub: String(u._id)
            },
            secret,
            {
                expiresIn: '30d'
            }
        ),

        {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
            maxAge: 30 * 86400000
        }
    );
}

// Authentication middleware

const auth = wrap(async (req, res, next) => {
    let token;

    try {
        token = jwt.verify(
            req.cookies.session,
            secret
        );
    } catch {
        return res.status(401).json({
            error: 'Login required'
        });
    }

    req.user = await User.findById(token.sub);

    if (!req.user) {
        return res.status(401).json({
            error: 'Account unavailable'
        });
    }

    next();
});

// Admin middleware

const admin = (req, res, next) => {
    if (req.user.role === 'admin') {
        return next();
    }

    return res.status(403).json({
        error: 'Admin only'
    });
};

// Normalize saved player state

function snapshot(u) {
    const s = normalizeState(u.state);

    s.premium = u.premium;

    s.premiumUntil =
        u.premiumUntil?.getTime() ?? null;

    return {
        username: u.username,
        role: u.role,
        state: s,
        version: u.version,
        request: u.request,
        serverTime: Date.now(),
        lastBatch: u.lastBatch ?? null
    };
}

// Register player

app.post(
    '/api/register',

    loginLimit,

    wrap(async (req, res) => {
        const {
            username,
            password
        } = req.body;

        if (
            typeof username !== 'string' ||
            !/^[a-zA-Z0-9_]{3,24}$/.test(username) ||
            typeof password !== 'string' ||
            password.length < 8 ||
            password.length > 72
        ) {
            throw Error(
                'Username: 3–24 letters/numbers/underscore; ' +
                'password: 8–72 characters'
            );
        }

        const u = await User.create({
            username: username.toLowerCase(),

            passwordHash: await bcrypt.hash(
                password,
                12
            ),

            state: initial()
        });

        cookie(res, u);

        res.json(snapshot(u));
    })
);

// Login player

app.post(
    '/api/login',

    loginLimit,

    wrap(async (req, res) => {
        const u = await User.findOne({
            username: String(
                req.body.username
            ).toLowerCase()
        });

        if (
            !u ||
            typeof req.body.password !== 'string' ||
            !(await bcrypt.compare(
                req.body.password,
                u.passwordHash
            ))
        ) {
            return res.status(401).json({
                error: 'Invalid login'
            });
        }

        cookie(res, u);

        res.json(snapshot(u));
    })
);

// Logout

app.post('/api/logout', (req, res) => {
    res.clearCookie('session');

    res.json({
        ok: true
    });
});

// Current player

app.get(
    '/api/me',
    auth,
    (req, res) => {
        res.json(snapshot(req.user));
    }
);

// Health check

app.get('/api/health', (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({
        ok: dbConnected,
        status: dbConnected ? 'healthy' : 'degraded',
        db: dbConnected ? 'connected' : 'disconnected',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// Game catalogue

app.get('/api/catalog', (req, res) => {
    res.json(catalog);
});

// Offline game synchronization

app.post(
    '/api/sync',

    auth,

    wrap(async (req, res) => {
        const u = req.user;

        const {
            version,
            actions,
            batch,
            force,
            state: clientState
        } = req.body;

        if (
            typeof batch !== 'string' ||
            batch.length > 100 ||
            !Array.isArray(actions) ||
            actions.length > 2000
        ) {
            throw Error('Invalid sync');
        }

        // Prevent duplicate sync batches.

        if (u.lastBatch === batch) {
            return res.json(snapshot(u));
        }

        // If client has no pending local actions, fast-forward to cloud save.

        if (version !== u.version && actions.length === 0 && !force) {
            return res.json(snapshot(u));
        }

        // Detect conflicts between devices.

        if (version !== u.version && !force) {
            return res.status(409).json({
                error: 'Cloud save changed; choose Cloud or Local save',
                cloud: snapshot(u)
            });
        }

        let s = force && clientState && typeof clientState === 'object'
            ? normalizeState(clientState)
            : structuredClone(u.state);

        const now = Date.now();

        if (force && clientState) {
            if (
                !Number.isSafeInteger(s.at) ||
                s.at > now ||
                typeof s.cash !== 'string' ||
                !Number.isFinite(Number(s.cash)) ||
                !Array.isArray(s.businesses) ||
                !Array.isArray(s.boosts)
            ) {
                throw Error('Invalid local save structure');
            }
        } else {
            const ids = new Set();

            for (const a of actions) {
                if (
                    typeof a.id !== 'string' ||
                    a.id.length > 100 ||
                    ids.has(a.id) ||
                    !Number.isSafeInteger(a.at) ||
                    a.at < s.at ||
                    a.at > now
                ) {
                    throw Error(
                        'Invalid action timestamp or ID'
                    );
                }

                ids.add(a.id);

                s = apply(
                    s,
                    a,
                    a.at,
                    catalog
                );
            }
        }

        // Calculate passive income and restore missing maps.

        s = settle(s, now, catalog);

        // Membership is controlled by the server.

        s.premium = u.premium;

        s.premiumUntil =
            u.premiumUntil?.getTime() ?? null;

        s.tickets +=
            (u.ticketGrant || 0) -
            (u.ticketApplied || 0);

        // Atomic database update.

        const updated = await User.findOneAndUpdate(
            {
                _id: u._id,
                version: u.version
            },
            {
                $set: {
                    state: s,
                    lastBatch: batch,
                    ticketApplied: u.ticketGrant || 0
                },

                $inc: {
                    version: 1
                }
            },
            {
                new: true
            }
        );

        if (!updated) {
            return res.status(409).json({
                error: 'Concurrent save; retry'
            });
        }

        res.json(snapshot(updated));
    })
);

// Request premium membership

app.post(
    '/api/premium/request',

    auth,

    wrap(async (req, res) => {
        await User.updateOne(
            {
                _id: req.user._id,
                premium: false
            },
            {
                $set: {
                    request: 'pending'
                }
            }
        );

        res.json({
            request: 'pending'
        });
    })
);

// Admin: Get all players

app.get(
    '/api/admin/users',

    auth,

    admin,

    wrap(async (req, res) => {
        const users = await User.find({
            role: 'player'
        })
            .select(
                'username premium premiumUntil ' +
                'request version ticketGrant'
            )
            .lean();

        res.json(users);
    })
);

// Admin: Manage premium and skip tickets

app.patch(
    '/api/admin/users/:id',

    auth,

    admin,

    wrap(async (req, res) => {
        const {
            decision,
            days,
            tickets
        } = req.body;

        const set = {};

        if (decision === 'approve') {
            set.premium = true;
            set.request = 'approved';

            set.premiumUntil =
                Number.isFinite(days) &&
                    days > 0 &&
                    days <= 3650

                    ? new Date(
                        Date.now() +
                        days * 86400000
                    )

                    : null;

        } else if (decision === 'reject') {
            set.request = 'rejected';

        } else if (decision === 'revoke') {
            set.premium = false;
            set.premiumUntil = null;
            set.request = 'none';

        } else if (decision !== 'tickets') {
            throw Error('Invalid decision');
        }

        const update = {
            $set: set
        };

        if (decision === 'tickets') {
            if (
                !Number.isSafeInteger(tickets) ||
                tickets < 1 ||
                tickets > 1000
            ) {
                throw Error('Invalid tickets');
            }

            update.$inc = {
                ticketGrant: tickets
            };
        }

        await User.updateOne(
            {
                _id: req.params.id,
                role: 'player'
            },

            update
        );

        res.json({
            ok: true
        });
    })
);

// Available store coupon packs (for players)

app.get(
    '/api/coupons',
    auth,
    wrap(async (req, res) => {
        const list = await Coupon.find({ active: true })
            .select('title cash grantVip vipDays extraSlots maxUses uses')
            .sort({ cash: 1, createdAt: -1 })
            .lean();
        res.json(list);
    })
);

// Redeem coupon code (in-app reward pack)

app.post(
    '/api/coupons/redeem',

    auth,
    couponLimit,

    wrap(async (req, res) => {
        const rawCode = typeof req.body.code === 'string'
            ? req.body.code.trim().toUpperCase()
            : '';

        if (!/^[A-Z0-9_-]{3,24}$/.test(rawCode)) {
            throw Error('Invalid coupon code format');
        }

        const u = req.user;

        const coupon = await Coupon.findOneAndUpdate(
            {
                code: rawCode,
                active: true,
                $or: [
                    { maxUses: null },
                    { $expr: { $lt: ['$uses', '$maxUses'] } }
                ]
            },
            { $inc: { uses: 1 } },
            { new: true }
        );

        if (!coupon) {
            throw Error('Coupon is invalid, expired, or out of uses');
        }

        const now = Date.now();
        let s = settle(u.state, now, catalog);

        if (coupon.cash > 0) {
            s.cash = new Decimal(s.cash).plus(coupon.cash).toString();
        }

        if (coupon.extraSlots > 0) {
            s.slots = (s.slots || catalog.startingSlots) + coupon.extraSlots;
        }

        let premium = u.premium;
        let premiumUntil = u.premiumUntil;
        let request = u.request;

        if (coupon.grantVip) {
            premium = true;
            request = 'approved';
            if (coupon.vipDays && coupon.vipDays > 0) {
                const base = Math.max(now, premiumUntil?.getTime() || 0);
                premiumUntil = new Date(base + coupon.vipDays * 86400000);
            } else {
                premiumUntil = null;
            }
        }

        s.premium = premium;
        s.premiumUntil = premiumUntil?.getTime() ?? null;

        const updated = await User.findOneAndUpdate(
            {
                _id: u._id,
                version: u.version
            },
            {
                $set: {
                    state: s,
                    premium,
                    premiumUntil,
                    request
                },
                $inc: { version: 1 }
            },
            { new: true }
        );

        if (!updated) {
            await Coupon.updateOne({ _id: coupon._id }, { $inc: { uses: -1 } });
            return res.status(409).json({
                error: 'Sync your save first and try again'
            });
        }

        res.json({
            ok: true,
            coupon: {
                code: coupon.code,
                title: coupon.title,
                cash: coupon.cash,
                grantVip: coupon.grantVip,
                vipDays: coupon.vipDays,
                extraSlots: coupon.extraSlots
            },
            cloud: snapshot(updated)
        });
    })
);

// Admin: Manage coupon codes

function parseCouponBody(body, isEdit = false) {
    const out = {};
    if (!isEdit || body.code !== undefined) {
        const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
        if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
            throw Error('Code must be 3–24 letters, numbers, _ or -');
        }
        out.code = code;
    }
    if (body.title !== undefined) {
        out.title = String(body.title).trim().slice(0, 60) || 'Reward Pack';
    }
    if (body.cash !== undefined) {
        const cash = Number(body.cash);
        if (!Number.isFinite(cash) || cash < 0 || cash > 1e15) {
            throw Error('Invalid cash amount');
        }
        out.cash = cash;
    }
    if (body.extraSlots !== undefined) {
        const extraSlots = Number(body.extraSlots);
        if (!Number.isSafeInteger(extraSlots) || extraSlots < 0 || extraSlots > 50) {
            throw Error('Extra slots must be 0–50');
        }
        out.extraSlots = extraSlots;
    }
    if (body.grantVip !== undefined) {
        out.grantVip = Boolean(body.grantVip);
    }
    if (body.vipDays !== undefined) {
        out.vipDays = body.vipDays === null || body.vipDays === ''
            ? null
            : Number(body.vipDays);
        if (out.vipDays !== null && (!Number.isSafeInteger(out.vipDays) || out.vipDays < 1 || out.vipDays > 3650)) {
            throw Error('VIP days must be 1–3650 or empty for lifetime');
        }
    }
    if (body.maxUses !== undefined) {
        out.maxUses = body.maxUses === null || body.maxUses === ''
            ? null
            : Number(body.maxUses);
        if (out.maxUses !== null && (!Number.isSafeInteger(out.maxUses) || out.maxUses < 1)) {
            throw Error('Max uses must be >= 1 or empty');
        }
    }
    if (body.active !== undefined) {
        out.active = Boolean(body.active);
    }
    return out;
}

app.get(
    '/api/admin/coupons',
    auth,
    admin,
    wrap(async (req, res) => {
        const list = await Coupon.find().sort({ createdAt: -1 }).lean();
        res.json(list);
    })
);

app.post(
    '/api/admin/coupons/seed',
    auth,
    admin,
    wrap(async (req, res) => {
        const packs = [
            { code: 'STARTER50K', title: 'Starter Cash Pack', cash: 50000, extraSlots: 0, grantVip: false, vipDays: null },
            { code: 'BOOST250K', title: 'Growth Capital Pack', cash: 250000, extraSlots: 1, grantVip: false, vipDays: null },
            { code: 'VIP7DAYS', title: 'VIP 7-Day Pass', cash: 0, extraSlots: 0, grantVip: true, vipDays: 7 },
            { code: 'MILLIONAIRE', title: 'Millionaire Pack', cash: 1000000, extraSlots: 1, grantVip: false, vipDays: null },
            { code: 'VIP30DAYS', title: 'VIP Monthly Pass', cash: 500000, extraSlots: 0, grantVip: true, vipDays: 30 },
            { code: 'EMPIRE5M', title: 'Tycoon Expansion Pack', cash: 5000000, extraSlots: 2, grantVip: false, vipDays: null },
            { code: 'MOGUL25M', title: 'Global Mogul Pack', cash: 25000000, extraSlots: 3, grantVip: true, vipDays: 90 },
            { code: 'BILLIONAIRE', title: 'Billionaire Vault', cash: 1000000000, extraSlots: 5, grantVip: false, vipDays: null },
            { code: 'DYNASTYLIFE', title: 'Dynasty Lifetime VIP', cash: 100000000, extraSlots: 5, grantVip: true, vipDays: null }
        ];
        let added = 0;
        for (const p of packs) {
            const r = await Coupon.updateOne(
                { code: p.code },
                { $setOnInsert: { ...p, active: true, maxUses: null, uses: 0 } },
                { upsert: true }
            );
            if (r.upsertedCount) added++;
        }
        res.json({ ok: true, added, total: packs.length });
    })
);

app.post(
    '/api/admin/coupons',
    auth,
    admin,
    wrap(async (req, res) => {
        const data = parseCouponBody(req.body, false);
        const created = await Coupon.create(data);
        res.json(created);
    })
);

app.patch(
    '/api/admin/coupons/:id',
    auth,
    admin,
    wrap(async (req, res) => {
        const data = parseCouponBody(req.body, true);
        const updated = await Coupon.findByIdAndUpdate(
            req.params.id,
            { $set: data },
            { new: true }
        );
        if (!updated) {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        res.json(updated);
    })
);

app.delete(
    '/api/admin/coupons/:id',
    auth,
    admin,
    wrap(async (req, res) => {
        await Coupon.deleteOne({ _id: req.params.id });
        res.json({ ok: true });
    })
);

app.get(
    '/api/leaderboard',
    auth,
    wrap(async (req, res) => {
        const players = await User.find(
            { role: { $ne: 'admin' }, state: { $exists: true } },
            'username state premium premiumUntil'
        ).lean();
        const now = Date.now();
        const rows = players
            .map(u => {
                try {
                    const st = normalizeState(u.state);
                    const nw = Number(netWorth(st, catalog));
                    const isPrem = !!u.premium && (!u.premiumUntil || new Date(u.premiumUntil).getTime() > now);
                    return {
                        username: u.username,
                        level: st.level || 1,
                        netWorth: nw,
                        businesses: (st.businesses || []).length,
                        achievements: (st.achievements || []).length,
                        premium: isPrem
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => b.netWorth - a.netWorth)
            .slice(0, 25);
        res.json(rows);
    })
);

// API fallback

app.use('/api', (req, res) => {
    res.status(404).json({
        error: 'Not found'
    });
});

// Serve production React frontend locally (handled by client service on Vercel)

if (!process.env.VERCEL) {
    app.use(
        express.static(
            path.join(root, 'client/dist')
        )
    );

    app.get('*', (req, res) => {
        res.sendFile(
            path.join(
                root,
                'client/dist/index.html'
            )
        );
    });
}

// Error handling

app.use((err, req, res, next) => {
    console.error(err.stack || err.message);

    res.status(400).json({
        error:
            err.code === 11000

                ? 'Username already taken'

                : err.message
    });
});

// Start server locally (skip on Vercel serverless)

if (!process.env.VERCEL) {
    await ensureReady();
    app.listen(
        process.env.PORT || 4000,

        () => console.log(
            'Business Dynasty API ready'
        )
    );
}

export default app;
