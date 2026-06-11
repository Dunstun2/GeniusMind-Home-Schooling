const mysql = require('mysql2/promise');
require('dotenv').config({ override: true });

async function check() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'genius_minds_db'
        });
        const [rows] = await connection.query('SELECT * FROM analytics_sessions');
        console.log('Sessions:', rows);
        await connection.end();
    } catch (e) {
        console.error('Error:', e.message);
    }
}
check();
