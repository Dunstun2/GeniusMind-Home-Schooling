---
kind: external_dependency
name: Outbound email (Nodemailer) and inbound IMAP ingestion (imapflow/mailparser)
slug: nodemailer-imapflow-mailparser
category: external_dependency
category_hints:
    - sdk_real_api
scope:
    - '**'
---

### Identity & role
- Outbound notifications use Nodemailer transport configured from environment variables. Inbound replies are polled via IMAP using `imapflow` and parsed with `mailparser`'s `simpleParser`.

### SDK shape
- Verify exact transport/inbox config fields against the Nodemailer and imapflow docs.