
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

import {
    initial,
    apply,
    settle,
    normalizeState
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
            }
        },
        {
            // IMPORTANT:
            // Prevent MongoDB saves from losing empty objects.
            minimize: false
        }
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
            batch
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

        // Detect conflicts between devices.

        if (version !== u.version) {
            return res.status(409).json({
                error: 'Cloud save changed; local actions preserved',
                cloud: snapshot(u)
            });
        }

        let s = structuredClone(u.state);

        const now = Date.now();

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

// API fallback

app.use('/api', (req, res) => {
    res.status(404).json({
        error: 'Not found'
    });
});

// Serve production React frontend

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
