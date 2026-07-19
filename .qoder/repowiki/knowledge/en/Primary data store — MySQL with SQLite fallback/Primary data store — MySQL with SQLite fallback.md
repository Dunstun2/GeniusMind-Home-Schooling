---
kind: external_dependency
name: Primary data store — MySQL with SQLite fallback
slug: mysql-mysql2
category: external_dependency
category_hints:
    - migration_status
    - client_constraint
scope:
    - '**'
---

### Identity & role
- MySQL via the `mysql2/promise` driver is the production data store; an in-memory map is the default dev mode, with SQLite (`sqlite3` + `sqlite`) available as a local persistence fallback.

### Dual-mode adapter
- `dbMode` is resolved at startup: if `MYSQL_*` env vars are present the server connects to MySQL; otherwise it tries SQLite (requires `sqlite3/sqlite` dev deps) and falls back to the in-memory store. All CRUD paths branch on `dbMode === 'mysql' | 'sqlite' | 'memory'`.

### Migration status
- Development defaults to `memory`; SQLite is opt-in locally. Production targets MySQL on the cPanel host.
- Verify exact pool/connection options against the mysql2 docs.