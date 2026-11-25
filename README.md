# Business Dynasty — MERN offline-first development edition

Original branding and demo catalogue. This is a runnable source-code foundation, not a verified feature-for-feature clone or production-ready release. All prices, formulas, unlocks, sports/project rules and asset lists in `shared/catalog.js` are placeholders pending verification against the current iOS title. No clicker, no payment provider, no real ads. All money is virtual.

## Run locally

Requirements: Node.js 22, npm, Docker (or your own MongoDB 7+).

```bash
cp .env.example .env
# Edit .env: set unique JWT_SECRET and ADMIN_PASSWORD before starting.
docker compose up -d
npm install
npm run dev
```
Open http://localhost:5173. Register with a username and password. New accounts start with $100,000 once. Admin account is initialized from .env; log in using its credentials. Do not use a real password from another service.

For PWA/offline testing use the production build (the development server does not enable service worker caching):

```bash
npm run build
npm start
```
Open http://localhost:4000, register/login online and let the service worker install. Reload once, then disconnect and reopen. For iPhone use an HTTPS deployment (a local network HTTP IP is not a secure context); in Safari use Add to Home Screen. Set NODE_ENV=production behind HTTPS to enable secure session cookies. Never expose MongoDB publicly.

## Implemented
- Username/password registration, bcrypt hashing, cookie sessions, admin role.
- $100,000 starting balance; no clicker.
- Shared decimal-based simulation, business purchase/sale/upgrade, slots, simplified fleet/staff/bank/sports/project mechanics, one demo merger, stocks/crypto, rentals, luxury assets.
- Individual 2x/6h, global 1.3x/4h, special 1.1x/4h (proposed), multiplicative stacking; free 60s reward wait, approved premium instant rewards, skip tickets and upgrade/project/slot/merger skips.
- Admin approve/reject/revoke premium; grant skip tickets. No automatic premium.
- IndexedDB local save and action log; automatic online sync every 30 seconds and on reconnect; version check and server action replay. Service worker caches production app shell. Offline premium uses last synced state.

## Limitations / next work
- Exact iOS catalogue and economic formulas not yet sourced. No complete sports league, employee salaries, banking deposit simulation, market charts, full merger catalogue, achievements, admin economy editing, audit logs or password reset. Admin expiry supported by API, not UI. Use original assets and names for release.
- Single active device recommended. Conflicts preserve local data and require manual resolution; export is available, import/merge is not implemented. A failed ambiguous sync temporarily blocks new actions until retry to avoid duplicate transactions. Sync requires a valid session; reauthentication recovery flow is still needed. Local browser storage can be cleared; iOS does not guarantee background sync. Offline timestamps cannot be made fully cheat-proof. Server validates recorded actions and rejects future timestamps, but offline timing, premium revocation and multi-device handling need further hardening. Premium changes are applied at sync boundaries; a previously issued membership may remain usable offline until sync.
- Financial UI formatting uses JS Number while engine uses Decimal; very large value display needs refinement. Production security review and full end-to-end tests are needed.
- `npm test` runs shared engine tests once dependencies are installed. Dependency installation/build and MongoDB integration have not been verified in the authoring environment.
