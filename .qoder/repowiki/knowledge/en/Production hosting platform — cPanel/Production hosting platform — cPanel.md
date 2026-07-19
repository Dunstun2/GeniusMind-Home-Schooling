---
kind: external_dependency
name: Production hosting platform — cPanel
slug: cpanel
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
---

### Identity & role
- The app is deployed to a cPanel account (`/home/vdranjxy/geniusminds/`). `.cpanel.yml` defines post-deploy tasks that normalize line endings on `.htaccess`, create a `tmp/` directory, and touch a `restart.txt` trigger file.

### Constraints
- No headless browser / Chromium is available at runtime (hence Baileys without Puppeteer). Error output is redirected to `app-errors.log` inside the project root for cPanel's error capture.
- The production domain is `geniusminds.website` (CORS whitelist includes both `www` and bare forms).