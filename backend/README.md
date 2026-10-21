# MEEG backend (staging scaffold)

This Cloudflare Worker is an **unpublished, non-integrated starting point**, not a finished production migration. The existing public GitHub Pages client still talks directly to Turso and performs insecure client-side login.

## Deploy prerequisites
- Cloudflare account, a Worker domain and preferably a custom domain hosting the UI and API on the **same site**. Cookies from a workers.dev hostname to github.io are third-party/cross-site and may be blocked; a SameSite=Lax cookie will not work cross-site.
- Turso read/write token held only in server-side secrets. Rotate all tokens embedded in public HTML/JS or git history.
- Secure user migration: the old dashboard_users.password column contains legacy plaintext credentials. Worker login intentionally rejects them until migrated to PBKDF2-SHA256 with 310000+ iterations and fresh 16+ byte salt per account; ideally use Argon2id in a supported auth service.
- Add rate limiting and anti-enumeration safeguards before exposing the login endpoint.
- Move all dashboard.html, analytics.html, dashboard-ui.js and index.html direct database operations to purpose-specific protected endpoints, and enforce record-level permissions server-side.
- Avoid exposing national IDs or YubiKey emails to unauthorized roles; restrict data exports.
- Serve UI and API under the same origin, or design a robust same-site session setup with correct CORS and CSRF defenses.
- Add browser end-to-end tests, logout/expiry testing and authorization coverage before promotion.

## Local dev (once Node and Wrangler are installed)
```bash
cd backend
npx wrangler dev
npx wrangler secret put TURSO_URL
npx wrangler secret put TURSO_TOKEN
npx wrangler secret put SESSION_SECRET
```
Never paste credentials into this repo, PR comments or public logs.

## Available API routes (prototype)
- `GET /api/health`
- `POST /api/auth/login` body: `{"username":"...","password":"..."}`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/analytics/summary`

**Security warning:** JWT-like signed cookies are stateless and currently do not provide immediate session revocation. Complete account revocation/session-store support, request throttling, login audit events and CSRF design before production.
