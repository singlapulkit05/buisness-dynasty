
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
import {
    AUCTION_CONFIG,
    storageKeyForAsset,
    minNextBid,
    validateListingInput
} from '../shared/auctions.js';
import {
    normalizePrivacy,
    buildPublicProfileSummary,
    projectPublicBusinesses,
    projectPublicBusinessDetail,
    projectPublicInvestments,
    projectPublicProperties,
    projectPublicAssets,
    projectPublicResearch,
    projectPublicAchievements
} from '../shared/public-profile.js';

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
    candles1h: { type: [mongoose.Schema.Types.Mixed], default: [] },
    candles1d: { type: [mongoose.Schema.Types.Mixed], default: [] }
});
const MarketQuote = mongoose.model('MarketQuote', marketQuoteSchema);

const auctionSchema = new mongoose.Schema(
    {
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        sellerUsername: { type: String, required: true },
        catalogueId: { type: String, required: true },
        cataloguePrice: { type: String, default: null },
        assetName: { type: String, required: true },
        category: { type: String, required: true },
        storageKey: { type: String, default: null },
        startingBid: { type: String, required: true },
        reservePrice: { type: String, default: null },
        highestBidId: { type: mongoose.Schema.Types.ObjectId, default: null },
        highestBidderId: { type: mongoose.Schema.Types.ObjectId, default: null },
        highestBidderUsername: { type: String, default: null },
        highestBidAmount: { type: String, default: null },
        bidCount: { type: Number, default: 0 },
        endsAt: { type: Date, required: true, index: true },
        originalEndsAt: { type: Date, required: true },
        status: { type: String, enum: ['active', 'settling', 'sold', 'unsold', 'cancelled'], default: 'active', index: true },
        feeRateSnapshot: { type: Number, default: AUCTION_CONFIG.FEE_RATE },
        version: { type: Number, default: 0 },
        settlementId: { type: String, default: null },
        settledAt: { type: Date, default: null },
        cancelReason: { type: String, default: null }
    },
    { timestamps: true }
);
auctionSchema.index(
    { sellerId: 1, catalogueId: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['active', 'settling'] } } }
);
auctionSchema.index({ status: 1, endsAt: 1 });
const Auction = mongoose.model('Auction', auctionSchema);

const auctionBidSchema = new mongoose.Schema({
    auctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true, index: true },
    bidderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bidderUsername: { type: String, required: true },
    amount: { type: String, required: true },
    acceptedAt: { type: Date, default: Date.now },
    sequence: { type: Number, required: true },
    clientRequestId: { type: String, default: null },
    status: { type: String, enum: ['leading', 'outbid', 'won', 'refunded'], default: 'leading' }
});
auctionBidSchema.index({ bidderId: 1, clientRequestId: 1 }, { unique: true, sparse: true });
const AuctionBid = mongoose.model('AuctionBid', auctionBidSchema);

const auctionSettlementSchema = new mongoose.Schema({
    auctionId: { type: mongoose.Schema.Types.ObjectId, unique: true, required: true },
    settlementId: { type: String, unique: true, required: true },
    winnerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    grossAmount: { type: String, default: '0' },
    feeAmount: { type: String, default: '0' },
    sellerNet: { type: String, default: '0' },
    outcome: { type: String, enum: ['sold', 'unsold', 'cancelled'], required: true },
    settledAt: { type: Date, default: Date.now }
});
const AuctionSettlement = mongoose.model('AuctionSettlement', auctionSettlementSchema);

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
            await Auction.init();
            await AuctionBid.init();
            await AuctionSettlement.init();

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

async function loadPublicPlayer(username) {
    const target = String(username || '').trim().toLowerCase();
    const u = await User.findOne(
        { username: target, role: { $ne: 'admin' } },
        '_id username state premium premiumUntil privacy'
    ).lean();
    if (!u || u.privacy?.showOnLeaderboard === false) return null;
    return u;
}

app.get(
    '/api/players/:username/profile',
    auth,
    wrap(async (req, res) => {
        const u = await loadPublicPlayer(req.params.username);
        if (!u) {
            return res.status(404).json({ error: 'Player profile not found or private' });
        }
        const liveQuotes = marketCache ? serializeQuotes(marketCache) : null;
        const activeAucs = await Auction.find({ sellerId: u._id, status: 'active' }).limit(20).lean();
        res.json(buildPublicProfileSummary(u, { liveQuotes, auctions: activeAucs }));
    })
);

app.get(
    '/api/players/:username/businesses',
    auth,
    wrap(async (req, res) => {
        const u = await loadPublicPlayer(req.params.username);
        if (!u) return res.status(404).json({ error: 'Player profile not found or private' });
        res.json(projectPublicBusinesses(u, req.query));
    })
);

app.get(
    '/api/players/:username/businesses/:publicBusinessId',
    auth,
    wrap(async (req, res) => {
        const u = await loadPublicPlayer(req.params.username);
        if (!u) return res.status(404).json({ error: 'Player profile not found or private' });
        const detail = projectPublicBusinessDetail(u, req.params.publicBusinessId);
        if (!detail) return res.status(404).json({ error: 'Business not found or private' });
        res.json(detail);
    })
);

app.get(
    '/api/players/:username/investments',
    auth,
    wrap(async (req, res) => {
        const u = await loadPublicPlayer(req.params.username);
        if (!u) return res.status(404).json({ error: 'Player profile not found or private' });
        const liveQuotes = marketCache ? serializeQuotes(marketCache) : null;
        res.json(projectPublicInvestments(u, { type: req.query.type, liveQuotes }));
    })
);

app.get(
    '/api/players/:username/properties',
    auth,
    wrap(async (req, res) => {
        const u = await loadPublicPlayer(req.params.username);
        if (!u) return res.status(404).json({ error: 'Player profile not found or private' });
        res.json(projectPublicProperties(u, req.query));
    })
);

app.get(
    '/api/players/:username/assets',
    auth,
    wrap(async (req, res) => {
        const u = await loadPublicPlayer(req.params.username);
        if (!u) return res.status(404).json({ error: 'Player profile not found or private' });
        res.json(projectPublicAssets(u, req.query));
    })
);

app.get(
    '/api/players/:username/research',
    auth,
    wrap(async (req, res) => {
        const u = await loadPublicPlayer(req.params.username);
        if (!u) return res.status(404).json({ error: 'Player profile not found or private' });
        res.json(projectPublicResearch(u));
    })
);

app.get(
    '/api/players/:username/achievements',
    auth,
    wrap(async (req, res) => {
        const u = await loadPublicPlayer(req.params.username);
        if (!u) return res.status(404).json({ error: 'Player profile not found or private' });
        res.json(projectPublicAchievements(u));
    })
);

app.get(
    '/api/players/:username/auctions',
    auth,
    wrap(async (req, res) => {
        const u = await loadPublicPlayer(req.params.username);
        if (!u) return res.status(404).json({ error: 'Player profile not found or private' });
        await settleExpiredAuctions(Date.now());
        const list = await Auction.find({
            sellerId: u._id,
            status: { $in: ['active', 'sold', 'unsold'] }
        }).sort({ createdAt: -1 }).limit(24).lean();
        res.json(list.map(a => serializeAuction(a, req.user._id)));
    })
);

app.get(
    '/api/profile/privacy',
    auth,
    (req, res) => {
        res.json(normalizePrivacy(req.user.privacy));
    }
);

app.patch(
    '/api/profile/privacy',
    auth,
    wrap(async (req, res) => {
        const cur = normalizePrivacy(req.user.privacy);
        const b = req.body || {};
        const next = normalizePrivacy({
            ...cur,
            showOnLeaderboard: b.showOnLeaderboard !== undefined ? Boolean(b.showOnLeaderboard) : cur.showOnLeaderboard,
            showFinancials: b.showFinancials !== undefined ? Boolean(b.showFinancials) : cur.showFinancials,
            showCollections: b.showCollections !== undefined ? Boolean(b.showCollections) : cur.showCollections,
            showBusinesses: b.showBusinesses !== undefined ? Boolean(b.showBusinesses) : cur.showBusinesses,
            showInvestments: b.showInvestments !== undefined ? Boolean(b.showInvestments) : cur.showInvestments,
            showProperties: b.showProperties !== undefined ? Boolean(b.showProperties) : cur.showProperties,
            showLuxury: b.showLuxury !== undefined ? Boolean(b.showLuxury) : cur.showLuxury,
            showResearch: b.showResearch !== undefined ? Boolean(b.showResearch) : cur.showResearch,
            showAchievements: b.showAchievements !== undefined ? Boolean(b.showAchievements) : cur.showAchievements,
            showVip: b.showVip !== undefined ? Boolean(b.showVip) : cur.showVip,
            hiddenCategories: b.hiddenCategories !== undefined ? b.hiddenCategories : cur.hiddenCategories
        });
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

function seedDailyCandles(item, cat, now, endPrice) {
    const days = 365;
    const arr = [];
    let p = String(item.price);
    const startDay = Math.floor(now / 86400000) - days;
    for (let i = 0; i < days; i++) {
        const tk = startDay + i;
        const tAt = tk * 86400000;
        p = stepMarketPrice({
            prevPrice: p,
            anchorPrice: item.price,
            category: cat,
            symbol: item.id,
            tickId: tk + 900000,
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
                    candles1h: seedHourlyCandles(item, cat, now, pStr),
                    candles1d: seedDailyCandles(item, cat, now, pStr)
                };
                toInsert.push(doc);
                bySym.set(item.id, doc);
            } else if (!existing.candles1h || existing.candles1h.length < 2 || !existing.candles1d || existing.candles1d.length < 30) {
                if (!existing.candles1h || existing.candles1h.length < 2) {
                    existing.candles1h = seedHourlyCandles(item, cat, now, existing.price);
                }
                if (!existing.candles1d || existing.candles1d.length < 30) {
                    existing.candles1d = seedDailyCandles(item, cat, now, existing.price);
                }
                backfillOps.push({
                    updateOne: {
                        filter: { symbol: item.id },
                        update: { $set: { candles1h: existing.candles1h, candles1d: existing.candles1d } }
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
            let candles1d = q.candles1d || [];
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
                const bucket1d = Math.floor(tAt / 86400000) * 86400000;
                const lastD = candles1d[candles1d.length - 1];
                const pNum = Number(cur);
                if (lastD && lastD.t === bucket1d) {
                    lastD.h = Math.max(lastD.h, pNum);
                    lastD.l = Math.min(lastD.l, pNum);
                    lastD.c = pNum;
                } else {
                    candles1d = [...candles1d, { t: bucket1d, o: pNum, h: pNum, l: pNum, c: pNum }].slice(-365);
                }
            }

            q.prevPrice = prevHourPrice;
            q.price = cur;
            q.tickId = targetTick;
            q.updatedAt = new Date(now);
            q.candles = candles;
            q.candles1h = candles1h;
            q.candles1d = candles1d;
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
                            candles1h,
                            candles1d
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
            candles1h: q.candles1h || [],
            candles1d: q.candles1d || []
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

// Player-to-Player Asset Auctions (Phase 5)

const auctionLimit = rateLimit({
    windowMs: 60000,
    limit: 20,
    keyGenerator: req => String(req.user?._id || req.ip)
});

function serializeAuction(rawAuc, viewerId) {
    const a = typeof rawAuc?.toObject === 'function' ? rawAuc.toObject() : rawAuc;
    const isSeller = viewerId && String(a.sellerId) === String(viewerId);
    const catPrice = a.cataloguePrice || String(catalog.assets.find(x => x.id === a.catalogueId)?.price || a.startingBid);
    const reserveMet = a.reservePrice
        ? Boolean(a.highestBidAmount && new Decimal(a.highestBidAmount).gte(a.reservePrice))
        : true;
    return {
        _id: a._id,
        sellerUsername: a.sellerUsername,
        isSeller,
        catalogueId: a.catalogueId,
        cataloguePrice: catPrice,
        assetName: a.assetName,
        category: a.category,
        storageKey: a.storageKey,
        startingBid: a.startingBid,
        hasReserve: Boolean(a.reservePrice),
        reservePrice: isSeller ? a.reservePrice : undefined,
        reserveMet,
        highestBidAmount: a.highestBidAmount,
        highestBidderUsername: a.highestBidderUsername,
        isLeading: viewerId && a.highestBidderId ? String(a.highestBidderId) === String(viewerId) : false,
        bidCount: a.bidCount || 0,
        minNextBid: minNextBid({ ...a, cataloguePrice: catPrice }),
        endsAt: a.endsAt,
        originalEndsAt: a.originalEndsAt,
        status: a.status,
        feeRate: a.feeRateSnapshot,
        createdAt: a.createdAt,
        cancelReason: a.cancelReason
    };
}

let auctionSettlePromise = null;
async function settleExpiredAuctions(now = Date.now()) {
    if (auctionSettlePromise) return auctionSettlePromise;
    auctionSettlePromise = (async () => {
        const due = await Auction.find({
            status: 'active',
            endsAt: { $lte: new Date(now) }
        }).limit(25).lean();

        for (const raw of due) {
            const locked = await Auction.findOneAndUpdate(
                { _id: raw._id, status: 'active' },
                { $set: { status: 'settling' } },
                { new: true }
            );
            if (!locked) continue;

            const settlementId = randomUUID();
            try {
                const seller = await User.findById(locked.sellerId);
                const reserveMet = locked.reservePrice
                    ? Boolean(locked.highestBidAmount && new Decimal(locked.highestBidAmount).gte(locked.reservePrice))
                    : true;
                const won = Boolean(locked.highestBidId && locked.highestBidderId && reserveMet);

                if (won) {
                    const winner = await User.findById(locked.highestBidderId);
                    if (!seller || !winner) throw Error('Participant missing');

                    const sSt = normalizeState(seller.state);
                    const wSt = normalizeState(winner.state);

                    const gross = new Decimal(locked.highestBidAmount);
                    const fee = gross.times(locked.feeRateSnapshot || AUCTION_CONFIG.FEE_RATE).toDecimalPlaces(2);
                    const sellerNet = gross.minus(fee);

                    sSt.assets[locked.catalogueId] = 0;
                    sSt.lockedAssets = (sSt.lockedAssets || []).filter(id => id !== locked.catalogueId);
                    const prevSCash = sSt.cash;
                    sSt.cash = new Decimal(sSt.cash).plus(sellerNet).toString();
                    sSt.ledger = [{
                        id: `auc-sell-${settlementId}`,
                        at: now,
                        type: 'auction_sale',
                        category: 'asset',
                        source: locked.assetName,
                        amount: sellerNet.toString(),
                        prevCash: prevSCash,
                        newCash: sSt.cash
                    }, ...(sSt.ledger || [])].slice(0, 200);
                    sSt.notifications = [{
                        id: `auc-n-s-${settlementId}`,
                        type: 'auction',
                        title: 'Auction Sold',
                        detail: `${locked.assetName} sold to ${winner.username} for $${gross.toFixed(2)} (net $${sellerNet.toFixed(2)})`,
                        at: now,
                        read: false
                    }, ...(sSt.notifications || [])].slice(0, 50);

                    wSt.assets[locked.catalogueId] = 1;
                    wSt.notifications = [{
                        id: `auc-n-w-${settlementId}`,
                        type: 'auction',
                        title: 'Auction Won',
                        detail: `Won ${locked.assetName} from ${seller.username} for $${gross.toFixed(2)}`,
                        at: now,
                        read: false
                    }, ...(wSt.notifications || [])].slice(0, 50);

                    seller.state = sSt;
                    seller.version = (seller.version || 0) + 1;
                    seller.markModified('state');
                    winner.state = wSt;
                    winner.version = (winner.version || 0) + 1;
                    winner.markModified('state');

                    await Promise.all([
                        seller.save(),
                        winner.save(),
                        AuctionBid.updateOne({ _id: locked.highestBidId }, { $set: { status: 'won' } }),
                        AuctionSettlement.create({
                            auctionId: locked._id,
                            settlementId,
                            winnerId: winner._id,
                            sellerId: seller._id,
                            grossAmount: gross.toString(),
                            feeAmount: fee.toString(),
                            sellerNet: sellerNet.toString(),
                            outcome: 'sold',
                            settledAt: new Date(now)
                        })
                    ]);
                    locked.status = 'sold';
                } else {
                    if (seller) {
                        const sSt = normalizeState(seller.state);
                        sSt.lockedAssets = (sSt.lockedAssets || []).filter(id => id !== locked.catalogueId);
                        sSt.notifications = [{
                            id: `auc-n-u-${settlementId}`,
                            type: 'auction',
                            title: 'Auction Ended Unsold',
                            detail: `${locked.assetName} did not meet sale conditions and was unlocked.`,
                            at: now,
                            read: false
                        }, ...(sSt.notifications || [])].slice(0, 50);
                        seller.state = sSt;
                        seller.version = (seller.version || 0) + 1;
                        seller.markModified('state');
                        await seller.save();
                    }
                    if (locked.highestBidderId && locked.highestBidAmount) {
                        const bidder = await User.findById(locked.highestBidderId);
                        if (bidder) {
                            const bSt = normalizeState(bidder.state);
                            const prevCash = bSt.cash;
                            bSt.cash = new Decimal(bSt.cash).plus(locked.highestBidAmount).toString();
                            bSt.ledger = [{
                                id: `auc-ref-${settlementId}`,
                                at: now,
                                type: 'auction_refund',
                                category: 'asset',
                                source: locked.assetName,
                                amount: locked.highestBidAmount,
                                prevCash,
                                newCash: bSt.cash
                            }, ...(bSt.ledger || [])].slice(0, 200);
                            bidder.state = bSt;
                            bidder.version = (bidder.version || 0) + 1;
                            bidder.markModified('state');
                            await bidder.save();
                        }
                        await AuctionBid.updateOne({ _id: locked.highestBidId }, { $set: { status: 'refunded' } });
                    }
                    await AuctionSettlement.create({
                        auctionId: locked._id,
                        settlementId,
                        winnerId: null,
                        sellerId: locked.sellerId,
                        outcome: 'unsold',
                        settledAt: new Date(now)
                    });
                    locked.status = 'unsold';
                }

                locked.settlementId = settlementId;
                locked.settledAt = new Date(now);
                await locked.save();
            } catch (err) {
                console.error('Auction settle error:', err.message);
            }
        }
    })().finally(() => {
        auctionSettlePromise = null;
    });
    return auctionSettlePromise;
}

app.get(
    '/api/auctions',
    auth,
    wrap(async (req, res) => {
        await settleExpiredAuctions(Date.now());
        const { category = 'all', q = '', sort = 'ending_soon', status = 'active' } = req.query;
        const filter = { status: status === 'ended' ? { $in: ['sold', 'unsold'] } : 'active' };
        if (category !== 'all') filter.category = String(category);
        if (String(q).trim()) {
            filter.assetName = new RegExp(escapeRegex(String(q).trim()), 'i');
        }
        const sortMap = {
            ending_soon: { endsAt: 1 },
            newest: { createdAt: -1 },
            price_asc: { startingBid: 1 },
            price_desc: { startingBid: -1 }
        };
        const list = await Auction.find(filter)
            .sort(sortMap[sort] || { endsAt: 1 })
            .limit(40)
            .lean();
        res.json(list.map(a => serializeAuction(a, req.user._id)));
    })
);

app.get(
    '/api/auctions/me/listings',
    auth,
    wrap(async (req, res) => {
        await settleExpiredAuctions(Date.now());
        const list = await Auction.find({ sellerId: req.user._id }).sort({ createdAt: -1 }).limit(40).lean();
        res.json(list.map(a => serializeAuction(a, req.user._id)));
    })
);

app.get(
    '/api/auctions/me/bids',
    auth,
    wrap(async (req, res) => {
        await settleExpiredAuctions(Date.now());
        const bids = await AuctionBid.find({ bidderId: req.user._id }).sort({ acceptedAt: -1 }).limit(40).lean();
        const aucIds = [...new Set(bids.map(b => b.auctionId))];
        const aucs = await Auction.find({ _id: { $in: aucIds } }).lean();
        const aucMap = new Map(aucs.map(a => [String(a._id), serializeAuction(a, req.user._id)]));
        res.json(bids.map(b => ({ ...b, auction: aucMap.get(String(b.auctionId)) || null })));
    })
);

app.get(
    '/api/auctions/:id',
    auth,
    wrap(async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        await settleExpiredAuctions(Date.now());
        const a = await Auction.findById(req.params.id).lean();
        if (!a) return res.status(404).json({ error: 'Auction not found' });
        const bids = await AuctionBid.find({ auctionId: a._id }).sort({ sequence: -1 }).limit(25).lean();
        res.json({
            auction: serializeAuction(a, req.user._id),
            bids: bids.map(b => ({
                _id: b._id,
                bidderUsername: b.bidderUsername,
                amount: b.amount,
                acceptedAt: b.acceptedAt,
                status: b.status
            }))
        });
    })
);

app.post(
    '/api/auctions',
    auth,
    auctionLimit,
    wrap(async (req, res) => {
        const now = Date.now();
        const { item, catalogueId, cataloguePrice, startingBid, reservePrice, durationMs } = validateListingInput(req.body, catalog);
        const s = settle(req.user.state, now, catalog);
        if ((s.assets?.[catalogueId] || 0) < 1) {
            throw Error('You must own this asset in your cloud save to list it');
        }
        if ((s.lockedAssets || []).includes(catalogueId)) {
            throw Error('This asset is already listed in an active auction');
        }
        const activeCount = await Auction.countDocuments({ sellerId: req.user._id, status: { $in: ['active', 'settling'] } });
        if (activeCount >= AUCTION_CONFIG.MAX_ACTIVE_PER_SELLER) {
            throw Error(`Maximum ${AUCTION_CONFIG.MAX_ACTIVE_PER_SELLER} active auctions allowed`);
        }

        const endsAt = new Date(now + durationMs);
        const created = await Auction.create({
            sellerId: req.user._id,
            sellerUsername: req.user.username,
            catalogueId,
            cataloguePrice,
            assetName: item.name,
            category: item.category || 'legacy',
            storageKey: storageKeyForAsset(item),
            startingBid,
            reservePrice,
            endsAt,
            originalEndsAt: endsAt,
            status: 'active',
            feeRateSnapshot: AUCTION_CONFIG.FEE_RATE
        });

        s.lockedAssets = [...(s.lockedAssets || []), catalogueId];
        req.user.state = s;
        req.user.version = (req.user.version || 0) + 1;
        req.user.markModified('state');
        await req.user.save();

        res.status(201).json({ auction: serializeAuction(created, req.user._id), cloud: snapshot(req.user) });
    })
);

app.post(
    '/api/auctions/:id/bids',
    auth,
    auctionLimit,
    wrap(async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        const now = Date.now();
        await settleExpiredAuctions(now);

        const a = await Auction.findById(req.params.id);
        if (!a || a.status !== 'active' || new Date(a.endsAt).getTime() <= now) {
            throw Error('Auction is no longer active');
        }
        if (String(a.sellerId) === String(req.user._id)) {
            throw Error('You cannot bid on your own auction');
        }

        const maxPrice = new Decimal(a.cataloguePrice || catalog.assets.find(x => x.id === a.catalogueId)?.price || '1000000000000');
        if (a.highestBidAmount && new Decimal(a.highestBidAmount).gte(maxPrice)) {
            throw Error(`Maximum auction price ($${maxPrice.toFixed(2)}) has already been reached`);
        }
        const bidAmt = new Decimal(req.body?.amount || 0).toDecimalPlaces(2);
        const reqMin = new Decimal(minNextBid({ ...a.toObject(), cataloguePrice: maxPrice.toString() }));
        if (!bidAmt.isFinite() || bidAmt.lt(reqMin)) {
            throw Error(`Minimum bid is $${reqMin.toFixed(2)}`);
        }
        if (bidAmt.gt(maxPrice)) {
            throw Error(`Bid cannot exceed new asset price ($${maxPrice.toFixed(2)})`);
        }

        const bSt = settle(req.user.state, now, catalog);
        if ((bSt.assets?.[a.catalogueId] || 0) > 0) {
            throw Error('You already own this unique asset');
        }
        const leadingSameItem = await Auction.findOne({
            _id: { $ne: a._id },
            status: { $in: ['active', 'settling'] },
            catalogueId: a.catalogueId,
            highestBidderId: req.user._id
        }).lean();
        if (leadingSameItem) {
            throw Error('You are already leading another auction for this asset');
        }

        const isSameLeader = a.highestBidderId && String(a.highestBidderId) === String(req.user._id);
        if (!isSameLeader && a.storageKey) {
            const used = catalog.assets
                .filter(it => storageKeyForAsset(it) === a.storageKey)
                .reduce((sum, it) => sum + (bSt.assets?.[it.id] || 0), 0);
            const reservedSlots = await Auction.countDocuments({
                _id: { $ne: a._id },
                status: { $in: ['active', 'settling'] },
                storageKey: a.storageKey,
                highestBidderId: req.user._id
            });
            const cap = bSt.storage?.[a.storageKey] || 0;
            if (used + reservedSlots + 1 > cap) {
                throw Error(`Not enough ${a.storageKey} space; upgrade storage first`);
            }
        }

        const chargeAmt = isSameLeader
            ? bidAmt.minus(a.highestBidAmount || '0')
            : bidAmt;
        if (chargeAmt.lte(0) || new Decimal(bSt.cash).lt(chargeAmt)) {
            throw Error('Insufficient cash for this bid');
        }

        // Anti-sniping extension (last 30s -> extend 30s, max 5m total)
        let newEndsAt = new Date(a.endsAt);
        const remMs = newEndsAt.getTime() - now;
        if (remMs <= AUCTION_CONFIG.ANTI_SNIPE_WINDOW_MS) {
            const maxEnd = new Date(a.originalEndsAt).getTime() + AUCTION_CONFIG.ANTI_SNIPE_MAX_EXTEND_MS;
            newEndsAt = new Date(Math.min(maxEnd, now + AUCTION_CONFIG.ANTI_SNIPE_WINDOW_MS));
        }

        const nextSeq = (a.bidCount || 0) + 1;
        const bidId = new mongoose.Types.ObjectId();
        const prevLeaderId = a.highestBidderId;
        const prevBidId = a.highestBidId;
        const prevAmount = a.highestBidAmount;

        const updatedAuc = await Auction.findOneAndUpdate(
            { _id: a._id, version: a.version, status: 'active' },
            {
                $set: {
                    highestBidId: bidId,
                    highestBidderId: req.user._id,
                    highestBidderUsername: req.user.username,
                    highestBidAmount: bidAmt.toString(),
                    endsAt: newEndsAt
                },
                $inc: { bidCount: 1, version: 1 }
            },
            { new: true }
        );
        if (!updatedAuc) {
            throw Error('Another bid was accepted first — please retry');
        }

        const prevCash = bSt.cash;
        bSt.cash = new Decimal(bSt.cash).minus(chargeAmt).toString();
        bSt.ledger = [{
            id: `bid-${bidId}`,
            at: now,
            type: 'auction_bid_escrow',
            category: 'asset',
            source: a.assetName,
            amount: chargeAmt.neg().toString(),
            prevCash,
            newCash: bSt.cash
        }, ...(bSt.ledger || [])].slice(0, 200);
        req.user.state = bSt;
        req.user.version = (req.user.version || 0) + 1;
        req.user.markModified('state');

        await Promise.all([
            req.user.save(),
            AuctionBid.create({
                _id: bidId,
                auctionId: a._id,
                bidderId: req.user._id,
                bidderUsername: req.user.username,
                amount: bidAmt.toString(),
                acceptedAt: new Date(now),
                sequence: nextSeq,
                status: 'leading'
            })
        ]);

        if (prevBidId && prevLeaderId && prevAmount) {
            await AuctionBid.updateOne({ _id: prevBidId }, { $set: { status: isSameLeader ? 'outbid' : 'refunded' } });
            if (!isSameLeader) {
                const prevUser = await User.findById(prevLeaderId);
                if (prevUser) {
                    const pSt = normalizeState(prevUser.state);
                    const pPrev = pSt.cash;
                    pSt.cash = new Decimal(pSt.cash).plus(prevAmount).toString();
                    pSt.ledger = [{
                        id: `outbid-${prevBidId}`,
                        at: now,
                        type: 'auction_outbid_refund',
                        category: 'asset',
                        source: a.assetName,
                        amount: prevAmount,
                        prevCash: pPrev,
                        newCash: pSt.cash
                    }, ...(pSt.ledger || [])].slice(0, 200);
                    prevUser.state = pSt;
                    prevUser.version = (prevUser.version || 0) + 1;
                    prevUser.markModified('state');
                    await prevUser.save();
                }
            }
        }

        res.json({ auction: serializeAuction(updatedAuc, req.user._id), cloud: snapshot(req.user) });
    })
);

app.post(
    '/api/auctions/:id/cancel',
    auth,
    wrap(async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        const a = await Auction.findOne({ _id: req.params.id, sellerId: req.user._id });
        if (!a || a.status !== 'active') throw Error('Auction cannot be cancelled');
        if ((a.bidCount || 0) > 0) throw Error('Cannot cancel after a bid has been placed');

        a.status = 'cancelled';
        a.settledAt = new Date();
        await a.save();

        const s = normalizeState(req.user.state);
        s.lockedAssets = (s.lockedAssets || []).filter(id => id !== a.catalogueId);
        req.user.state = s;
        req.user.version = (req.user.version || 0) + 1;
        req.user.markModified('state');
        await req.user.save();

        res.json({ auction: serializeAuction(a, req.user._id), cloud: snapshot(req.user) });
    })
);

app.get(
    '/api/admin/auctions',
    auth,
    admin,
    wrap(async (req, res) => {
        await settleExpiredAuctions(Date.now());
        const list = await Auction.find().sort({ createdAt: -1 }).limit(50).lean();
        res.json(list);
    })
);

app.post(
    '/api/admin/auctions/:id/cancel',
    auth,
    admin,
    wrap(async (req, res) => {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        const now = Date.now();
        const reason = String(req.body?.reason || 'Admin emergency cancellation').slice(0, 200);
        const a = await Auction.findOneAndUpdate(
            { _id: req.params.id, status: 'active' },
            { $set: { status: 'cancelled', cancelReason: reason, settledAt: new Date(now) } },
            { new: true }
        );
        if (!a) throw Error('Active auction not found');

        const seller = await User.findById(a.sellerId);
        if (seller) {
            const sSt = normalizeState(seller.state);
            sSt.lockedAssets = (sSt.lockedAssets || []).filter(id => id !== a.catalogueId);
            seller.state = sSt;
            seller.version = (seller.version || 0) + 1;
            seller.markModified('state');
            await seller.save();
        }
        if (a.highestBidderId && a.highestBidAmount) {
            const bidder = await User.findById(a.highestBidderId);
            if (bidder) {
                const bSt = normalizeState(bidder.state);
                bSt.cash = new Decimal(bSt.cash).plus(a.highestBidAmount).toString();
                bidder.state = bSt;
                bidder.version = (bidder.version || 0) + 1;
                bidder.markModified('state');
                await bidder.save();
            }
            if (a.highestBidId) {
                await AuctionBid.updateOne({ _id: a.highestBidId }, { $set: { status: 'refunded' } });
            }
        }
        await AuctionSettlement.create({
            auctionId: a._id,
            settlementId: randomUUID(),
            winnerId: null,
            sellerId: a.sellerId,
            outcome: 'cancelled',
            settledAt: new Date(now)
        });
        res.json(a);
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
    setInterval(() => settleExpiredAuctions(Date.now()).catch(() => {}), 15000);
    app.listen(
        process.env.PORT || 4000,

        () => console.log(
            'Business Dynasty API ready'
        )
    );
}

export default app;
