# Unified WhatsApp Configuration Setup Guide

## ✅ What Was Changed

You now have a **single, unified WhatsApp setup** where everything is managed from **Admin Dashboard → Site Settings**:

1. ✅ Enter WhatsApp phone number once
2. ✅ Scan QR code for backend connection
3. ✅ Automatic booking notifications to that number
4. ✅ Automatic social media link for website

**No more .env configuration needed!**

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

### Step 3: Go to Site Settings
```
Navigation: System Config → Site Settings
OR: Direct link sidebar "⚙️ Site Settings"
```

### Step 4: Enter WhatsApp Phone Number
```
Form Field: "💬 WhatsApp Number (for Admin Notifications & Booking Alerts)"

Examples of valid formats:
✅ 0743322975
✅ 254743322975
✅ +254743322975
✅ +254 743-322-975

All formats auto-converted to WhatsApp format
```

### Step 5: Save Settings
```
Click: "💾 Save Settings"
Status shows: "✅ Saved successfully!"
```

### Step 6: Verify WhatsApp Connection (Dashboard)
```
Navigation: Dashboard tab (default page)
Look for: "WhatsApp" status widget

Status will show:
- "disconnected" → Need to scan QR
- "authenticating" → Scan QR code with your phone
- "ready" → Backend connected ✅
```

### Step 7: Scan QR Code (if needed)
```
If status is "authenticating":
1. Look for QR code in WhatsApp widget
2. Open WhatsApp on your phone
3. Settings → Linked Devices → Link a Device
4. Scan the QR code
5. Wait 10-30 seconds for "ready" status
```

### Step 8: Verify Social Media Link
```
Navigation: System Config → Social Media
You should see: "WhatsApp" entry with URL like:
https://wa.me/254743322975?text=Hello%20Genius%20Minds

This link was auto-created when you saved the phone number!
```

---

## 🧪 Testing Checklist

### ✅ Test 1: Settings Save & Load
```
[ ] Open Site Settings
[ ] Enter WhatsApp phone: 0743322975
[ ] Save
[ ] Refresh page
[ ] Phone number still there? ✅
```

### ✅ Test 2: Social Media Auto-Sync
```
[ ] Save WhatsApp phone in settings
[ ] Go to Social Media tab
[ ] WhatsApp link exists? ✅
[ ] URL format correct? (https://wa.me/254743322975)
```

### ✅ Test 3: Booking Notification
```
[ ] Go to website public page
[ ] Submit booking form with:
    - Name: Test User
    - Email: test@example.com
    - Phone: Your phone number
    - Service: Any service
    - Message: Test message
[ ] Click Submit
[ ] Check WhatsApp on your phone
[ ] Did you receive notification? ✅
```

### ✅ Test 4: Customer Notification
```
[ ] When submitting booking:
    - Enter Phone: 0743322975 (or your number)
    - Enter Name: Test Name
[ ] Customer should receive WhatsApp:
    "Hello Test Name, 👋
     We have received your booking request..."
```

### ✅ Test 5: QR Reconnection
```
[ ] Go to Dashboard
[ ] Click "Disconnect WhatsApp" button
[ ] Wait for status: "authenticating"
[ ] Scan new QR code with phone
[ ] Status changes to "ready"? ✅
```

### ✅ Test 6: Website Social Link
```
[ ] Visit public website
[ ] Go to footer or contact page
[ ] Click WhatsApp icon/link
[ ] Browser opens: https://wa.me/254743322975?text=...
[ ] WhatsApp chat window opens? ✅
```

---

## 📋 What Each Component Does

### Admin Site Settings Form
```
Input: WhatsApp Phone Number
Stores: In site_settings table as "whatsapp_phone"
Auto-triggers: Social media link sync
```

### Backend Connection (QR Scan)
```
Process: Admin scans QR in dashboard
Stores: Session in .wwebjs_auth/ directory
Purpose: Enables backend to send WhatsApp messages
```

### Booking Handler
```
Old: Used env var WHATSAPP_ADMIN_PHONE
New: Reads whatsapp_phone from site_settings table
Sends notifications to: The phone number from settings
```

### Social Media Auto-Sync
```
Triggered: When WhatsApp phone saved in settings
Creates/Updates: "WhatsApp" entry in social_media table
URL Format: https://wa.me/{phone}?text=...
Displays: On website footer/contact page
```

---

## 🔍 Troubleshooting

### Problem: WhatsApp phone not saving
```
Check:
[ ] Form shows no validation errors?
[ ] Phone number has valid format? (0... or 254... or +254...)
[ ] Save button clicked and says "Saved"?
[ ] Check browser console for errors (F12 → Console)
[ ] Refresh page - does value persist?

If still failing:
1. Check server logs: tail -f /home/vdranjxy/geniusminds/stderr.log
2. Look for MySQL errors
3. Verify database connection
```

### Problem: WhatsApp notifications not sending
```
Check:
[ ] Is WhatsApp status "ready"?
[ ] Is WhatsApp phone saved in settings?
[ ] Is phone number valid format?
[ ] Check logs: tail -f /home/vdranjxy/geniusminds/app-errors.log
[ ] Try submitting booking again

Common issues:
- Status is "disconnected" → Scan QR again
- Phone number empty → Save in settings first
- Phone format wrong → Use 0743322975 format
```

### Problem: Social media link not created
```
Check:
[ ] Did you get "Saved successfully" message?
[ ] Wait 2-3 seconds after save
[ ] Refresh Social Media page
[ ] WhatsApp entry not appearing?

Try manual sync:
```bash
curl -X POST http://localhost:3000/api/admin/sync-whatsapp-social \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Problem: Booking shows but no WhatsApp sent
```
Check server logs:
```bash
tail -100 /home/vdranjxy/geniusminds/stderr.log | grep -i whatsapp
```

Look for:
- "Cannot send WhatsApp message: Client not ready"
  → Need to scan QR code
- "Error fetching WhatsApp phone from settings"
  → Check database connection
- "WhatsApp message sent to..."
  → Success! Check your phone
```

---

## 📊 Database Changes

### New Site Setting Stored
```sql
INSERT INTO site_settings (setting_key, setting_value) 
VALUES ('whatsapp_phone', '0743322975');
```

### Social Media Auto-Created
```sql
-- When you save WhatsApp phone, this is auto-created:
INSERT INTO social_media (name, url, display_order) 
VALUES ('WhatsApp', 'https://wa.me/254743322975?text=Hello%20Genius%20Minds', 3);
```

### No Changes to Bookings Table
```
Bookings table unchanged - only the notification handler changed
```

---

## 🔄 Migration from Old System

### Old Way (Hardcoded .env)
```env
WHATSAPP_ADMIN_PHONE=0140802797
DISABLE_WHATSAPP=false
```

### New Way (Admin Dashboard)
```
Admin → Site Settings → Enter phone → Save
```

### Backwards Compatible
```
If whatsapp_phone not in settings:
Fallback to WHATSAPP_ADMIN_PHONE from .env
Fallback to hardcoded default: 0140802797

But recommended: Use settings instead
```

### Optional: Remove from .env
```
Can leave WHATSAPP_ADMIN_PHONE in .env for safety
Or remove it entirely - will use settings
```

---

## ✨ Benefits of This Setup

| Old Way | New Way |
|---------|---------|
| Edit `.env` file | Use admin dashboard |
| Restart server needed | No restart needed |
| Hardcoded number | Dynamic, changeable |
| Manual social link | Auto-synced link |
| 2 different numbers | 1 unified number |
| Less flexible | More flexible |

---

## 🚨 Important Notes

### WhatsApp Session Management
- Session stored in `.wwebjs_auth/` directory
- Tied to phone running WhatsApp Web
- Different from the admin notification phone
- QR scan creates the session

### Phone Number Format
- Accepts: 0743322975, 254743322975, +254743322975
- All converted to: 254743322975 (for WhatsApp)
- Must be valid Kenyan number format

### Social Media Link
- Automatically creates/updates WhatsApp link
- URL format: `https://wa.me/254743322975?text=...`
- Displayed on website footer and contact page
- Can be manually edited if needed

---

## 📞 Production Deployment Checklist

Before deploying to production:

```
[ ] Local testing passed (all 6 tests above)
[ ] git commit with proper message
[ ] git push to remote
[ ] SSH to production server
[ ] git pull latest changes
[ ] npm install (if needed)
[ ] pm2 restart all
[ ] Check WhatsApp status in dashboard
[ ] Test booking form
[ ] Verify notification received
[ ] Check social media link on website
[ ] Monitor logs for 24 hours
```

---

## 🔧 Rollback Instructions

If needed to revert to old system:

```bash
# Revert to previous commit
git revert HEAD

# Or reset to specific commit
git reset --hard COMMIT_HASH

# Restart
pm2 restart all
```

But you shouldn't need to - this change is backwards compatible!

---

## API Endpoints Reference

### Get Settings
```bash
GET /api/admin/settings
Response: { contact_phone, contact_email, contact_location, whatsapp_phone }
```

### Update Settings
```bash
PUT /api/admin/settings
Body: { whatsapp_phone: "0743322975", ... }
```

### Sync WhatsApp Social Link
```bash
POST /api/admin/sync-whatsapp-social
Response: { success: true, url: "https://wa.me/..." }
```

### Get Social Media
```bash
GET /api/social-media
Response: [{ name: "WhatsApp", url: "...", display_order: 3 }]
```

---

## 📞 Support

If you encounter issues:

1. **Check logs first:**
   ```bash
   tail -100 /home/vdranjxy/geniusminds/stderr.log
   tail -100 /home/vdranjxy/geniusminds/app-errors.log
   ```

2. **Verify database:**
   ```bash
   mysql -u vdranjxy_GeniusmindAdmin -p"GeniusmindAdmin@#12" vdranjxy_Geniusmind_db
   SELECT * FROM site_settings WHERE setting_key LIKE 'whatsapp%';
   SELECT * FROM social_media WHERE name = 'WhatsApp';
   ```

3. **Test API endpoint:**
   ```bash
   curl http://localhost:3000/api/admin/settings
   ```

