# Architecture

## Monorepo

| Path | Purpose | Tooling |
| --- | --- | --- |
| `apps/web` | Next.js 15 App Router frontend | Bun (ADR 0018), TypeScript strict, Tailwind v4 |
| `apps/api` | FastAPI backend (Phase 2, from B1) | uv, Python |
| `packages/contracts` | TypeScript types generated from the API's OpenAPI schema (from B7) | openapi-typescript |

## `apps/web/src`

| Folder | Owns | May import |
| --- | --- | --- |
| `app/` | Routing only: route groups `(marketing)`, `(auth)`, `(app)/family|agency|admin`, `(dev)`. Route files render a feature screen or layout component and set metadata. | `components`, `config`, feature `index.ts` |
| `config/` | `routes.ts` (every path), `nav.ts` (menus), `site.ts`, `env.ts` (validated `NEXT_PUBLIC_*`) | — |
| `styles/` | `tokens.css` (the only place raw colour values appear), `base.css`, `globals.css` | — |
| `assets/` | `brand/` (logo + map), `images/index.ts` (the only place image paths appear) | — |
| `components/` | Shared, feature-agnostic UI: `ui/`, `layout/` (frames, `app-shell/`), `navigation/` (header, menus, icon map), `brand/`, `shared/` (later `forms/`, `feedback/`, `animation/`) | `lib`, `config`, `assets` — never `features` |
| `features/<name>/` | Feature logic: `components/`, `screens/`, `hooks/`, `api.ts`, `schemas.ts`, `status.ts`, `index.ts` | `components`, `lib`, `config`, `assets`, `content`, other features via `index.ts` only |
| `lib/` | Framework-free helpers: `api-client` (the only place that calls `fetch`), `error-messages`, `format`, `active-link`, `cn`, `contrast` | `config` |
| `content/` | Typed marketing copy (see `docs/content.md`) | `config`, `assets` |
| `mocks/` | Phase 1 mock API (MSW): `handlers/`, in-memory `db`, error helpers, `browser.ts` (dev/demo), `server.ts` (Vitest) | `lib`, `config`, feature `index.ts` |
| `test/` | Vitest setup | — |

These boundaries are enforced by ESLint (`apps/web/eslint.config.mjs`):

- `import/no-restricted-paths`: `components`, `lib` and `config` cannot import from `features`.
- `no-restricted-imports`: no deep imports into another feature (`@/features/x/...`); `@tanstack/react-query` is banned in `app/`.
- `no-restricted-globals`: no `fetch` in `app/`.
- `no-restricted-syntax`: no hex colour literals, no path string literals in `href` / `router.push` / `redirect`, no raw image paths in `src`.
- Stylelint `color-no-hex` everywhere except `tokens.css`.

## Frames and navigation

| Route group | Frame | Contents |
| --- | --- | --- |
| `(marketing)` + 404 | `components/layout/MarketingFrame` | `SiteHeader` (logo, `DesktopNav` dropdowns at ≥ 1024 px, `MobileNav` drawer below), `<main id="main">`, `SiteFooter` |
| `(auth)` | `components/layout/AuthLayout` | Split card: logo header, form `<main>`, legal `<footer>`, promo panel ≥ 1024 px (gradient band below) |
| `(app)/family|agency|admin` | `RoleGuard` → `components/layout/app-shell/AppShell` | Navy sidebar ≥ 1024 px, 72 px icon rail 768–1023 px, top bar + bottom tabs < 768 px (agency overflow in a "More" sheet) |
| `(dev)` | none | Styleguide renders its own `<main>` |

- Frames own the single `<main id="main">` (the skip-link target). Page components render content only.
- Menus come from `config/nav.ts`. App items carry an icon *name*, resolved by `components/navigation/icons.ts`.
- Active state comes from `lib/active-link.ts`: workspace homes match exactly, sections match by path prefix at segment boundaries.
- Desktop dropdowns use Radix NavigationMenu and open on click/Enter only (hover disabled). Drawers and sheets use Radix Dialog for the focus trap, Esc and focus return.
- Route files import a feature's screens directly (`@/features/x/screens/Y`); a feature's `index.ts` exposes only shared pieces. Re-exporting screens from a barrel made every route bundle every screen's client code (M3).

## Data and mocks (Phase 1)

- `lib/api-client.ts` builds URLs from `NEXT_PUBLIC_API_BASE_URL`, sends JSON, adds `Idempotency-Key` when asked, and turns the API's error envelope into a typed `ApiError { code, message, status, fields, requestId }`. Network failures become `NETWORK_ERROR`.
- `lib/error-messages.ts` maps every error code to a user-facing sentence; components never show codes.
- When `NEXT_PUBLIC_API_MOCKING=enabled`, `app/providers.tsx` starts the MSW worker in the background and sets the API client's request gate, so pages render immediately and API calls wait for the mock. The "Demo mode" notice shows whenever mocking is on.
- Mock handlers return real error envelopes and add 300–800 ms latency. Opening a page with `?mock_error=CODE` makes the next API call fail with that code.
- `next.config.ts` aliases `msw/browser` to an empty module in the server build, because MSW refuses to load under Node.
- Phase 2 (B7) switches features to the real API by removing their handlers; feature code does not change.

## Workspace data (M5)

- **Server data:** TanStack Query, one cache per signed-in workspace (`components/providers/WorkspaceProviders`, created inside `RoleGuard`, so signing out discards it). Query keys come from each feature's `api.ts` (`workerKeys`, `verificationKeys`, `agencyKeys`). Mutations invalidate the keys whose data they can change (a check change refreshes the worker, the worker lists and the dashboard). 4xx errors aren't retried.
- **Shared domain types** live in `src/types/domain.ts` (mirroring the database enums) so features don't import each other's internals.
- **Status maps** are the single source of labels, colours and explanations: `features/workers/status.ts`, `features/verification/status.ts`. `features/workers/listing.ts` explains why "List worker" is disabled; the API is still the authority.
- **Data views** use shared pieces: `components/feedback` (`Skeleton`/`LoadingRegion`, `EmptyState`, `ErrorState`, `Toast`), `components/data/DataTable` (table on md+, cards below), `Pagination`, `components/ui/Dialog`, `components/forms/FileDrop`.
- **Uploads:** `features/verification/api.ts` gets a signature from the API, `lib/cloudinary.ts` uploads straight to Cloudinary (XHR for progress), then the `public_id` is registered with the API. Documents are viewed in-app (`DocumentViewer`) through short-lived URLs fetched on open and never cached.
- **Mock domain:** `mocks/seed.ts` (fictional demo data, NINs only as hashes), `mocks/domain.ts` (tenant lookup, activity gate, expiry on read, delist rules, response shapes), `mocks/placements-domain.ts` (state machine transitions with events, hold expiry, what each role sees) and one handler file per resource. Uploaded files stay in page memory (`fileBlobs`); metadata persists in `sessionStorage`.
- **Placements:** `features/placements/state-machine.ts` is the TypeScript mirror of the backend state machine (database.md §6). Only the mock uses it to compute `allowed_actions`; screens render the actions the API returns, labelled via `features/placements/status.ts`, and handle only those they support. Placement screens take a `viewer` (agency or family) so M6 reuses them.
- **Requests and proposals** share one feature (`features/requests`): proposals only exist in the context of a request. Agencies see the area, schedule and budget of a request, never the family's name, until a placement exists.

## Family workspace (M6)

- **Family requests** live beside the agency side in `features/requests` (`family-api.ts`, `family-hooks.ts`). The mock answers family callers on the shared paths (`/requests`, `/proposals/...`) and falls through to the agency handlers otherwise.
- **Payments follow Paystack's redirect flow:** accept returns an `authorization_url`; the family leaves the app, pays, and returns to `/family/payments/callback`, which only trusts `GET /payments/{reference}/verify`. In demo mode the URL points at `/demo/checkout` (`features/payments`), which simulates `charge.success`. Swapping in real Paystack changes the URL, not the screens.
- **Placement actions:** `usePlacementActions` (`features/placements/hooks.ts`) runs every action and refreshes the placement, workers, dashboards, requests and billing together. Actions needing a reason share `ReasonDialog`.
- **Shared payment history:** `features/billing/components/PaymentHistory` serves agency billing and family payments; the API scopes payments to the signed-in user.
- **Families feature** (`features/families`): dashboard and read-only settings.

## Admin console (M7)

- **`features/admin`** holds the overview, agencies, workers review and audit log. Agency actions come from `allowed_actions` on the agency (computed in `mocks/admin-domain.ts`, as placements use their state machine), labelled via `features/admin/status.ts`.
- **Reused, not copied:** admin placements use `PlacementsListScreen` / `PlacementDetailScreen` with `viewer="super_admin"` (both family and agency shown); documents open in the verification feature's `DocumentViewer`; reasons use `components/forms/ReasonDialog`; numbers use `components/data/StatCard`.
- **Admin worker review is read-only** (`AdminCheck` in `AdminWorkerDetailScreen`): no uploads or verify buttons, only View (logged) and Flag. The agency's editable `CheckCard` shows a flag as "Flagged by HelpVerified".
- **Audit:** `writeAudit` in the mock is called by admin actions, document views (any viewer) and admin-ended placements. Entries link back to their record (`auditEntityHref`).
- **Forced errors in demo mode** can target one request type: `?mock_error=CODE&mock_error_method=POST&mock_error_path=/proposals`.

## Authentication (M4)

- **Session:** `features/auth/session.ts` (Zustand) holds `status`, the access token (memory only) and the user. `features/auth/client.ts` wires the API client (`configureAuth`): it attaches the bearer token, refreshes once on `401`, and on refresh failure clears the session and redirects to `/login?expired=1&next=…`.
- **Restore on demand:** `restoreSession()` (refresh → `/me`) runs only where a session is needed (`RoleGuard`, agency onboarding), so marketing pages never load the mock API or make auth calls.
- **Guards:** `middleware.ts` redirects workspace paths using the non-sensitive `hv_role` cookie (fast path). `RoleGuard` re-checks after restore: anonymous → `/login?next=`, wrong role → `/403`. The API remains the authority.
- **Redirects:** `features/auth/redirects.ts` only accepts same-origin in-app `next` paths, and only ones the signed-in role may open.
- **Demo mode:** the mock API stands in for the httpOnly refresh cookie with a readable `hv_mock_refresh` cookie, keeps its database in `sessionStorage` (survives reloads, cleared with the tab), and exposes `GET /__mock/outbox` so "Check your email" screens can show the link that would have been emailed. Seeded accounts: `family@demo.hv`, `agency@demo.hv`, `admin@demo.hv`, `newagency@demo.hv` (no agency yet), `unverified@demo.hv`, `suspended@demo.hv`; password `demo1234`.
- **Layout:** `(auth)` pages use `components/layout/AuthLayout` (split card from the login reference) with `features/auth` `PromoPanel` and `AuthLegal` passed in; the app shell receives `AccountControls` through its `account` prop.

## Rendering

- Marketing and auth pages are static server components. Only interactive pieces are client components (`Reveal`, `Stagger`, `ServiceChips`, `ContactForm`, navigation menus).
- The hero on each page is not animated, so the largest content paints without waiting for JavaScript. A `<noscript>` rule shows all reveal content when JavaScript is off.
- Per-page metadata comes from `content/metadata.ts` through `pageMetadata()` (title, description, canonical, Open Graph with the generated `/opengraph-image`).
- App workspaces are client-heavy from M4 (TanStack Query, MSW in Phase 1), and every `(app)` route is `noindex`.
- Photos are served as pre-built AVIF/WebP/JPEG variants through `components/shared/ResponsiveImage` (a `<picture>` element), not `next/image`. See ADR 0003.

## Testing

- Unit: Vitest + Testing Library, co-located `*.test.ts(x)`.
- End-to-end: Playwright in `apps/web/e2e`, Chromium desktop + WebKit at 375 px, axe on every route.
- CI: `.github/workflows/ci.yml`.
