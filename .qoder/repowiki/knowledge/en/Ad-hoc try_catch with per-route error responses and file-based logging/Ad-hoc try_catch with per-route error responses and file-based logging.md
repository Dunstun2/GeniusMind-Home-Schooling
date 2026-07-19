---
kind: error_handling
name: Ad-hoc try/catch with per-route error responses and file-based logging
category: error_handling
scope:
    - '**'
source_files:
    - server.js
    - admin/script.js
---

This Express application does not use a centralized error-handling framework or custom error class hierarchy. Instead, errors are handled locally within each route handler using individual `try`/`catch` blocks that log to `console.error` and return a uniform `{ error: string }` JSON body with an appropriate HTTP status code (400 for validation failures, 401 for unauthorized admin access via the `requireAdmin` middleware, 404 for missing resources, 500 for unexpected failures). There is no global Express error-handling middleware (`app.use((err, req, res, next) => ...)`), so unhandled promise rejections or thrown exceptions inside async handlers will crash the process rather than be caught by a central handler.

Key characteristics:
- **Per-route try/catch**: Every async route wraps its logic in `try { ... } catch (err) { console.error(...); res.status(500).json({ error: '...' }); }`, producing consistent but non-descriptive 500 messages.
- **No custom error types**: Errors are plain JavaScript `Error` objects or strings; there is no domain-specific error class or sentinel-error pattern.
- **Authentication errors**: The `requireAdmin` middleware returns `401 { error: 'Unauthorized. Admin access required.' }` synchronously when `req.session.isAdmin` is absent.
- **Input validation**: Inline checks return `400 { error: 'Missing required fields.' }` before any database work.
- **File upload errors**: Multer's `fileFilter` invokes `cb(new Error('File type not allowed.'))`, which Express surfaces as a 400 response automatically.
- **Logging strategy**: At startup the app monkey-patches `console.error` and `console.warn` to append timestamped entries to `app-errors.log` in the project root, providing a simple cPanel-friendly error log. Database connection failures during init fall back to in-memory mode with a warning rather than crashing.
- **Client-side handling**: The admin SPA (`admin/script.js`) catches fetch/network errors and throws user-facing `Error` messages; public pages rely on browser defaults.
- **No panic/recover**: No `process.on('uncaughtException')` or `process.on('unhandledRejection')` listeners exist, meaning unhandled errors terminate the Node process.

Conventions developers should follow:
- Wrap every async route body in `try`/`catch`, log the full error object with `console.error`, and respond with `res.status(500).json({ error: '<user-safe message>' })`.
- Return early with `400`/`401`/`404` JSON bodies for validation, auth, and not-found cases instead of throwing.
- Do not expose stack traces or internal DB/provider details in API responses — only the `error` string field reaches clients.
- Be aware that because there is no global error middleware, any path that forgets its `try`/`catch` will crash the server.