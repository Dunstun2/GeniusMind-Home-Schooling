---
kind: build_system
name: Node.js Flat-File Build & cPanel Deployment
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - server.js
    - .cpanel.yml
---

This repository has no formal build system. It is a single-process Express application with no compilation, bundling, or transpilation step — the source files are served and executed directly by Node.js. The only "build" activity is `npm install` to resolve dependencies declared in `package.json`, followed by running `node server.js`.

**Runtime entry point**
- `server.js` is the sole process; it wires Express middleware, mounts static HTML/CSS/JS from the repo root, initializes an in-memory / SQLite / MySQL database adapter, and starts listening on `PORT` (default 3000). There is no separate client build pipeline — the admin SPA (`admin/*.html`) and public pages are plain HTML served as-is.

**Development workflow**
- `npm run dev` uses Node's built-in `--watch-path=server.js --watch-path=utils` to auto-restart the server on file changes.
- A `livereload` + `connect-livereload` server is started when `NODE_ENV !== 'production'` to refresh browser pages after backend restarts. No frontend hot-module replacement exists.

**Production runtime**
- `npm start` → `node server.js`.
- Database mode is selected at startup: production (`NODE_ENV=production`) forces MySQL via `mysql2`; development falls back to SQLite (`sqlite/sqlite3`), then to an in-memory store if neither driver is available. All schema DDL is embedded in `server.js` and self-heals via `CREATE TABLE IF NOT EXISTS` plus guarded `ALTER TABLE` calls.

**Deployment**
- cPanel deployment is driven by `.cpanel.yml`, which runs three shell tasks per push: fix Windows line endings in `.htaccess`, create a `tmp/` directory, and touch `tmp/restart.txt` to signal the hosting platform to reload the app. There is no Dockerfile, no CI pipeline, no Makefile, and no asset bundler.

**Dependency management**
- `package.json` pins all runtime and dev dependencies. An `overrides` block redirects `libsignal-node` to a specific GitHub archive URL to work around a broken npm registry entry for `@whiskeysockets/baileys`. No lockfile vendoring strategy beyond `package-lock.json` is used.