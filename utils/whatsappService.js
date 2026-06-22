const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.status = 'disconnected'; // 'disconnected', 'authenticating', 'ready', 'error'
        this.qrCodeDataUrl = null;
        this.isDisconnecting = false;
    }

    initialize() {
        console.log('📱 Initializing WhatsApp Web Client...');
        
        this.client = new Client({
            authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
            puppeteer: {
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.client.on('qr', async (qr) => {
            console.log('📱 Scan the QR code below to authenticate WhatsApp:');
            qrcodeTerminal.generate(qr, { small: true });
            this.status = 'authenticating';
            
            try {
                this.qrCodeDataUrl = await qrcode.toDataURL(qr);
            } catch (err) {
                console.error('Failed to generate QR Data URL:', err);
            }
        });

        this.client.on('ready', () => {
            console.log('✅ WhatsApp Client is ready!');
            this.status = 'ready';
            this.qrCodeDataUrl = null;
        });

        this.client.on('authenticated', () => {
            console.log('✅ WhatsApp Authenticated!');
        });

        this.client.on('auth_failure', (msg) => {
            console.error('❌ WhatsApp Authentication failure:', msg);
            this.status = 'error';
        });

        this.client.on('disconnected', (reason) => {
            console.warn('⚠️ WhatsApp Client was disconnected:', reason);
            this.status = 'disconnected';
            this.qrCodeDataUrl = null;
            
            if (this.isDisconnecting) {
                console.log('📱 Disconnect triggered manually, skipping auto-reinitialize in event handler.');
                return;
            }
            
            // Try to reinitialize after some time
            setTimeout(() => {
                this.initialize();
            }, 5000);
        });

        this.client.initialize().catch(err => {
            console.error('Failed to initialize WhatsApp client:', err);
            this.status = 'error';
        });
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
        
        return cleaned + '@c.us';
    }

    async sendMessage(phone, message) {
        if (this.status !== 'ready' || !this.client) {
            console.warn(`⚠️ Cannot send WhatsApp message to ${phone}: Client not ready. Status: ${this.status}`);
            return false;
        }

        const formattedPhone = this.formatPhoneNumber(phone);
        if (!formattedPhone) return false;

        try {
            await this.client.sendMessage(formattedPhone, message);
            console.log(`📱 WhatsApp message sent to ${formattedPhone}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to send WhatsApp message to ${formattedPhone}:`, error);
            return false;
        }
    }

    async disconnect() {
        if (this.client) {
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
                await this.client.destroy();
                console.log('✅ WhatsApp Client Puppeteer browser destroyed.');
            } catch (destroyErr) {
                console.error('❌ Error destroying WhatsApp Client:', destroyErr);
            }
            
            // Force clean up of session files to prevent stale logins
            try {
                const fs = require('fs');
                const path = require('path');
                const sessionPath = path.join(__dirname, '..', '.wwebjs_auth');
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    console.log('✅ Cleaned up WhatsApp session directory.');
                }
            } catch (fsErr) {
                console.error('❌ Failed to delete session directory:', fsErr);
            }

            this.isDisconnecting = false;
            this.initialize();
        }
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
