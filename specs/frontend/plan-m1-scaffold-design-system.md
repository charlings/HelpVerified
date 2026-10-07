# Plan: M1 — Scaffold + design system

**Spec:** `specs/frontend/project-helpverified-web.md` (requirements 1–7, 9–11, 21 partial; milestone M1)
**Status:** Approved 2026-10-04 · Implemented 2026-10-05 (see `docs/CHANGELOG.md`)

## Objective

A monorepo where `apps/web` runs, every route renders a titled placeholder, all design values live in `tokens.css`, brand assets and optimised photos are served through one asset map, lint enforces the module boundaries, and CI runs lint, typecheck, unit tests, build and an axe-checked Playwright smoke test.

Out of scope for M1: real navigation menus (M2), page content (M3), MSW handlers (M4), anything in `apps/api`.

## Environment findings (2026-10-04)

| Tool | Found | Action |
| --- | --- | --- |
| Node | 24.20.0 | OK |
| pnpm | missing | `corepack enable` then pin via `packageManager` in root `package.json` |
| git | 2.55 | `git init` — folder is not a repo yet |
| uv / Python | 0.12.9 / 3.14 | Not needed until B1 |
| Docker | missing | Not needed until B1; note in README |

## Decisions needing approval

1. **Original photos are not committed.** They are 14–25 MB each. Originals stay in `specs/frontend/brandfiles/` (git-ignored); the image script reads from there and writes optimised outputs to `apps/web/public/images/`, which are committed. *Alternative: Git LFS.*
2. **Styleguide route is `/styleguide`, not `/_styleguide`.** In the App Router, a folder starting with `_` is private and never routes. It lives at `app/(dev)/styleguide/` and calls `notFound()` when `NODE_ENV === "production"`.
3. **Logo processing is scripted.** `scripts/brand.ts` (sharp) trims the white background to transparent `logo-full.png` and crops the "H" mark to `logo-mark.png`, then generates favicons from the mark. Output is reviewed by eye before commit; the source PNG is never edited.
4. **Lint enforcement approach:** ESLint `no-restricted-syntax` for hex literals in TS/TSX and for string literals starting with `/` in `href`/`router.push`; `eslint-plugin-boundaries` for the import rules; Stylelint `color-no-hex` on all CSS except `tokens.css`.

## Steps

Each step ends with the listed check passing before moving on.

### 1. Repository and workspace
Create: `.gitignore`, `package.json` (workspace root, `packageManager: pnpm@<latest>`), `pnpm-workspace.yaml`, `.npmrc`, `.editorconfig`, `.nvmrc` (24), `README.md` (stub), `.env.example`.
Then `git init`; first commit contains only these files.
**Check:** `pnpm install` succeeds.

### 2. Next.js app
Create `apps/web` with Next.js 15, TypeScript strict, App Router, `src/` dir, alias `@/` → `src/`. Remove the starter page content.
**Check:** `pnpm --filter web dev` serves `/`; `pnpm --filter web build` passes.

### 3. Design tokens and fonts
Create: `src/styles/tokens.css` (all tokens from `references/design-system.md` §2 plus role aliases), `src/styles/globals.css` (imports Tailwind v4 + tokens, base type styles, reveal CSS stub, reduced-motion rule), `src/app/fonts.ts` (`next/font/google` Plus Jakarta Sans 600/700/800, Inter 400/500/600 as CSS variables).
Modify: `src/app/layout.tsx` — apply fonts, globals, `lang="en"`, skip link to `#main`.
**Check:** build passes; a test element using `bg-blue-600` and `font-display` renders correctly.

### 4. Lint, format, boundaries
Create: `eslint.config.mjs` (Next, TS strict, jsx-a11y, boundaries, restricted syntax per decision 4), `.stylelintrc.json`, `.prettierrc`.
Add scripts: `lint`, `lint:css`, `typecheck`, `format`.
**Check:** lint passes on clean code, and a deliberate violation of each rule (hex in TSX, hex in CSS, path literal, deep cross-feature import, `ui` → `features` import) fails. Violations removed after verifying.

### 5. Config: routes, nav, site, env
Create: `src/config/routes.ts` (full map from `references/frontend.md` §2 + `homeForRole`), `src/config/nav.ts` (typed menu structures built from `routes`, minimal entries), `src/config/site.ts` (name, description, title template `%s · HelpVerified`, base URL), `src/config/env.ts` (Zod-validated `NEXT_PUBLIC_*` vars).
**Check:** typecheck passes; unit test asserts every `routes` entry is unique and starts with `/`.

### 6. Placeholder routes
Create a thin route file for every path in `routes.ts` across `(marketing)`, `(auth)`, `(app)/family|agency|admin`, each rendering `components/layout/PlaceholderPage` with the page title and setting `metadata.title`. Add `not-found.tsx`, `error.tsx`, `global-error.tsx`, a `/403` page, and minimal segment layouts (no real header/sidebar yet). App segments set `robots: { index: false }`.
Create: `src/app/sitemap.ts` (public routes only) and `src/app/robots.ts` (disallow `/family`, `/agency`, `/admin`).
**Check:** build passes; Playwright visits every static route and asserts the document title.

### 7. Brand assets and favicons
Create: `scripts/brand.ts` per decision 3 → `src/assets/brand/logo-full.png`, `logo-mark.png`; `public/favicon/` 16, 32, 180, 192, 512, `favicon.ico`, `site.webmanifest` (theme `#0158E1`). Wire icons and manifest in root `metadata`. Create `src/assets/brand/index.ts` (keys `logoFull`, `logoMark`).
Create: `src/components/brand/Logo.tsx` (variant `full | mark`, height prop, uses the asset map).
**Check:** favicons and manifest load with no 404s; logo shown undistorted at 32 and 40 px height.

### 8. Image pipeline and asset map
Create: `scripts/images.ts` (sharp) — reads Photo1–3 from `specs/frontend/brandfiles/`, writes `public/images/{cleaner,driver,nanny}-{640,1024,1600,2400}.{avif,webp,jpg}`; fails if any 1600 px output exceeds 300 KB. Script `pnpm --filter web images`.
Create: `src/assets/images/index.ts` (entries from `references/design-system.md` §6), `src/components/shared/ResponsiveImage.tsx` (fixed ratio box, `object-position` from focal, `sizes`, lazy unless `priority`, gradient + mark fallback when the entry is missing).
Create: `docs/placeholders.md` listing all three photos as temporary (licence unconfirmed) and the missing `login` reference.
**Check:** script output sizes logged and under budget; unit test renders `ResponsiveImage` with and without a source.

### 9. Core UI primitives
Add shadcn/ui and create token-driven `src/components/ui/`: `Button` (primary, secondary, ghost, link; md/lg; pill vs app radius; loading state), `Input`, `Label`, `Badge` (neutral, info, success, warning, danger, verified), `Card`, `Alert`. Plus `src/lib/cn.ts`.
Only what the styleguide needs; other primitives arrive with the milestone that uses them.
**Check:** Vitest + Testing Library tests for Button loading/disabled state and Badge text tones.

### 10. Styleguide page
Create: `app/(dev)/styleguide/page.tsx` → `features/styleguide/StyleguideScreen` showing colour swatches with computed contrast ratios against white and navy, type scale, spacing scale, radii, shadows, motion tokens, and all button/input/badge states including focus and error.
Create: `src/lib/contrast.ts` (WCAG ratio function) with unit tests against known values (e.g. blue-600 on white = 6.03).
**Check:** page renders in dev; returns 404 in a production build; axe reports zero violations.

### 11. Test tooling
Create: `vitest.config.ts`, `src/test/setup.ts`, `playwright.config.ts` (Chromium + WebKit mobile 375 px), `e2e/routes.spec.ts` (every route: title + axe), `e2e/styleguide.spec.ts`.
Scripts: `test`, `test:e2e`.
**Check:** `pnpm --filter web test` and `test:e2e` green locally.

### 12. CI
Create: `.github/workflows/ci.yml` — job `web`: checkout, corepack, `pnpm install --frozen-lockfile`, lint, lint:css, typecheck, test, build, Playwright + axe. Job `security`: gitleaks, `pnpm audit --audit-level high`.
**Check:** workflow YAML validates (`actionlint` if available); runs green once a remote is added. *No remote exists yet; pushing is the owner's call.*

### 13. Docs and changelog
Create: `docs/architecture.md`, `docs/decisions/0001-stack.md`, `docs/decisions/0002-brand-originals-outside-git.md`, `docs/route-map.md` (generated table from `routes.ts`), `docs/design-tokens.md`, `docs/asset-inventory.md`, `docs/reference-adaptation.md` (skeleton), `docs/CHANGELOG.md` with the M1 report. Fill `README.md` (setup, commands, structure) and `.env.example` (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_API_MOCKING`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_SITE_URL`).
Modify: `CLAUDE.md` — "Current phase" block to M1 in progress at start, complete at end.
**Check:** full QA checklist from `references/testing-and-milestones.md` §3.

## M1 acceptance criteria (from the testing reference)

- [ ] `pnpm install && pnpm --filter web dev` works from a clean clone
- [ ] lint, typecheck, test and build pass (locally; in CI once a remote exists)
- [ ] `tokens.css` holds every design value; lint fails on raw hex elsewhere
- [ ] Every route renders a placeholder with the correct title
- [ ] Favicons and manifest load
- [ ] Photo1–3 optimised ≤ 300 KB at 1600 px and served via the asset map
- [ ] Styleguide shows colours with contrast ratios, type scale, all button/input/badge states
- [ ] axe clean on the styleguide and every placeholder route
- [ ] `.env.example`, README and docs files exist
- [ ] CHANGELOG has the M1 entry

## Risks

- **Logo auto-trim quality:** the PNG has anti-aliased edges on white; trimming may leave a halo. Mitigation: threshold tuning plus visual review; request an SVG or transparent PNG from the owner if needed.
- **Mark crop:** cropping the "H" from the full logo is a coordinate guess; it needs visual sign-off.
- **CI cannot run** until a GitHub remote is added (`gh` CLI is not installed).
- **Version drift:** Next.js 15 is specified while newer majors may exist; the stack says 15, so pin 15 unless the owner approves an upgrade via ADR.
