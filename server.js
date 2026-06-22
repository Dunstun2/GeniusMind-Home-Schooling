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
    highlights_banners: []
};

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

// Helper functions for query/insert operations abstracting SQLite vs Memory
const db = {
    async query(sql, params = []) {
        if (dbMode === 'mysql') {
            const [rows] = await dbPool.execute(sql, params);
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
                return [...memDb.highlights_banners].sort((a, b) => a.sort_order - b.sort_order);
            }

            if (sqlUpper.startsWith('INSERT INTO HIGHLIGHTS_BANNERS')) {
                const id = memDb.highlights_banners.length + 1;
                const record = {
                    id,
                    badge_text: params[0],
                    badge_class: params[1],
                    title: params[2],
                    subtitle: params[3],
                    btn_primary_text: params[4],
                    btn_primary_link: params[5],
                    btn_secondary_text: params[6],
                    btn_secondary_link: params[7],
                    stat_1_number: params[8],
                    stat_1_label: params[9],
                    stat_2_number: params[10],
                    stat_2_label: params[11],
                    stat_3_number: params[12],
                    stat_3_label: params[13],
                    image_path: params[14],
                    floating_icon: params[15],
                    floating_title: params[16],
                    floating_desc: params[17],
                    glow_class: params[18],
                    sort_order: params[19] || id,
                    is_active: params[20] !== undefined ? params[20] : 1,
                    start_date: params[21] || null,
                    end_date: params[22] || null
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
                const id = params[23];
                const banner = memDb.highlights_banners.find(b => b.id == id);
                if (banner) {
                    banner.badge_text = params[0];  banner.badge_class = params[1];
                    banner.title = params[2];        banner.subtitle = params[3];
                    banner.btn_primary_text = params[4];  banner.btn_primary_link = params[5];
                    banner.btn_secondary_text = params[6]; banner.btn_secondary_link = params[7];
                    banner.stat_1_number = params[8];  banner.stat_1_label = params[9];
                    banner.stat_2_number = params[10]; banner.stat_2_label = params[11];
                    banner.stat_3_number = params[12]; banner.stat_3_label = params[13];
                    banner.image_path = params[14]; banner.floating_icon = params[15];
                    banner.floating_title = params[16]; banner.floating_desc = params[17];
                    banner.glow_class = params[18]; banner.sort_order = params[19];
                    banner.is_active = params[20]; banner.start_date = params[21];
                    banner.end_date = params[22];
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
                host:     process.env.DB_HOST     || '127.0.0.1',
                port:     parseInt(process.env.DB_PORT || '3306'),
                user:     process.env.DB_USER     || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME     || 'genius_minds_db',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                charset: 'utf8mb4'
            });

            // Test connection
            await dbPool.execute('SELECT 1');

            // Create MySQL Tables
            await dbPool.execute(`
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

            await dbPool.execute(`
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

            await dbPool.execute(`
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

            await dbPool.execute(`
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

            await dbPool.execute(`
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

            await dbPool.execute(`
                CREATE TABLE IF NOT EXISTS admin_users (
                    id            INT NOT NULL AUTO_INCREMENT,
                    username      VARCHAR(100) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY idx_username (username)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await dbPool.execute(`
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

            await dbPool.execute(`
                CREATE TABLE IF NOT EXISTS highlights_banners (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    badge_text VARCHAR(255) NOT NULL,
                    badge_class VARCHAR(100) NOT NULL DEFAULT 'event-badge',
                    title VARCHAR(255) NOT NULL,
                    subtitle TEXT NOT NULL,
                    btn_primary_text VARCHAR(255) DEFAULT NULL,
                    btn_primary_link VARCHAR(500) DEFAULT NULL,
                    btn_secondary_text VARCHAR(255) DEFAULT NULL,
                    btn_secondary_link VARCHAR(500) DEFAULT NULL,
                    stat_1_number VARCHAR(100) DEFAULT NULL,
                    stat_1_label VARCHAR(255) DEFAULT NULL,
                    stat_2_number VARCHAR(100) DEFAULT NULL,
                    stat_2_label VARCHAR(255) DEFAULT NULL,
                    stat_3_number VARCHAR(100) DEFAULT NULL,
                    stat_3_label VARCHAR(255) DEFAULT NULL,
                    image_path VARCHAR(500) DEFAULT NULL,
                    floating_icon VARCHAR(50) DEFAULT NULL,
                    floating_title VARCHAR(255) DEFAULT NULL,
                    floating_desc VARCHAR(255) DEFAULT NULL,
                    glow_class VARCHAR(100) DEFAULT 'glow-green',
                    sort_order INT DEFAULT 0,
                    is_active TINYINT DEFAULT 1,
                    start_date DATETIME DEFAULT NULL,
                    end_date DATETIME DEFAULT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            // Migrations (safe – ignored if column already exists)
            try { await dbPool.execute("ALTER TABLE analytics_sessions ADD COLUMN country_name VARCHAR(100) DEFAULT 'Kenya'"); } catch (e) {}
            try { await dbPool.execute("ALTER TABLE analytics_sessions ADD COLUMN country_flag VARCHAR(20) DEFAULT '🇰🇪'"); } catch (e) {}
            try { await dbPool.execute("ALTER TABLE booking_messages ADD COLUMN attachment_url VARCHAR(500) DEFAULT NULL"); } catch (e) {}
            try { await dbPool.execute("ALTER TABLE booking_messages ADD COLUMN attachment_name VARCHAR(255) DEFAULT NULL"); } catch (e) {}
            try { await dbPool.execute("ALTER TABLE highlights_banners ADD COLUMN is_active TINYINT DEFAULT 1"); } catch (e) {}
            try { await dbPool.execute("ALTER TABLE highlights_banners ADD COLUMN start_date DATETIME NULL"); } catch (e) {}
            try { await dbPool.execute("ALTER TABLE highlights_banners ADD COLUMN end_date DATETIME NULL"); } catch (e) {}

            // Seed default admin user if missing
            const [rows] = await dbPool.execute('SELECT id FROM admin_users WHERE username = ?', [defaultUsername]);
            if (rows.length === 0) {
                await dbPool.execute('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [
                    defaultUsername,
                    defaultPasswordHash
                ]);
                console.log(`👤 Seeded default admin user in MySQL: "${defaultUsername}" / "${defaultPassword}"`);
            }

            // Seed default banners if empty
            const [bannerRows] = await dbPool.execute('SELECT COUNT(*) as count FROM highlights_banners');
            if (bannerRows[0].count === 0) {
                await dbPool.execute(`
                    INSERT INTO highlights_banners
                        (badge_text, badge_class, title, subtitle, btn_primary_text, btn_primary_link, btn_secondary_text, btn_secondary_link,
                         stat_1_number, stat_1_label, stat_2_number, stat_2_label, stat_3_number, stat_3_label,
                         image_path, floating_icon, floating_title, floating_desc, glow_class, sort_order, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    ['Upcoming Event', 'event-badge', 'Junior Programmer <span>Bootcamp.</span>',
                     "Launch your child's coding journey! Our interactive programmer workshops introduce python, scratch, and web design.",
                     'Enroll in Coding Program', '#contact', 'View Syllabus', '#curriculum',
                     'June 15', 'Start Date', 'Ages 8-18', 'Target Groups', 'Hands-on', 'Project Based',
                     '/images/hero-img.webp', '🚀', 'New Batch', 'Starting Soon', 'glow-green', 1, 1]
                );
                console.log('✨ Seeded default highlights banner in MySQL.');
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
                        badge_text TEXT NOT NULL,
                        badge_class TEXT NOT NULL DEFAULT 'event-badge',
                        title TEXT NOT NULL,
                        subtitle TEXT NOT NULL,
                        btn_primary_text TEXT DEFAULT NULL,
                        btn_primary_link TEXT DEFAULT NULL,
                        btn_secondary_text TEXT DEFAULT NULL,
                        btn_secondary_link TEXT DEFAULT NULL,
                        stat_1_number TEXT DEFAULT NULL,
                        stat_1_label TEXT DEFAULT NULL,
                        stat_2_number TEXT DEFAULT NULL,
                        stat_2_label TEXT DEFAULT NULL,
                        stat_3_number TEXT DEFAULT NULL,
                        stat_3_label TEXT DEFAULT NULL,
                        image_path TEXT DEFAULT NULL,
                        floating_icon TEXT DEFAULT NULL,
                        floating_title TEXT DEFAULT NULL,
                        floating_desc TEXT DEFAULT NULL,
                        glow_class TEXT DEFAULT 'glow-green',
                        sort_order INTEGER DEFAULT 0,
                        is_active INTEGER DEFAULT 1,
                        start_date DATETIME DEFAULT NULL,
                        end_date DATETIME DEFAULT NULL
                    )
                `);

                // Seed default banner in SQLite if empty
                const bannerCount = await dbConnection.get('SELECT COUNT(*) as count FROM highlights_banners');
                if (bannerCount.count === 0) {
                    await dbConnection.run(`
                        INSERT INTO highlights_banners
                            (badge_text, badge_class, title, subtitle, btn_primary_text, btn_primary_link, btn_secondary_text, btn_secondary_link,
                             stat_1_number, stat_1_label, stat_2_number, stat_2_label, stat_3_number, stat_3_label,
                             image_path, floating_icon, floating_title, floating_desc, glow_class, sort_order, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        ['Upcoming Event', 'event-badge', 'Junior Programmer <span>Bootcamp.</span>',
                         "Launch your child's coding journey! Our interactive programmer workshops introduce python, scratch, and web design.",
                         'Enroll in Coding Program', '#contact', 'View Syllabus', '#curriculum',
                         'June 15', 'Start Date', 'Ages 8-18', 'Target Groups', 'Hands-on', 'Project Based',
                         '/images/hero-img.webp', '🚀', 'New Batch', 'Starting Soon', 'glow-green', 1, 1]
                    );
                    console.log('✨ Seeded default highlights banner in SQLite.');
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


// Helper to resolve country from client timezone
function resolveCountry(timezone) {
    if (!timezone) return { name: 'Kenya', flag: '🇰🇪' };
    
    const tz = timezone.toLowerCase();
    if (tz.includes('nairobi')) return { name: 'Kenya', flag: '🇰🇪' };
    if (tz.includes('kampala')) return { name: 'Uganda', flag: '🇺🇬' };
    if (tz.includes('dar_es_salaam')) return { name: 'Tanzania', flag: '🇹🇿' };
    if (tz.includes('kigali')) return { name: 'Rwanda', flag: '🇷🇼' };
    if (tz.includes('london')) return { name: 'United Kingdom', flag: '🇬🇧' };
    if (tz.includes('america/') || tz.includes('us/')) return { name: 'United States', flag: '🇺🇸' };
    if (tz.includes('paris')) return { name: 'France', flag: '🇫🇷' };
    if (tz.includes('berlin')) return { name: 'Germany', flag: '🇩🇪' };
    if (tz.includes('tokyo')) return { name: 'Japan', flag: '🇯🇵' };
    if (tz.includes('harare') || tz.includes('johannesburg') || tz.includes('cairo')) return { name: 'South Africa', flag: '🇿🇦' };
    
    return { name: 'Kenya', flag: '🇰🇪' }; // Default fallback
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

// 2. Analytics Session Registration
app.post('/api/analytics/session', async (req, res) => {
    const { sessionKey, referrer, timezone } = req.body;
    if (!sessionKey) return res.status(400).json({ error: 'Session key is required.' });
    
    const uaString = req.headers['user-agent'] || '';
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const parsedUa = parseUserAgent(uaString);
    const country = resolveCountry(timezone);
    
    try {
        await db.query(
            'INSERT INTO analytics_sessions (session_key, ip_address, user_agent, browser, os, device, referrer, country_name, country_flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP',
            [sessionKey, ip, uaString, parsedUa.browser, parsedUa.os, parsedUa.device, referrer || '', country.name, country.flag]
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

// Get Analytics & Dashboard Statistics (Google Analytics Style)
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const bookings = await db.query('SELECT * FROM bookings ORDER BY created_at DESC');
        const sessions = await db.query('SELECT * FROM analytics_sessions ORDER BY created_at DESC');
        const events = await db.query('SELECT * FROM analytics_events ORDER BY created_at DESC');
        
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
        
        // 8. Timeline (Recent 7 days)
        const timeline = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            timeline[dateStr] = { pageviews: 0, sessions: 0 };
        }
        
        sessions.forEach(s => {
            const dateStr = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (timeline[dateStr]) {
                timeline[dateStr].sessions++;
            }
        });
        
        events.forEach(e => {
            if (e.event_type === 'pageview') {
                const dateStr = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (timeline[dateStr]) {
                    timeline[dateStr].pageviews++;
                }
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
            .sort((a, b) => a.sort_order - b.sort_order);
        res.json(activeBanners);
    } catch (err) {
        console.error('Error fetching highlights banners:', err);
        res.status(500).json({ error: 'Failed to retrieve banners.' });
    }
});

// 2. Admin: Get all banners
app.get('/api/admin/banners', requireAdmin, async (req, res) => {
    try {
        const banners = await db.query('SELECT * FROM highlights_banners ORDER BY sort_order ASC');
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
            badge_text, badge_class, title, subtitle,
            btn_primary_text, btn_primary_link, btn_secondary_text, btn_secondary_link,
            stat_1_number, stat_1_label, stat_2_number, stat_2_label, stat_3_number, stat_3_label,
            floating_icon, floating_title, floating_desc, glow_class, sort_order,
            is_active, start_date, end_date
        } = req.body;

        if (!badge_text || !title || !subtitle) {
            return res.status(400).json({ error: 'badge_text, title, and subtitle are required.' });
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : (req.body.image_path || null);

        const result = await db.query(`
            INSERT INTO highlights_banners
                (badge_text, badge_class, title, subtitle,
                 btn_primary_text, btn_primary_link, btn_secondary_text, btn_secondary_link,
                 stat_1_number, stat_1_label, stat_2_number, stat_2_label, stat_3_number, stat_3_label,
                 image_path, floating_icon, floating_title, floating_desc, glow_class, sort_order,
                 is_active, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [badge_text, badge_class || 'event-badge', title, subtitle,
             btn_primary_text || null, btn_primary_link || null, btn_secondary_text || null, btn_secondary_link || null,
             stat_1_number || null, stat_1_label || null, stat_2_number || null, stat_2_label || null, stat_3_number || null, stat_3_label || null,
             imagePath, floating_icon || null, floating_title || null, floating_desc || null,
             glow_class || 'glow-green', parseInt(sort_order) || 0,
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
            badge_text, badge_class, title, subtitle,
            btn_primary_text, btn_primary_link, btn_secondary_text, btn_secondary_link,
            stat_1_number, stat_1_label, stat_2_number, stat_2_label, stat_3_number, stat_3_label,
            floating_icon, floating_title, floating_desc, glow_class, sort_order,
            is_active, start_date, end_date
        } = req.body;

        const imagePath = req.file ? `/uploads/${req.file.filename}` : (existingBanner.image_path);

        await db.query(`
            UPDATE highlights_banners SET
                badge_text = ?, badge_class = ?, title = ?, subtitle = ?,
                btn_primary_text = ?, btn_primary_link = ?, btn_secondary_text = ?, btn_secondary_link = ?,
                stat_1_number = ?, stat_1_label = ?, stat_2_number = ?, stat_2_label = ?, stat_3_number = ?, stat_3_label = ?,
                image_path = ?, floating_icon = ?, floating_title = ?, floating_desc = ?, glow_class = ?, sort_order = ?,
                is_active = ?, start_date = ?, end_date = ?
            WHERE id = ?`,
            [badge_text, badge_class || 'event-badge', title, subtitle,
             btn_primary_text || null, btn_primary_link || null, btn_secondary_text || null, btn_secondary_link || null,
             stat_1_number || null, stat_1_label || null, stat_2_number || null, stat_2_label || null, stat_3_number || null, stat_3_label || null,
             imagePath, floating_icon || null, floating_title || null, floating_desc || null,
             glow_class || 'glow-green', parseInt(sort_order) || 0,
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
