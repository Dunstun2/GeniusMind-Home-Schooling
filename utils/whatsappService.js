// WhatsApp Service - Baileys implementation for cPanel production compatibility.
// No Puppeteer/Chromium dependencies needed.
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');

const sessionPath = path.join(__dirname, '..', '.wwebjs_auth');

let whatsappAvailable = false;
if (process.env.DISABLE_WHATSAPP === 'true') {
    console.warn('📱 WhatsApp is disabled via DISABLE_WHATSAPP environment variable.');
} else {
    try {
        require('@whiskeysockets/baileys');
        whatsappAvailable = true;
    } catch (e) {
        console.warn('⚠️ @whiskeysockets/baileys not available. WhatsApp notifications are disabled.');
    }
}

class WhatsAppService {
    constructor() {
        this.client = null;
        this.status = 'disconnected'; // 'disconnected', 'authenticating', 'ready', 'error', 'unavailable'
        this.qrCodeDataUrl = null;
        this.isDisconnecting = false;

        if (!whatsappAvailable) {
            this.status = 'unavailable';
        }
    }

    async initialize() {
        if (!whatsappAvailable || process.env.DISABLE_WHATSAPP === 'true') {
            console.warn('⚠️ WhatsApp unavailable or disabled: @whiskeysockets/baileys not installed or DISABLE_WHATSAPP is true.');
            this.status = 'unavailable';
            return;
        }

        console.log('📱 Initializing WhatsApp Web Client via Baileys...');
        this.status = 'disconnected';

        try {
            // Fetch the latest WhatsApp Web version to prevent 405 Method Not Allowed errors
            const { version } = await fetchLatestBaileysVersion();
            console.log(`📱 Using WhatsApp Web version: ${version.join('.')}`);

            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

            this.client = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }), // Suppress Baileys verbose logs
                browser: ['Genius Minds', 'Chrome', '120.0.0'],
                printQRInTerminal: false
            });

            this.client.ev.on('creds.update', saveCreds);

            this.client.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log('📱 New WhatsApp QR Code generated!');
                    this.status = 'authenticating';
                    try {
                        this.qrCodeDataUrl = await qrcode.toDataURL(qr);
                    } catch (err) {
                        console.error('Failed to generate QR Data URL:', err);
                    }
                }

                if (connection === 'open') {
                    console.log('✅ WhatsApp Client is ready!');
                    this.status = 'ready';
                    this.qrCodeDataUrl = null;
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    console.warn(`⚠️ WhatsApp Client connection closed. Reason Code: ${statusCode}. Reconnecting: ${shouldReconnect}`);
                    
                    this.status = 'disconnected';
                    this.qrCodeDataUrl = null;

                    if (this.isDisconnecting) {
                        console.log('📱 Disconnect triggered manually, skipping auto-reinitialize.');
                        return;
                    }

                    if (shouldReconnect) {
                        setTimeout(() => this.initialize(), 5000);
                    } else {
                        console.log('📱 Logged out of WhatsApp. Cleaning up session and generating new QR...');
                        this.cleanSessionDir();
                        setTimeout(() => this.initialize(), 2000);
                    }
                }
            });
        } catch (err) {
            console.error('Failed to initialize WhatsApp client:', err);
            this.status = 'error';
        }
    }

    cleanSessionDir() {
        try {
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log('✅ Cleaned up WhatsApp session directory.');
            }
        } catch (fsErr) {
            console.error('❌ Failed to delete session directory:', fsErr);
        }
    }

    formatPhoneNumber(phone) {
        if (!phone) return null;
        
        // Remove all non-numeric characters
        let cleaned = phone.replace(/\D/g, '');
        
        // Handle Kenyan numbers
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.substring(1);
        } else if (!cleaned.startsWith('254') && cleaned.length === 9) {
            cleaned = '254' + cleaned;
        }
        
        return cleaned + '@s.whatsapp.net';
    }

    async sendMessage(phone, message) {
        if (!whatsappAvailable || this.status === 'unavailable') {
            console.log(`📱 [WhatsApp disabled] Would have sent to ${phone}: ${message.substring(0, 80)}...`);
            return false;
        }

        if (this.status !== 'ready' || !this.client) {
            console.warn(`⚠️ Cannot send WhatsApp message to ${phone}: Client not ready. Status: ${this.status}`);
            return false;
        }

        const formattedPhone = this.formatPhoneNumber(phone);
        if (!formattedPhone) return false;

        try {
            await this.client.sendMessage(formattedPhone, { text: message });
            console.log(`📱 WhatsApp message sent to ${formattedPhone}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to send WhatsApp message to ${formattedPhone}:`, error);
            return false;
        }
    }

    async disconnect() {
        if (!whatsappAvailable || !this.client) return;

        console.log('📱 Disconnecting WhatsApp Client...');
        this.isDisconnecting = true;
        this.status = 'disconnected';
        this.qrCodeDataUrl = null;
        
        try {
            await this.client.logout();
            console.log('✅ WhatsApp Client logged out successfully.');
        } catch (err) {
            console.error('❌ Error logging out WhatsApp Client:', err);
        }

        try {
            this.client.end(undefined);
            console.log('✅ WhatsApp Client socket ended.');
        } catch (err) {
            // Ignore socket end errors
        }

        this.cleanSessionDir();
        this.client = null;
        this.isDisconnecting = false;
        
        // Reinitialize to generate a new QR code immediately
        this.initialize();
    }

    getStatus() {
        return {
            status: this.status,
            qrCode: this.qrCodeDataUrl
        };
    }
}

// Export a singleton instance
module.exports = new WhatsAppService();
