# Frontend reference (Next.js 15, App Router)

Contents: 1. Layout and boundaries · 2. Routes · 3. Feature module shape · 4. Data fetching and state · 5. Forms · 6. UI states · 7. Auth on the client · 8. Mocks · 9. Animation · 10. Accessibility · 11. SEO · 12. Commands

## 1. Layout and boundaries

```
apps/web/src/
├── app/
│   ├── (marketing)/layout.tsx        # SiteHeader + Footer
│   ├── (marketing)/page.tsx          # Home
│   ├── (marketing)/services/page.tsx, services/[slug]/page.tsx, how-it-works, for-agencies, pricing, about, contact, privacy, terms
│   ├── (auth)/layout.tsx             # AuthLayout (split panel)
│   ├── (auth)/login, signup, signup/agency, forgot-password, reset-password, verify-email
│   ├── (app)/layout.tsx              # QueryClient boundary, AppShell
│   ├── (app)/family/…, (app)/agency/…, (app)/admin/…   # each segment layout runs RoleGuard
│   ├── (dev)/styleguide/page.tsx     # /styleguide, dev-only (404 in prod unless ENABLE_STYLEGUIDE=true); `_` folders never route
│   ├── layout.tsx  providers.tsx  not-found.tsx  error.tsx  global-error.tsx
│   └── sitemap.ts  robots.ts  opengraph-image.tsx
```

Route files stay thin:

```tsx
// app/(app)/agency/workers/[id]/page.tsx
import { WorkerDetailScreen } from "@/features/workers";
export const metadata = { title: "Worker" };
export default function Page({ params }: { params: { id: string } }) {
  return <WorkerDetailScreen workerId={params.id} />;
}
```

Import boundaries (enforced by ESLint `import/no-restricted-paths` and `no-restricted-imports`):

- `features/x/**` may import `components/**`, `lib/**`, `config/**`, `types/**`, `assets/**`, `content/**`, and `features/y` **only via `features/y/index.ts`**.
- `components/ui/**` imports nothing from `features/**`.
- `app/**` imports only feature screens (directly: `@/features/x/screens/Y`), a feature's `index.ts`, layouts, `config/**`. No `fetch`, no `useQuery` in `app/`.
- A feature's `index.ts` must **not** re-export screens: Next bundles every client component reachable through a barrel into every route that imports it (found in M3: zod and react-hook-form shipped on the Home page).
- Multi-step forms: give "Next" and "Submit" buttons distinct `key`s. If React reuses the "Next" `<button>` as `type="submit"`, the click that advances to the last step also submits the form (found in M4).
- Path alias `@/` → `src/`.

## 2. Routes

`src/config/routes.ts` is the single map. Never write a path string in a component.

```ts
export const routes = {
  home: "/", services: "/services", service: (slug: ServiceSlug) => `/services/${slug}`,
  howItWorks: "/how-it-works", forAgencies: "/for-agencies", pricing: "/pricing",
  about: "/about", contact: "/contact", privacy: "/privacy", terms: "/terms",
  auth: { login: "/login", signup: "/signup", signupFor: (role: ServiceSlug) => `/signup?role=${role}`, agencySignup: "/signup/agency",
          forgot: "/forgot-password", reset: "/reset-password", verifyEmail: "/verify-email" },
  family: { home: "/family", requests: "/family/requests", newRequest: "/family/requests/new",
            request: (id: string) => `/family/requests/${id}`, worker: (id: string) => `/family/workers/${id}`,
            placements: "/family/placements", placement: (id: string) => `/family/placements/${id}`,
            payments: "/family/payments", settings: "/family/settings" },
  agency: { home: "/agency", workers: "/agency/workers", newWorker: "/agency/workers/new",
            worker: (id: string) => `/agency/workers/${id}`, requests: "/agency/requests",
            request: (id: string) => `/agency/requests/${id}`, placements: "/agency/placements",
            placement: (id: string) => `/agency/placements/${id}`, billing: "/agency/billing", settings: "/agency/settings" },
  admin: { home: "/admin", agencies: "/admin/agencies", agency: (id: string) => `/admin/agencies/${id}`,
           workers: "/admin/workers", placements: "/admin/placements", audit: "/admin/audit-log" },
} as const;
export const homeForRole = { family: routes.family.home, agency_admin: routes.agency.home, super_admin: routes.admin.home };
```

`config/nav.ts` builds menus (marketing header groups, footer columns, sidebar per role) from `routes`. Adding a page = add the route, add the nav entry, add the route file, add the feature screen.

## 3. Feature module shape

```
features/placements/
├── components/      PlacementTimeline.tsx, PlacementStatusBadge.tsx, ConfirmPlacementDialog.tsx, …
├── screens/         PlacementDetailScreen.tsx, PlacementListScreen.tsx   # composed pages
├── hooks/           usePlacement.ts, usePlacements.ts, usePlacementAction.ts
├── api.ts           getPlacement, listPlacements, confirmPlacement, endPlacement, requestReplacement
├── schemas.ts       Zod schemas (forms + response parsing in dev)
├── status.ts        status → { label, tone, description } and action → { label, variant, confirmText }
├── types.ts         re-exports from generated contracts + view types
├── *.test.tsx
└── index.ts         public surface only
```

Features: `auth`, `marketing`, `requests`, `proposals`, `placements`, `workers`, `verification`, `agencies`, `billing`, `notifications`, `admin`.

Keep components under ~150 lines. If a component fetches data and renders a complex layout, split it into a container hook and a presentational component.

## 4. Data fetching and state

- All HTTP goes through `lib/api-client.ts` (`api.get/post/patch/delete`), which handles base URL, bearer token, one retry on 401 after refresh, `Idempotency-Key` for flagged mutations, and throws `ApiError`.
- TanStack Query for all server data. Query keys from one factory per feature: `placementKeys.detail(id)`. Mutations invalidate exact keys; accept/confirm use optimistic status only when the rollback is obvious.
- Zustand only for client state: `useSessionStore` (access token in memory, user summary) and small UI state (sidebar open). Never put server lists in Zustand. Never store tokens in localStorage.
- Server components for marketing pages (static content from `content/`). Client components for app screens that use Query.
- Status-driven UI: render action buttons from `allowed_actions` returned by the API, labelled via `status.ts`. Do not re-implement transition rules in the browser.

## 5. Forms

- React Hook Form + `zodResolver`. Schema in the feature's `schemas.ts`.
- Use `components/forms/FormField` which wires `<label>`, hint, error and `aria-describedby`/`aria-invalid`.
- Validate on blur, re-validate on change after first error, full validation on submit. Focus the first invalid field on submit.
- Server `VALIDATION_ERROR` field messages are mapped back with `setError`. Other `ApiError` codes show a form-level `Alert` with the message from `lib/error-messages.ts`, which receives focus.
- Submit buttons show a spinner and `aria-busy`, and are disabled while pending to prevent double submits.
- Multi-step forms (new request, add worker, agency onboarding) use `components/forms/Stepper`, keep values in one RHF instance, and validate per step.
- File uploads (`FileDrop`): accept jpg/png/pdf ≤ 10 MB, show progress, request a signature, upload to Cloudinary, then register the `public_id`. Never display the document inline to families.

## 6. UI states

Every data screen handles all of these with shared components from `components/feedback`:

| State | Component | Rule |
| --- | --- | --- |
| Loading | `Skeleton` shaped like the content | No spinners for whole pages |
| Empty | `EmptyState` with icon, one sentence, primary action | E.g. "No workers yet — Add your first worker" |
| Error | `ErrorState` with message and Retry | Uses `ApiError.message`; logs to console in dev |
| Forbidden | redirect to `/403` | |
| Not found | `notFound()` | |
| Success after mutation | `Toast` + updated view | Toasts are `aria-live="polite"` |

Domain-specific must-haves:

- Worker detail: checklist progress `n/4`; "List worker" disabled with the reason ("2 checks still pending: Guarantor, Address") until 4/4; a listed worker shows a green Verified badge with the yellow check motif.
- Propose dialog: lists only listed + available workers; unavailable ones are shown greyed with "In a placement until …".
- Accept: if the API returns `WORKER_UNAVAILABLE`, show "This worker has just been placed with another family" and refresh proposals.
- Placement detail: `PlacementTimeline` shows every event; trial countdown; actions from `allowed_actions`.

## 7. Auth on the client

- Access token held in memory (Zustand, `features/auth/session.ts`); refresh cookie is httpOnly. The session is restored **on demand** by `restoreSession()` (refresh → `/me`) from `RoleGuard` and other pages that need it — not on every page load, so marketing pages make no auth calls.
- `features/auth/client.ts` wires `lib/api-client` via `configureAuth` (bearer token, one refresh on 401, `onAuthFailure`).
- Demo mode: the mock uses a readable `hv_mock_refresh` cookie in place of the httpOnly one, persists its db in `sessionStorage`, and serves `GET /__mock/outbox` for the "demo inbox" link.
- `(app)` segment layouts use a `RoleGuard` client component plus `middleware.ts` that checks a lightweight non-sensitive `hv_role` cookie for fast redirects; the API remains the real authority.
- Session expiry: on a failed refresh, clear state and redirect to `routes.auth.login` with `?expired=1&next=<path>`.
- After login, redirect to `next` if it is a same-origin app path, else `homeForRole[role]`.

## 8. Mocks (Phase 1)

- MSW in `src/mocks`: `handlers/<feature>.ts`, `fixtures/*.ts`, `db.ts` (in-memory store so mutations persist during a session).
- Mocks must implement the real rules (listing gate, one active placement, transitions) and return real error envelopes, so the UI is built against realistic failures.
- Simulate latency (300–800 ms) and provide `?mock_error=<code>` to force errors in development.
- Seeded logins: `family@demo.hv`, `agency@demo.hv`, `admin@demo.hv`, password `demo1234` (mock only).
- A "Demo mode" pill renders whenever mocking is enabled.

## 9. Animation

- `components/animation/Reveal.tsx` + `useInView` (Intersection Observer, `threshold: 0.2`, once). Applies `data-visible`; CSS in `styles/globals.css` does the transition using motion tokens.
- `Stagger` wraps children and sets `--stagger-index` for delays (80 ms steps, max 6).
- Motion library only for app interactions (dialog, sheet, tab underline, list reordering).
- Respect `prefers-reduced-motion`: `useReducedMotion()` returns true → render final state, no parallax. Animate only `opacity` and `transform`.
- No carousels, no scroll-jacking, no autoplay.

## 10. Accessibility checklist

- One `<h1>` per page; headings in order; landmarks (`header`, `nav`, `main`, `footer`); skip link to `#main`.
- Every input has a visible `<label>`; placeholder is never the label.
- Colour is never the only signal: status badges include text.
- Focus visible on all interactive elements (token `--focus-ring`); dialogs trap focus and restore it on close (Radix does this).
- Touch targets ≥ 44 × 44 px.
- Images: meaningful `alt` from the asset map; decorative images `alt=""` and `aria-hidden`.
- Tables have `<caption>` (can be visually hidden) and `scope` on headers; on mobile they become card lists with the same data.
- Run `@axe-core/playwright` on every route in CI; zero violations allowed.

## 11. SEO

- `generateMetadata` per marketing page from `content/`; title template `%s · HelpVerified`.
- `sitemap.ts` from `routes` (public only); `robots.ts` disallows `/family`, `/agency`, `/admin`.
- Open Graph image generated with the logo and brand gradient.
- App routes `noindex`.

## 12. Commands

```
pnpm install
pnpm --filter web dev
pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test
pnpm --filter web test:e2e          # Playwright + axe
pnpm --filter web build
pnpm --filter web images            # sharp: src/assets/images → public/images variants
pnpm contracts:generate             # openapi-typescript from API /openapi.json
```
