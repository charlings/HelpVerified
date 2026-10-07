# HelpVerified

Families in Nigeria hire nannies, drivers and cleaners whose **ID, guarantor, references and address** have been checked by a registered agency.

- Specs: `specs/frontend/project-helpverified-web.md`, `specs/backend/project-helpverified-api.md`
- Working rules for contributors and Claude Code: `CLAUDE.md` and `.claude/skills/helpverified/`
- Architecture and decisions: `docs/`

**Current phase:** 1 — Frontend, complete (M1–M9). The web app runs on mock data; nothing is connected to a real backend, payments or email yet. Backend work (B1–B8) starts after the owner's sign-off recorded in `docs/frontend-signoff.md`; start with `docs/backend-handoff.md`.

## Requirements

- Node 24 (`.nvmrc`)
- pnpm via corepack: `corepack enable`
- Docker and uv (Python) are only needed from backend milestone B1.

## Setup

```bash
corepack enable
pnpm install
cp .env.example apps/web/.env.local     # PowerShell: Copy-Item .env.example apps/web/.env.local
pnpm dev                                # http://localhost:3000
```

The design-token and component gallery is at http://localhost:3000/styleguide (development only).

## Commands

Run from the repository root (or use `pnpm --filter web <script>`).

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the web app |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint, including module-boundary, raw-colour and route-literal rules |
| `pnpm --filter web lint:css` | Stylelint (no hex colours outside `tokens.css`) |
| `pnpm typecheck` | TypeScript, strict (runs `next typegen` first, so it works on a clean clone) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm --filter web test:e2e` | Playwright on Chromium and WebKit (iPhone 13); builds into `apps/web/.next-e2e` and serves on port 3100, so `pnpm dev` can keep running |
| `pnpm --filter web exec playwright test e2e/audit.spec.ts --project=chromium --workers=1` | Accessibility and layout audit of every route (heavy; add `--shard=1/8` on a low-memory machine). See `docs/accessibility.md` |
| `pnpm --filter web exec playwright test -c playwright.firefox.config.ts` | Firefox smoke run (not in CI; `playwright install firefox` first) |
| `pnpm --filter web bundle:check <build log>` | Fail if a route is over its JS budget (`pnpm build > build.log` first). See `docs/bundles.md` |
| `pnpm --filter web brand` | Regenerate transparent logo, mark and favicons from the source logo |
| `pnpm --filter web images` | Regenerate responsive photo variants (needs the originals, see below) |
| `pnpm --filter web lighthouse` | Lighthouse mobile on Home and Services against a production build (build first with `NEXT_PUBLIC_SITE_URL=http://localhost:3200`); reports in `apps/web/lighthouse/` |

**Demo accounts** (demo mode only, password `demo1234`):

| Account | What it shows |
| --- | --- |
| `family@demo.hv` | A family with a proposal to review, a trial in progress and a past placement |
| `bola@demo.hv` | A family with a placement waiting for payment, and a confirmed placement |
| `newfamily@demo.hv` | A family with nothing yet (empty states) |
| `agency@demo.hv` | Sunrise Domestic Staffing: workers in every verification and listing state, requests, placements, billing |
| `kano@demo.hv` | A second approved agency (Kano) |
| `pending@demo.hv` | An agency waiting for approval |
| `suspendedagency@demo.hv` | A suspended agency, with the admin's reason |
| `newagency@demo.hv` | An agency admin who hasn't registered an agency yet |
| `admin@demo.hv` | The super admin console |
| `unverified@demo.hv`, `suspended@demo.hv` | Sign-in edge cases |

Demo data lives in each browser tab and resets when the tab closes; to see one role's action from another role's side, stay in the same tab and sign out and in. No email is sent in demo mode; "Check your email" screens show a link to the page the email would have opened.

**Demo mode:** with `NEXT_PUBLIC_API_MOCKING=enabled` (the Phase 1 default) the app talks to a mock API in the browser, seeded with fictional agencies, workers, requests and placements. Add `?mock_error=CODE` to any page URL (e.g. `/contact?mock_error=RATE_LIMITED`) to make API calls fail with that error code; add `&mock_error_method=POST` and/or `&mock_error_path=/proposals` to limit it to matching calls. Files uploaded in demo mode never leave the browser.

First Playwright run: `pnpm --filter web exec playwright install chromium webkit`.

## Docs

| Document | What's in it |
| --- | --- |
| `docs/frontend-signoff.md` | Every spec acceptance item with its evidence, and the owner's sign-off |
| `docs/backend-handoff.md` | What the backend must implement, schema changes, order of work |
| `docs/architecture.md` | How the frontend is organised |
| `docs/route-map.md` | Every route, who can open it, and when it was built |
| `docs/accessibility.md` | What's checked automatically, exceptions, patterns |
| `docs/bundles.md` | JS per page and the budgets CI enforces |
| `docs/design-tokens.md`, `docs/asset-inventory.md`, `docs/content.md`, `docs/placeholders.md`, `docs/reference-adaptation.md` | Design system, assets, copy, temporary items, reference sites |
| `docs/decisions/` | Architecture decision records (ADRs 0001–0009) |
| `docs/CHANGELOG.md` | A report per milestone |

## Brand originals

The source logo and photos live in `specs/frontend/brandfiles/`. The photos (14–25 MB each) are **not committed** (ADR 0002). Only the optimised variants in `apps/web/public/images/` are. To regenerate them, place `Photo1.jpg` (cleaner), `Photo2.jpg` (driver) and `Photo3.jpg` (nanny) in that folder and run `pnpm --filter web images`.

## Structure

```
apps/web/            Next.js 15 frontend (see docs/architecture.md)
apps/api/            FastAPI backend (from B1)
packages/contracts/  Generated API types (from B7)
docs/                Architecture, ADRs, route map, tokens, assets, changelog
specs/               Approved specs and milestone plans
```
