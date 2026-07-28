# WhatsApp Configuration & Setup Options

You have **THREE ways** to configure WhatsApp in your system:

---

## Option 1: Environment Variables (`.env` file)

### Current Setup:
```env
# .env (Production Server)
WHATSAPP_ADMIN_PHONE=0140802797
DISABLE_WHATSAPP=false
```

### Purpose:
- **WHATSAPP_ADMIN_PHONE**: The phone number that receives notifications from bookings/inquiries
- **DISABLE_WHATSAPP**: Disable WhatsApp service entirely (set to `true` for testing)

### How It's Used:
```javascript
// When customer makes a booking:
const adminPhone = process.env.WHATSAPP_ADMIN_PHONE || '0140802797';
whatsappService.sendMessage(adminPhone, bookingNotification);
```

### Update:
1. Edit `.env` file directly
2. Restart Node server
3. WhatsApp admin notifications will go to the new number

---

## Option 2: Site Settings (Admin Dashboard)

### Access:
**Admin Dashboard** → **System Config** → **Site Settings**

### Available Fields in Settings:
```
📞 Phone Number        (contact_phone)
✉️ Email Address       (contact_email)
📍 Location           (contact_location)
```

### Current Code:
These are stored in `site_settings` table:
```sql
SELECT * FROM site_settings;
-- Returns:
contact_phone: '+254 743-322-975'
contact_email: 'geniusminds2425@gmail.com'
contact_location: 'Nairobi, Kenya'
```

### API Endpoint:
```bash
# Get settings
GET /api/admin/settings

# Update settings
PUT /api/admin/settings
Body: {
  "contact_phone": "+254743322975",
  "contact_email": "new@email.com",
  "contact_location": "New Location"
}
```

### Current Implementation:
- ✅ Phone, Email, Location can be stored
- ❌ **WhatsApp Account/Number is NOT stored here** (only in `.env`)
- ✅ Auto-saved from admin form

---

## Option 3: Social Media Links (Admin Dashboard)

### Access:
**Admin Dashboard** → **System Config** → **Social Media**

### Purpose:
Add social media platform links displayed in:
- Website footer
- Contact page  
- "Share" buttons

### Supported Platforms:
- TikTok
- Instagram
- **WhatsApp** (can be added!)
- Facebook, LinkedIn, YouTube, Twitter, etc.

### Current Database:
```sql
SELECT * FROM social_media;
-- Example:
id: 1, name: 'TikTok', url: 'https://tiktok.com/@genius.minds.home', display_order: 1
id: 2, name: 'Instagram', url: 'https://www.instagram.com/genius_minds_homeschool?igsh=...', display_order: 2
```

### How to Add WhatsApp Link:
1. **Admin Dashboard** → **Social Media** → **Add Social Link**
2. Fill in:
   - **Platform**: WhatsApp
   - **URL**: `https://wa.me/254743322975` (or your number)
   - **Order**: (e.g., 3)
3. **Save**

### URL Format for WhatsApp:
```
https://wa.me/254743322975        # Direct WhatsApp Web
https://wa.me/254743322975?text=Hello%20there  # Pre-filled message
```

### API Endpoint:
```bash
# Get all social media links
GET /api/admin/social-media

# Add new social link
POST /api/admin/social-media
Body: {
  "name": "WhatsApp",
  "url": "https://wa.me/254743322975",
  "display_order": 3
}

# Update social link
PUT /api/admin/social-media/:id
Body: {
  "name": "WhatsApp",
  "url": "https://wa.me/254743322975",
  "display_order": 3
}
```

---

## The WhatsApp Scanning Process

The **QR Code Scanning** is for connecting the backend to WhatsApp Web:

### Current Flow:
```
1. Admin logs into dashboard
2. Goes to Dashboard tab
3. WhatsApp status widget shows "Authenticating"
4. Admin scans QR code with phone running WhatsApp
5. Backend connects to WhatsApp Web
6. Status changes to "ready"
7. Backend can now send messages
```

### This is SEPARATE from:
- `.env` WHATSAPP_ADMIN_PHONE (where to send notifications)
- Social media links (frontend share buttons)

---

## Complete WhatsApp Setup Workflow

### Step 1: Environment Configuration (`.env`)
```env
WHATSAPP_ADMIN_PHONE=0140802797    # Your admin phone
DISABLE_WHATSAPP=false              # Enable WhatsApp
```

### Step 2: Connect Backend to WhatsApp Web
1. Start Node server
2. Open Admin Dashboard
3. Look for WhatsApp status widget
4. Scan QR code with phone
5. Wait for "ready" status

### Step 3: Add Social Media Link (Frontend)
1. Admin Dashboard → Social Media
2. Add WhatsApp link: `https://wa.me/254743322975`
3. This creates a "Chat on WhatsApp" button on website

### Step 4: Send Notifications
- When customer books → Message sent to `WHATSAPP_ADMIN_PHONE`
- Automatic via `whatsappService.sendMessage()`

---

## What's Stored WHERE

| Setting | Storage | Access | Purpose |
|---------|---------|--------|---------|
| **WHATSAPP_ADMIN_PHONE** | `.env` file | Backend only | Admin receives booking notifications |
| **WhatsApp Connection** | `.wwebjs_auth/` directory | Backend | Session to WhatsApp Web |
| **Social Media Links** | `social_media` table | Frontend + Backend | Share buttons on website |
| **Contact Info** | `site_settings` table | Frontend | Display phone/email on website |

---

## Common Confusion Points

### ❌ "I can't add WhatsApp account in social media settings"
**Correct**: Social media settings are for FRONTEND share links, not backend connection.
- Use `.env` file to set admin phone
- Scan QR code in dashboard for backend connection

### ❌ "WhatsApp keeps disconnecting"
**Fix**: 
1. Check if phone running WhatsApp Web is still connected
2. Logout current session: `POST /api/admin/whatsapp/disconnect`
3. Rescan QR code

### ✅ "I want customers to message me on WhatsApp"
**Do this**:
1. Add WhatsApp social link: `https://wa.me/254743322975`
2. This creates a clickable button on your website

### ✅ "I want to send booking notifications to admin via WhatsApp"
**Do this**:
1. Set `WHATSAPP_ADMIN_PHONE` in `.env`
2. Connect backend via QR scan in dashboard
3. Automatic messages sent when customers book

---

## Admin Settings Form (Currently in Use)

### What Admin Can Update:
```html
<!-- Site Settings Form -->
<input name="contact_phone" />       → setting_contact_phone
<input name="contact_email" />       → setting_contact_email
<input name="contact_location" />    → setting_contact_location
```

### What Admin CANNOT Update (But Can Use):
```javascript
// Hardcoded in .env
WHATSAPP_ADMIN_PHONE = process.env.WHATSAPP_ADMIN_PHONE

// QR Code scanned in dashboard
WhatsApp Connection Status
```

---

## Future Enhancement: Add WhatsApp Admin Phone to Settings

If you want to manage WhatsApp admin phone from the admin panel instead of `.env`:

### Option A: Add to Site Settings
```html
<!-- In admin/index.html site settings form -->
<input name="whatsapp_admin_phone" placeholder="+254743322975" />
```

### Update server.js:
```javascript
// In booking notification handler
const adminPhone = await getSetting('whatsapp_admin_phone') 
    || process.env.WHATSAPP_ADMIN_PHONE;
```

### Then settings table would have:
```sql
whatsapp_admin_phone: '0140802797'
```

---

## Summary for Your Questions

| Question | Answer |
|----------|--------|
| **Where is WhatsApp number stored?** | `.env` file (WHATSAPP_ADMIN_PHONE) |
| **Can admin change WhatsApp number?** | Only by editing `.env` + restart server |
| **Can admin add WhatsApp account without scanning?** | No, must scan QR code for backend connection |
| **What is social media settings for?** | Frontend share links, not notifications |
| **How do booking notifications work?** | `.env` WHATSAPP_ADMIN_PHONE → backend sends message → admin receives |

