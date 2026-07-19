---
kind: logging_system
name: Ad-hoc console logging with cPanel error file sink
category: logging_system
scope:
    - '**'
source_files:
    - server.js
---

The application has no dedicated logging framework or structured logger. Logging is ad-hoc and built entirely on Node.js `console.log` / `console.warn` / `console.error`, with one server-side exception: at the top of `server.js` the global `console.error` and `console.warn` are monkey-patched to also append timestamped lines to a plain-text file `app-errors.log`. This is the only persistent log sink in the repository.

- Server-side (`server.js`): startup, database connection, seeding, and fallback paths emit human-readable emoji-prefixed messages via `console.log`/`console.warn`/`console.error`; unhandled errors and warnings are additionally written to `app-errors.log` as `[ISO timestamp] ERROR/WARN: ...` lines.
- Client-side (`admin/script.js`, `script.js`, `analytics.js`, `banner-cta-handler.js`): all diagnostics go straight to the browser console via `console.error`/`console.warn`; there is no client-to-server log transport.
- No middleware (e.g., Morgan) for HTTP request/response logging; no log levels beyond the three console methods; no structured fields, correlation IDs, or centralized logger module.
- The admin dashboard does not expose any log viewer endpoint — it fetches analytics/bookings/email data from the DB but does not read `app-errors.log`.