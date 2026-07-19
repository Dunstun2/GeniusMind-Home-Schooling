---
kind: dependency_management
name: npm-based dependency management with lockfile and overrides
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - .gitignore
---

This repository uses npm as its package manager for a single Node.js/Express application. All third-party dependencies are declared in the root `package.json` and pinned to reproducible versions via `package-lock.json` (lockfileVersion 3). There is no vendoring strategy — `node_modules/` is installed locally and excluded from version control via `.gitignore`. No private registry, `.npmrc`, or proxy configuration is present; all packages resolve against the default public npm registry.

**Manifest and scripts**
- `package.json` declares runtime dependencies (`express`, `mysql2`, `nodemailer`, `@whiskeysockets/baileys`, etc.) under `dependencies` and development-only tooling (`livereload`, `sqlite`, `sqlite3`) under `devDependencies`.
- Two scripts are defined: `start` runs `server.js`, and `dev` uses Node's built-in file watching (`--watch-path=server.js --watch-path=utils`) for hot reload during development.

**Version pinning and overrides**
- The project uses caret ranges (`^x.y.z`) on most dependencies, allowing minor/patch updates within the major version.
- A single `overrides` entry forces `libsignal-node` (a transitive dependency of `@whiskeysockets/baileys`) to be resolved from a specific GitHub tarball URL, bypassing the published npm version. This is the only mechanism used to patch or replace a dependency tree node.
- `package-lock.json` records exact resolved URLs and sha512 integrity hashes for every package, ensuring deterministic installs across machines.

**No multi-package workspace**
There is no `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, or monorepo layout — this is a flat, single-package project.

**Rules developers should follow**
- Add new runtime dependencies with `npm install <pkg>` so they land in `dependencies`; add dev-only tooling with `--save-dev` so they land in `devDependencies`.
- Commit both `package.json` and `package-lock.json` after any change to keep installs deterministic.
- Do not commit `node_modules/`; it is ignored by `.gitignore`.
- Avoid committing secrets via `.env` (already ignored); use `.env.example` as the template.
- If you need to force a different version of a transitive dependency, prefer using the `overrides` field in `package.json` rather than editing `package-lock.json` directly.