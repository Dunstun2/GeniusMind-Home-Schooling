const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
require('dotenv').config({ override: true });

const app = express();
const PORT = process.env.PORT || 3000;

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
// DUAL-MODE DATABASE ADAPTER (MySQL & Memory)
// ==========================================
let dbMode = 'memory'; // 'mysql' or 'memory'
let pool = null;

// In-Memory Database fallback data structures
const memDb = {
    bookings: [],
    email_logs: [],
    analytics_sessions: [],
    analytics_events: [],
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

// Seed default highlights banners in-memory
memDb.highlights_banners = [
    {
        id: 1,
        badge_text: 'Upcoming Event',
        badge_class: 'event-badge',
        title: 'Junior Programmer <span>Bootcamp.</span>',
        subtitle: "Launch your child's coding journey! Our interactive programmer workshops introduce python, scratch, and web design, building critical logical skills for the future.",
        btn_primary_text: 'Enroll in Coding Program',
        btn_primary_link: '#contact',
        btn_secondary_text: 'View Syllabus',
        btn_secondary_link: '#curriculum',
        stat_1_number: 'June 15',
        stat_1_label: 'Start Date',
        stat_2_number: 'Ages 8-18',
        stat_2_label: 'Target Groups',
        stat_3_number: 'Hands-on',
        stat_3_label: 'Project Based',
        image_path: 'assets/images/upcoming_coder.png',
        floating_icon: '💻',
        floating_title: 'Python & Web',
        floating_desc: 'Weekend Workshops',
        glow_class: 'glow-purple',
        sort_order: 1,
        is_active: 1,
        start_date: null,
        end_date: null,
        created_at: new Date()
    },
    {
        id: 2,
        badge_text: 'Outstanding Achievement',
        badge_class: 'success-badge',
        title: 'Outstanding IGCSE <span>Triumphs.</span>',
        subtitle: 'We celebrate academic excellence! Our IGCSE student Esther W. scored an outstanding 98% in Mathematics under customized Genius Minds personal tutoring.',
        btn_primary_text: 'Request Personal Tutor',
        btn_primary_link: '#contact',
        btn_secondary_text: 'Our Success Stories',
        btn_secondary_link: '#about',
        stat_1_number: '98%',
        stat_1_label: 'Highest Score',
        stat_2_number: 'A+ Grade',
        stat_2_label: 'Average Performance',
        stat_3_number: '1-on-1',
        stat_3_label: 'Personalized Care',
        image_path: 'assets/images/achievement_trophy.png',
        floating_icon: '🏆',
        floating_title: 'IGCSE Maths',
        floating_desc: 'Esther W. 98%',
        glow_class: 'glow-green',
        sort_order: 2,
        is_active: 1,
        start_date: null,
        end_date: null,
        created_at: new Date()
    },
    {
        id: 3,
        badge_text: 'Enrollment Announcement',
        badge_class: 'announce-badge',
        title: 'Term 3 Admissions <span>Now Open.</span>',
        subtitle: 'Enrollments for Online, Home-based, and Physical center tutoring classes are open. We support IGCSE, CBE/CBC, and the 8-4-4 systems. Secure your child\'s success today!',
        btn_primary_text: 'Book a Free Session',
        btn_primary_link: '#contact',
        btn_secondary_text: 'Explore Formats',
        btn_secondary_link: '#services',
        stat_1_number: 'Active',
        stat_1_label: 'Admissions Status',
        stat_2_number: 'Online/Home',
        stat_2_label: 'Flexible Formats',
        stat_3_number: 'Affordable',
        stat_3_label: 'Flexible Payments',
        image_path: 'assets/images/announcement_bell.png',
        floating_icon: '🔔',
        floating_title: 'Admissions Open',
        floating_desc: 'CBE, IGCSE & 8-4-4',
        glow_class: 'glow-orange',
        sort_order: 3,
        is_active: 1,
        start_date: null,
        end_date: null,
        created_at: new Date()
    }
];

// Helper functions for query/insert operations abstracting MySQL vs Memory
const db = {
    async query(sql, params = []) {
        if (dbMode === 'mysql') {
            const [rows] = await pool.execute(sql, params);
            return rows;
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
                    status: 'pending',
                    created_at: new Date()
                };
                memDb.bookings.push(record);
                return { insertId: id };
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

            if (sqlUpper.startsWith('INSERT INTO BOOKINGS')) {
                const id = memDb.bookings.length + 1;
                const record = {
                    id,
                    name: params[0],
                    email: params[1],
                    phone: params[2],
                    service: params[3],
                    message: params[4] || '',
                    status: 'pending',
                    created_at: new Date()
                };
                memDb.bookings.push(record);
                return { insertId: id };
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
                    error_message: params[5] || null,
                    created_at: new Date()
                };
                memDb.email_logs.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('SELECT * FROM EMAIL_LOGS ORDER BY CREATED_AT DESC')) {
                return [...memDb.email_logs].sort((a, b) => b.created_at - a.created_at);
            }

            if (sqlUpper.startsWith('SELECT * FROM ANALYTICS_SESSIONS')) {
                return [...memDb.analytics_sessions].sort((a, b) => b.created_at - a.created_at);
            }

            if (sqlUpper.startsWith('SELECT * FROM ANALYTICS_EVENTS')) {
                return [...memDb.analytics_events].sort((a, b) => b.created_at - a.created_at);
            }

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
                    sort_order: params[19] || 0,
                    is_active: params[20] !== undefined ? params[20] : 1,
                    start_date: params[21] || null,
                    end_date: params[22] || null,
                    created_at: new Date()
                };
                memDb.highlights_banners.push(record);
                return { insertId: id };
            }

            if (sqlUpper.startsWith('UPDATE HIGHLIGHTS_BANNERS')) {
                const id = params[23];
                const banner = memDb.highlights_banners.find(b => b.id == id);
                if (banner) {
                    banner.badge_text = params[0];
                    banner.badge_class = params[1];
                    banner.title = params[2];
                    banner.subtitle = params[3];
                    banner.btn_primary_text = params[4];
                    banner.btn_primary_link = params[5];
                    banner.btn_secondary_text = params[6];
                    banner.btn_secondary_link = params[7];
                    banner.stat_1_number = params[8];
                    banner.stat_1_label = params[9];
                    banner.stat_2_number = params[10];
                    banner.stat_2_label = params[11];
                    banner.stat_3_number = params[12];
                    banner.stat_3_label = params[13];
                    banner.image_path = params[14];
                    banner.floating_icon = params[15];
                    banner.floating_title = params[16];
                    banner.floating_desc = params[17];
                    banner.glow_class = params[18];
                    banner.sort_order = params[19];
                    banner.is_active = params[20];
                    banner.start_date = params[21] || null;
                    banner.end_date = params[22] || null;
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

            if (sqlUpper.startsWith('UPDATE HIGHLIGHTS_BANNERS SET IS_ACTIVE')) {
                const banner = memDb.highlights_banners.find(b => b.id == params[1]);
                if (banner) {
                    banner.is_active = params[0];
                    return { affectedRows: 1 };
                }
                return { affectedRows: 0 };
            }

            return [];
        }
    }
};

// Initial database connection and tables creation
async function initDatabase() {
    const dbConfig = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    };

    try {
        console.log('🔄 Connecting to MySQL server...');
        // First connect without database name to ensure db exists
        const tempConn = await mysql.createConnection(dbConfig);
        await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'genius_minds_db'}\``);
        await tempConn.end();

        // Connect to the specific database
        pool = mysql.createPool({
            ...dbConfig,
            database: process.env.DB_NAME || 'genius_minds_db',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // Initialize Tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                service VARCHAR(100) NOT NULL,
                message TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS email_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT,
                recipient VARCHAR(255) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                body TEXT,
                status VARCHAR(50) NOT NULL,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS analytics_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_key VARCHAR(255) UNIQUE NOT NULL,
                ip_address VARCHAR(100),
                user_agent TEXT,
                browser VARCHAR(100),
                os VARCHAR(100),
                device VARCHAR(100),
                referrer TEXT,
                country_name VARCHAR(100) DEFAULT 'Kenya',
                country_flag VARCHAR(10) DEFAULT '🇰🇪',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS analytics_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_key VARCHAR(255) NOT NULL,
                event_type VARCHAR(100) NOT NULL,
                event_name VARCHAR(100) NOT NULL,
                event_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS highlights_banners (
                id INT AUTO_INCREMENT PRIMARY KEY,
                badge_text VARCHAR(255) NOT NULL,
                badge_class VARCHAR(100) NOT NULL,
                title VARCHAR(255) NOT NULL,
                subtitle TEXT NOT NULL,
                btn_primary_text VARCHAR(255),
                btn_primary_link VARCHAR(255),
                btn_secondary_text VARCHAR(255),
                btn_secondary_link VARCHAR(255),
                stat_1_number VARCHAR(100),
                stat_1_label VARCHAR(100),
                stat_2_number VARCHAR(100),
                stat_2_label VARCHAR(100),
                stat_3_number VARCHAR(100),
                stat_3_label VARCHAR(100),
                image_path VARCHAR(255) NOT NULL,
                floating_icon VARCHAR(10),
                floating_title VARCHAR(255),
                floating_desc VARCHAR(255),
                glow_class VARCHAR(100) NOT NULL,
                sort_order INT DEFAULT 0,
                is_active TINYINT DEFAULT 1,
                start_date DATETIME NULL,
                end_date DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Run migrations/ALTER commands to update existing DB if tables already existed
        try {
            await pool.query("ALTER TABLE analytics_sessions ADD COLUMN country_name VARCHAR(100) DEFAULT 'Kenya'");
        } catch (e) { /* ignore duplicate column */ }
        try {
            await pool.query("ALTER TABLE analytics_sessions ADD COLUMN country_flag VARCHAR(10) DEFAULT '🇰🇪'");
        } catch (e) { /* ignore duplicate column */ }
        try {
            await pool.query("ALTER TABLE highlights_banners ADD COLUMN is_active TINYINT DEFAULT 1");
        } catch (e) { /* ignore */ }
        try {
            await pool.query("ALTER TABLE highlights_banners ADD COLUMN start_date DATETIME NULL");
        } catch (e) { /* ignore */ }
        try {
            await pool.query("ALTER TABLE highlights_banners ADD COLUMN end_date DATETIME NULL");
        } catch (e) { /* ignore */ }

        // Check if admin user exists, if not seed default
        const [rows] = await pool.query('SELECT * FROM admin_users WHERE username = ?', [defaultUsername]);
        if (rows.length === 0) {
            await pool.query('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [
                defaultUsername,
                defaultPasswordHash
            ]);
            console.log(`👤 Seeded default admin user: "${defaultUsername}" / "${defaultPassword}"`);
        }

        // Check if highlights_banners is empty, if so seed defaults
        const [bannerRows] = await pool.query('SELECT COUNT(*) as count FROM highlights_banners');
        if (bannerRows[0].count === 0) {
            const defaultBanners = [
                [
                    'Upcoming Event', 'event-badge', 'Junior Programmer <span>Bootcamp.</span>',
                    "Launch your child's coding journey! Our interactive programmer workshops introduce python, scratch, and web design, building critical logical skills for the future.",
                    'Enroll in Coding Program', '#contact', 'View Syllabus', '#curriculum',
                    'June 15', 'Start Date', 'Ages 8-18', 'Target Groups', 'Hands-on', 'Project Based',
                    'assets/images/upcoming_coder.png', '💻', 'Python & Web', 'Weekend Workshops', 'glow-purple', 1, 1, null, null
                ],
                [
                    'Outstanding Achievement', 'success-badge', 'Outstanding IGCSE <span>Triumphs.</span>',
                    'We celebrate academic excellence! Our IGCSE student Esther W. scored an outstanding 98% in Mathematics under customized Genius Minds personal tutoring.',
                    'Request Personal Tutor', '#contact', 'Our Success Stories', '#about',
                    '98%', 'Highest Score', 'A+ Grade', 'Average Performance', '1-on-1', 'Personalized Care',
                    'assets/images/achievement_trophy.png', '🏆', 'IGCSE Maths', 'Esther W. 98%', 'glow-green', 2, 1, null, null
                ],
                [
                    'Enrollment Announcement', 'announce-badge', 'Term 3 Admissions <span>Now Open.</span>',
                    'Enrollments for Online, Home-based, and Physical center tutoring classes are open. We support IGCSE, CBE/CBC, and the 8-4-4 systems. Secure your child\'s success today!',
                    'Book a Free Session', '#contact', 'Explore Formats', '#services',
                    'Active', 'Admissions Status', 'Online/Home', 'Flexible Formats', 'Affordable', 'Flexible Payments',
                    'assets/images/announcement_bell.png', '🔔', 'Admissions Open', 'CBE, IGCSE & 8-4-4', 'glow-orange', 3, 1, null, null
                ]
            ];

            for (const banner of defaultBanners) {
                await pool.query(`
                    INSERT INTO highlights_banners (
                        badge_text, badge_class, title, subtitle,
                        btn_primary_text, btn_primary_link, btn_secondary_text, btn_secondary_link,
                        stat_1_number, stat_1_label, stat_2_number, stat_2_label, stat_3_number, stat_3_label,
                        image_path, floating_icon, floating_title, floating_desc, glow_class, sort_order,
                        is_active, start_date, end_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, banner);
            }
            console.log('✨ Seeded default highlights banners in MySQL.');
        }

        dbMode = 'mysql';
        console.log('✅ Connected to MySQL successfully. Running in DATABASE mode.');
    } catch (err) {
        console.error('⚠️ MySQL Connection Failed:', err.message);
        console.warn('⚠️ Falling back to IN-MEMORY storage. All database operations will work but will reset on server restart.');
        dbMode = 'memory';
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
        // Insert into database
        const result = await db.query(
            'INSERT INTO bookings (name, email, phone, service, message) VALUES (?, ?, ?, ?, ?)',
            [name, email, phone, service, message || '']
        );
        const bookingId = result.insertId;
        
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
        
        res.json({ success: true, bookingId });
    } catch (err) {
        console.error('Error creating booking request:', err);
        res.status(500).json({ error: 'Failed to process booking request.' });
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

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer upload setup using memory storage
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// HIGHLIGHTS BANNER APIS
// ==========================================

// 1. Get Public Highlights Banners (Filtered by visibility and scheduled times)
app.get('/api/banners', async (req, res) => {
    try {
        const banners = await db.query('SELECT * FROM highlights_banners');
        const now = new Date();
        const activeBanners = banners
            .filter(b => {
                // Check active status (default to 1 if not set)
                const isActive = b.is_active === undefined || b.is_active == 1;
                // Check start date (if set, now must be >= start_date)
                const hasStarted = !b.start_date || now >= new Date(b.start_date);
                // Check end date (if set, now must be <= end_date)
                const hasEnded = !b.end_date || now <= new Date(b.end_date);
                
                return isActive && hasStarted && hasEnded;
            })
            .sort((a, b) => a.sort_order - b.sort_order);
            
        res.json(activeBanners);
    } catch (err) {
        console.error('Error fetching highlights banners:', err);
        res.status(500).json({ error: 'Failed to retrieve banners.' });
    }
});

// 2. Get Admin Banners
app.get('/api/admin/banners', requireAdmin, async (req, res) => {
    try {
        const banners = await db.query('SELECT * FROM highlights_banners ORDER BY sort_order ASC');
        res.json(banners);
    } catch (err) {
        console.error('Error fetching admin highlights banners:', err);
        res.status(500).json({ error: 'Failed to retrieve banners.' });
    }
});

// 3. Create Highlights Banner
app.post('/api/admin/banners', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const {
            badge_text,
            badge_class,
            title,
            subtitle,
            btn_primary_text,
            btn_primary_link,
            btn_secondary_text,
            btn_secondary_link,
            stat_1_number,
            stat_1_label,
            stat_2_number,
            stat_2_label,
            stat_3_number,
            stat_3_label,
            floating_icon,
            floating_title,
            floating_desc,
            glow_class,
            sort_order,
            is_active,
            start_date,
            end_date
        } = req.body;

        if (!badge_text || !badge_class || !title || !subtitle || !glow_class) {
            return res.status(400).json({ error: 'Missing required banner text fields.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Banner image is required.' });
        }

        // Process image using sharp: crop/resize to 800x800 cover fit, compress to WebP
        const filename = `banner_${Date.now()}.webp`;
        const filepath = path.join(uploadsDir, filename);

        await sharp(req.file.buffer)
            .resize(800, 800, {
                fit: 'cover',
                position: 'center'
            })
            .webp({ quality: 85 })
            .toFile(filepath);

        const image_path = `uploads/${filename}`;

        // Insert into database
        await db.query(`
            INSERT INTO highlights_banners (
                badge_text, badge_class, title, subtitle,
                btn_primary_text, btn_primary_link, btn_secondary_text, btn_secondary_link,
                stat_1_number, stat_1_label, stat_2_number, stat_2_label, stat_3_number, stat_3_label,
                image_path, floating_icon, floating_title, floating_desc, glow_class, sort_order,
                is_active, start_date, end_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            badge_text, badge_class, title, subtitle,
            btn_primary_text || '', btn_primary_link || '', btn_secondary_text || '', btn_secondary_link || '',
            stat_1_number || '', stat_1_label || '', stat_2_number || '', stat_2_label || '', stat_3_number || '', stat_3_label || '',
            image_path, floating_icon || '', floating_title || '', floating_desc || '', glow_class, parseInt(sort_order) || 0,
            is_active !== undefined ? parseInt(is_active) : 1,
            start_date ? new Date(start_date) : null,
            end_date ? new Date(end_date) : null
        ]);

        res.json({ success: true, image_path });
    } catch (err) {
        console.error('Error creating banner:', err);
        res.status(500).json({ error: 'Failed to create banner: ' + err.message });
    }
});

// 4. Update Highlights Banner
app.put('/api/admin/banners/:id', requireAdmin, upload.single('image'), async (req, res) => {
    const bannerId = req.params.id;
    try {
        // Find existing banner
        const banners = await db.query('SELECT * FROM highlights_banners');
        const existingBanner = banners.find(b => b.id == bannerId);
        
        if (!existingBanner) {
            return res.status(404).json({ error: 'Banner not found.' });
        }

        const {
            badge_text,
            badge_class,
            title,
            subtitle,
            btn_primary_text,
            btn_primary_link,
            btn_secondary_text,
            btn_secondary_link,
            stat_1_number,
            stat_1_label,
            stat_2_number,
            stat_2_label,
            stat_3_number,
            stat_3_label,
            floating_icon,
            floating_title,
            floating_desc,
            glow_class,
            sort_order,
            is_active,
            start_date,
            end_date
        } = req.body;

        if (!badge_text || !badge_class || !title || !subtitle || !glow_class) {
            return res.status(400).json({ error: 'Missing required banner text fields.' });
        }

        let image_path = existingBanner.image_path;

        // If new file is uploaded
        if (req.file) {
            // Process and save new image
            const filename = `banner_${Date.now()}.webp`;
            const filepath = path.join(uploadsDir, filename);

            await sharp(req.file.buffer)
                .resize(800, 800, {
                    fit: 'cover',
                    position: 'center'
                })
                .webp({ quality: 85 })
                .toFile(filepath);

            image_path = `uploads/${filename}`;

            // Delete old image file if it's in the uploads directory
            if (existingBanner.image_path.startsWith('uploads/')) {
                const oldFilepath = path.join(__dirname, existingBanner.image_path);
                if (fs.existsSync(oldFilepath)) {
                    fs.unlinkSync(oldFilepath);
                }
            }
        }

        // Run query to update
        await db.query(`
            UPDATE highlights_banners SET
                badge_text = ?, badge_class = ?, title = ?, subtitle = ?,
                btn_primary_text = ?, btn_primary_link = ?, btn_secondary_text = ?, btn_secondary_link = ?,
                stat_1_number = ?, stat_1_label = ?, stat_2_number = ?, stat_2_label = ?, stat_3_number = ?, stat_3_label = ?,
                image_path = ?, floating_icon = ?, floating_title = ?, floating_desc = ?, glow_class = ?, sort_order = ?,
                is_active = ?, start_date = ?, end_date = ?
            WHERE id = ?
        `, [
            badge_text, badge_class, title, subtitle,
            btn_primary_text || '', btn_primary_link || '', btn_secondary_text || '', btn_secondary_link || '',
            stat_1_number || '', stat_1_label || '', stat_2_number || '', stat_2_label || '', stat_3_number || '', stat_3_label || '',
            image_path, floating_icon || '', floating_title || '', floating_desc || '', glow_class, parseInt(sort_order) || 0,
            is_active !== undefined ? parseInt(is_active) : 1,
            start_date ? new Date(start_date) : null,
            end_date ? new Date(end_date) : null,
            bannerId
        ]);

        res.json({ success: true, image_path });
    } catch (err) {
        console.error('Error updating banner:', err);
        res.status(500).json({ error: 'Failed to update banner: ' + err.message });
    }
});

// 5. Delete Highlights Banner
app.delete('/api/admin/banners/:id', requireAdmin, async (req, res) => {
    const bannerId = req.params.id;
    try {
        const banners = await db.query('SELECT * FROM highlights_banners');
        const existingBanner = banners.find(b => b.id == bannerId);
        
        if (!existingBanner) {
            return res.status(404).json({ error: 'Banner not found.' });
        }

        // Delete image file if it's in the uploads directory
        if (existingBanner.image_path.startsWith('uploads/')) {
            const oldFilepath = path.join(__dirname, existingBanner.image_path);
            if (fs.existsSync(oldFilepath)) {
                fs.unlinkSync(oldFilepath);
            }
        }

        // Delete from database
        await db.query('DELETE FROM highlights_banners WHERE id = ?', [bannerId]);

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting banner:', err);
        res.status(500).json({ error: 'Failed to delete banner.' });
    }
});

// 6. Toggle Banner Visibility (Show/Hide) — quick action without full form submit
app.patch('/api/admin/banners/:id/toggle', requireAdmin, async (req, res) => {
    const bannerId = req.params.id;
    try {
        const banners = await db.query('SELECT * FROM highlights_banners');
        const existingBanner = banners.find(b => b.id == bannerId);

        if (!existingBanner) {
            return res.status(404).json({ error: 'Banner not found.' });
        }

        const newStatus = existingBanner.is_active == 1 ? 0 : 1;

        await db.query(
            'UPDATE highlights_banners SET is_active = ? WHERE id = ?',
            [newStatus, bannerId]
        );

        res.json({ success: true, is_active: newStatus });
    } catch (err) {
        console.error('Error toggling banner visibility:', err);
        res.status(500).json({ error: 'Failed to toggle banner visibility.' });
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
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating booking status:', err);
        res.status(500).json({ error: 'Failed to update booking.' });
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

// ==========================================
// SERVING STATIC ASSETS & FILES
// ==========================================

// Route for static admin files (must be before the root static serving)
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Custom route to redirect users directly to admin panel login if not logged in
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

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
});
