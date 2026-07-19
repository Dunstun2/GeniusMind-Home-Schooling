---
kind: configuration_system
name: Environment-Based Configuration via dotenv
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - server.js
---

The application uses a flat, environment-variable-driven configuration system centered on the `dotenv` package. There is no dedicated config directory or typed config module — all runtime settings are consumed directly from process.env throughout server.js.

How it works:
- require('dotenv').config({ override: true }) is called at the top of server.js, loading .env (and any process-supplied overrides) into process.env before anything else reads it.
- The single source of truth for available keys and defaults is .env.example; there is no .env committed to the repo (it is gitignored).
- Every subsystem reads its own variables inline with process.env.X || 'default' fallbacks rather than through a shared accessor.

Configuration categories and where they are consumed:
- Server and session: PORT, SESSION_SECRET, NODE_ENV — port binding, Express session secret, live-reload toggle.
- Database: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME — MySQL pool creation; when unset the app falls back to SQLite then to an in-memory store.
- Email SMTP send: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM — Nodemailer transport init.
- Email IMAP receive: IMAP_HOST, IMAP_PORT, IMAP_SECURE, IMAP_USER, IMAP_PASS — IMAP flow for inbox sync.
- Notifications: NOTIFICATION_RECIPIENT, WHATSAPP_ADMIN_PHONE — booking notification routing.
- Admin bootstrap: ADMIN_DEFAULT_USER, ADMIN_DEFAULT_PASS — auto-seeded admin user on first run.

Runtime mode selection:
- NODE_ENV=production connects to MySQL using the DB_* env vars; if connection fails, silently falls back to in-memory storage.
- Development tries SQLite (sqlite3/sqlite optional dev deps); if those packages are missing, also falls back to in-memory.

What is not configured via env:
- Hardcoded CORS origins list, default banner seeds, upload limits, file filters, and many other operational constants are embedded directly in server.js as literals rather than being pulled from env.
- No feature flags, no per-environment YAML/TOML files, no schema validation of env values.

Rules developers should follow:
1. Add new secrets or tunables only as process.env.* reads with sensible defaults — do not create ad-hoc config objects scattered across modules.
2. Keep .env.example in sync whenever a new env var is introduced so deployers know what to supply.
3. Never commit a real .env; use platform-level env injection (cPanel, CI, container runtime) in production.
4. When adding a new subsystem that needs external credentials, read them from process.env inside server.js during startup and log whether the transport was initialized successfully.