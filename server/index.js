
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

import { catalog, stockTotalShares } from '../shared/catalog.js';
import { MARKET_CONFIG, stepMarketPrice, updateCandles } from '../shared/market-engine.js';
import {
    FEEDBACK_STATUSES,
    FEEDBACK_PRIORITIES,
    validateFeedbackInput,
    validateFeedbackMessage,
    escapeRegex
} from '../shared/feedback.js';

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
            },

            privacy: {
                type: mongoose.Schema.Types.Mixed,
                default: () => ({
                    showFinancials: true,
                    showCollections: true,
                    showOnLeaderboard: true
                })
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

const Counter = mongoose.model(
    'Counter',
    new mongoose.Schema({
        _id: String,
        seq: { type: Number, default: 0 }
    })
);

const feedbackSchema = new mongoose.Schema(
    {
        publicTicketId: { type: String, unique: true, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        usernameSnapshot: { type: String, required: true },
        category: { type: String, required: true },
        subject: { type: String, required: true },
        description: { type: String, required: true },
        reportedSeverity: { type: String, default: null },
        adminPriority: { type: String, default: 'normal' },
        status: { type: String, default: 'new', index: true },
        relatedRoute: { type: String, default: null },
        diagnostics: { type: mongoose.Schema.Types.Mixed, default: null },
        clientRequestId: { type: String, required: true },
        lastPlayerReadAt: { type: Date, default: Date.now },
        lastAdminReadAt: { type: Date, default: null },
        lastAdminReplyAt: { type: Date, default: null },
        archivedAt: { type: Date, default: null },
        auditLog: { type: [mongoose.Schema.Types.Mixed], default: [] }
    },
    { timestamps: true }
);
feedbackSchema.index({ userId: 1, clientRequestId: 1 }, { unique: true });
feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ category: 1, createdAt: -1 });
feedbackSchema.index({ archivedAt: 1, createdAt: -1 });
const Feedback = mongoose.model('Feedback', feedbackSchema);

const feedbackMessageSchema = new mongoose.Schema(
    {
        feedbackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Feedback', required: true, index: true },
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        authorUsername: { type: String, required: true },
        authorRole: { type: String, enum: ['player', 'admin'], required: true },
        body: { type: String, required: true },
        visibility: { type: String, enum: ['player', 'internal'], default: 'player' }
    },
    { timestamps: true }
);
const FeedbackMessage = mongoose.model('FeedbackMessage', feedbackMessageSchema);

const marketQuoteSchema = new mongoose.Schema({
    symbol: { type: String, unique: true, required: true },
    category: { type: String, enum: ['stocks', 'crypto'], required: true },
    anchorPrice: { type: Number, required: true },
    price: { type: String, required: true },
    prevPrice: { type: String, required: true },
    tickId: { type: Number, required: true },
    updatedAt: { type: Date, required: true },
    candles: { type: [mongoose.Schema.Types.Mixed], default: [] },
    candles1h: { type: [mongoose.Schema.Types.Mixed], default: [] }
});
const MarketQuote = mongoose.model('MarketQuote', marketQuoteSchema);

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
            await Counter.init();
            await Feedback.init();
            await FeedbackMessage.init();
            await MarketQuote.init();

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

const feedbackCreateLimit = rateLimit({
    windowMs: 3600000,
    limit: 5,
    keyGenerator: req => String(req.user?._id || req.ip),
    message: { error: 'Too many feedback submissions. Please try again later.' }
});

const feedbackMsgLimit = rateLimit({
    windowMs: 3600000,
    limit: 20,
    keyGenerator: req => String(req.user?._id || req.ip),
    message: { error: 'Too many follow-up messages. Please try again later.' }
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
            { role: { $ne: 'admin' }, state: { $exists: true }, 'privacy.showOnLeaderboard': { $ne: false } },
            'username state premium premiumUntil privacy'
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
                        netWorth: u.privacy?.showFinancials === false ? null : nw,
                        _sortNw: nw,
                        businesses: (st.businesses || []).length,
                        achievements: (st.achievements || []).length,
                        premium: isPrem
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => b._sortNw - a._sortNw)
            .slice(0, 25)
            .map(({ _sortNw, ...rest }) => rest);
        res.json(rows);
    })
);

// Public Player Search & Profiles (Phase 4)

const searchLimit = rateLimit({
    windowMs: 60000,
    limit: 30,
    keyGenerator: req => String(req.user?._id || req.ip)
});

function buildPublicProfile(u) {
    const st = normalizeState(u.state || initial());
    const priv = {
        showFinancials: u.privacy?.showFinancials !== false,
        showCollections: u.privacy?.showCollections !== false,
        showOnLeaderboard: u.privacy?.showOnLeaderboard !== false
    };
    const now = Date.now();
    const isPrem = !!u.premium && (!u.premiumUntil || new Date(u.premiumUntil).getTime() > now);
    const nw = Number(netWorth(st, catalog));
    const investVal = [...catalog.stocks, ...catalog.crypto].reduce(
        (sum, x) => sum + Number(x.price) * (st.holdings?.[x.id] || 0),
        0
    );
    const propCount = Object.values(st.properties || {}).reduce((a, b) => a + b, 0);
    const assetCount = Object.values(st.assets || {}).reduce((a, b) => a + b, 0);

    return {
        username: u.username,
        level: st.level || 1,
        premium: isPrem,
        netWorth: priv.showFinancials ? nw : null,
        investVal: priv.showFinancials ? investVal : null,
        businessesCount: (st.businesses || []).length,
        businesses: (st.businesses || []).map(b => ({
            name: b.name || b.type,
            type: b.type,
            level: b.level,
            branches: (b.branches || []).length
        })),
        propertiesCount: priv.showCollections ? propCount : null,
        assetsCount: priv.showCollections ? assetCount : null,
        achievementsCount: (st.achievements || []).length,
        researchCount: (st.research?.completed || []).length,
        snapshotAt: st.at || null
    };
}

app.get(
    '/api/players/search',
    auth,
    searchLimit,
    wrap(async (req, res) => {
        const q = String(req.query.q || '').trim().toLowerCase();
        if (q.length < 2) {
            return res.json({ items: [] });
        }
        const rx = new RegExp('^' + escapeRegex(q), 'i');
        const users = await User.find(
            {
                role: { $ne: 'admin' },
                username: rx,
                'privacy.showOnLeaderboard': { $ne: false }
            },
            'username state premium premiumUntil privacy'
        ).limit(15).lean();

        const now = Date.now();
        res.json({
            items: users.map(u => {
                const st = normalizeState(u.state || initial());
                const isPrem = !!u.premium && (!u.premiumUntil || new Date(u.premiumUntil).getTime() > now);
                return {
                    username: u.username,
                    level: st.level || 1,
                    premium: isPrem,
                    netWorth: u.privacy?.showFinancials === false ? null : Number(netWorth(st, catalog))
                };
            })
        });
    })
);

app.get(
    '/api/players/:username/profile',
    auth,
    wrap(async (req, res) => {
        const target = String(req.params.username || '').trim().toLowerCase();
        const u = await User.findOne(
            { username: target, role: { $ne: 'admin' } },
            'username state premium premiumUntil privacy'
        ).lean();
        if (!u || u.privacy?.showOnLeaderboard === false) {
            return res.status(404).json({ error: 'Player profile not found or private' });
        }
        res.json(buildPublicProfile(u));
    })
);

app.patch(
    '/api/profile/privacy',
    auth,
    wrap(async (req, res) => {
        const cur = req.user.privacy || {};
        const next = {
            showFinancials: req.body.showFinancials !== undefined ? Boolean(req.body.showFinancials) : cur.showFinancials !== false,
            showCollections: req.body.showCollections !== undefined ? Boolean(req.body.showCollections) : cur.showCollections !== false,
            showOnLeaderboard: req.body.showOnLeaderboard !== undefined ? Boolean(req.body.showOnLeaderboard) : cur.showOnLeaderboard !== false
        };
        req.user.privacy = next;
        req.user.markModified('privacy');
        await req.user.save();
        res.json(next);
    })
);

// Player & Admin Feedback API

const serializePlayerTicket = t => ({
    _id: t._id,
    publicTicketId: t.publicTicketId,
    category: t.category,
    subject: t.subject,
    description: t.description,
    reportedSeverity: t.reportedSeverity,
    status: t.status,
    relatedRoute: t.relatedRoute,
    diagnostics: t.diagnostics,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    unreadReply: Boolean(
        t.lastAdminReplyAt &&
        (!t.lastPlayerReadAt || new Date(t.lastAdminReplyAt) > new Date(t.lastPlayerReadAt))
    )
});

app.post(
    '/api/feedback',
    auth,
    feedbackCreateLimit,
    wrap(async (req, res) => {
        const data = validateFeedbackInput(req.body);
        const existing = await Feedback.findOne({
            userId: req.user._id,
            clientRequestId: data.clientRequestId
        }).lean();
        if (existing) {
            return res.json(serializePlayerTicket(existing));
        }

        const ctr = await Counter.findByIdAndUpdate(
            'feedback',
            { $inc: { seq: 1 } },
            { upsert: true, new: true }
        );
        const publicTicketId = `FB-${String(ctr.seq).padStart(6, '0')}`;

        const created = await Feedback.create({
            publicTicketId,
            userId: req.user._id,
            usernameSnapshot: req.user.username,
            ...data,
            status: 'new',
            adminPriority: 'normal',
            lastPlayerReadAt: new Date(),
            auditLog: [{ actor: req.user.username, action: 'created', from: null, to: 'new', at: new Date() }]
        });
        res.status(201).json(serializePlayerTicket(created));
    })
);

app.get(
    '/api/feedback/me',
    auth,
    wrap(async (req, res) => {
        const tickets = await Feedback.find({
            userId: req.user._id,
            archivedAt: null
        }).sort({ updatedAt: -1 }).limit(50).lean();
        res.json(tickets.map(serializePlayerTicket));
    })
);

app.get(
    '/api/feedback/:id',
    auth,
    wrap(async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        const ticket = await Feedback.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id, archivedAt: null },
            { $set: { lastPlayerReadAt: new Date() } },
            { new: true }
        ).lean();
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        const messages = await FeedbackMessage.find({
            feedbackId: ticket._id,
            visibility: 'player'
        }).sort({ createdAt: 1 }).lean();
        res.json({
            ticket: serializePlayerTicket(ticket),
            messages: messages.map(m => ({
                _id: m._id,
                authorRole: m.authorRole,
                authorUsername: m.authorRole === 'admin' ? 'Admin' : m.authorUsername,
                body: m.body,
                createdAt: m.createdAt
            }))
        });
    })
);

app.post(
    '/api/feedback/:id/messages',
    auth,
    feedbackMsgLimit,
    wrap(async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        const body = validateFeedbackMessage(req.body?.body);
        const ticket = await Feedback.findOne({
            _id: req.params.id,
            userId: req.user._id,
            archivedAt: null
        });
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        if (ticket.status === 'closed') {
            return res.status(400).json({ error: 'This ticket is closed' });
        }
        const msg = await FeedbackMessage.create({
            feedbackId: ticket._id,
            authorId: req.user._id,
            authorUsername: req.user.username,
            authorRole: 'player',
            body,
            visibility: 'player'
        });
        ticket.lastPlayerReadAt = new Date();
        ticket.updatedAt = new Date();
        await ticket.save();
        res.status(201).json({
            _id: msg._id,
            authorRole: msg.authorRole,
            authorUsername: msg.authorUsername,
            body: msg.body,
            createdAt: msg.createdAt
        });
    })
);

app.get(
    '/api/admin/feedback',
    auth,
    admin,
    wrap(async (req, res) => {
        const {
            q = '',
            status = 'all',
            category = 'all',
            priority = 'all',
            archived = 'false',
            sort = 'newest',
            page = '1',
            limit = '20'
        } = req.query;

        const filter = {};
        filter.archivedAt = archived === 'true' ? { $ne: null } : null;
        if (status !== 'all' && FEEDBACK_STATUSES.includes(String(status))) {
            filter.status = String(status);
        }
        if (category !== 'all') {
            filter.category = String(category);
        }
        if (priority !== 'all' && FEEDBACK_PRIORITIES.includes(String(priority))) {
            filter.adminPriority = String(priority);
        }
        const cleanQ = String(q).trim();
        if (cleanQ) {
            const rx = new RegExp(escapeRegex(cleanQ), 'i');
            filter.$or = [
                { publicTicketId: rx },
                { usernameSnapshot: rx },
                { subject: rx }
            ];
        }

        const pNum = Math.max(1, Number(page) || 1);
        const lim = Math.min(50, Math.max(1, Number(limit) || 20));
        const sortSpec = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

        const [items, total, aggCounts] = await Promise.all([
            Feedback.find(filter).sort(sortSpec).skip((pNum - 1) * lim).limit(lim).lean(),
            Feedback.countDocuments(filter),
            Feedback.aggregate([
                { $match: { archivedAt: null } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ])
        ]);

        const counts = { new: 0, in_review: 0, planned: 0, resolved: 0, closed: 0 };
        for (const row of aggCounts) {
            if (row._id in counts) counts[row._id] = row.count;
        }

        res.json({
            items: items.map(t => ({
                ...t,
                unreadByAdmin: !t.lastAdminReadAt || new Date(t.updatedAt) > new Date(t.lastAdminReadAt)
            })),
            total,
            page: pNum,
            pages: Math.max(1, Math.ceil(total / lim)),
            counts
        });
    })
);

app.get(
    '/api/admin/feedback/:id',
    auth,
    admin,
    wrap(async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        const ticket = await Feedback.findByIdAndUpdate(
            req.params.id,
            { $set: { lastAdminReadAt: new Date() } },
            { new: true }
        ).lean();
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        const messages = await FeedbackMessage.find({ feedbackId: ticket._id }).sort({ createdAt: 1 }).lean();
        res.json({ ticket, messages });
    })
);

app.patch(
    '/api/admin/feedback/:id',
    auth,
    admin,
    wrap(async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        const ticket = await Feedback.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        const now = new Date();
        if (req.body.status !== undefined) {
            if (!FEEDBACK_STATUSES.includes(req.body.status)) {
                throw Error('Invalid status');
            }
            if (ticket.status !== req.body.status) {
                ticket.auditLog.push({ actor: req.user.username, action: 'status', from: ticket.status, to: req.body.status, at: now });
                ticket.status = req.body.status;
            }
        }
        if (req.body.adminPriority !== undefined) {
            if (!FEEDBACK_PRIORITIES.includes(req.body.adminPriority)) {
                throw Error('Invalid priority');
            }
            if (ticket.adminPriority !== req.body.adminPriority) {
                ticket.auditLog.push({ actor: req.user.username, action: 'priority', from: ticket.adminPriority, to: req.body.adminPriority, at: now });
                ticket.adminPriority = req.body.adminPriority;
            }
        }
        if (req.body.archived !== undefined) {
            const wantArch = Boolean(req.body.archived);
            ticket.archivedAt = wantArch ? now : null;
            ticket.auditLog.push({ actor: req.user.username, action: wantArch ? 'archive' : 'unarchive', from: null, to: wantArch ? 'archived' : 'active', at: now });
        }
        if (req.body.markRead === true) {
            ticket.lastAdminReadAt = now;
        } else if (req.body.markRead === false) {
            ticket.lastAdminReadAt = null;
        }
        await ticket.save();
        res.json(ticket);
    })
);

app.post(
    '/api/admin/feedback/:id/messages',
    auth,
    admin,
    wrap(async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        const body = validateFeedbackMessage(req.body?.body);
        const visibility = req.body?.visibility === 'internal' ? 'internal' : 'player';
        const ticket = await Feedback.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        const msg = await FeedbackMessage.create({
            feedbackId: ticket._id,
            authorId: req.user._id,
            authorUsername: req.user.username,
            authorRole: 'admin',
            body,
            visibility
        });
        const now = new Date();
        ticket.lastAdminReadAt = now;
        if (visibility === 'player') {
            ticket.lastAdminReplyAt = now;
            if (ticket.status === 'new') {
                ticket.auditLog.push({ actor: req.user.username, action: 'status', from: 'new', to: 'in_review', at: now });
                ticket.status = 'in_review';
            }
        }
        ticket.auditLog.push({ actor: req.user.username, action: visibility === 'internal' ? 'internal_note' : 'reply', from: null, to: visibility, at: now });
        await ticket.save();
        res.status(201).json(msg);
    })
);

// Authoritative Shared Market Engine (Phase 3)

let marketCache = null;
let marketAdvancePromise = null;

function seedHourlyCandles(item, cat, now, endPrice) {
    const hours = 168;
    const arr = [];
    let p = String(item.price);
    const startHour = Math.floor(now / 3600000) - hours;
    for (let i = 0; i < hours; i++) {
        const tk = startHour + i;
        const tAt = tk * 3600000;
        p = stepMarketPrice({
            prevPrice: p,
            anchorPrice: item.price,
            category: cat,
            symbol: item.id,
            tickId: tk,
            secretKey: secret,
            t: tAt
        });
        arr.push({ t: tAt, o: Number(p), h: Number(p), l: Number(p), c: Number(p) });
    }
    if (endPrice !== undefined && arr.length) {
        const ep = Number(endPrice);
        arr[arr.length - 1].c = ep;
        arr[arr.length - 1].h = Math.max(arr[arr.length - 1].h, ep);
        arr[arr.length - 1].l = Math.min(arr[arr.length - 1].l, ep);
    }
    return arr;
}

async function ensureMarketLoaded(now) {
    if (marketCache) return marketCache;
    const docs = await MarketQuote.find().lean();
    const bySym = new Map(docs.map(d => [d.symbol, d]));
    const toInsert = [];
    const backfillOps = [];
    for (const cat of ['stocks', 'crypto']) {
        const tickMs = cat === 'crypto' ? MARKET_CONFIG.CRYPTO_TICK_MS : MARKET_CONFIG.STOCK_TICK_MS;
        const tickId = Math.floor(now / tickMs);
        for (const item of catalog[cat]) {
            const existing = bySym.get(item.id);
            if (!existing) {
                const pStr = String(item.price);
                const doc = {
                    symbol: item.id,
                    category: cat,
                    anchorPrice: item.price,
                    price: pStr,
                    prevPrice: pStr,
                    tickId,
                    updatedAt: new Date(now),
                    candles: updateCandles([], pStr, now, 60000),
                    candles1h: seedHourlyCandles(item, cat, now, pStr)
                };
                toInsert.push(doc);
                bySym.set(item.id, doc);
            } else if (!existing.candles1h || existing.candles1h.length < 2) {
                existing.candles1h = seedHourlyCandles(item, cat, now, existing.price);
                backfillOps.push({
                    updateOne: {
                        filter: { symbol: item.id },
                        update: { $set: { candles1h: existing.candles1h } }
                    }
                });
            }
        }
    }
    if (toInsert.length) {
        await MarketQuote.insertMany(toInsert, { ordered: false }).catch(() => {});
    }
    if (backfillOps.length) {
        await MarketQuote.bulkWrite(backfillOps, { ordered: false }).catch(() => {});
    }
    marketCache = bySym;
    return marketCache;
}

async function advanceMarketTo(now = Date.now()) {
    if (marketAdvancePromise) return marketAdvancePromise;
    marketAdvancePromise = (async () => {
        const cache = await ensureMarketLoaded(now);
        const ops = [];
        const triggeredSymbols = new Set();

        for (const q of cache.values()) {
            const tickMs = q.category === 'crypto' ? MARKET_CONFIG.CRYPTO_TICK_MS : MARKET_CONFIG.STOCK_TICK_MS;
            const targetTick = Math.floor(now / tickMs);
            if (targetTick <= q.tickId) continue;

            const steps = Math.min(360, targetTick - q.tickId);
            const startTick = targetTick - steps + 1;
            let cur = q.price;
            let candles = q.candles || [];
            let candles1h = q.candles1h || [];
            const prevHourPrice = q.prevPrice || q.price;

            for (let tk = startTick; tk <= targetTick; tk++) {
                const tAt = tk * tickMs;
                cur = stepMarketPrice({
                    prevPrice: cur,
                    anchorPrice: q.anchorPrice,
                    category: q.category,
                    symbol: q.symbol,
                    tickId: tk,
                    secretKey: secret,
                    t: tAt
                });
                candles = updateCandles(candles, cur, tAt, 60000);
                candles1h = updateCandles(candles1h, cur, tAt, 3600000);
            }

            q.prevPrice = prevHourPrice;
            q.price = cur;
            q.tickId = targetTick;
            q.updatedAt = new Date(now);
            q.candles = candles;
            q.candles1h = candles1h;
            triggeredSymbols.add(q.symbol);

            ops.push({
                updateOne: {
                    filter: { symbol: q.symbol },
                    update: {
                        $set: {
                            price: cur,
                            prevPrice: q.prevPrice,
                            tickId: targetTick,
                            updatedAt: q.updatedAt,
                            candles,
                            candles1h
                        }
                    }
                }
            });
        }

        if (ops.length) {
            await MarketQuote.bulkWrite(ops, { ordered: false });
            // Settle any server-accepted pending limit/stop orders on affected symbols
            const usersWithOrders = await User.find({ 'state.orders.0': { $exists: true } });
            for (const u of usersWithOrders) {
                const st = normalizeState(u.state);
                let changed = false;
                const remaining = [];
                for (const ord of st.orders || []) {
                    const liveQ = cache.get(ord.item);
                    if (!liveQ || !triggeredSymbols.has(ord.item)) {
                        remaining.push(ord);
                        continue;
                    }
                    const curPrice = new Decimal(liveQ.price);
                    const targetP = new Decimal(ord.targetPrice);
                    const triggered = ord.side === 'buy'
                        ? (ord.kind === 'limit' ? curPrice.lte(targetP) : curPrice.gte(targetP))
                        : (ord.kind === 'limit' ? curPrice.gte(targetP) : curPrice.lte(targetP));
                    if (triggered) {
                        changed = true;
                        if (ord.side === 'buy') {
                            const actualCost = curPrice.times(ord.qty);
                            const refund = targetP.times(ord.qty).minus(actualCost);
                            if (refund.gt(0)) st.cash = new Decimal(st.cash).plus(refund).toString();
                            st.holdings[ord.item] = (st.holdings[ord.item] || 0) + ord.qty;
                            st.costBasis[ord.item] = new Decimal(st.costBasis[ord.item] || '0').plus(actualCost).toString();
                        } else {
                            st.cash = new Decimal(st.cash).plus(curPrice.times(ord.qty)).toString();
                        }
                        st.ledger = [{
                            id: `ord-${ord.id}`,
                            at: now,
                            type: `order_${ord.side}`,
                            category: 'invest',
                            source: ord.item,
                            amount: ord.side === 'buy' ? '0' : curPrice.times(ord.qty).toString(),
                            prevCash: st.cash,
                            newCash: st.cash
                        }, ...(st.ledger || [])].slice(0, 200);
                    } else {
                        remaining.push(ord);
                    }
                }
                if (changed) {
                    st.orders = remaining;
                    u.state = st;
                    u.version = (u.version || 0) + 1;
                    u.markModified('state');
                    await u.save();
                }
            }
        }
        return cache;
    })().finally(() => {
        marketAdvancePromise = null;
    });
    return marketAdvancePromise;
}

function serializeQuotes(cache) {
    const out = {};
    for (const q of cache.values()) {
        const cur = Number(q.price);
        const prv = Number(q.prevPrice || q.price);
        out[q.symbol] = {
            price: q.price,
            prevPrice: q.prevPrice,
            tickId: q.tickId,
            updatedAt: q.updatedAt,
            changePct: prv > 0 ? ((cur / prv - 1) * 100) : 0
        };
    }
    return out;
}

app.get(
    '/api/market/quotes',
    wrap(async (req, res) => {
        const now = Date.now();
        const cache = await advanceMarketTo(now);
        res.json({ t: now, quotes: serializeQuotes(cache) });
    })
);

app.get(
    '/api/market/history/:category/:symbol',
    wrap(async (req, res) => {
        const now = Date.now();
        const cache = await advanceMarketTo(now);
        const q = cache.get(req.params.symbol);
        if (!q || q.category !== req.params.category) {
            return res.status(404).json({ error: 'Symbol not found' });
        }
        res.json({
            symbol: q.symbol,
            category: q.category,
            price: q.price,
            prevPrice: q.prevPrice,
            tickId: q.tickId,
            updatedAt: q.updatedAt,
            candles: q.candles || [],
            candles1h: q.candles1h || []
        });
    })
);

app.get(
    '/api/market/stream',
    auth,
    wrap(async (req, res) => {
        res.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        });
        res.flushHeaders?.();

        let closed = false;
        const push = async () => {
            if (closed) return;
            try {
                const now = Date.now();
                const cache = await advanceMarketTo(now);
                res.write(`data: ${JSON.stringify({ t: now, quotes: serializeQuotes(cache) })}\n\n`);
            } catch {
                // Keep stream alive on transient DB error
            }
        };

        await push();
        const iv = setInterval(push, 5000);
        req.on('close', () => {
            closed = true;
            clearInterval(iv);
        });
    })
);

app.post(
    '/api/market/trade',
    auth,
    wrap(async (req, res) => {
        const now = Date.now();
        const cache = await advanceMarketTo(now);
        const { category, item: symbol, qty, sell } = req.body || {};
        if (!['stocks', 'crypto'].includes(category)) {
            throw Error('Invalid market category');
        }
        if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1000000) {
            throw Error('Invalid quantity');
        }
        const item = catalog[category].find(x => x.id === symbol);
        const liveQ = cache.get(symbol);
        if (!item || !liveQ) throw Error('Unknown symbol');

        const s = settle(req.user.state, now, catalog);
        const prevCash = s.cash;
        const unitPrice = new Decimal(liveQ.price);
        const owned = s.holdings[symbol] || 0;

        if (sell) {
            if (owned < qty) throw Error('Not enough owned');
            s.holdings[symbol] = owned - qty;
            const prevCost = new Decimal(s.costBasis[symbol] || '0');
            s.costBasis[symbol] = owned - qty === 0
                ? '0'
                : prevCost.times(owned - qty).div(owned).toString();
            s.cash = new Decimal(s.cash).plus(unitPrice.times(qty)).toString();
        } else {
            if (category === 'stocks') {
                const total = stockTotalShares(item);
                const reservedBuy = (s.orders || []).filter(o => o.item === symbol && o.side === 'buy').reduce((sum, o) => sum + o.qty, 0);
                if (owned + reservedBuy + qty > total) {
                    throw Error(`Only ${Math.max(0, total - owned - reservedBuy)} shares available`);
                }
            }
            const cost = unitPrice.times(qty);
            if (new Decimal(s.cash).lt(cost)) throw Error('Insufficient funds');
            s.cash = new Decimal(s.cash).minus(cost).toString();
            s.costBasis[symbol] = new Decimal(s.costBasis[symbol] || '0').plus(cost).toString();
            s.holdings[symbol] = owned + qty;
        }

        const delta = new Decimal(s.cash).minus(prevCash);
        s.ledger = [{
            id: `mkt-${now}-${Math.random().toString(36).slice(2, 7)}`,
            at: now,
            type: sell ? 'market_sell' : 'market_buy',
            category: 'invest',
            source: item.name,
            amount: delta.toString(),
            prevCash,
            newCash: s.cash
        }, ...(s.ledger || [])].slice(0, 200);

        req.user.state = s;
        req.user.version = (req.user.version || 0) + 1;
        req.user.markModified('state');
        await req.user.save();

        res.json({ cloud: snapshot(req.user), fill: { symbol, qty, sell: Boolean(sell), price: liveQ.price } });
    })
);

app.post(
    '/api/market/orders',
    auth,
    wrap(async (req, res) => {
        const now = Date.now();
        const cache = await advanceMarketTo(now);
        const { category, item: symbol, side, kind, targetPrice, qty } = req.body || {};
        if (!['stocks', 'crypto'].includes(category)) throw Error('Invalid market');
        if (!['buy', 'sell'].includes(side) || !['limit', 'stop'].includes(kind)) throw Error('Invalid order');
        if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1000000) throw Error('Invalid quantity');
        const targetP = new Decimal(targetPrice || 0);
        if (targetP.lte(0)) throw Error('Invalid target price');

        const item = catalog[category].find(x => x.id === symbol);
        const liveQ = cache.get(symbol);
        if (!item || !liveQ) throw Error('Unknown symbol');

        const s = settle(req.user.state, now, catalog);
        if ((s.orders || []).length >= 20) throw Error('Maximum 20 open orders');

        const curPrice = new Decimal(liveQ.price);
        const triggered = side === 'buy'
            ? (kind === 'limit' ? curPrice.lte(targetP) : curPrice.gte(targetP))
            : (kind === 'limit' ? curPrice.gte(targetP) : curPrice.lte(targetP));

        if (side === 'buy') {
            if (category === 'stocks') {
                const total = stockTotalShares(item);
                const owned = s.holdings[symbol] || 0;
                const reservedBuy = (s.orders || []).filter(o => o.item === symbol && o.side === 'buy').reduce((sum, o) => sum + o.qty, 0);
                if (owned + reservedBuy + qty > total) throw Error(`Exceeds available share supply (${total})`);
            }
            const reserveAmt = targetP.times(qty);
            if (new Decimal(s.cash).lt(reserveAmt)) throw Error('Insufficient funds');
            if (triggered) {
                const actualCost = curPrice.times(qty);
                s.cash = new Decimal(s.cash).minus(actualCost).toString();
                s.holdings[symbol] = (s.holdings[symbol] || 0) + qty;
                s.costBasis[symbol] = new Decimal(s.costBasis[symbol] || '0').plus(actualCost).toString();
            } else {
                s.cash = new Decimal(s.cash).minus(reserveAmt).toString();
                s.orders.push({ id: randomUUID(), category, item: symbol, side, kind, targetPrice: targetP.toString(), qty, at: now });
            }
        } else {
            const owned = s.holdings[symbol] || 0;
            if (owned < qty) throw Error('Not enough owned');
            s.holdings[symbol] = owned - qty;
            const prevCost = new Decimal(s.costBasis[symbol] || '0');
            s.costBasis[symbol] = owned - qty === 0 ? '0' : prevCost.times(owned - qty).div(owned).toString();
            if (triggered) {
                s.cash = new Decimal(s.cash).plus(curPrice.times(qty)).toString();
            } else {
                s.orders.push({ id: randomUUID(), category, item: symbol, side, kind, targetPrice: targetP.toString(), qty, at: now });
            }
        }

        req.user.state = s;
        req.user.version = (req.user.version || 0) + 1;
        req.user.markModified('state');
        await req.user.save();
        res.json({ cloud: snapshot(req.user), filled: triggered, price: liveQ.price });
    })
);

app.delete(
    '/api/market/orders/:orderId',
    auth,
    wrap(async (req, res) => {
        const now = Date.now();
        const s = settle(req.user.state, now, catalog);
        const ord = (s.orders || []).find(o => o.id === req.params.orderId);
        if (!ord) return res.status(404).json({ error: 'Order not found' });
        if (ord.side === 'buy') {
            s.cash = new Decimal(s.cash).plus(new Decimal(ord.targetPrice).times(ord.qty)).toString();
        } else {
            s.holdings[ord.item] = (s.holdings[ord.item] || 0) + ord.qty;
        }
        s.orders = s.orders.filter(o => o.id !== ord.id);
        req.user.state = s;
        req.user.version = (req.user.version || 0) + 1;
        req.user.markModified('state');
        await req.user.save();
        res.json({ cloud: snapshot(req.user) });
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
