# Quick WhatsApp Reference

## Three Different WhatsApp Systems

### 1️⃣ **Booking Notifications** (Admin receives messages)
```
Customer Books → Backend sends WhatsApp → Admin gets notification
Location: .env file
Variable: WHATSAPP_ADMIN_PHONE=0140802797
```

### 2️⃣ **Backend Connection** (Can send messages)
```
Dashboard QR Code Scan → Backend connects to WhatsApp Web
Location: .wwebjs_auth/ directory  
Process: Admin scans QR → Status becomes "ready"
```

### 3️⃣ **Social Media Links** (Customers click to chat)
```
Website Footer/Contact → "Chat on WhatsApp" button
Location: social_media table
URL: https://wa.me/254743322975?text=Hello
```

---

## Current Setup

| System | Setting | Value | Location |
|--------|---------|-------|----------|
| **Booking Notifications** | Admin Phone | 0140802797 | `.env` |
| **Backend Connection** | Session Status | (variable) | Dashboard |
| **Social Media** | WhatsApp Link | Not added yet | Admin panel |

---

## Your Production Issue

### Error: "Connection closed. Reason Code: 408"

**What's happening:**
```
Backend lost connection to WhatsApp Web
↓
Cannot send booking notifications anymore
↓
New bookings not delivered to admin
```

### How to fix:
1. Open Admin Dashboard
2. Find WhatsApp widget
3. If "Disconnected" → Click "Disconnect" button
4. Wait for "Authenticating" status
5. Scan QR code with phone
6. Wait for "Ready" status

---

## What Needs Each Component?

### To Send Booking Notifications:
- ✅ `.env` must have `WHATSAPP_ADMIN_PHONE`
- ✅ Backend must connect via QR scan
- ✅ Phone number must be valid

### To Add WhatsApp Button on Website:
- ✅ Add social media link in admin panel
- ✅ Format: `https://wa.me/254743322975`
- ✅ No additional setup needed

### To Change Admin Notification Phone:
- ✅ Edit `.env` file
- ✅ Restart Node server
- ✅ Re-scan QR code (session may be tied to old number)

---

## API Endpoints

### Check WhatsApp Status
```bash
curl http://localhost:3000/api/admin/whatsapp/status
# Returns:
# {
#   "status": "ready|disconnected|authenticating|error",
#   "qrCode": "data:image/png;base64,..."
# }
```

### Disconnect (Logout)
```bash
curl -X POST http://localhost:3000/api/admin/whatsapp/disconnect
# Cleans session, generates new QR
```

### Get Site Settings
```bash
curl http://localhost:3000/api/admin/settings
# Returns all site_settings from database
```

### Get Social Media Links
```bash
curl http://localhost:3000/api/social-media
# Returns all social media links from database
```

---

## File Locations

| File | Purpose | Contains |
|------|---------|----------|
| `.env` | Environment variables | WHATSAPP_ADMIN_PHONE |
| `.wwebjs_auth/` | WhatsApp session | Connection credentials |
| `utils/whatsappService.js` | Backend service | Message sending logic |
| `admin/script.js` | Admin dashboard | Status polling, QR display |
| `server.js` | API & notifications | Booking handlers |

---

## When Does WhatsApp Send Messages?

### Automatic:
1. Customer makes a booking
2. Backend calls `whatsappService.sendMessage(adminPhone, message)`
3. Message sent to `WHATSAPP_ADMIN_PHONE` from `.env`

### Manual:
- Only in code when explicitly called
- Check `server.js` line ~1640 for booking handler

---

## Troubleshooting Checklist

```
□ Is WHATSAPP_ADMIN_PHONE set in .env?
□ Is DISABLE_WHATSAPP=true? (should be false)
□ Is backend status "ready"?
□ Is the phone number valid (starts with 0 or 254)?
□ Can you scan QR code from dashboard?
□ Did you restart server after .env change?
□ Is WhatsApp running on the phone?
□ Is network connectivity good on server?
```

---

## One Command to Restart Everything

```bash
# SSH to server
ssh vdranjxy@sbg106.sbg106.ovh.net
cd /home/vdranjxy/geniusminds/vdranjxy/geniusminds
source /home/vdranjxy/nodevenv/geniusminds/20/bin/activate

# Restart
pm2 restart all

# Check status
curl http://localhost:3000/api/admin/whatsapp/status
```

