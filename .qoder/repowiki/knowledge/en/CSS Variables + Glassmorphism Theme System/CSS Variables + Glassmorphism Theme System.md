---
kind: frontend_style
name: CSS Variables + Glassmorphism Theme System
category: frontend_style
scope:
    - '**'
source_files:
    - styles.css
    - admin/styles.css
---

The frontend styling is a hand-rolled, CSS-variable-driven system with no build step or component library. Two parallel design languages coexist:

Public marketing site (styles.css) — A light/dark theme driven by :root and [data-theme="dark"] variables (primary indigo #4F46E5, secondary orange #F97316, surface/background tokens). It uses the Outfit/Inter font pair, glassmorphic cards via backdrop-filter: blur(16px), CSS Grid/Flexbox layouts, and extensive mobile breakpoints at 992 / 768 / 480 px for a responsive hero, services grid, contact split, and a custom horizontal highlights slider with animated dots/arrows. Social-link hover colors are brand-specific (TikTok, Instagram, X, Facebook, LinkedIn, YouTube, WhatsApp).

Admin dashboard (admin/styles.css) — A separate dark-first palette (--bg-dark: #07090e) with an optional .light-mode body class that re-declares every variable. Uses glassmorphic sidebar (backdrop-filter: blur(20px)), status badges (pending/contacted/completed/cancelled), stat cards, chart containers, data tables, modals, and a collapsible sidebar on mobile. The admin theme is intentionally distinct from the public site rather than sharing tokens.

Conventions and patterns
- All colors, typography, spacing, and radii live in CSS custom properties; there is no SCSS/Less/Tailwind pipeline.
- Component classes follow a BEM-like flat naming (.btn-primary, .glass-card, .stat-card, .nav-item.active).
- Responsive strategy is breakpoint-based media queries layered atop the same stylesheet; no utility framework.
- Animations use CSS @keyframes (float, fadeIn, modalShow) plus transition: var(--transition) for consistent timing.
- No shared design-token file between public and admin — each area owns its own :root declarations.

What is not used
- No Tailwind, Bootstrap, Material UI, or any CSS-in-JS runtime.
- No CSS preprocessing (SCSS/Sass/Less); plain CSS only.
- No build-time asset pipeline — styles are served directly by Express.