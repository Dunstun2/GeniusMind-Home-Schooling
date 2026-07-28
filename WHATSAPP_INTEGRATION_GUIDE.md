# WhatsApp Integration Guide

## Overview
Your application uses **Baileys** (`@whiskeysockets/baileys`) to send WhatsApp messages. Baileys is a headless WhatsApp Web client that simulates WhatsApp Web without requiring Puppeteer/Chrome.

---

## Architecture

### 1. **WhatsApp Service** (`utils/whatsappService.js`)
A singleton service that manages the WhatsApp client lifecycle.

**Key Components:**
- **Status States:** 
  - `disconnected` - Initial or after disconnect
  - `authenticating` - Waiting for QR code scan
  - `ready` - Connected and ready to send messages
  - `error` - Connection error
  - `unavailable` - Baileys not installed or disabled

- **Session Storage:**
  - Credentials stored in `.wwebjs_auth/` directory
  - Sessions persist across server restarts
  - Automatic cleanup on logout

- **Auto-Reconnection:**
  - Retries every 5 seconds if disconnected (except logout)
  - Generates new QR code if session expires
  - Detects logout vs temporary disconnection

---

## How Messages Are Sent

### Flow:
```
User Action (Booking, Contact Form, etc.)
    ↓
Backend Handler (e.g., POST /api/bookings)
    ↓
whatsappService.sendMessage(phone, message)
    ↓
Format Phone Number (Convert to WhatsApp format)
    ↓
Check Connection Status
    ↓
Send via Baileys Client
    ↓
WhatsApp Servers
    ↓
Recipient's Phone
```

### Phone Number Formatting:
```javascript
// Converts various formats to WhatsApp format
+254743322975 → 254743322975@s.whatsapp.net
0743322975 → 254743322975@s.whatsapp.net
743322975 → 254743322975@s.whatsapp.net
```

---

## API Endpoints

### 1. Get WhatsApp Status
```
GET /api/admin/whatsapp/status
Headers: Authorization (admin only)

Response:
{
  "status": "ready|disconnected|authenticating|error|unavailable",
  "qrCode": "data:image/png;base64,..." (if authenticating)
}
```

### 2. Disconnect & Refresh
```
POST /api/admin/whatsapp/disconnect
Headers: Authorization (admin only)

Response:
{
  "success": true
}
```
- Logs out current session
- Cleans up `.wwebjs_auth/` directory
- Reinitializes and generates new QR code

---

## Current Issues & Error Logs

### Problem: "Bad MAC Error"
```
Error: Bad MAC Error: Bad MAC
  at Object.verifyMAC (/node_modules/libsignal/src/crypto.js:87:15)
```

**Causes:**
1. **Session Expired** - WhatsApp Web session no longer valid
2. **Device Logged Out** - Logged out from another session
3. **Protocol Mismatch** - Baileys version doesn't match WhatsApp Web version

**Solutions:**
1. **Disconnect & Reconnect:**
   ```bash
   curl -X POST http://localhost:3000/api/admin/whatsapp/disconnect \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

2. **Check Admin Dashboard:**
   - Go to `/admin/dashboard.html`
   - Look for WhatsApp status widget
   - If "Authenticating", scan the QR code with your phone

3. **Update Baileys:**
   ```bash
   npm update @whiskeysockets/baileys
   ```

---

## Connection Reason Codes

| Code | Meaning | Action |
|------|---------|--------|
| 401 | Logged Out | Manual logout - generate new QR |
| 408 | Request Timeout | Auto-reconnect |
| 500+ | Server Error | Auto-reconnect |
| None | Connection Open | Ready to send |

---

## Environment Variables

```env
# WhatsApp Configuration
DISABLE_WHATSAPP=false              # Set to 'true' to disable WhatsApp
WHATSAPP_ADMIN_PHONE=0140802797     # Admin's phone for receiving notifications

# WhatsApp will NOT work if:
DISABLE_WHATSAPP=true              # Explicitly disabled
```

---

## Current Implementation in Code

### Booking Notifications (server.js ~line 1637)
```javascript
// When booking created:
// 1. Send to admin
whatsappService.sendMessage(adminPhone, adminMsg);

// 2. Send to customer
whatsappService.sendMessage(phone, customerMsg);
```

### Banner CTA (banner-cta-handler.js ~line 13)
```javascript
'whatsapp_chat': {
    text: 'Chat on WhatsApp',
    handler: () => openWhatsApp()  // Frontend: Opens WhatsApp web link
}
```

---

## Troubleshooting Checklist

### ✅ WhatsApp not sending messages?

1. **Check WhatsApp Status**
   ```bash
   # SSH into server
   curl http://localhost:3000/api/admin/whatsapp/status
   ```

2. **Check Server Logs**
   ```bash
   tail -100 /home/vdranjxy/geniusminds/app-errors.log
   tail -100 /home/vdranjxy/geniusminds/stderr.log
   ```

3. **Is Status "ready"?**
   - If `authenticating`: Scan QR code from admin dashboard
   - If `disconnected`: Click "Disconnect" → wait → should reconnect

4. **Check Phone Number Format**
   - Must be valid Kenyan number (starts with 254 or 0)
   - Example: `0743322975` or `254743322975`

5. **Session Expired?**
   - Log out the phone running WhatsApp Web
   - Disconnect via API: `POST /api/admin/whatsapp/disconnect`
   - Scan new QR code

---

## What Causes "Connection Closed" Repeatedly?

### Reason Code 408 (Timeout):
- Network connectivity issues
- Firewall/proxy blocking
- WhatsApp Web rate limiting
- Auto-reconnects every 5 seconds

### Fix:
```bash
# Check network connectivity
ping 8.8.8.8

# Restart Node app
pm2 restart all

# Update Baileys (sometimes fixes protocol issues)
npm update @whiskeysockets/baileys
```

---

## Admin Dashboard WhatsApp Widget

Located in `/admin/dashboard.html`:
- **Status Display:** Shows current connection state
- **QR Code Scanner:** Appears when status is "authenticating"
- **Disconnect Button:** Logs out and generates new session
- **Auto-Polling:** Checks status every 2-20 seconds

JavaScript Handler: `admin/script.js` - `loadWhatsAppStatus()`

---

## Next Steps to Fix

1. **SSH to Production Server:**
   ```bash
   ssh vdranjxy@sbg106.sbg106.ovh.net
   cd /home/vdranjxy/geniusminds/vdranjxy/geniusminds
   source /home/vdranjxy/nodevenv/geniusminds/20/bin/activate
   ```

2. **Check Current Status:**
   ```bash
   curl http://localhost:3000/api/admin/whatsapp/status
   ```

3. **If Disconnected, Reinitialize:**
   ```bash
   curl -X POST http://localhost:3000/api/admin/whatsapp/disconnect
   ```

4. **Monitor Logs:**
   ```bash
   tail -f /home/vdranjxy/geniusminds/stderr.log
   ```

5. **Access Admin Dashboard:**
   - Open browser to admin dashboard
   - Wait for status to change to "authenticating"
   - Scan QR code with phone running WhatsApp

6. **Verify Connection:**
   ```bash
   curl http://localhost:3000/api/admin/whatsapp/status
   # Should return status: "ready"
   ```

---

## Key Files

| File | Purpose |
|------|---------|
| `utils/whatsappService.js` | WhatsApp client & message handling |
| `server.js` | API endpoints & message triggers |
| `admin/script.js` | Admin dashboard WhatsApp widget |
| `.wwebjs_auth/` | Session credentials (private, don't commit) |
| `.env` | Configuration (DISABLE_WHATSAPP, WHATSAPP_ADMIN_PHONE) |

---

## Disabled WhatsApp

If WhatsApp is disabled via `DISABLE_WHATSAPP=true`:
- Messages logged to console instead of sent
- No errors - graceful fallback
- Useful for development without real WhatsApp

