# WhatsApp QR-Based Auto-Configuration Guide

## ✅ What Changed

**Simplified Setup - No Manual Phone Entry Needed!**

Instead of entering the phone number manually, the system now:

1. ✅ Admin scans QR code in dashboard
2. ✅ Phone number **automatically extracted** from the scanned session
3. ✅ Auto-**saved to site settings**
4. ✅ Auto-**creates social media link** for website
5. ✅ **One unified WhatsApp account** - only one can be connected at a time

**Result:** Single configuration point = QR Code Scan

---

## 🚀 Complete Setup Workflow

### Step 1: Deploy Changes to Production
```bash
# From your local machine
git push origin master

# On production server (SSH)
ssh vdranjxy@sbg106.sbg106.ovh.net
cd /home/vdranjxy/geniusminds/vdranjxy/geniusminds
git pull origin master
pm2 restart all
```

### Step 2: Access Admin Dashboard
```
URL: https://geniusminds.website.comrades360.shop/admin/
Login: admin / GeniusAdmin2026!
```

### Step 3: Go to Dashboard Tab
```
Navigation: Click "📊 Dashboard" (default page)
Look for: "WhatsApp Integration" card
```

### Step 4: Check WhatsApp Status
```
You'll see:
- Connection Status: "Disconnected ⚠️" OR
- Connection Status: "Waiting for QR Scan..." OR  
- Connection Status: "Connected ✅" + phone number
```

### Step 5: Scan QR Code (If Disconnected)
```
If status shows "Waiting for QR Scan..." or "Disconnected":

1. Look for QR code in WhatsApp Integration card
2. Open WhatsApp on your phone
3. Settings → Linked Devices → Link a Device
4. Scan the displayed QR code
5. Wait 10-30 seconds...

Dashboard will auto-update:
- Status changes to: "Connected ✅"
- Phone number appears: "📱 Connected Account: 254743322975"
```

### Step 6: Verify Auto-Configuration
```
✅ Site Settings:
   Admin Dashboard → System Config → Site Settings
   You won't see a WhatsApp phone field (removed)
   Phone is stored in database behind the scenes

✅ Social Media Link:
   Admin Dashboard → System Config → Social Media
   You'll see new entry: "WhatsApp" with URL:
   https://wa.me/254743322975?text=...

✅ Booking Notifications:
   System automatically sends to that phone number
```

### Step 7: Test Everything
```
1. Submit a booking on the website
2. Check your WhatsApp - you should receive notification
3. Check website footer - WhatsApp link appears
4. Click link - opens WhatsApp chat
```

---

## 🧪 Complete Testing Checklist

### ✅ Test 1: QR Code Scanning
```
[ ] Open Admin Dashboard
[ ] Look for WhatsApp Integration card
[ ] Status shows "Disconnected" or "Waiting for QR"?
[ ] QR code visible in card?
[ ] Scan QR with your phone (WhatsApp → Linked Devices)
[ ] Status changes to "Connected ✅"? 
[ ] Phone number displayed? (e.g., "📱 Connected Account: 254743322975")
```

### ✅ Test 2: Automatic Phone Extraction
```
[ ] After scanning QR code
[ ] Dashboard shows connected phone number?
[ ] Go to Admin → System Config → Site Settings
[ ] Notice: No WhatsApp phone field (expected - auto-managed)
[ ] Go to database and check:
    mysql -u ... -p... db -e "SELECT * FROM site_settings WHERE setting_key='whatsapp_phone';"
    Should show the phone number from QR scan
```

### ✅ Test 3: Social Media Auto-Creation
```
[ ] Scan QR code (or it's already connected)
[ ] Go to Admin → System Config → Social Media
[ ] "WhatsApp" entry exists?
[ ] URL format is correct: https://wa.me/254743322975?text=...
```

### ✅ Test 4: Booking Notification
```
[ ] Submit booking form on website:
    - Name: Test User
    - Email: test@example.com
    - Phone: Any phone
    - Service: Any service
    - Message: Test message
[ ] You receive WhatsApp notification on admin account?
[ ] Notification shows booking details?
[ ] Customer also receives notification?
```

### ✅ Test 5: Website Social Link
```
[ ] Go to public website
[ ] Check footer or contact page
[ ] WhatsApp icon/link visible?
[ ] Click it - opens WhatsApp chat window?
[ ] Pre-filled text appears?
```

### ✅ Test 6: Disconnect & Reconnect
```
[ ] Go to Admin Dashboard
[ ] Click "Disconnect WhatsApp" button
[ ] Status changes to "Disconnected"?
[ ] Phone number disappears from display?
[ ] Wait for new QR code to generate
[ ] Scan new QR with phone
[ ] Status becomes "Connected" again?
```

### ✅ Test 7: Only One Account
```
[ ] With WhatsApp account A connected
[ ] Try to scan QR for account B
[ ] Old account should be replaced by new one
[ ] Phone number in display updates
[ ] Notifications go to new account B
```

---

## 📋 How It Works (Technical)

### Phone Extraction Flow
```
QR Code Scanned
    ↓
WhatsApp session established
    ↓
Client connects (connection === 'open')
    ↓
Extract: this.client.user.id
    ↓
Format: "254743322975@c.us" → "254743322975"
    ↓
Store: whatsappService.userPhoneNumber
    ↓
Auto-sync to site_settings table
    ↓
Auto-sync to social_media table (create WhatsApp link)
```

### Component Roles

| Component | Purpose |
|-----------|---------|
| **WhatsApp QR Code** | Initiates connection to WhatsApp Web |
| **Client User ID** | Contains the phone number in format "254743322975@c.us" |
| **WhatsAppService** | Extracts & stores phone number |
| **Status API** | Returns phone number in `phoneNumber` field |
| **Dashboard** | Displays the phone number when connected |
| **Site Settings** | Stores phone automatically (no UI input needed) |
| **Social Media Table** | Auto-creates WhatsApp link |

---

## 📊 Database Changes

### New Data Automatically Stored
```sql
-- When QR is scanned and connected:
INSERT INTO site_settings (setting_key, setting_value) 
VALUES ('whatsapp_phone', '254743322975');

-- Auto-creates social link:
INSERT INTO social_media (name, url, display_order) 
VALUES ('WhatsApp', 'https://wa.me/254743322975?text=...', 3);
```

### Data Flow
```
WhatsApp QR Scan
    ↓ (extracts: 254743322975)
    ↓
site_settings.whatsapp_phone = '254743322975'
    ↓
Used by: Booking notification handler
    ↓
social_media table (auto-creates WhatsApp link)
    ↓
Displayed on: Website footer + dashboard
```

---

## 🔍 API Endpoints

### Get WhatsApp Status (with Phone)
```bash
GET /api/admin/whatsapp/status
Response:
{
  "status": "ready|disconnected|authenticating|error",
  "qrCode": "data:image/png;base64,...",
  "phoneNumber": "254743322975"  # NEW: Auto-extracted phone
}
```

### Disconnect WhatsApp
```bash
POST /api/admin/whatsapp/disconnect
Response:
{
  "success": true
}
```

### Get Settings (phone now auto-managed)
```bash
GET /api/admin/settings
Response:
{
  "contact_phone": "+254 743-322-975",
  "contact_email": "...",
  "contact_location": "...",
  "whatsapp_phone": "254743322975"  # Auto-set from QR scan
}
```

---

## 🚨 Important Notes

### What Removed
- ❌ Manual WhatsApp phone input field in Site Settings
- ❌ Manual "whatsapp_phone" form field
- ❌ `POST /api/admin/sync-whatsapp-social` endpoint (auto-sync now)

### What Added
- ✅ `phoneNumber` field in WhatsApp status response
- ✅ Phone display on dashboard when connected
- ✅ Automatic phone extraction from QR session
- ✅ Automatic settings & social media sync

### One Account Only
```
When admin scans new QR:
1. Old WhatsApp session disconnected
2. New session established
3. New phone extracted
4. Old phone in settings replaced
5. Social media link updated
```

### Phone Formats Supported
The phone is stored in WhatsApp format:
- Format: `254743322975` (no + or leading 0)
- Source: WhatsApp client.user.id
- Auto-converted to URL format: `https://wa.me/254743322975?text=...`

---

## 🔧 Troubleshooting

### Problem: QR Code Not Appearing
```
Check:
[ ] WhatsApp status shows "Authenticating"?
[ ] Refresh browser page
[ ] Check browser console for errors (F12 → Console)
[ ] Check server logs:
    tail -f /home/vdranjxy/geniusminds/stderr.log

If still failing:
pm2 restart all
```

### Problem: Phone Number Not Extracting
```
Check:
[ ] Phone number field empty on dashboard?
[ ] Check logs: "Connected WhatsApp account: ..."
[ ] Try re-scanning QR code

Logs to look for:
- "✅ Connected WhatsApp account: 254743322975"
- "Could not extract phone number from WhatsApp session"
```

### Problem: No Notifications Sent
```
Check:
[ ] Is status "Connected"?
[ ] Is phone number displayed?
[ ] Does booking reach the server?
[ ] Check server logs for:
    - "Error fetching WhatsApp phone from settings"
    - "WhatsApp message sent to..."
    - Any error messages
```

### Problem: Social Media Link Not Created
```
Check:
[ ] WhatsApp status "Connected"?
[ ] Go to Social Media tab
[ ] WhatsApp entry missing?

Manual check:
mysql -u ... -p... db -e "SELECT * FROM social_media WHERE name='WhatsApp';"

If missing, manually check logs:
tail -100 /home/vdranjxy/geniusminds/stderr.log | grep -i "social\|sync"
```

---

## 📞 Production Deployment Checklist

```
Before deploying:
[ ] Local testing passed (all 7 tests above)
[ ] Git commit reviewed
[ ] Git push to remote

On production:
[ ] SSH into server
[ ] git pull latest
[ ] pm2 restart all
[ ] Check WhatsApp status in dashboard
[ ] Verify phone displayed
[ ] Test booking notification
[ ] Check social media link on website
[ ] Monitor logs for 24 hours

Post-deployment:
[ ] Old WhatsApp phone field removed? (expected)
[ ] Dashboard shows "Connected" with phone?
[ ] Bookings send notifications?
[ ] Website shows WhatsApp link?
```

---

## 🎯 Benefits of This Approach

| Old Way | New Way |
|---------|---------|
| Manual phone entry in form | Automatic extraction from QR |
| Multiple ways to configure | Single configuration: QR scan |
| Admin could enter wrong number | Phone auto-extracted from session |
| Can have multiple accounts | Only one account at a time |
| Manual social link creation | Auto-synced social link |
| More fields/complexity | Simpler UI - just scan QR |

---

## 🔄 Migration from Previous Version

### If you had the old version with manual phone entry:

```bash
# Old data in database will remain:
SELECT * FROM site_settings WHERE setting_key='whatsapp_phone';
# Result: Shows old manually-entered phone

# To reset and use QR scanning:
1. Deploy new code
2. Restart server
3. Go to Dashboard
4. Click "Disconnect WhatsApp"
5. Scan QR code with your account
6. New phone will replace old one
```

---

## 🔐 Security Notes

- Phone number extracted from WhatsApp Web session (trusted source)
- Only stored in database (not exposed in UI except on dashboard)
- Auto-deleted when account disconnects
- QR code is temporary and regenerated on disconnect

---

## 📞 Support

If you encounter issues:

1. **Check Status First:**
   ```bash
   curl http://localhost:3000/api/admin/whatsapp/status
   ```

2. **Check Logs:**
   ```bash
   tail -100 /home/vdranjxy/geniusminds/stderr.log | grep -i whatsapp
   tail -100 /home/vdranjxy/geniusminds/app-errors.log
   ```

3. **Verify Database:**
   ```bash
   mysql -u vdranjxy_GeniusmindAdmin -p"GeniusmindAdmin@#12" vdranjxy_Geniusmind_db
   SELECT * FROM site_settings WHERE setting_key='whatsapp_phone';
   SELECT * FROM social_media WHERE name='WhatsApp';
   ```

