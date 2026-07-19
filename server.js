// Triggering watch reload for seeding default banners
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config({ override: true });
const whatsappService = require('./utils/whatsappService');

// --- Custom Error Logger for cPanel ---
const logStream = fs.createWriteStream(path.join(__dirname, 'app-errors.log'), { flags: 'a' });
const originalConsoleError = console.error;
console.error = function (...args) {
    originalConsoleError.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' && a instanceof Error) ? a.stack : (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
    logStream.write(`[${new Date().toISOString()}] ERROR: ${msg}\n`);
};
const originalConsoleWarn = console.warn;
console.warn = function (...args) {
    originalConsoleWarn.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' && a instanceof Error) ? a.stack : (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
    logStream.write(`[${new Date().toISOString()}] WARN: ${msg}\n`);
};
// --------------------------------------

let sqlite3 = null;
let sqliteOpen = null;
let sqliteAvailable = false;

try {
    sqlite3 = require('sqlite3');
    sqliteOpen = require('sqlite').open;
    sqliteAvailable = true;
} catch (e) {
    console.warn('⚠️ SQLite local database driver not available (sqlite3/sqlite packages missing).');
}

// ==========================================
// MULTER FILE UPLOAD CONFIGURATION
// ==========================================
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
        cb(null, unique + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
        // Allow images, PDFs, Word docs, Excel, text files, ZIPs
        const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|zip/;
        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        if (allowed.test(ext)) return cb(null, true);
        cb(new Error('File type not allowed.'));
    }
});

const app = express();
const PORT = process.env.PORT || 3000;

// --- Live Reload for Local Development ---
if (process.env.NODE_ENV !== 'production') {
    try {
        const livereload = require('livereload');
        const connectLiveReload = require('connect-livereload');
        const liveReloadServer = livereload.createServer();
        liveReloadServer.watch(path.join(__dirname));

        // Brief delay on refresh to let backend restart fully
        liveReloadServer.server.once("connection", () => {
            setTimeout(() => {
                liveReloadServer.refresh("/");
            }, 100);
        });

        app.use(connectLiveReload());
        console.log('⚡ Live Reload active for local development.');
    } catch (e) {
        console.warn('⚠️ Could not initialize Live Reload:', e.message);
    }
}

const allowedOrigins = [
    'https://www.geniusminds.website',
    'https://geniusminds.website',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

app.use(cors({
    origin: function (origin, callback) {
        // If origin is null (from redirects) or missing, fallback to the main production domain
        if (!origin || origin === 'null') {
            return callback(null, 'https://www.geniusminds.website');
        }
        if (allowedOrigins.includes(origin)) {
            return callback(null, origin);
        }
        // Fallback for any other origin
        return callback(null, 'https://www.geniusminds.website');
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Sessions setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'genius_minds_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// ==========================================
// DUAL-MODE DATABASE ADAPTER (SQLite & Memory)
// ==========================================
let dbMode = 'memory'; // 'mysql', 'sqlite', or 'memory'
let dbPool = null; // MySQL2 connection pool
let dbConnection = null; // SQLite connection

// In-Memory Database fallback data structures
const memDb = {
    bookings: [],
    email_logs: [],
    received_emails: [],
    analytics_sessions: [],
    analytics_events: [],
    booking_messages: [],
    admin_users: [],
    highlights_banners: [],
    site_settings: [
        { setting_key: 'contact_phone', setting_value: '+254 743-322-975' },
        { setting_key: 'contact_email', setting_value: 'geniusminds2425@gmail.com' },
        { setting_key: 'contact_location', setting_value: 'Nairobi, Kenya' }
    ],
    team_members: [],
    courses: [],
    faqs: [],
    blog_posts: [],
    page_content: [],
    social_media: [
        { id: 1, name: 'TikTok', url: 'https://tiktok.com/@genius.minds.home', icon: null, display_order: 1 },
        { id: 2, name: 'Instagram', url: 'https://www.instagram.com/genius_minds_homeschool?igsh=aHRsZnk2cjRkaTVv', icon: null, display_order: 2 }
    ]
};

// Default dynamic homepage highlights banners seed data
const defaultBanners = [
    {
        badge_text: 'Upcoming Event',
        badge_class: 'event-badge',
        title: 'Junior Programmer <span>Bootcamp.</span>',
        subtitle: "Launch your child's coding journey! Our interactive programmer workshops introduce python, scratch, and web design, building critical logical skills for the future.",
        btn_primary_action: 'book_session',
        image_path: 'assets/images/upcoming_coder.png',
        is_active: 1
    },
    {
        badge_text: 'Outstanding Achievement',
        badge_class: 'success-badge',
        title: 'Outstanding IGCSE <span>Triumphs.</span>',
        subtitle: 'We celebrate academic excellence! Our IGCSE student Esther W. scored an outstanding 98% in Mathematics under customized Genius Minds personal tutoring.',
        btn_primary_action: 'book_session',
        image_path: 'assets/images/achievement_trophy.png',
        is_active: 1
    },
    {
        badge_text: 'Enrollment Announcement',
        badge_class: 'announce-badge',
        title: 'Term 3 Admissions <span>Now Open.</span>',
        subtitle: 'Enrollments for Online, Home-based, and Physical center tutoring classes are open. We support IGCSE, CBE/CBC, and the 8-4-4 systems. Secure your child\'s success today!',
        btn_primary_action: 'book_session',
        image_path: 'assets/images/announcement_bell.png',
        is_active: 1
    }
];

// Seed default admin in-memory
const defaultUsername = process.env.ADMIN_DEFAULT_USER || 'admin';
const defaultPassword = process.env.ADMIN_DEFAULT_PASS || 'GeniusAdmin2026!';
const defaultPasswordHash = bcrypt.hashSync(defaultPassword, 10);
memDb.admin_users.push({
    id: 1,
    username: defaultUsername,
    password_hash: defaultPasswordHash,
    created_at: new Date()
});

// Seed default banners in-memory
memDb.highlights_banners = defaultBanners.map((b, idx) => ({
    id: idx + 1,
    ...b,
    start_date: null,
    end_date: null
}));

// Helper functions for query/insert operations abstracting SQLite vs Memory
const db = {
    async query(sql, params = []) {
        if (dbMode === 'mysql') {
            const [rows] = await dbPool.query(sql, params);
            const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
            if (isSelect) {
                return rows;
            } else {
                return { insertId: rows.insertId, affectedRows: rows.affectedRows };
            }
        } else if (dbMode === 'sqlite') {
            const sqlUpper = sql.trim().toUpperCase();
            const isSelect = sqlUpper.startsWith('SELECT');

            // Format ON DUPLICATE KEY UPDATE for SQLite
            let sqlFormatted = sql;
            if (sqlUpper.includes('ON DUPLICATE KEY UPDATE')) {
                sqlFormatted = sql.replace('ON DUPLICATE KEY UPDATE', 'ON CONFLICT(session_key) DO UPDATE SET');
            }

            if (isSelect) {
                return await dbConnection.all(sqlFormatted, params);
            } else {
                const result = await dbConnection.run(sqlFormatted, params);
                return { insertId: result.lastID, affectedRows: result.changes };
            }
        } else {
            // Basic SQL parsing/routing to mock collections
            const sqlUpper = sql.trim().toUpperCase();

            if (sqlUpper.startsWith('INSERT INTO BOOKINGS')) {
                const id = memDb.bookings.length + 1;
                const record = {
                    id,
                    name: params[0],
                    email: params[1],
                    phone: params[2],
                    service: params[3],
                    message: params[4],
                    tracking_token: params[5],
                    status: 'pending',
                    created_at: new Date()
                };
                memDb.bookings.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('INSERT INTO BOOKING_MESSAGES')) {
                const id = memDb.booking_messages.length + 1;
                const record = {
                    id,
                    booking_id: params[0],
                    sender: params[1],
                    message: params[2],
                    created_at: new Date()
                };
                memDb.booking_messages.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('SELECT * FROM BOOKING_MESSAGES WHERE BOOKING_ID')) {
                return memDb.booking_messages.filter(m => m.booking_id == params[0]).sort((a, b) => a.created_at - b.created_at);
            }

            if (sqlUpper.startsWith('SELECT * FROM BOOKINGS WHERE TRACKING_TOKEN')) {
                return memDb.bookings.filter(b => b.tracking_token === params[0]);
            }

            if (sqlUpper.startsWith('INSERT INTO EMAIL_LOGS')) {
                const id = memDb.email_logs.length + 1;
                const record = {
                    id,
                    booking_id: params[0],
                    recipient: params[1],
                    subject: params[2],
                    body: params[3],
                    status: params[4],
                    error_message: params[5],
                    created_at: new Date()
                };
                memDb.email_logs.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('INSERT INTO ANALYTICS_SESSIONS')) {
                // Check if session exists
                const existing = memDb.analytics_sessions.find(s => s.session_key === params[0]);
                if (existing) {
                    existing.updated_at = new Date();
                    return { insertId: existing.id };
                }
                const id = memDb.analytics_sessions.length + 1;
                const record = {
                    id,
                    session_key: params[0],
                    ip_address: params[1],
                    user_agent: params[2],
                    browser: params[3],
                    os: params[4],
                    device: params[5],
                    referrer: params[6],
                    country_name: params[7] || 'Kenya',
                    country_flag: params[8] || '🇰🇪',
                    created_at: new Date(),
                    updated_at: new Date()
                };
                memDb.analytics_sessions.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('UPDATE ANALYTICS_SESSIONS')) {
                // Update session timestamp
                const existing = memDb.analytics_sessions.find(s => s.session_key === params[0]);
                if (existing) {
                    existing.updated_at = new Date();
                }
                return { affectedRows: 1 };
            }

            if (sqlUpper.startsWith('INSERT INTO ANALYTICS_EVENTS')) {
                const id = memDb.analytics_events.length + 1;
                const record = {
                    id,
                    session_key: params[0],
                    event_type: params[1],
                    event_name: params[2],
                    event_data: params[3],
                    created_at: new Date()
                };
                memDb.analytics_events.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('SELECT * FROM ADMIN_USERS WHERE USERNAME')) {
                return memDb.admin_users.filter(u => u.username === params[0]);
            }

            if (sqlUpper.startsWith('SELECT * FROM ADMIN_USERS ORDER BY CREATED_AT DESC')) {
                return [...memDb.admin_users].sort((a, b) => b.created_at - a.created_at);
            }

            if (sqlUpper.startsWith('INSERT INTO ADMIN_USERS (USERNAME, PASSWORD_HASH)')) {
                const id = memDb.admin_users.length + 1;
                const record = {
                    id,
                    username: params[0],
                    password_hash: params[1],
                    created_at: new Date()
                };
                memDb.admin_users.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('SELECT * FROM BOOKINGS ORDER BY CREATED_AT DESC')) {
                return [...memDb.bookings].sort((a, b) => b.created_at - a.created_at);
            }

            if (sqlUpper.startsWith('UPDATE BOOKINGS SET STATUS')) {
                const booking = memDb.bookings.find(b => b.id == params[1]);
                if (booking) {
                    booking.status = params[0];
                    return { affectedRows: 1 };
                }
                return { affectedRows: 0 };
            }

            if (sqlUpper.startsWith('SELECT * FROM EMAIL_LOGS ORDER BY CREATED_AT DESC')) {
                return [...memDb.email_logs].sort((a, b) => b.created_at - a.created_at);
            }

            if (sqlUpper.startsWith('INSERT INTO RECEIVED_EMAILS')) {
                const id = memDb.received_emails.length + 1;
                const record = {
                    id,
                    message_id: params[0],
                    sender_name: params[1],
                    sender_email: params[2],
                    subject: params[3],
                    body: params[4],
                    received_at: params[5] || new Date(),
                    created_at: new Date()
                };
                memDb.received_emails.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('SELECT * FROM RECEIVED_EMAILS WHERE MESSAGE_ID')) {
                return memDb.received_emails.filter(e => e.message_id === params[0]);
            }

            if (sqlUpper.startsWith('SELECT * FROM RECEIVED_EMAILS ORDER BY RECEIVED_AT DESC')) {
                return [...memDb.received_emails].sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
            }

            if (sqlUpper.startsWith('SELECT * FROM ANALYTICS_SESSIONS')) {
                return [...memDb.analytics_sessions].sort((a, b) => b.created_at - a.created_at);
            }

            if (sqlUpper.startsWith('SELECT * FROM ANALYTICS_EVENTS')) {
                return [...memDb.analytics_events].sort((a, b) => b.created_at - a.created_at);
            }

            // --- Highlights Banners ---
            if (sqlUpper.startsWith('SELECT * FROM HIGHLIGHTS_BANNERS')) {
                return [...memDb.highlights_banners];
            }

            if (sqlUpper.startsWith('INSERT INTO HIGHLIGHTS_BANNERS')) {
                const id = memDb.highlights_banners.length + 1;
                const record = {
                    id,
                    banner_type: params[0],
                    badge_text: params[1],
                    badge_class: params[2],
                    title: params[3],
                    subtitle: params[4],
                    btn_primary_action: params[5],
                    btn_secondary_action: params[6],
                    image_path: params[7],
                    is_active: params[8] !== undefined ? params[8] : 1,
                    start_date: params[9] || null,
                    end_date: params[10] || null
                };
                memDb.highlights_banners.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('UPDATE HIGHLIGHTS_BANNERS SET IS_ACTIVE')) {
                const banner = memDb.highlights_banners.find(b => b.id == params[1]);
                if (banner) {
                    banner.is_active = params[0];
                    return { affectedRows: 1 };
                }
                return { affectedRows: 0 };
            }

            if (sqlUpper.startsWith('UPDATE HIGHLIGHTS_BANNERS SET')) {
                const id = params[11];
                const banner = memDb.highlights_banners.find(b => b.id == id);
                if (banner) {
                    banner.banner_type = params[0];
                    banner.badge_text = params[1]; banner.badge_class = params[2];
                    banner.title = params[3]; banner.subtitle = params[4];
                    banner.btn_primary_action = params[5];
                    banner.btn_secondary_action = params[6];
                    banner.image_path = params[7];
                    banner.is_active = params[8]; banner.start_date = params[9];
                    banner.end_date = params[10];
                    return { affectedRows: 1 };
                }
                return { affectedRows: 0 };
            }

            if (sqlUpper.startsWith('DELETE FROM HIGHLIGHTS_BANNERS')) {
                const id = params[0];
                const initialLength = memDb.highlights_banners.length;
                memDb.highlights_banners = memDb.highlights_banners.filter(b => b.id != id);
                return { affectedRows: initialLength - memDb.highlights_banners.length };
            }

            // --- Site Settings ---
            if (sqlUpper.startsWith('SELECT SETTING_KEY, SETTING_VALUE FROM SITE_SETTINGS')) {
                return [...memDb.site_settings];
            }

            // --- Team Members ---
            if (sqlUpper.startsWith('SELECT * FROM TEAM_MEMBERS')) {
                return [...memDb.team_members].sort((a, b) => a.display_order - b.display_order);
            }
            if (sqlUpper.startsWith('INSERT INTO TEAM_MEMBERS')) {
                const id = memDb.team_members.length + 1;
                const record = {
                    id,
                    name: params[0],
                    role: params[1],
                    bio: params[2],
                    image_url: params[3],
                    display_order: parseInt(params[4]) || 0
                };
                memDb.team_members.push(record);
                return { insertId: id };
            }
            if (sqlUpper.startsWith('UPDATE TEAM_MEMBERS SET')) {
                const id = params[5];
                const record = memDb.team_members.find(t => t.id == id);
                if (record) {
                    record.name = params[0];
                    record.role = params[1];
                    record.bio = params[2];
                    record.image_url = params[3];
                    record.display_order = parseInt(params[4]) || 0;
                    return { affectedRows: 1 };
                }
                return { affectedRows: 0 };
            }
            if (sqlUpper.startsWith('DELETE FROM TEAM_MEMBERS')) {
                const id = params[0];
                const initialLength = memDb.team_members.length;
                memDb.team_members = memDb.team_members.filter(t => t.id != id);
                return { affectedRows: initialLength - memDb.team_members.length };
            }

            // --- Courses ---
            if (sqlUpper.startsWith('SELECT * FROM COURSES')) {
                return [...memDb.courses];
            }
            if (sqlUpper.startsWith('INSERT INTO COURSES')) {
                const id = memDb.courses.length + 1;
                const record = {
                    id,
                    title: params[0],
                    grade_levels: params[1],
                    subjects: params[2],
                    description: params[3],
                    duration: params[4],
                    fees: params[5],
                    outcomes: params[6]
                };
                memDb.courses.push(record);
                return { insertId: id };
            }
            if (sqlUpper.startsWith('UPDATE COURSES SET')) {
                const id = params[7];
                const record = memDb.courses.find(c => c.id == id);
                if (record) {
                    record.title = params[0];
                    record.grade_levels = params[1];
                    record.subjects = params[2];
                    record.description = params[3];
                    record.duration = params[4];
                    record.fees = params[5];
                    record.outcomes = params[6];
                    return { affectedRows: 1 };
                }
                return { affectedRows: 0 };
            }
            if (sqlUpper.startsWith('DELETE FROM COURSES')) {
                const id = params[0];
                const initialLength = memDb.courses.length;
                memDb.courses = memDb.courses.filter(c => c.id != id);
                return { affectedRows: initialLength - memDb.courses.length };
            }

            // --- FAQs ---
            if (sqlUpper.startsWith('SELECT * FROM FAQS')) {
                return [...memDb.faqs].sort((a, b) => a.display_order - b.display_order);
            }
            if (sqlUpper.startsWith('INSERT INTO FAQS')) {
                const id = memDb.faqs.length + 1;
                const record = {
                    id,
                    question: params[0],
                    answer: params[1],
                    category: params[2],
                    display_order: parseInt(params[3]) || 0
                };
                memDb.faqs.push(record);
                return { insertId: id };
            }
            if (sqlUpper.startsWith('UPDATE FAQS SET')) {
                const id = params[4];
                const record = memDb.faqs.find(f => f.id == id);
                if (record) {
                    record.question = params[0];
                    record.answer = params[1];
                    record.category = params[2];
                    record.display_order = parseInt(params[3]) || 0;
                    return { affectedRows: 1 };
                }
                return { affectedRows: 0 };
            }
            if (sqlUpper.startsWith('DELETE FROM FAQS')) {
                const id = params[0];
                const initialLength = memDb.faqs.length;
                memDb.faqs = memDb.faqs.filter(f => f.id != id);
                return { affectedRows: initialLength - memDb.faqs.length };
            }

            // --- Blog Posts ---
            if (sqlUpper.startsWith('SELECT * FROM BLOG_POSTS')) {
                return [...memDb.blog_posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
            if (sqlUpper.startsWith('INSERT INTO BLOG_POSTS')) {
                const id = memDb.blog_posts.length + 1;
                const record = {
                    id,
                    title: params[0],
                    excerpt: params[1],
                    content: params[2],
                    author: params[3],
                    category: params[4],
                    image_url: params[5],
                    created_at: new Date()
                };
                memDb.blog_posts.push(record);
                return { insertId: id };
            }
            if (sqlUpper.startsWith('UPDATE BLOG_POSTS SET')) {
                const id = params[6];
                const record = memDb.blog_posts.find(b => b.id == id);
                if (record) {
                    record.title = params[0];
                    record.excerpt = params[1];
                    record.content = params[2];
                    record.author = params[3];
                    record.category = params[4];
                    record.image_url = params[5];
                    return { affectedRows: 1 };
                }
                return { affectedRows: 0 };
            }
            if (sqlUpper.startsWith('DELETE FROM BLOG_POSTS')) {
                const id = params[0];
                const initialLength = memDb.blog_posts.length;
                memDb.blog_posts = memDb.blog_posts.filter(b => b.id != id);
                return { affectedRows: initialLength - memDb.blog_posts.length };
            }

            // --- Page Content ---
            if (sqlUpper.startsWith('SELECT * FROM PAGE_CONTENT')) {
                return [...memDb.page_content];
            }
            if (sqlUpper.startsWith('INSERT INTO PAGE_CONTENT') || sqlUpper.startsWith('INSERT OR REPLACE INTO PAGE_CONTENT')) {
                const key = params[0];
                const val = params[1];
                const existing = memDb.page_content.find(p => p.content_key === key);
                if (existing) {
                    existing.content_value = val;
                    existing.updated_at = new Date();
                    return { affectedRows: 1 };
                } else {
                    const id = memDb.page_content.length + 1;
                    memDb.page_content.push({
                        id,
                        content_key: key,
                        content_value: val,
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                    return { insertId: id };
                }
            }

            // --- Social Media ---
            if (sqlUpper.startsWith('SELECT * FROM SOCIAL_MEDIA')) {
                return [...memDb.social_media].sort((a, b) => a.display_order - b.display_order);
            }
            if (sqlUpper.startsWith('INSERT INTO SOCIAL_MEDIA')) {
                const id = memDb.social_media.length > 0 ? Math.max(...memDb.social_media.map(s => s.id)) + 1 : 1;
                const record = {
                    id,
                    name: params[0],
                    url: params[1],
                    icon: params[2] || null,
                    display_order: parseInt(params[3]) || 0
                };
                memDb.social_media.push(record);
                return { insertId: id };
            }
            if (sqlUpper.startsWith('UPDATE SOCIAL_MEDIA SET')) {
                const id = params[4];
                const record = memDb.social_media.find(s => s.id == id);
                if (record) {
                    record.name = params[0];
                    record.url = params[1];
                    record.icon = params[2] || null;
                    record.display_order = parseInt(params[3]) || 0;
                    return { affectedRows: 1 };
                }
                return { affectedRows: 0 };
            }
            if (sqlUpper.startsWith('DELETE FROM SOCIAL_MEDIA')) {
                const id = params[0];
                const initialLength = memDb.social_media.length;
                memDb.social_media = memDb.social_media.filter(s => s.id != id);
                return { affectedRows: initialLength - memDb.social_media.length };
            }

            return [];
        }
    }
};

// Initial database connection and tables creation
async function initDatabase() {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
        // ==========================================
        // PRODUCTION DATABASE INIT: MySQL ONLY
        // ==========================================
        try {
            console.log('🔄 [Production] Connecting to MySQL database...');

            dbPool = await mysql.createPool({
                host: process.env.DB_HOST || '127.0.0.1',
                port: parseInt(process.env.DB_PORT || '3306'),
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'genius_minds_db',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                charset: 'utf8mb4'
            });

            // Test connection
            await dbPool.query('SELECT 1');

            // Create MySQL Tables
            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS bookings (
                    id              INT NOT NULL AUTO_INCREMENT,
                    name            VARCHAR(255) NOT NULL,
                    email           VARCHAR(255) NOT NULL,
                    phone           VARCHAR(50)  NOT NULL,
                    service         VARCHAR(255) NOT NULL,
                    message         TEXT,
                    tracking_token  VARCHAR(64)  DEFAULT NULL,
                    status          VARCHAR(50)  DEFAULT 'pending',
                    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY idx_tracking_token (tracking_token)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS booking_messages (
                    id              INT NOT NULL AUTO_INCREMENT,
                    booking_id      INT NOT NULL,
                    sender          VARCHAR(50)  NOT NULL,
                    message         TEXT         NOT NULL,
                    attachment_url  VARCHAR(500) DEFAULT NULL,
                    attachment_name VARCHAR(255) DEFAULT NULL,
                    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS email_logs (
                    id            INT NOT NULL AUTO_INCREMENT,
                    booking_id    INT          DEFAULT NULL,
                    recipient     VARCHAR(255) NOT NULL,
                    subject       VARCHAR(500) NOT NULL,
                    body          LONGTEXT,
                    status        VARCHAR(50)  NOT NULL,
                    error_message TEXT         DEFAULT NULL,
                    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS analytics_sessions (
                    id           INT NOT NULL AUTO_INCREMENT,
                    session_key  VARCHAR(255) NOT NULL,
                    ip_address   VARCHAR(45)  DEFAULT NULL,
                    user_agent   TEXT,
                    browser      VARCHAR(100) DEFAULT NULL,
                    os           VARCHAR(100) DEFAULT NULL,
                    device       VARCHAR(100) DEFAULT NULL,
                    referrer     TEXT,
                    country_name VARCHAR(100) DEFAULT 'Kenya',
                    country_flag VARCHAR(20)  DEFAULT '🇰🇪',
                    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY idx_session_key (session_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS analytics_events (
                    id          INT NOT NULL AUTO_INCREMENT,
                    session_key VARCHAR(255) NOT NULL,
                    event_type  VARCHAR(100) NOT NULL,
                    event_name  VARCHAR(255) NOT NULL,
                    event_data  TEXT,
                    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS admin_users (
                    id            INT NOT NULL AUTO_INCREMENT,
                    username      VARCHAR(100) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY idx_username (username)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS received_emails (
                    id           INT NOT NULL AUTO_INCREMENT,
                    message_id   VARCHAR(255) NOT NULL,
                    sender_name  VARCHAR(255) DEFAULT NULL,
                    sender_email VARCHAR(255) NOT NULL,
                    subject      VARCHAR(500) DEFAULT NULL,
                    body         LONGTEXT,
                    received_at  DATETIME     DEFAULT NULL,
                    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY idx_message_id (message_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS highlights_banners (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    banner_type VARCHAR(100) DEFAULT NULL,
                    badge_text VARCHAR(255) NOT NULL,
                    badge_class VARCHAR(100) NOT NULL DEFAULT 'event-badge',
                    title VARCHAR(255) NOT NULL,
                    subtitle TEXT NOT NULL,
                    btn_primary_action VARCHAR(100) DEFAULT NULL,
                    btn_secondary_action VARCHAR(100) DEFAULT NULL,
                    image_path VARCHAR(500) DEFAULT NULL,
                    is_active TINYINT DEFAULT 1,
                    start_date DATETIME DEFAULT NULL,
                    end_date DATETIME DEFAULT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS team_members (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    role VARCHAR(255) NOT NULL,
                    bio TEXT DEFAULT NULL,
                    image_url VARCHAR(500) DEFAULT NULL,
                    display_order INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS courses (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    grade_levels VARCHAR(255) DEFAULT NULL,
                    subjects TEXT DEFAULT NULL,
                    description TEXT DEFAULT NULL,
                    duration VARCHAR(255) DEFAULT NULL,
                    fees VARCHAR(255) DEFAULT NULL,
                    outcomes TEXT DEFAULT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS faqs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    category VARCHAR(255) DEFAULT NULL,
                    display_order INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS blog_posts (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    excerpt TEXT DEFAULT NULL,
                    content LONGTEXT DEFAULT NULL,
                    author VARCHAR(255) DEFAULT NULL,
                    category VARCHAR(255) DEFAULT NULL,
                    image_url VARCHAR(500) DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS page_content (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    content_key VARCHAR(255) NOT NULL,
                    content_value TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY idx_content_key (content_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS site_settings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    setting_key VARCHAR(255) NOT NULL,
                    setting_value TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY idx_setting_key (setting_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            // Seed default settings in MySQL if empty
            const [settingsCount] = await dbPool.query('SELECT COUNT(*) as count FROM site_settings');
            if (settingsCount[0].count === 0) {
                await dbPool.query(`
                    INSERT INTO site_settings (setting_key, setting_value) VALUES 
                    ('contact_phone', '+254 743-322-975'),
                    ('contact_email', 'geniusminds2425@gmail.com'),
                    ('contact_location', 'Nairobi, Kenya')
                `);
                console.log('✨ Seeded default site settings in MySQL.');
            }

            await dbPool.query(`
                CREATE TABLE IF NOT EXISTS social_media (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    url VARCHAR(500) NOT NULL,
                    icon VARCHAR(100) DEFAULT NULL,
                    display_order INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            // Seed default social media in MySQL if empty
            const [socialCount] = await dbPool.query('SELECT COUNT(*) as count FROM social_media');
            if (socialCount[0].count === 0) {
                await dbPool.query(`
                    INSERT INTO social_media (name, url, display_order) VALUES
                    ('TikTok', 'https://tiktok.com/@genius.minds.home', 1),
                    ('Instagram', 'https://www.instagram.com/genius_minds_homeschool?igsh=aHRsZnk2cjRkaTVv', 2)
                `);
                console.log('✨ Seeded default social media links in MySQL.');
            }

            try { await dbPool.query("ALTER TABLE analytics_sessions ADD COLUMN country_name VARCHAR(100) DEFAULT 'Kenya'"); } catch (e) { }
            try { await dbPool.query("ALTER TABLE analytics_sessions ADD COLUMN country_flag VARCHAR(20) DEFAULT '🇰🇪'"); } catch (e) { }
            try { await dbPool.query("ALTER TABLE booking_messages ADD COLUMN attachment_url VARCHAR(500) DEFAULT NULL"); } catch (e) { }
            try { await dbPool.query("ALTER TABLE booking_messages ADD COLUMN attachment_name VARCHAR(255) DEFAULT NULL"); } catch (e) { }
            try { await dbPool.query("ALTER TABLE highlights_banners ADD COLUMN is_active TINYINT DEFAULT 1"); } catch (e) { }
            try { await dbPool.query("ALTER TABLE highlights_banners ADD COLUMN start_date DATETIME NULL"); } catch (e) { }
            try { await dbPool.query("ALTER TABLE highlights_banners ADD COLUMN end_date DATETIME NULL"); } catch (e) { }

            // Seed default admin user if missing
            const [rows] = await dbPool.query('SELECT id FROM admin_users WHERE username = ?', [defaultUsername]);
            if (rows.length === 0) {
                await dbPool.query('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [
                    defaultUsername,
                    defaultPasswordHash
                ]);
                console.log(`👤 Seeded default admin user in MySQL: "${defaultUsername}" / "${defaultPassword}"`);
            }

            // Seed default banners if empty
            const [bannerRows] = await dbPool.query('SELECT COUNT(*) as count FROM highlights_banners');
            if (bannerRows[0].count === 0) {
                for (const banner of defaultBanners) {
                    await dbPool.query(`
                        INSERT INTO highlights_banners
                            (badge_text, badge_class, title, subtitle, btn_primary_action, image_path, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [banner.badge_text, banner.badge_class, banner.title, banner.subtitle,
                        banner.btn_primary_action, banner.image_path, banner.is_active]
                    );
                }
                console.log('✨ Seeded default highlights banners in MySQL.');
            }

            dbMode = 'mysql';
            console.log('✅ Connected to MySQL successfully. Running in PRODUCTION database mode.');
        } catch (err) {
            console.error('❌ [Production] MySQL Connection Failed:', err.message);
            console.warn('⚠️ Falling back to IN-MEMORY storage. Data will reset on restart.');
            dbMode = 'memory';
        }
    } else {
        // ==========================================
        // DEVELOPMENT DATABASE INIT: SQLite ONLY
        // ==========================================
        if (sqliteAvailable) {
            try {
                console.log('🔄 [Development] Connecting to SQLite local database...');
                dbConnection = await sqliteOpen({
                    filename: './database.sqlite',
                    driver: sqlite3.Database
                });

                // Create SQLite Tables
                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS bookings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        email TEXT NOT NULL,
                        phone TEXT NOT NULL,
                        service TEXT NOT NULL,
                        message TEXT,
                        tracking_token TEXT UNIQUE,
                        status TEXT DEFAULT 'pending',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS booking_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        booking_id INTEGER NOT NULL,
                        sender TEXT NOT NULL,
                        message TEXT NOT NULL,
                        attachment_url TEXT DEFAULT NULL,
                        attachment_name TEXT DEFAULT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS email_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        booking_id INTEGER DEFAULT NULL,
                        recipient TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        body TEXT,
                        status TEXT NOT NULL,
                        error_message TEXT DEFAULT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS analytics_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_key TEXT UNIQUE NOT NULL,
                        ip_address TEXT,
                        user_agent TEXT,
                        browser TEXT,
                        os TEXT,
                        device TEXT,
                        referrer TEXT,
                        country_name TEXT DEFAULT 'Kenya',
                        country_flag TEXT DEFAULT '🇰🇪',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS analytics_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_key TEXT NOT NULL,
                        event_type TEXT NOT NULL,
                        event_name TEXT NOT NULL,
                        event_data TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS admin_users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS received_emails (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        message_id TEXT UNIQUE NOT NULL,
                        sender_name TEXT,
                        sender_email TEXT NOT NULL,
                        subject TEXT,
                        body TEXT,
                        received_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS highlights_banners (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        banner_type TEXT DEFAULT NULL,
                        badge_text TEXT NOT NULL,
                        badge_class TEXT NOT NULL DEFAULT 'event-badge',
                        title TEXT NOT NULL,
                        subtitle TEXT NOT NULL,
                        btn_primary_action TEXT DEFAULT NULL,
                        btn_secondary_action TEXT DEFAULT NULL,
                        image_path TEXT DEFAULT NULL,
                        is_active INTEGER DEFAULT 1,
                        start_date DATETIME DEFAULT NULL,
                        end_date DATETIME DEFAULT NULL
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS site_settings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        setting_key TEXT UNIQUE NOT NULL,
                        setting_value TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS team_members (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        role TEXT NOT NULL,
                        bio TEXT,
                        image_url TEXT,
                        display_order INTEGER DEFAULT 0
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS courses (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        grade_levels TEXT,
                        subjects TEXT,
                        description TEXT,
                        duration TEXT,
                        fees TEXT,
                        outcomes TEXT
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS faqs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        question TEXT NOT NULL,
                        answer TEXT NOT NULL,
                        category TEXT,
                        display_order INTEGER DEFAULT 0
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS blog_posts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        excerpt TEXT,
                        content TEXT,
                        author TEXT,
                        category TEXT,
                        image_url TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS page_content (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        content_key TEXT UNIQUE NOT NULL,
                        content_value TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await dbConnection.run(`
                    INSERT OR IGNORE INTO site_settings (setting_key, setting_value) VALUES 
                    ('contact_phone', '+254 743-322-975'),
                    ('contact_email', 'geniusminds2425@gmail.com'),
                    ('contact_location', 'Nairobi, Kenya')
                `);

                await dbConnection.run(`
                    CREATE TABLE IF NOT EXISTS social_media (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        url TEXT NOT NULL,
                        icon TEXT DEFAULT NULL,
                        display_order INTEGER DEFAULT 0
                    )
                `);

                // Seed default social media in SQLite if empty
                const socialCount = await dbConnection.get('SELECT COUNT(*) as count FROM social_media');
                if (socialCount.count === 0) {
                    await dbConnection.run(`INSERT INTO social_media (name, url, display_order) VALUES ('TikTok', 'https://tiktok.com/@genius.minds.home', 1)`);
                    await dbConnection.run(`INSERT INTO social_media (name, url, display_order) VALUES ('Instagram', 'https://www.instagram.com/genius_minds_homeschool?igsh=aHRsZnk2cjRkaTVv', 2)`);
                    console.log('✨ Seeded default social media links in SQLite.');
                }

                const bannerCount = await dbConnection.get('SELECT COUNT(*) as count FROM highlights_banners');
                if (bannerCount.count === 0) {
                    for (const banner of defaultBanners) {
                        await dbConnection.run(`
                            INSERT INTO highlights_banners
                                (badge_text, badge_class, title, subtitle, btn_primary_action, image_path, is_active)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [banner.badge_text, banner.badge_class, banner.title, banner.subtitle,
                            banner.btn_primary_action, banner.image_path, banner.is_active]
                        );
                    }
                    console.log('✨ Seeded default highlights banners in SQLite.');
                }

                // Seed default admin in SQLite if missing
                const rows = await dbConnection.all('SELECT id FROM admin_users WHERE username = ?', [defaultUsername]);
                if (rows.length === 0) {
                    await dbConnection.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [
                        defaultUsername,
                        defaultPasswordHash
                    ]);
                    console.log(`👤 Seeded default admin user in SQLite: "${defaultUsername}" / "${defaultPassword}"`);
                }

                dbMode = 'sqlite';
                console.log('✅ Connected to SQLite successfully. Running in DEVELOPMENT database mode.');
            } catch (sqliteErr) {
                console.error('❌ [Development] SQLite Connection/Initialization Failed:', sqliteErr.message);
                console.warn('⚠️ Falling back to IN-MEMORY storage. Data will reset on restart.');
                dbMode = 'memory';
            }
        } else {
            console.warn('⚠️ [Development] SQLite driver not available. Falling back to IN-MEMORY storage.');
        }

        // Seed default CMS data
        await seedDefaultCMSData();
    }
}

// Helper to seed default CMS data if tables are empty
async function seedDefaultCMSData() {
    try {
        // 1. Team Members
        const team = await db.query('SELECT * FROM team_members');
        if (team.length === 0) {
            await db.query('INSERT INTO team_members (name, role, bio, image_url, display_order) VALUES (?, ?, ?, ?, ?)',
                ['Esther W.', 'Lead Science & Mathematics Tutor', 'Esther is a passionate educator with over 8 years of tutoring experience in the British IGCSE curriculum. She holds a B.Ed. in Mathematics & Physics.', 'assets/images/team-1.jpg', 1]
            );
            await db.query('INSERT INTO team_members (name, role, bio, image_url, display_order) VALUES (?, ?, ?, ?, ?)',
                ['David N.', 'Primary CBC Specialist', 'David specializes in active learning and competency-based curriculum development. He has helped dozens of primary learners build confidence in mathematics and technology.', 'assets/images/team-2.jpg', 2]
            );
            await db.query('INSERT INTO team_members (name, role, bio, image_url, display_order) VALUES (?, ?, ?, ?, ?)',
                ['Grace M.', 'English & Languages Tutor', 'Grace is a certified ESL trainer and literature enthusiast. She works with secondary students on writing excellence, comprehension skills, and literary analysis.', 'assets/images/team-3.jpg', 3]
            );
            console.log('✨ Seeded default CMS Team Members.');
        }

        // 2. Courses
        const courses = await db.query('SELECT * FROM courses');
        if (courses.length === 0) {
            await db.query('INSERT INTO courses (title, grade_levels, subjects, description, duration, fees, outcomes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['IGCSE Prep & Support', 'Year 9 - Year 11 (High School)', 'Mathematics, Physics, Chemistry, Biology, English', 'Comprehensive preparation for IGCSE board examinations. Includes past paper practice, mock testing, and conceptual breakdown.', 'Flexible (hourly/weekly)', 'From KES 2,500/hour', 'Thorough understanding of syllabus, exam confidence, and top grades.']
            );
            await db.query('INSERT INTO courses (title, grade_levels, subjects, description, duration, fees, outcomes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['CBC / CBE Enrichment', 'Grade 1 - Grade 9', 'Core CBE Subjects, Mathematics, Science & Tech', 'Hands-on, competency-based support to reinforce school learning and complete project tasks efficiently.', 'Flexible (hourly/weekly)', 'From KES 1,800/hour', 'Enhanced creative and critical thinking, timely project completion.']
            );
            await db.query('INSERT INTO courses (title, grade_levels, subjects, description, duration, fees, outcomes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['8-4-4 / KCSE Support', 'Primary & Secondary', 'Mathematics, Sciences, English, Kiswahili', 'Traditional system support focusing on KCSE exam success and reinforcing core concepts.', 'Flexible (hourly/weekly)', 'From KES 1,800/hour', 'High score targets, solid subject foundation.']
            );
            console.log('✨ Seeded default CMS Courses.');
        }

        // 3. FAQs
        const faqs = await db.query('SELECT * FROM faqs');
        if (faqs.length === 0) {
            await db.query('INSERT INTO faqs (question, answer, category, display_order) VALUES (?, ?, ?, ?)',
                ['How do I get started with Genius Minds?', 'Getting started is simple! Just fill out our booking form at the bottom of the page or call us directly. We will schedule a free initial assessment to understand your child\'s needs and match them with the perfect tutor.', 'General', 1]
            );
            await db.query('INSERT INTO faqs (question, answer, category, display_order) VALUES (?, ?, ?, ?)',
                ['Do you offer physical in-person home tutoring or online classes?', 'We offer both! We provide in-person tutoring where our qualified tutors visit your home in Nairobi (Karen, Runda, Westlands, Kilimani, etc.), online interactive tutoring for students globally, and physical classes at our structured learning center.', 'Programs', 2]
            );
            await db.query('INSERT INTO faqs (question, answer, category, display_order) VALUES (?, ?, ?, ?)',
                ['Which curricula do you support?', 'We support all major curricula, including British International (IGCSE/GCSE), Competency-Based Curriculum (CBC), the traditional Kenyan 8-4-4 system, and the US Curriculum.', 'Curriculum', 3]
            );
            await db.query('INSERT INTO faqs (question, answer, category, display_order) VALUES (?, ?, ?, ?)',
                ['How are your tutors selected and vetted?', 'All our tutors are university graduates, certified educators, or subject-matter experts. They undergo rigorous background checks, reference checks, and interview vetting to ensure safety, reliability, and academic excellence.', 'Tutors', 4]
            );
            await db.query('INSERT INTO faqs (question, answer, category, display_order) VALUES (?, ?, ?, ?)',
                ['Can we schedule classes on weekends or evenings?', 'Yes, our schedules are highly flexible. We customize tutoring sessions to fit your family\'s routine, offering classes during weekdays, evenings, or weekends.', 'Scheduling', 5]
            );
            await db.query('INSERT INTO faqs (question, answer, category, display_order) VALUES (?, ?, ?, ?)',
                ['How do you track my child\'s academic progress?', 'We provide detailed weekly progress reports to parents, regular mock assessments to track understanding, and continuous feedback directly from the tutor after each session.', 'Assessment', 6]
            );
            console.log('✨ Seeded default CMS FAQs.');
        }

        // 4. Blog Posts
        const blogs = await db.query('SELECT * FROM blog_posts');
        if (blogs.length === 0) {
            await db.query('INSERT INTO blog_posts (title, excerpt, content, author, category, image_url) VALUES (?, ?, ?, ?, ?, ?)',
                ['The Rise of Homeschooling in Kenya', 'Why more parents in Nairobi are opting for personalized homeschooling programs for their children.', 'Homeschooling is rapidly growing in popularity across Kenya. Parents seek flexible scheduling, customized pacing, safety, and a focused environment. Our systems, like IGCSE and CBC, adapt perfectly to home tutoring. By matching students with certified tutors who understand the specific curriculum, we make transition seamless and results outstanding.', 'Admin Team', 'Education Trends', 'assets/images/blog-1.jpg']
            );
            await db.query('INSERT INTO blog_posts (title, excerpt, content, author, category, image_url) VALUES (?, ?, ?, ?, ?, ?)',
                ['Tips for Preparing Your Child for IGCSE Exams', 'Practical strategies and study tips from our lead mathematics and sciences tutors to boost exam performance.', 'Preparing for IGCSE board exams requires a structured revision plan, extensive practice with past papers, and continuous feedback. Here are the top five strategies recommended by our instructors:\n\n1. Start early: Do not wait until the final months.\n2. Do active recall: Test knowledge rather than passively reading.\n3. Master past papers: Understand examiner mark schemes.\n4. Build exam stamina: Take timed mock tests.\n5. Address weak spots immediately: Work one-on-one with a tutor.', 'Esther W.', 'Study Tips', 'assets/images/blog-2.jpg']
            );
            console.log('✨ Seeded default CMS Blog Posts.');
        }

        // 5. Page Content
        const content = await db.query('SELECT * FROM page_content');
        if (content.length === 0) {
            await db.query('INSERT INTO page_content (content_key, content_value) VALUES (?, ?)', ['mission_statement', 'Dedicated to providing high-quality and affordable tutoring services for learners of all ages.']);
            await db.query('INSERT INTO page_content (content_key, content_value) VALUES (?, ?)', ['vision', 'To be the leading personalized homeschooling partner in East Africa, unlocking every student\'s full potential.']);
            await db.query('INSERT INTO page_content (content_key, content_value) VALUES (?, ?)', ['history', 'Genius Minds Homeschooling was founded to bridge learning gaps for students in Nairobi. Starting with a few local students, we have expanded to support over 120+ families both locally and internationally, providing high-standard tutoring across various systems.']);
            await db.query('INSERT INTO page_content (content_key, content_value) VALUES (?, ?)', ['teaching_philosophy', 'We believe education is not one-size-fits-all. Our approach centers on personalized instruction, building confidence, practical skill acquisition, and close parent-tutor communication.']);
            console.log('✨ Seeded default CMS Page Content.');
        }
    } catch (err) {
        console.error('⚠️ Error seeding default CMS data:', err);
    }
}

// Initialize the database connection
initDatabase();

// ==========================================
// MAILER SETUP
// ==========================================
let transporter = null;

function initMailer() {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpUser && smtpPass) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });
        console.log(`✉️ Mail Transporter initialized using: ${process.env.SMTP_HOST}`);
    } else {
        console.log('✉️ Mail credentials not fully configured in .env. Emails will be logged to console in Development Mode.');
    }
}
initMailer();

// ==========================================
// IMAP CLIENT & SYNC SETUP (Gmail Receiving)
// ==========================================
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function syncGmailEmails() {
    const imapUser = process.env.IMAP_USER || 'geniusminds2425@gmail.com';
    const imapPass = process.env.IMAP_PASS;

    // Check if credentials are set
    if (!imapUser || !imapPass) {
        console.warn('⚠️ IMAP credentials not configured in .env. Falling back to mock emails.');
        await generateMockEmails();
        return;
    }

    const client = new ImapFlow({
        host: process.env.IMAP_HOST || 'imap.gmail.com',
        port: parseInt(process.env.IMAP_PORT || '993'),
        secure: process.env.IMAP_SECURE !== 'false',
        auth: {
            user: imapUser,
            pass: imapPass
        },
        logger: false
    });

    try {
        await client.connect();

        // Lock inbox to fetch messages
        let lock = await client.getMailboxLock('INBOX');
        try {
            const status = await client.status('INBOX', { messages: true });
            const totalMessages = status.messages;

            if (totalMessages > 0) {
                // Fetch last 20 messages to keep sync snappy
                const startSeq = Math.max(1, totalMessages - 19);
                const range = `${startSeq}:${totalMessages}`;

                for await (let message of client.fetch(range, { source: true, envelope: true })) {
                    const messageId = message.envelope.messageId;

                    // Check if message already exists in DB
                    const existing = await db.query('SELECT * FROM received_emails WHERE message_id = ?', [messageId]);
                    if (existing.length === 0) {
                        // Parse raw message source using simpleParser
                        const parsed = await simpleParser(message.source);

                        // Extract details
                        const senderName = parsed.from && parsed.from.value && parsed.from.value[0] ? (parsed.from.value[0].name || '') : '';
                        const senderEmail = parsed.from && parsed.from.value && parsed.from.value[0] ? (parsed.from.value[0].address || '') : '';
                        const subject = parsed.subject || '(No Subject)';
                        const body = parsed.html || parsed.text || '(No Content)';
                        const receivedAt = parsed.date || new Date();

                        // Save in database
                        await db.query(
                            'INSERT INTO received_emails (message_id, sender_name, sender_email, subject, body, received_at) VALUES (?, ?, ?, ?, ?, ?)',
                            [messageId, senderName, senderEmail, subject, body, receivedAt]
                        );
                        console.log(`📥 Synced new email from ${senderEmail}: "${subject}"`);
                    }
                }
            }
        } finally {
            lock.release();
        }

        await client.logout();
    } catch (err) {
        console.error('❌ IMAP sync failed:', err);
        console.log('🔄 Falling back to generating mock emails.');
        await generateMockEmails();
    }
}

// Generate premium mock emails for demonstration/development
async function generateMockEmails() {
    const mockEmails = [
        {
            message_id: 'mock-msg-1@geniusminds.com',
            sender_name: 'Sarah Wambui',
            sender_email: 'sarah.wambui@gmail.com',
            subject: 'Inquiry about Home-Based Tutoring Rates',
            body: `<p>Dear Genius Minds Team,</p>
                   <p>I would like to inquire about your home-based tutoring rates for a Grade 5 student. We reside in Kilimani, Nairobi. Do you have tutors available on weekday evenings (from 4:30 PM)?</p>
                   <p>Please let me know the pricing structures and how we can get started.</p>
                   <p>Best regards,<br>Sarah Wambui<br>+254 712 345 678</p>`,
            received_at: new Date(Date.now() - 3600000 * 2) // 2 hours ago
        },
        {
            message_id: 'mock-msg-2@geniusminds.com',
            sender_name: 'David Kimani',
            sender_email: 'david.kimani@outlook.com',
            subject: 'Do you offer coding/STEM classes at the physical center?',
            body: `<p>Hi Genius Minds,</p>
                   <p>I was browsing your website and saw you have a physical center in Nairobi. My daughter is 12 years old and is very interested in learning computer coding (specifically Python) and STEM projects.</p>
                   <p>Do you offer specialized coding or STEM tutoring at your center? If so, what are the weekend schedules and costs?</p>
                   <p>Regards,<br>David Kimani</p>`,
            received_at: new Date(Date.now() - 3600000 * 24) // 1 day ago
        },
        {
            message_id: 'mock-msg-3@geniusminds.com',
            sender_name: 'Amara Okafor',
            sender_email: 'amara.okafor@gmail.com',
            subject: 'Online tutoring classes inquiry for Grade 8 student',
            body: `<p>Hello team,</p>
                   <p>I am looking for an online tutor for my son who is preparing for his upcoming junior high math exam. He needs help particularly with algebra and geometry.</p>
                   <p>Do you conduct classes via Zoom? Could you send details about scheduling a trial session?</p>
                   <p>Thank you,<br>Amara</p>`,
            received_at: new Date(Date.now() - 3600000 * 48) // 2 days ago
        }
    ];

    for (const email of mockEmails) {
        const existing = await db.query('SELECT * FROM received_emails WHERE message_id = ?', [email.message_id]);
        if (existing.length === 0) {
            await db.query(
                'INSERT INTO received_emails (message_id, sender_name, sender_email, subject, body, received_at) VALUES (?, ?, ?, ?, ?, ?)',
                [email.message_id, email.sender_name, email.sender_email, email.subject, email.body, email.received_at]
            );
        }
    }
}


// Real IP Geolocation using ip-api.com (free, no API key needed)
// Results are cached in memory to avoid redundant lookups
const geoCache = {};

async function resolveCountryFromIP(ip) {
    // Skip private/local IPs
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return { name: 'Local / Dev', flag: '🖥️', city: 'Localhost', region: '' };
    }
    if (geoCache[ip]) return geoCache[ip];
    try {
        const https = require('https');
        const result = await new Promise((resolve, reject) => {
            const req = https.get(`https://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
        });
        if (result.status === 'success') {
            const code = (result.countryCode || 'KE').toLowerCase();
            // Build emoji flag from country code
            const flag = result.countryCode
                ? String.fromCodePoint(...[...result.countryCode.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)))
                : '🌍';

            let locationName = result.country || 'Unknown';
            // If the visitor is from Kenya, show the County/Region instead of just "Kenya"
            if (result.countryCode === 'KE' && result.regionName) {
                locationName = `${result.regionName}, Kenya`;
            }

            const geo = { name: locationName, flag, code, city: result.city || '', region: result.regionName || '' };
            geoCache[ip] = geo;
            return geo;
        }
    } catch (e) {
        // Silent fallback
    }
    return { name: 'Unknown', flag: '🌍', code: 'xx', city: '', region: '' };
}

// Helper to parse User-Agent
function parseUserAgent(uaString) {
    if (!uaString) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

    let browser = 'Unknown';
    let os = 'Unknown';
    let device = 'Desktop';

    // Parse OS
    if (uaString.includes('Windows')) os = 'Windows';
    else if (uaString.includes('Macintosh') || uaString.includes('Mac OS X')) os = 'macOS';
    else if (uaString.includes('Android')) { os = 'Android'; device = 'Mobile'; }
    else if (uaString.includes('iPhone') || uaString.includes('iPad')) { os = 'iOS'; device = 'Mobile'; }
    else if (uaString.includes('Linux')) os = 'Linux';

    // Parse Browser
    if (uaString.includes('Firefox')) browser = 'Firefox';
    else if (uaString.includes('Chrome') && !uaString.includes('Chromium')) browser = 'Chrome';
    else if (uaString.includes('Safari') && !uaString.includes('Chrome')) browser = 'Safari';
    else if (uaString.includes('Edge')) browser = 'Edge';
    else if (uaString.includes('MSIE') || uaString.includes('Trident')) browser = 'Internet Explorer';

    // Parse Device Type
    if (uaString.includes('Mobile') || uaString.includes('Tablet') || uaString.includes('iPad') || uaString.includes('iPhone') || uaString.includes('Android')) {
        device = uaString.includes('Tablet') || uaString.includes('iPad') ? 'Tablet' : 'Mobile';
    }

    return { browser, os, device };
}

// Middleware: Check if logged in as Admin
function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized. Admin access required.' });
    }
}

// ==========================================
// ROUTES / APIS
// ==========================================

// 1. Submit Booking Request
app.post('/api/bookings', async (req, res) => {
    const { name, email, phone, service, message } = req.body;

    if (!name || !email || !phone || !service) {
        return res.status(400).json({ error: 'Missing required booking fields.' });
    }

    try {
        const crypto = require('crypto');
        const trackingToken = 'bkg_' + crypto.randomBytes(6).toString('hex');

        // Insert into database
        const result = await db.query(
            'INSERT INTO bookings (name, email, phone, service, message, tracking_token) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, phone, service, message || '', trackingToken]
        );
        const bookingId = result.insertId;

        const trackingLink = `http://${req.headers.host || 'localhost:3000'}/track.html?token=${trackingToken}`;

        // Prepare Email
        const recipient = process.env.NOTIFICATION_RECIPIENT || 'geniusminds2425@gmail.com';
        const subject = `New Booking Request from ${name}`;
        const emailBody = `
            <h3>New Booking Request</h3>
            <p><strong>Parent Name:</strong> ${name}</p>
            <p><strong>Email Address:</strong> ${email}</p>
            <p><strong>Phone Number:</strong> ${phone}</p>
            <p><strong>Preferred Learning Option:</strong> ${service}</p>
            <p><strong>Additional Notes:</strong> ${message || 'None'}</p>
            <p><strong>Tracking Link:</strong> <a href="${trackingLink}">${trackingLink}</a></p>
            <hr>
            <p>This message was sent from your Genius Minds Homeschooling website contact form.</p>
        `;

        let mailStatus = 'sent';
        let mailError = null;

        if (transporter) {
            try {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || `"Genius Minds Homeschooling" <${process.env.SMTP_USER}>`,
                    to: recipient,
                    subject: subject,
                    html: emailBody
                });
                console.log(`📧 Notification email sent successfully to ${recipient}`);
            } catch (err) {
                console.error('📧 Email sending failed:', err);
                mailStatus = 'failed';
                mailError = err.message;
            }
        } else {
            console.log('-------------------------------------------');
            console.log('MOCK EMAIL SENDING (SMTP credentials empty)');
            console.log(`To: ${recipient}`);
            console.log(`Subject: ${subject}`);
            console.log(`Body:\n${emailBody.replace(/<[^>]*>/g, '')}`);
            console.log('-------------------------------------------');
            mailStatus = 'logged_to_console';
        }

        // Log the email action
        await db.query(
            'INSERT INTO email_logs (booking_id, recipient, subject, body, status, error_message) VALUES (?, ?, ?, ?, ?, ?)',
            [bookingId, recipient, subject, emailBody, mailStatus, mailError]
        );

        // --- WhatsApp Notifications ---
        const adminPhone = process.env.WHATSAPP_ADMIN_PHONE || '0140802797';

        // Notify Admin
        const adminMsg = `🆕 *New Booking Request*\n\n*Name:* ${name}\n*Phone:* ${phone}\n*Service:* ${service}\n\n*Message:* ${message || 'None'}`;
        whatsappService.sendMessage(adminPhone, adminMsg);

        // Notify Customer
        const customerMsg = `Hello ${name}, 👋\n\nWe have received your booking request for *${service}* at Genius Minds Homeschooling.\n\nYou can track the status of your booking and chat with us directly using your secure tracking link:\n${trackingLink}\n\nThank you for choosing us! 🎓`;
        whatsappService.sendMessage(phone, customerMsg);

        res.json({ success: true, bookingId });
    } catch (err) {
        console.error('Error creating booking request:', err);
        res.status(500).json({ error: 'Failed to process booking request.' });
    }
});

// ==========================================
// TRACKING PORTAL APIS
// ==========================================

// Get Booking by Token
app.get('/api/booking/track/:token', async (req, res) => {
    try {
        const bookings = await db.query('SELECT * FROM bookings WHERE tracking_token = ?', [req.params.token]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Invalid or expired tracking token.' });

        const booking = bookings[0];
        const messages = await db.query('SELECT * FROM booking_messages WHERE booking_id = ? ORDER BY created_at ASC', [booking.id]);

        res.json({ booking, messages });
    } catch (err) {
        console.error('Error fetching tracking info:', err);
        res.status(500).json({ error: 'Failed to fetch booking details.' });
    }
});

// Send Message from Customer (supports file attachments)
app.post('/api/booking/track/:token/message', upload.single('attachment'), async (req, res) => {
    const message = (req.body.message || '').trim();
    const hasAttachment = !!req.file;

    if (!message && !hasAttachment) {
        return res.status(400).json({ error: 'A message or attachment is required.' });
    }

    try {
        const bookings = await db.query('SELECT * FROM bookings WHERE tracking_token = ?', [req.params.token]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Invalid tracking token.' });

        const booking = bookings[0];
        const attachmentUrl = hasAttachment ? `/uploads/${req.file.filename}` : null;
        const attachmentName = hasAttachment ? req.file.originalname : null;
        const displayMsg = message || (hasAttachment ? `[Attached: ${req.file.originalname}]` : '');

        await db.query(
            'INSERT INTO booking_messages (booking_id, sender, message, attachment_url, attachment_name) VALUES (?, ?, ?, ?, ?)',
            [booking.id, 'customer', displayMsg, attachmentUrl, attachmentName]
        );

        // Notify Admin
        const adminPhone = process.env.WHATSAPP_ADMIN_PHONE || '0140802797';
        const attachNote = hasAttachment ? `\n📎 Attachment: ${req.file.originalname}` : '';
        const adminMsg = `💬 *New Message from Customer*\n\n*Name:* ${booking.name}\n*Message:* ${displayMsg}${attachNote}`;
        whatsappService.sendMessage(adminPhone, adminMsg);

        res.json({ success: true });
    } catch (err) {
        console.error('Error sending customer message:', err);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

// Admin APIs for Messages
app.get('/api/admin/bookings/:id/messages', requireAdmin, async (req, res) => {
    try {
        const messages = await db.query('SELECT * FROM booking_messages WHERE booking_id = ? ORDER BY created_at ASC', [req.params.id]);
        res.json(messages);
    } catch (err) {
        console.error('Error fetching admin messages:', err);
        res.status(500).json({ error: 'Failed to fetch messages.' });
    }
});

app.post('/api/admin/bookings/:id/messages', requireAdmin, upload.single('attachment'), async (req, res) => {
    const message = (req.body.message || '').trim();
    const hasAttachment = !!req.file;

    if (!message && !hasAttachment) {
        return res.status(400).json({ error: 'A message or attachment is required.' });
    }

    try {
        const bookings = await db.query('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });

        const booking = bookings[0];
        const attachmentUrl = hasAttachment ? `/uploads/${req.file.filename}` : null;
        const attachmentName = hasAttachment ? req.file.originalname : null;
        const displayMsg = message || (hasAttachment ? `[Attached: ${req.file.originalname}]` : '');

        await db.query(
            'INSERT INTO booking_messages (booking_id, sender, message, attachment_url, attachment_name) VALUES (?, ?, ?, ?, ?)',
            [booking.id, 'admin', displayMsg, attachmentUrl, attachmentName]
        );

        // Notify Customer via WhatsApp
        const trackingLink = `http://${req.headers.host || 'localhost:3000'}/track.html?token=${booking.tracking_token}`;
        const attachNote = hasAttachment ? `\n📎 Attachment: ${req.file.originalname}` : '';
        const customerMsg = `Hello ${booking.name}, you have a new message from Genius Minds regarding your booking!\n\n*Admin:* ${displayMsg}${attachNote}\n\nReply here: ${trackingLink}`;
        whatsappService.sendMessage(booking.phone, customerMsg);

        res.json({ success: true });
    } catch (err) {
        console.error('Error sending admin reply:', err);
        res.status(500).json({ error: 'Failed to send reply.' });
    }
});

// 2. Analytics Session Registration (with real IP geolocation)
app.post('/api/analytics/session', async (req, res) => {
    const { sessionKey, referrer } = req.body;
    if (!sessionKey) return res.status(400).json({ error: 'Session key is required.' });

    const uaString = req.headers['user-agent'] || '';
    const rawIp = (req.headers['x-forwarded-for'] || req.ip || '127.0.0.1').split(',')[0].trim();
    const parsedUa = parseUserAgent(uaString);

    // Resolve real country from IP address
    const geo = await resolveCountryFromIP(rawIp);

    try {
        await db.query(
            'INSERT INTO analytics_sessions (session_key, ip_address, user_agent, browser, os, device, referrer, country_name, country_flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP',
            [sessionKey, rawIp, uaString, parsedUa.browser, parsedUa.os, parsedUa.device, referrer || '', geo.name, geo.flag]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error logging analytics session:', err);
        res.status(500).json({ error: 'Failed to log session.' });
    }
});

// 3. Analytics Event Capture
app.post('/api/analytics/event', async (req, res) => {
    const { sessionKey, eventType, eventName, eventData } = req.body;
    if (!sessionKey || !eventType || !eventName) {
        return res.status(400).json({ error: 'Missing analytics fields.' });
    }

    try {
        await db.query(
            'INSERT INTO analytics_events (session_key, event_type, event_name, event_data) VALUES (?, ?, ?, ?)',
            [sessionKey, eventType, eventName, typeof eventData === 'object' ? JSON.stringify(eventData) : (eventData || '')]
        );
        // Also touch/update the session updated_at timestamp
        await db.query(
            'UPDATE analytics_sessions SET updated_at = CURRENT_TIMESTAMP WHERE session_key = ?',
            [sessionKey]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error logging analytics event:', err);
        res.status(500).json({ error: 'Failed to log event.' });
    }
});

// 4. Admin Auth
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        const users = await db.query('SELECT * FROM admin_users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        req.session.isAdmin = true;
        req.session.username = username;
        res.json({ success: true });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: 'Authentication failed.' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Admin logout error:', err);
            return res.status(500).json({ error: 'Failed to logout.' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

app.get('/api/admin/check-session', (req, res) => {
    if (req.session && req.session.isAdmin) {
        res.json({ authenticated: true, username: req.session.username });
    } else {
        res.json({ authenticated: false });
    }
});

// ==========================================
// ADMIN DASHBOARD APIS (Auth Required)
// ==========================================

// Get Analytics & Dashboard Statistics with optional date range filtering
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    // Date range filtering: default to last 30 days
    const now = new Date();
    const defaultStart = new Date(now); defaultStart.setDate(now.getDate() - 30);
    const startDate = req.query.startDate ? new Date(req.query.startDate) : defaultStart;
    const endDate = req.query.endDate ? new Date(req.query.endDate + 'T23:59:59') : now;

    try {
        const allBookings = await db.query('SELECT * FROM bookings ORDER BY created_at DESC');
        const allSessions = await db.query('SELECT * FROM analytics_sessions ORDER BY created_at DESC');
        const allEvents = await db.query('SELECT * FROM analytics_events ORDER BY created_at DESC');

        // Filter by date range
        const bookings = allBookings.filter(b => { const d = new Date(b.created_at); return d >= startDate && d <= endDate; });
        const sessions = allSessions.filter(s => { const d = new Date(s.created_at); return d >= startDate && d <= endDate; });
        const events = allEvents.filter(e => { const d = new Date(e.created_at); return d >= startDate && d <= endDate; });

        // 1. Basic Counts
        const totalBookings = bookings.length;
        const totalPageviews = events.filter(e => e.event_type === 'pageview').length;
        const totalSessions = sessions.length;

        // 2. Real-Time Active Users (last 5 minutes)
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
        const activeUsers = sessions.filter(s => new Date(s.updated_at) > fiveMinsAgo).length;

        // 3. Conversion Rate
        const conversionRate = totalSessions > 0 ? ((totalBookings / totalSessions) * 100).toFixed(1) : 0;

        // 4. Bounce Rate (Sessions with only 1 event)
        const sessionEventCounts = {};
        events.forEach(e => {
            sessionEventCounts[e.session_key] = (sessionEventCounts[e.session_key] || 0) + 1;
        });
        let bouncedSessions = 0;
        sessions.forEach(s => {
            const count = sessionEventCounts[s.session_key] || 0;
            if (count <= 1) {
                bouncedSessions++;
            }
        });
        const bounceRate = totalSessions > 0 ? ((bouncedSessions / totalSessions) * 100).toFixed(1) : 0;

        // 5. Avg Session Duration
        const sessionTimes = {};
        events.forEach(e => {
            const t = new Date(e.created_at).getTime();
            if (!sessionTimes[e.session_key]) {
                sessionTimes[e.session_key] = { min: t, max: t };
            } else {
                if (t < sessionTimes[e.session_key].min) sessionTimes[e.session_key].min = t;
                if (t > sessionTimes[e.session_key].max) sessionTimes[e.session_key].max = t;
            }
        });
        let totalDurationMs = 0;
        let sessionsWithDuration = 0;
        Object.keys(sessionTimes).forEach(key => {
            const diff = sessionTimes[key].max - sessionTimes[key].min;
            if (diff > 0) {
                totalDurationMs += diff;
                sessionsWithDuration++;
            }
        });
        const avgDurationSeconds = sessionsWithDuration > 0 ? Math.round((totalDurationMs / sessionsWithDuration) / 1000) : 0;

        // Format duration to MM:SS
        const mins = Math.floor(avgDurationSeconds / 60);
        const remainingSecs = avgDurationSeconds % 60;
        const avgDurationFormatted = `${mins}m ${remainingSecs}s`;

        // 6. Services Distribution
        const services = {};
        bookings.forEach(b => {
            services[b.service] = (services[b.service] || 0) + 1;
        });

        // 7. Devices & Browsers Breakdown
        const devices = {};
        sessions.forEach(s => {
            const dev = s.device || 'Unknown';
            devices[dev] = (devices[dev] || 0) + 1;
        });

        const browsers = {};
        sessions.forEach(s => {
            const br = s.browser || 'Unknown';
            browsers[br] = (browsers[br] || 0) + 1;
        });

        const osBreakdown = {};
        sessions.forEach(s => {
            const os = s.os || 'Unknown';
            osBreakdown[os] = (osBreakdown[os] || 0) + 1;
        });

        // 7.5. Country Breakdown
        const countries = {};
        sessions.forEach(s => {
            const cName = s.country_name || 'Kenya';
            const cFlag = s.country_flag || '🇰🇪';

            // Map name to 2-letter country code for FlagCDN
            let code = 'ke';
            const nameLower = cName.toLowerCase();
            if (nameLower.includes('uganda')) code = 'ug';
            else if (nameLower.includes('tanzania')) code = 'tz';
            else if (nameLower.includes('rwanda')) code = 'rw';
            else if (nameLower.includes('united kingdom')) code = 'gb';
            else if (nameLower.includes('united states')) code = 'us';
            else if (nameLower.includes('france')) code = 'fr';
            else if (nameLower.includes('germany')) code = 'de';
            else if (nameLower.includes('japan')) code = 'jp';
            else if (nameLower.includes('south africa')) code = 'za';

            if (!countries[cName]) {
                countries[cName] = { name: cName, flag: cFlag, code: code, count: 0 };
            }
            countries[cName].count++;
        });

        // 8. Top Pages breakdown from pageview events
        const pagesMap = {};
        const pageVisitors = {};
        events.filter(e => e.event_type === 'pageview').forEach(e => {
            let pageLabel = 'Home';
            try {
                const data = typeof e.event_data === 'string' ? JSON.parse(e.event_data) : e.event_data;
                if (data && data.page) pageLabel = data.page;
                else if (data && data.url) {
                    const url = data.url.toLowerCase();
                    if (url.includes('about')) pageLabel = 'About';
                    else if (url.includes('contact')) pageLabel = 'Contact';
                    else if (url.includes('blog-post')) pageLabel = 'Blog Post';
                    else if (url.includes('blog')) pageLabel = 'Blog';
                    else if (url.includes('courses')) pageLabel = 'Courses';
                    else if (url.includes('faq')) pageLabel = 'FAQ';
                }
            } catch (_) { }
            pagesMap[pageLabel] = (pagesMap[pageLabel] || 0) + 1;
            if (!pageVisitors[pageLabel]) pageVisitors[pageLabel] = new Set();
            pageVisitors[pageLabel].add(e.session_key);
        });
        const topPages = Object.keys(pagesMap)
            .map(page => ({ page, views: pagesMap[page], visitors: pageVisitors[page].size }))
            .sort((a, b) => b.views - a.views);

        // 9. Timeline grouped by day within date range
        const timeline = {};
        const rangeDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        const maxDays = Math.min(rangeDays, 90); // cap display to 90 days
        for (let i = maxDays - 1; i >= 0; i--) {
            const d = new Date(endDate);
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            timeline[dateStr] = { pageviews: 0, sessions: 0 };
        }
        sessions.forEach(s => {
            const dateStr = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (timeline[dateStr]) timeline[dateStr].sessions++;
        });
        events.forEach(e => {
            if (e.event_type === 'pageview') {
                const dateStr = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (timeline[dateStr]) timeline[dateStr].pageviews++;
            }
        });

        // 9. Top Referrers
        const referrers = {};
        sessions.forEach(s => {
            let ref = s.referrer || 'Direct';
            if (ref.includes('localhost') || ref.includes('127.0.0.1')) ref = 'Localhost Dev';
            referrers[ref] = (referrers[ref] || 0) + 1;
        });
        const topReferrers = Object.keys(referrers)
            .map(name => ({ name, count: referrers[name] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // 10. GA Events List (Unique visitors vs Total triggers)
        const eventSummary = {};
        events.forEach(e => {
            if (e.event_type !== 'pageview' && e.event_type !== 'heartbeat') {
                const eventName = e.event_name;
                if (!eventSummary[eventName]) {
                    eventSummary[eventName] = { name: eventName, total: 0, visitors: new Set() };
                }
                eventSummary[eventName].total++;
                eventSummary[eventName].visitors.add(e.session_key);
            }
        });
        const eventsGA = Object.keys(eventSummary).map(k => ({
            name: eventSummary[k].name,
            total: eventSummary[k].total,
            visitors: eventSummary[k].visitors.size
        })).sort((a, b) => b.total - a.total).slice(0, 10);

        res.json({
            dbMode,
            stats: {
                totalBookings,
                totalPageviews,
                totalSessions,
                activeUsers,
                conversionRate: `${conversionRate}%`,
                bounceRate: `${bounceRate}%`,
                avgDuration: avgDurationFormatted
            },
            timeline,
            topReferrers,
            eventsGA,
            topPages,
            dateRange: {
                startDate: isNaN(startDate.getTime()) ? null : startDate.toISOString(),
                endDate: isNaN(endDate.getTime()) ? null : endDate.toISOString()
            },
            breakdowns: {
                services,
                devices,
                browsers,
                osBreakdown,
                countries
            }
        });
    } catch (err) {
        console.error('Error fetching dashboard stats:', err);
        res.status(500).json({ error: 'Failed to fetch statistics.' });
    }
});

// ==========================================
// DEDICATED ANALYTICS ENDPOINTS
// ==========================================

// Timeline: Grouped visits by day/week/month with date range
app.get('/api/admin/analytics/timeline', requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const defaultStart = new Date(now); defaultStart.setDate(now.getDate() - 30);
        const startDate = req.query.startDate ? new Date(req.query.startDate) : defaultStart;
        const endDate = req.query.endDate ? new Date(req.query.endDate + 'T23:59:59') : now;
        const groupBy = req.query.groupBy || 'day'; // 'day', 'week', 'month'

        const sessions = await db.query('SELECT * FROM analytics_sessions ORDER BY created_at DESC');
        const events = await db.query('SELECT * FROM analytics_events ORDER BY created_at DESC');

        const filteredSessions = sessions.filter(s => { const d = new Date(s.created_at); return d >= startDate && d <= endDate; });
        const filteredEvents = events.filter(e => { const d = new Date(e.created_at); return d >= startDate && d <= endDate; });

        function getGroupKey(date) {
            const d = new Date(date);
            if (groupBy === 'month') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
            if (groupBy === 'week') {
                const weekStart = new Date(d);
                weekStart.setDate(d.getDate() - d.getDay());
                return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        const timeline = {};
        filteredSessions.forEach(s => {
            const key = getGroupKey(s.created_at);
            if (!timeline[key]) timeline[key] = { label: key, sessions: 0, pageviews: 0 };
            timeline[key].sessions++;
        });
        filteredEvents.filter(e => e.event_type === 'pageview').forEach(e => {
            const key = getGroupKey(e.created_at);
            if (!timeline[key]) timeline[key] = { label: key, sessions: 0, pageviews: 0 };
            timeline[key].pageviews++;
        });

        res.json({
            timeline: Object.values(timeline),
            groupBy,
            startDate: isNaN(startDate.getTime()) ? null : startDate.toISOString(),
            endDate: isNaN(endDate.getTime()) ? null : endDate.toISOString()
        });
    } catch (err) {
        console.error('Error in analytics timeline:', err);
        res.status(500).json({ error: 'Failed to fetch timeline.' });
    }
});

// Top Pages: Ranked list with visits and unique visitors
app.get('/api/admin/analytics/pages', requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const defaultStart = new Date(now); defaultStart.setDate(now.getDate() - 30);
        const startDate = req.query.startDate ? new Date(req.query.startDate) : defaultStart;
        const endDate = req.query.endDate ? new Date(req.query.endDate + 'T23:59:59') : now;

        const events = await db.query('SELECT * FROM analytics_events ORDER BY created_at DESC');
        const filtered = events.filter(e => {
            const d = new Date(e.created_at);
            return e.event_type === 'pageview' && d >= startDate && d <= endDate;
        });

        const pagesMap = {};
        const pageVisitors = {};
        filtered.forEach(e => {
            let pageLabel = 'Home';
            try {
                const data = typeof e.event_data === 'string' ? JSON.parse(e.event_data) : e.event_data;
                if (data && data.page) pageLabel = data.page;
            } catch (_) { }
            pagesMap[pageLabel] = (pagesMap[pageLabel] || 0) + 1;
            if (!pageVisitors[pageLabel]) pageVisitors[pageLabel] = new Set();
            pageVisitors[pageLabel].add(e.session_key);
        });

        const pages = Object.keys(pagesMap)
            .map(page => ({ page, views: pagesMap[page], visitors: pageVisitors[page].size }))
            .sort((a, b) => b.views - a.views);

        res.json({ pages, total: filtered.length });
    } catch (err) {
        console.error('Error in analytics pages:', err);
        res.status(500).json({ error: 'Failed to fetch page stats.' });
    }
});

// Countries: Ranked with counts and percentages
app.get('/api/admin/analytics/countries', requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const defaultStart = new Date(now); defaultStart.setDate(now.getDate() - 30);
        const startDate = req.query.startDate ? new Date(req.query.startDate) : defaultStart;
        const endDate = req.query.endDate ? new Date(req.query.endDate + 'T23:59:59') : now;

        const sessions = await db.query('SELECT * FROM analytics_sessions ORDER BY created_at DESC');
        const filtered = sessions.filter(s => { const d = new Date(s.created_at); return d >= startDate && d <= endDate; });

        const countryMap = {};
        filtered.forEach(s => {
            const name = s.country_name || 'Unknown';
            const flag = s.country_flag || '🌍';
            if (!countryMap[name]) countryMap[name] = { name, flag, count: 0 };
            countryMap[name].count++;
        });

        const total = filtered.length;
        const countries = Object.values(countryMap)
            .sort((a, b) => b.count - a.count)
            .map(c => ({ ...c, percentage: total > 0 ? ((c.count / total) * 100).toFixed(1) : '0.0' }));

        res.json({ countries, total });
    } catch (err) {
        console.error('Error in analytics countries:', err);
        res.status(500).json({ error: 'Failed to fetch country stats.' });
    }
});

// Administrative User Management APIs
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await db.query('SELECT username, created_at FROM admin_users ORDER BY created_at DESC');
        res.json(users);
    } catch (err) {
        console.error('Error fetching admin users:', err);
        res.status(500).json({ error: 'Failed to retrieve administrators.' });
    }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        const existing = await db.query('SELECT * FROM admin_users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Username already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [
            username,
            passwordHash
        ]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error creating admin user:', err);
        res.status(500).json({ error: 'Failed to create admin user.' });
    }
});

// Retrieve Bookings List
app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
    try {
        const bookings = await db.query('SELECT * FROM bookings ORDER BY created_at DESC');
        res.json(bookings);
    } catch (err) {
        console.error('Error fetching bookings:', err);
        res.status(500).json({ error: 'Failed to fetch bookings.' });
    }
});

// Update Booking Status
app.patch('/api/admin/bookings/:id', requireAdmin, async (req, res) => {
    const bookingId = req.params.id;
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: 'Status is required.' });

    try {
        await db.query('UPDATE bookings SET status = ? WHERE id = ?', [status, bookingId]);

        // Fetch booking to get phone number and name for WhatsApp notification
        const bookings = await db.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        if (bookings.length > 0) {
            const booking = bookings[0];
            const msg = `Hello ${booking.name}, 👋\n\nYour booking request for *${booking.service}* has been updated to: *${status.toUpperCase()}*.\n\nThank you! 🎓`;
            whatsappService.sendMessage(booking.phone, msg);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating booking status:', err);
        res.status(500).json({ error: 'Failed to update booking.' });
    }
});

// ==========================================
// WHATSAPP INTEGRATION & BOOKING CHAT
// ==========================================

// Get WhatsApp Status
app.get('/api/admin/whatsapp/status', requireAdmin, (req, res) => {
    res.json(whatsappService.getStatus());
});

// Disconnect WhatsApp
app.post('/api/admin/whatsapp/disconnect', requireAdmin, async (req, res) => {
    try {
        await whatsappService.disconnect();
        res.json({ success: true });
    } catch (err) {
        console.error('Error disconnecting WhatsApp:', err);
        res.status(500).json({ error: 'Failed to disconnect WhatsApp.' });
    }
});

// Retrieve Booking Messages (Chat)
app.get('/api/admin/bookings/:id/messages', requireAdmin, async (req, res) => {
    const bookingId = req.params.id;
    try {
        const messages = await db.query('SELECT * FROM booking_messages WHERE booking_id = ? ORDER BY created_at ASC', [bookingId]);
        res.json(messages);
    } catch (err) {
        console.error('Error fetching booking messages:', err);
        res.status(500).json({ error: 'Failed to fetch messages.' });
    }
});

// Send Admin Message (Chat)
app.post('/api/admin/bookings/:id/messages', requireAdmin, upload.single('attachment'), async (req, res) => {
    const bookingId = req.params.id;
    const { message } = req.body;
    let attachmentUrl = null;
    let attachmentName = null;

    if (req.file) {
        attachmentUrl = `/uploads/${req.file.filename}`;
        attachmentName = req.file.originalname;
    }

    if (!message && !attachmentUrl) {
        return res.status(400).json({ error: 'Message or attachment is required.' });
    }

    try {
        const bookings = await db.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });
        const booking = bookings[0];

        await db.query(`
            INSERT INTO booking_messages (booking_id, sender, message, attachment_url, attachment_name) 
            VALUES (?, ?, ?, ?, ?)`,
            [bookingId, 'admin', message || '', attachmentUrl, attachmentName]
        );

        // Notify user via WhatsApp
        let waMsg = `*Genius Minds Admin:*\n\n${message}`;
        if (attachmentUrl) {
            waMsg += `\n\n[Attached: ${attachmentName}]`;
        }
        if (booking.tracking_token) {
            waMsg += `\n\nTrack your booking here: https://geniusminds.website/track.html?token=${booking.tracking_token}`;
        }

        whatsappService.sendMessage(booking.phone, waMsg);

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Error saving admin message:', err);
        res.status(500).json({ error: 'Failed to save message.' });
    }
});

// ==========================================
// PUBLIC BOOKING TRACKING (track.html)
// ==========================================

// Get Booking & Messages by Tracking Token
app.get('/api/booking/track/:token', async (req, res) => {
    const token = req.params.token;
    if (!token) return res.status(400).json({ error: 'Tracking token is required.' });

    try {
        const bookings = await db.query('SELECT * FROM bookings WHERE tracking_token = ?', [token]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });

        const booking = bookings[0];
        const messages = await db.query('SELECT * FROM booking_messages WHERE booking_id = ? ORDER BY created_at ASC', [booking.id]);

        res.json({ booking, messages });
    } catch (err) {
        console.error('Error fetching tracking data:', err);
        res.status(500).json({ error: 'Failed to load tracking data.' });
    }
});

// Post Message from Customer via Tracking Portal
app.post('/api/booking/track/:token/message', upload.single('attachment'), async (req, res) => {
    const token = req.params.token;
    const { message } = req.body;
    let attachmentUrl = null;
    let attachmentName = null;

    if (req.file) {
        attachmentUrl = `/uploads/${req.file.filename}`;
        attachmentName = req.file.originalname;
    }

    if (!message && !attachmentUrl) {
        return res.status(400).json({ error: 'Message or attachment is required.' });
    }

    try {
        const bookings = await db.query('SELECT * FROM bookings WHERE tracking_token = ?', [token]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });

        const booking = bookings[0];

        await db.query(`
            INSERT INTO booking_messages (booking_id, sender, message, attachment_url, attachment_name) 
            VALUES (?, ?, ?, ?, ?)`,
            [booking.id, 'customer', message || '', attachmentUrl, attachmentName]
        );

        // Notify admin via WhatsApp (if admin's number was known, but we'll let it just appear in the portal)
        // Or if the system sends an email to the admin:
        // sendEmailNotificationToAdmin(`New message from ${booking.name} on booking #${booking.id}`, message);

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Error saving customer message:', err);
        res.status(500).json({ error: 'Failed to save message.' });
    }
});

// Sync emails via IMAP
app.get('/api/admin/emails/sync', requireAdmin, async (req, res) => {
    try {
        await syncGmailEmails();
        const received = await db.query('SELECT * FROM received_emails ORDER BY received_at DESC');
        res.json({ success: true, emails: received });
    } catch (err) {
        console.error('Error syncing emails:', err);
        res.status(500).json({ error: 'Failed to sync emails from Gmail.' });
    }
});

// Retrieve Received Inbox Emails
app.get('/api/admin/emails/inbox', requireAdmin, async (req, res) => {
    try {
        const received = await db.query('SELECT * FROM received_emails ORDER BY received_at DESC');
        res.json(received);
    } catch (err) {
        console.error('Error fetching inbox emails:', err);
        res.status(500).json({ error: 'Failed to fetch inbox emails.' });
    }
});

// Retrieve Outgoing/Sent Email Logs
app.get('/api/admin/emails/sent', requireAdmin, async (req, res) => {
    try {
        const emails = await db.query('SELECT * FROM email_logs ORDER BY created_at DESC');
        res.json(emails);
    } catch (err) {
        console.error('Error fetching sent email logs:', err);
        res.status(500).json({ error: 'Failed to fetch sent email logs.' });
    }
});

// Send Manual Email from Dashboard
app.post('/api/admin/emails/send', requireAdmin, async (req, res) => {
    const { recipient, subject, body } = req.body;

    if (!recipient || !subject || !body) {
        return res.status(400).json({ error: 'Recipient, subject, and body are required.' });
    }

    try {
        let mailStatus = 'sent';
        let mailError = null;

        if (transporter) {
            try {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || `"Genius Minds Homeschooling" <${process.env.SMTP_USER}>`,
                    to: recipient,
                    subject: subject,
                    html: body
                });
                console.log(`📧 Composed email sent successfully to ${recipient}`);
            } catch (err) {
                console.error('📧 Composed email sending failed:', err);
                mailStatus = 'failed';
                mailError = err.message;
            }
        } else {
            console.log('-------------------------------------------');
            console.log('MOCK EMAIL SENDING (SMTP credentials empty)');
            console.log(`To: ${recipient}`);
            console.log(`Subject: ${subject}`);
            console.log(`Body:\n${body}`);
            console.log('-------------------------------------------');
            mailStatus = 'logged_to_console';
        }

        // Log the manual email send (booking_id is null)
        await db.query(
            'INSERT INTO email_logs (booking_id, recipient, subject, body, status, error_message) VALUES (?, ?, ?, ?, ?, ?)',
            [null, recipient, subject, body, mailStatus, mailError]
        );

        if (mailStatus === 'failed') {
            return res.status(500).json({ error: 'Failed to send email: ' + mailError });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error in send manual email route:', err);
        res.status(500).json({ error: 'Failed to process email dispatch.' });
    }
});

// Retrieve Email Dispatch Logs
app.get('/api/admin/emails', requireAdmin, async (req, res) => {
    try {
        const emails = await db.query('SELECT * FROM email_logs ORDER BY created_at DESC');
        res.json(emails);
    } catch (err) {
        console.error('Error fetching email logs:', err);
        res.status(500).json({ error: 'Failed to fetch email logs.' });
    }
});

// Retrieve Analytics Events Log
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
    try {
        const sessions = await db.query('SELECT * FROM analytics_sessions ORDER BY created_at DESC');
        const events = await db.query('SELECT * FROM analytics_events ORDER BY created_at DESC');
        res.json({ sessions, events });
    } catch (err) {
        console.error('Error fetching analytics data:', err);
        res.status(500).json({ error: 'Failed to fetch analytics.' });
    }
});

// WhatsApp Status API
app.get('/api/admin/whatsapp/status', requireAdmin, (req, res) => {
    res.json(whatsappService.getStatus());
});

// WhatsApp Disconnect API
app.post('/api/admin/whatsapp/disconnect', requireAdmin, async (req, res) => {
    try {
        await whatsappService.disconnect();
        res.json({ success: true });
    } catch (err) {
        console.error('Error disconnecting WhatsApp:', err);
        res.status(500).json({ error: 'Failed to disconnect WhatsApp.' });
    }
});

// ==========================================
// HIGHLIGHTS BANNERS API
// ==========================================

// 1. Public: Get active banners (filtered by schedule)
app.get('/api/banners', async (req, res) => {
    try {
        const banners = await db.query('SELECT * FROM highlights_banners');
        const now = new Date();
        const activeBanners = banners
            .filter(b => {
                const isActive = b.is_active === undefined || b.is_active == 1;
                const hasStarted = !b.start_date || now >= new Date(b.start_date);
                const notExpired = !b.end_date || now <= new Date(b.end_date);
                return isActive && hasStarted && notExpired;
            })
            .sort((a, b) => a.id - b.id);
        res.json(activeBanners);
    } catch (err) {
        console.error('Error fetching highlights banners:', err);
        res.status(500).json({ error: 'Failed to retrieve banners.' });
    }
});

// 2. Admin: Get all banners
app.get('/api/admin/banners', requireAdmin, async (req, res) => {
    try {
        const banners = await db.query('SELECT * FROM highlights_banners ORDER BY id ASC');
        res.json(banners);
    } catch (err) {
        console.error('Error fetching admin highlights banners:', err);
        res.status(500).json({ error: 'Failed to retrieve banners.' });
    }
});

// 3. Admin: Create banner
app.post('/api/admin/banners', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const {
            banner_type, badge_text, badge_class, title, subtitle,
            btn_primary_action, btn_secondary_action,
            is_active, start_date, end_date
        } = req.body;

        if (!badge_text || !title || !subtitle) {
            return res.status(400).json({ error: 'badge_text, title, and subtitle are required.' });
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : (req.body.image_path || null);

        const result = await db.query(`
            INSERT INTO highlights_banners
                (banner_type, badge_text, badge_class, title, subtitle,
                 btn_primary_action, btn_secondary_action,
                 image_path, is_active, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [banner_type || null, badge_text, badge_class || 'event-badge', title, subtitle,
            btn_primary_action || null, btn_secondary_action || null,
            imagePath,
            is_active !== undefined ? parseInt(is_active) : 1,
            start_date || null, end_date || null]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Error creating banner:', err);
        res.status(500).json({ error: 'Failed to create banner.' });
    }
});

// 4. Admin: Update banner
app.put('/api/admin/banners/:id', requireAdmin, upload.single('image'), async (req, res) => {
    const bannerId = req.params.id;
    try {
        const banners = await db.query('SELECT * FROM highlights_banners');
        const existingBanner = banners.find(b => b.id == bannerId);
        if (!existingBanner) return res.status(404).json({ error: 'Banner not found.' });

        const {
            banner_type, badge_text, badge_class, title, subtitle,
            btn_primary_action, btn_secondary_action,
            is_active, start_date, end_date
        } = req.body;

        const imagePath = req.file ? `/uploads/${req.file.filename}` : (existingBanner.image_path);

        await db.query(`
            UPDATE highlights_banners SET
                banner_type = ?, badge_text = ?, badge_class = ?, title = ?, subtitle = ?,
                btn_primary_action = ?, btn_secondary_action = ?,
                image_path = ?, is_active = ?, start_date = ?, end_date = ?
            WHERE id = ?`,
            [banner_type || null, badge_text, badge_class || 'event-badge', title, subtitle,
            btn_primary_action || null, btn_secondary_action || null,
            imagePath,
            is_active !== undefined ? parseInt(is_active) : 1,
            start_date || null, end_date || null,
            bannerId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating banner:', err);
        res.status(500).json({ error: 'Failed to update banner.' });
    }
});

// 5. Admin: Delete banner
app.delete('/api/admin/banners/:id', requireAdmin, async (req, res) => {
    const bannerId = req.params.id;
    try {
        const banners = await db.query('SELECT * FROM highlights_banners');
        const existingBanner = banners.find(b => b.id == bannerId);
        if (!existingBanner) return res.status(404).json({ error: 'Banner not found.' });

        // Delete image file if it was uploaded
        if (existingBanner.image_path && existingBanner.image_path.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, existingBanner.image_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        await db.query('DELETE FROM highlights_banners WHERE id = ?', [bannerId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting banner:', err);
        res.status(500).json({ error: 'Failed to delete banner.' });
    }
});

// 6. Admin: Toggle banner visibility (Show/Hide)
app.patch('/api/admin/banners/:id/toggle', requireAdmin, async (req, res) => {
    const bannerId = req.params.id;
    try {
        const banners = await db.query('SELECT * FROM highlights_banners');
        const existingBanner = banners.find(b => b.id == bannerId);
        if (!existingBanner) return res.status(404).json({ error: 'Banner not found.' });

        const newStatus = existingBanner.is_active == 1 ? 0 : 1;
        await db.query('UPDATE highlights_banners SET is_active = ? WHERE id = ?', [newStatus, bannerId]);
        res.json({ success: true, is_active: newStatus });
    } catch (err) {
        console.error('Error toggling banner visibility:', err);
        res.status(500).json({ error: 'Failed to toggle banner visibility.' });
    }
});

// ==========================================
// SITE SETTINGS APIs
// ==========================================

// Public: Get Settings
app.get('/api/settings', async (req, res) => {
    try {
        const settingsArr = await db.query('SELECT setting_key, setting_value FROM site_settings');
        // Convert array to key-value map
        const settings = {};
        settingsArr.forEach(s => settings[s.setting_key] = s.setting_value);
        res.json(settings);
    } catch (err) {
        console.error('Error fetching public settings:', err);
        res.status(500).json({ error: 'Failed to load settings.' });
    }
});

// Admin: Get Settings
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
        const settingsArr = await db.query('SELECT setting_key, setting_value FROM site_settings');
        const settings = {};
        settingsArr.forEach(s => settings[s.setting_key] = s.setting_value);
        res.json(settings);
    } catch (err) {
        console.error('Error fetching admin settings:', err);
        res.status(500).json({ error: 'Failed to load settings.' });
    }
});

// Admin: Update Settings
app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    const newSettings = req.body;
    try {
        for (const [key, value] of Object.entries(newSettings)) {
            // Upsert mechanism depending on database driver
            if (dbMode === 'memory') {
                const existing = memDb.site_settings.find(s => s.setting_key === key);
                if (existing) {
                    existing.setting_value = value;
                } else {
                    memDb.site_settings.push({ setting_key: key, setting_value: value });
                }
            } else if (dbMode === 'sqlite') {
                await dbConnection.run(
                    'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?, updated_at = CURRENT_TIMESTAMP',
                    [key, value, value]
                );
            } else if (dbMode === 'mysql') {
                await dbPool.query(
                    'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                    [key, value, value]
                );
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings.' });
    }
});

// ==========================================
// SOCIAL MEDIA LINKS APIs
// ==========================================

// Public: Get all social media links
app.get('/api/social-media', async (req, res) => {
    try {
        const links = await db.query('SELECT * FROM social_media ORDER BY display_order ASC');
        res.json(links);
    } catch (err) {
        console.error('Error fetching social media links:', err);
        res.status(500).json({ error: 'Failed to load social media links.' });
    }
});

// Admin: Get all social media links
app.get('/api/admin/social-media', requireAdmin, async (req, res) => {
    try {
        const links = await db.query('SELECT * FROM social_media ORDER BY display_order ASC');
        res.json(links);
    } catch (err) {
        console.error('Error fetching social media links:', err);
        res.status(500).json({ error: 'Failed to load social media links.' });
    }
});

// Admin: Create social media link
app.post('/api/admin/social-media', requireAdmin, async (req, res) => {
    try {
        const { name, url, icon, display_order } = req.body;

        if (!name || !url) {
            return res.status(400).json({ error: 'Name and URL are required.' });
        }

        const result = await db.query(
            'INSERT INTO social_media (name, url, icon, display_order) VALUES (?, ?, ?, ?)',
            [name, url, icon || null, parseInt(display_order) || 0]
        );

        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Error creating social media link:', err);
        res.status(500).json({ error: 'Failed to create social media link.' });
    }
});

// Admin: Update social media link
app.put('/api/admin/social-media/:id', requireAdmin, async (req, res) => {
    const linkId = req.params.id;
    try {
        const { name, url, icon, display_order } = req.body;

        if (!name || !url) {
            return res.status(400).json({ error: 'Name and URL are required.' });
        }

        await db.query(
            'UPDATE social_media SET name = ?, url = ?, icon = ?, display_order = ? WHERE id = ?',
            [name, url, icon || null, parseInt(display_order) || 0, linkId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating social media link:', err);
        res.status(500).json({ error: 'Failed to update social media link.' });
    }
});

// Admin: Delete social media link
app.delete('/api/admin/social-media/:id', requireAdmin, async (req, res) => {
    const linkId = req.params.id;
    try {
        await db.query('DELETE FROM social_media WHERE id = ?', [linkId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting social media link:', err);
        res.status(500).json({ error: 'Failed to delete social media link.' });
    }
});

// ==========================================
// SOCIAL MEDIA APIs
// ==========================================

// Public: Get all social media links (sorted by display_order)
app.get('/api/social-media', async (req, res) => {
    try {
        const links = await db.query('SELECT * FROM social_media ORDER BY display_order ASC');
        res.json(links);
    } catch (err) {
        console.error('Error fetching social media links:', err);
        res.status(500).json({ error: 'Failed to load social media links.' });
    }
});

// Admin: Get all social media links
app.get('/api/admin/social-media', requireAdmin, async (req, res) => {
    try {
        const links = await db.query('SELECT * FROM social_media ORDER BY display_order ASC');
        res.json(links);
    } catch (err) {
        console.error('Error fetching admin social media:', err);
        res.status(500).json({ error: 'Failed to load social media links.' });
    }
});

// Admin: Create a social media link
app.post('/api/admin/social-media', requireAdmin, async (req, res) => {
    const { name, url, icon, display_order } = req.body;
    if (!name || !url) {
        return res.status(400).json({ error: 'Platform name and URL are required.' });
    }
    try {
        const result = await db.query(
            'INSERT INTO social_media (name, url, icon, display_order) VALUES (?, ?, ?, ?)',
            [name.trim(), url.trim(), icon || null, parseInt(display_order) || 0]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Error creating social media link:', err);
        res.status(500).json({ error: 'Failed to create social media link.' });
    }
});

// Admin: Update a social media link
app.put('/api/admin/social-media/:id', requireAdmin, async (req, res) => {
    const { name, url, icon, display_order } = req.body;
    const { id } = req.params;
    if (!name || !url) {
        return res.status(400).json({ error: 'Platform name and URL are required.' });
    }
    try {
        await db.query(
            'UPDATE social_media SET name = ?, url = ?, icon = ?, display_order = ? WHERE id = ?',
            [name.trim(), url.trim(), icon || null, parseInt(display_order) || 0, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating social media link:', err);
        res.status(500).json({ error: 'Failed to update social media link.' });
    }
});

// Admin: Delete a social media link
app.delete('/api/admin/social-media/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM social_media WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting social media link:', err);
        res.status(500).json({ error: 'Failed to delete social media link.' });
    }
});

// ==========================================
// CUSTOM CMS API ENDPOINTS
// ==========================================

// --- 1. TEAM MEMBERS ---

// Public: Get all team members
app.get('/api/team', async (req, res) => {
    try {
        const team = await db.query('SELECT * FROM team_members ORDER BY display_order ASC');
        res.json(team);
    } catch (err) {
        console.error('Error fetching team members:', err);
        res.status(500).json({ error: 'Failed to retrieve team members.' });
    }
});

// Admin: Get all team members
app.get('/api/admin/team', requireAdmin, async (req, res) => {
    try {
        const team = await db.query('SELECT * FROM team_members ORDER BY display_order ASC');
        res.json(team);
    } catch (err) {
        console.error('Error fetching admin team members:', err);
        res.status(500).json({ error: 'Failed to retrieve team members.' });
    }
});

// Admin: Create team member
app.post('/api/admin/team', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, role, bio, display_order } = req.body;
        if (!name || !role) {
            return res.status(400).json({ error: 'Name and role are required.' });
        }
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || null);
        const result = await db.query(
            'INSERT INTO team_members (name, role, bio, image_url, display_order) VALUES (?, ?, ?, ?, ?)',
            [name, role, bio || null, imageUrl, parseInt(display_order) || 0]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Error creating team member:', err);
        res.status(500).json({ error: 'Failed to create team member.' });
    }
});

// Admin: Update team member
app.put('/api/admin/team/:id', requireAdmin, upload.single('image'), async (req, res) => {
    const { id } = req.params;
    try {
        const { name, role, bio, display_order } = req.body;
        if (!name || !role) {
            return res.status(400).json({ error: 'Name and role are required.' });
        }
        const team = await db.query('SELECT * FROM team_members');
        const member = team.find(t => t.id == id);
        if (!member) return res.status(404).json({ error: 'Team member not found.' });

        const imageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || member.image_url);
        await db.query(
            'UPDATE team_members SET name = ?, role = ?, bio = ?, image_url = ?, display_order = ? WHERE id = ?',
            [name, role, bio || null, imageUrl, parseInt(display_order) || 0, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating team member:', err);
        res.status(500).json({ error: 'Failed to update team member.' });
    }
});

// Admin: Delete team member
app.delete('/api/admin/team/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM team_members WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting team member:', err);
        res.status(500).json({ error: 'Failed to delete team member.' });
    }
});

// --- 2. COURSES ---

// Public: Get all courses
app.get('/api/courses', async (req, res) => {
    try {
        const courses = await db.query('SELECT * FROM courses');
        res.json(courses);
    } catch (err) {
        console.error('Error fetching courses:', err);
        res.status(500).json({ error: 'Failed to retrieve courses.' });
    }
});

// Admin: Get all courses
app.get('/api/admin/courses', requireAdmin, async (req, res) => {
    try {
        const courses = await db.query('SELECT * FROM courses');
        res.json(courses);
    } catch (err) {
        console.error('Error fetching admin courses:', err);
        res.status(500).json({ error: 'Failed to retrieve courses.' });
    }
});

// Admin: Create course
app.post('/api/admin/courses', requireAdmin, async (req, res) => {
    try {
        const { title, grade_levels, subjects, description, duration, fees, outcomes } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required.' });
        const result = await db.query(
            'INSERT INTO courses (title, grade_levels, subjects, description, duration, fees, outcomes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, grade_levels || null, subjects || null, description || null, duration || null, fees || null, outcomes || null]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Error creating course:', err);
        res.status(500).json({ error: 'Failed to create course.' });
    }
});

// Admin: Update course
app.put('/api/admin/courses/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const { title, grade_levels, subjects, description, duration, fees, outcomes } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required.' });

        const courses = await db.query('SELECT * FROM courses');
        const course = courses.find(c => c.id == id);
        if (!course) return res.status(404).json({ error: 'Course not found.' });

        await db.query(
            'UPDATE courses SET title = ?, grade_levels = ?, subjects = ?, description = ?, duration = ?, fees = ?, outcomes = ? WHERE id = ?',
            [title, grade_levels || null, subjects || null, description || null, duration || null, fees || null, outcomes || null, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating course:', err);
        res.status(500).json({ error: 'Failed to update course.' });
    }
});

// Admin: Delete course
app.delete('/api/admin/courses/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM courses WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting course:', err);
        res.status(500).json({ error: 'Failed to delete course.' });
    }
});

// --- 3. FAQS ---

// Public: Get all FAQs
app.get('/api/faqs', async (req, res) => {
    try {
        const faqs = await db.query('SELECT * FROM faqs ORDER BY display_order ASC');
        res.json(faqs);
    } catch (err) {
        console.error('Error fetching FAQs:', err);
        res.status(500).json({ error: 'Failed to retrieve FAQs.' });
    }
});

// Admin: Get all FAQs
app.get('/api/admin/faqs', requireAdmin, async (req, res) => {
    try {
        const faqs = await db.query('SELECT * FROM faqs ORDER BY display_order ASC');
        res.json(faqs);
    } catch (err) {
        console.error('Error fetching admin FAQs:', err);
        res.status(500).json({ error: 'Failed to retrieve FAQs.' });
    }
});

// Admin: Create FAQ
app.post('/api/admin/faqs', requireAdmin, async (req, res) => {
    try {
        const { question, answer, category, display_order } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ error: 'Question and answer are required.' });
        }
        const result = await db.query(
            'INSERT INTO faqs (question, answer, category, display_order) VALUES (?, ?, ?, ?)',
            [question, answer, category || 'General', parseInt(display_order) || 0]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Error creating FAQ:', err);
        res.status(500).json({ error: 'Failed to create FAQ.' });
    }
});

// Admin: Update FAQ
app.put('/api/admin/faqs/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const { question, answer, category, display_order } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ error: 'Question and answer are required.' });
        }
        const faqs = await db.query('SELECT * FROM faqs');
        const faq = faqs.find(f => f.id == id);
        if (!faq) return res.status(404).json({ error: 'FAQ not found.' });

        await db.query(
            'UPDATE faqs SET question = ?, answer = ?, category = ?, display_order = ? WHERE id = ?',
            [question, answer, category || 'General', parseInt(display_order) || 0, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating FAQ:', err);
        res.status(500).json({ error: 'Failed to update FAQ.' });
    }
});

// Admin: Delete FAQ
app.delete('/api/admin/faqs/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM faqs WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting FAQ:', err);
        res.status(500).json({ error: 'Failed to delete FAQ.' });
    }
});

// --- 4. BLOG POSTS ---

// Public: Get all blog posts
app.get('/api/blog', async (req, res) => {
    try {
        const blogs = await db.query('SELECT * FROM blog_posts ORDER BY created_at DESC');
        res.json(blogs);
    } catch (err) {
        console.error('Error fetching blog posts:', err);
        res.status(500).json({ error: 'Failed to retrieve blog posts.' });
    }
});

// Public: Get single blog post
app.get('/api/blog/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const blogs = await db.query('SELECT * FROM blog_posts');
        const post = blogs.find(b => b.id == id);
        if (!post) return res.status(404).json({ error: 'Blog post not found.' });
        res.json(post);
    } catch (err) {
        console.error('Error fetching blog post:', err);
        res.status(500).json({ error: 'Failed to retrieve blog post.' });
    }
});

// Admin: Get all blog posts
app.get('/api/admin/blog', requireAdmin, async (req, res) => {
    try {
        const blogs = await db.query('SELECT * FROM blog_posts ORDER BY created_at DESC');
        res.json(blogs);
    } catch (err) {
        console.error('Error fetching admin blogs:', err);
        res.status(500).json({ error: 'Failed to retrieve blogs.' });
    }
});

// Admin: Create blog post
app.post('/api/admin/blog', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { title, excerpt, content, author, category } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required.' });
        }
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || null);
        const result = await db.query(
            'INSERT INTO blog_posts (title, excerpt, content, author, category, image_url) VALUES (?, ?, ?, ?, ?, ?)',
            [title, excerpt || null, content, author || 'Admin', category || 'General', imageUrl]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Error creating blog post:', err);
        res.status(500).json({ error: 'Failed to create blog post.' });
    }
});

// Admin: Update blog post
app.put('/api/admin/blog/:id', requireAdmin, upload.single('image'), async (req, res) => {
    const { id } = req.params;
    try {
        const { title, excerpt, content, author, category } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required.' });
        }
        const blogs = await db.query('SELECT * FROM blog_posts');
        const post = blogs.find(b => b.id == id);
        if (!post) return res.status(404).json({ error: 'Blog post not found.' });

        const imageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || post.image_url);
        await db.query(
            'UPDATE blog_posts SET title = ?, excerpt = ?, content = ?, author = ?, category = ?, image_url = ? WHERE id = ?',
            [title, excerpt || null, content, author || 'Admin', category || 'General', imageUrl, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating blog post:', err);
        res.status(500).json({ error: 'Failed to update blog post.' });
    }
});

// Admin: Delete blog post
app.delete('/api/admin/blog/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM blog_posts WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting blog post:', err);
        res.status(500).json({ error: 'Failed to delete blog post.' });
    }
});

// --- 5. PAGE CONTENT (Key-Value) ---

// Public: Get all page content
app.get('/api/content', async (req, res) => {
    try {
        const content = await db.query('SELECT * FROM page_content');
        const formatted = {};
        content.forEach(c => {
            formatted[c.content_key] = c.content_value;
        });
        res.json(formatted);
    } catch (err) {
        console.error('Error fetching page content:', err);
        res.status(500).json({ error: 'Failed to retrieve page content.' });
    }
});

// Admin: Get raw page content key-values
app.get('/api/admin/content', requireAdmin, async (req, res) => {
    try {
        const content = await db.query('SELECT * FROM page_content');
        const formatted = {};
        content.forEach(c => {
            formatted[c.content_key] = c.content_value;
        });
        res.json(formatted);
    } catch (err) {
        console.error('Error fetching admin page content:', err);
        res.status(500).json({ error: 'Failed to retrieve page content.' });
    }
});

// Admin: Bulk update page content
app.post('/api/admin/content', requireAdmin, async (req, res) => {
    try {
        const updates = req.body;
        for (const [key, value] of Object.entries(updates)) {
            if (dbMode === 'memory') {
                const existing = memDb.page_content.find(p => p.content_key === key);
                if (existing) {
                    existing.content_value = value;
                    existing.updated_at = new Date();
                } else {
                    memDb.page_content.push({
                        id: memDb.page_content.length + 1,
                        content_key: key,
                        content_value: value,
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                }
            } else if (dbMode === 'sqlite') {
                await dbConnection.run(
                    'INSERT INTO page_content (content_key, content_value) VALUES (?, ?) ON CONFLICT(content_key) DO UPDATE SET content_value = ?, updated_at = CURRENT_TIMESTAMP',
                    [key, value, value]
                );
            } else if (dbMode === 'mysql') {
                await dbPool.query(
                    'INSERT INTO page_content (content_key, content_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE content_value = ?',
                    [key, value, value]
                );
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating page content:', err);
        res.status(500).json({ error: 'Failed to update page content.' });
    }
});

// ==========================================
// SERVING STATIC ASSETS & FILES
// ==========================================

// Serve uploaded files (attachments from chat)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Route for static admin files (must be before the root static serving)
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Custom route to redirect users directly to admin panel login if not logged in
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Route for public pages (track.html, etc.) — serves /public as root-level URLs
app.use(express.static(path.join(__dirname, 'public')));

// Route for general static website (landing page, script.js, styles.css)
app.use(express.static(path.join(__dirname)));

// Fallback for everything else
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Genius Minds Homeschooling backend running on port ${PORT}`);
    console.log(`🔗 Local Address: http://localhost:${PORT}`);
    console.log(`🔗 Admin Dashboard: http://localhost:${PORT}/admin`);
    console.log(`=======================================================`);

    // Initialize WhatsApp
    whatsappService.initialize();
});
