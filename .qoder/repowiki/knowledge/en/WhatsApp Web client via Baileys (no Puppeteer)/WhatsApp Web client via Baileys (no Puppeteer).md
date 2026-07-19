---
kind: external_dependency
name: WhatsApp Web client via Baileys (no Puppeteer)
slug: baileys
category: external_dependency
category_hints:
    - vendor_identity
    - framework_behavior
scope:
    - '**'
---

### Identity & role
- The project uses the @whiskeysockets/baileys library as a WhatsApp Web client to send booking confirmations and notifications from the Node.js backend.

### Integration shape
- Connection is gated by `DISABLE_WHATSAPP=true`; when unavailable the service stays in `unavailable` status and all sends become no-ops.
- An `overrides` entry pins `libsignal-node` to a specific GitHub archive URL to satisfy Baileys' native dependency requirements on cPanel.

### Deployment notes
- Production runs on cPanel (`server.js` + `.cpanel.yml`); Baileys is used instead of any Puppeteer/Chromium-based solution so no headless browser is required at runtime.
- Verify exact API/params against the official Baileys docs.