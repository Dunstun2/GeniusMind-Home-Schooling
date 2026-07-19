A monolithic Node.js server (`server.js`) is the single entry point for all three child modules:
- Static HTML/CSS/JS under `public_website/` are served as-is by Express static middleware.
- The admin SPA under `admin_panel/` is served from `/admin`, with session-based login enforced by `express-session` middleware before any admin route.
- Shared fragments (navbar/footer) and global client-side logic live in `shared_components/` and are injected into every page at render time.

All three children share one backend: a dual-mode database adapter (`db.query`) that switches between MySQL (production), SQLite (development), and an in-memory fallback, so both the public booking tracker and the admin dashboard read/write the same tables (`bookings`, `booking_messages`, `email_logs`, `analytics_sessions`, `analytics_events`, `highlights_banners`, `site_settings`, `team_members`, `courses`, `faqs`, `blog_posts`, `page_content`, `social_media`).

Cross-cutting concerns wired once at startup in `server.js`: CORS policy, cookie parsing, file uploads via Multer to `uploads/`, Nodemailer SMTP transport, WhatsApp integration via `utils/whatsappService`, bcrypt password hashing, and a custom error logger writing to `app-errors.log`. Environment variables from `.env.example` control DB credentials, SMTP, WhatsApp tokens, and the default admin seed.