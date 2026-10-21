# Unified MEEG dashboard — integration and security checklist

## Changes in this branch
- Analytics uses the existing `meti_dash_user` dashboard session; its embedded mode is no longer an access bypass.
- The Analytics sign-in overlay is removed when opened by an authorized dashboard user.
- The dashboard's authorized operations roles are recognized by the analytics data loader.

## Important: not production authentication
The current `dashboard.html` implementation compares passwords in the browser, includes hardcoded admin bypass credentials and stores user details in `sessionStorage`. These values can be changed by browser JavaScript and **are not proof of identity**. This patch fixes the duplicate login UI but does not secure data.
Turso bearer credentials currently live in public HTML/JavaScript and must be treated as compromised, revoked and rotated after the database API is moved server-side. Do not publish new tokens to GitHub Pages.

## Required production architecture
1. Host a secure API (e.g. Cloudflare Worker, managed service or equivalent) with `TURSO_URL` and `TURSO_TOKEN` in server-side secrets.
2. Keep a single users table and migrate passwords to slow salted hashes (Argon2id or bcrypt); remove all plaintext password comparisons and hardcoded admin bypass.
3. API issues and verifies opaque sessions in Secure, HttpOnly, SameSite cookies; validate authorizations server-side on every operation.
4. Migrate `tursoQuery()` and analytics data queries to purpose-specific API endpoints, never accepting arbitrary SQL from clients.
5. Use HTTPS and configure CORS/CSRF protections for the GitHub Pages origin; verify role and allowed page permissions at the backend.
6. Replace `sessionStorage`-based analytics checks with a real `/api/me` session check once the backend exists. Current frontend checks are only UX.
7. Test login, reload, logout, expired sessions, user roles, all analytics tabs, writes and exports before merging.
8. Deploy the API and configure secrets before switching the live dashboard; GitHub Pages alone cannot host trusted server-side authentication.

The existing task data and schema should be preserved during the migration.
