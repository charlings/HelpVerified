# Plan: M2 — Shell + navigation

**Spec:** `specs/frontend/project-helpverified-web.md` (requirements 2, 12 partial, 16 partial, 20, 22; milestone M2)
**Status:** Approved 2026-10-05 · Implemented 2026-10-05 (see `docs/CHANGELOG.md`)

## Objective

Every page sits inside the right frame. Marketing and auth pages get a site header (grouped menus, mobile drawer) and footer. Family, agency and admin workspaces get an app shell whose navigation adapts to the screen: sidebar on desktop, icon rail on tablet, bottom tabs on phone. All of it works by keyboard alone and stays axe-clean.

Out of scope: real sign-in, session or redirects (M4); page content (M3); notifications and user menu contents (M4–M6); the "Demo mode" pill (M4, with MSW).

## Decisions needing approval

1. **Sidebar logo.** The design system puts the app sidebar on navy-900, but the full-colour logo must not sit on dark backgrounds and no white variant exists yet. Until one is approved, the sidebar header shows the logo mark on a small white rounded tile. When a white logo arrives, only `Sidebar.tsx` changes.
2. **Agency bottom tabs on phones.** Agencies have 6 nav items; a bottom tab bar fits 5 comfortably at 375 px. The first 4 show as tabs plus a **More** tab that opens a sheet with the rest (Billing, Settings). Family and admin have 5 items and need no More tab.
3. **Icons: add `lucide-react`.** M5–M7 need dozens of icons; hand-drawing SVGs doesn't scale. Nav config stores an icon *name*, and a single map in `components/navigation/icons.ts` resolves names to components, so config stays free of React imports.
4. **New Radix primitives:** `@radix-ui/react-navigation-menu` (accessible desktop dropdowns) and `@radix-ui/react-dialog` (mobile drawer and More sheet; focus trap, Esc to close and focus return come built in).
5. **404 page gets the site header and footer.** Today the root `not-found.tsx` renders bare. It will render inside the marketing frame so a lost visitor can navigate away.
6. **RoleGuard is a pass-through stub in M2.** Each workspace layout wraps children in `<RoleGuard role="…">`, which renders children unchanged and carries a typed `role` prop. M4 adds the session check, `middleware.ts` and the 403 redirect without touching the layouts.

## Steps

Each step ends with its check passing.

### 1. Dependencies and nav config
Add `lucide-react`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-dialog`.
Modify `src/config/nav.ts`: add an `icon` name to every app nav item, and a `primaryCount` per role for bottom tabs (agency 4, others 5). Add header CTAs (`Sign in` → `routes.auth.login`, `Get started` → `routes.auth.signup`).
Create `src/lib/active-link.ts`: `isActive(pathname, href, { exact })`. Workspace homes match exactly; other items match their prefix, so `/family/requests/new` highlights Requests and not Dashboard.
**Check:** unit tests for `isActive` (exact home, nested prefix, no false prefix match like `/agency` vs `/agency-x`) and for nav config (every href is in `routes`, every icon name exists in the map, ≤ 5 tabs per role).

### 2. Marketing header
Create in `src/components/navigation/`:
- `SiteHeader.tsx`: sticky, white, bottom border; full logo (32 px mobile, 40 px desktop) linking home; desktop nav at ≥ lg; CTAs; hamburger button < lg.
- `DesktopNav.tsx`: Radix NavigationMenu. Groups (Services) open a panel of links; plain links render directly. `aria-current="page"` on the active item.
- `MobileNav.tsx`: Radix Dialog as a right-side sheet. Groups render as `<details>`-style disclosures. Closes on link click and on route change; Esc closes and returns focus to the hamburger.
**Check:** renders at 375/768/1280 in dev; unit test that MobileNav opens, shows every nav link and closes on Esc.

### 3. Footer
Create `src/components/layout/SiteFooter.tsx`: slate-50 background, logo + one-line description, four columns from `footerNav` (headings as `<h2>` styled small), bottom row with © year and legal links. Columns stack to 2 at md and 1 below sm.
**Check:** links come only from `footerNav`; axe clean.

### 4. Wire marketing and auth frames
Modify `app/(marketing)/layout.tsx`: render `SiteHeader`, `children`, `SiteFooter`.
Modify `app/(auth)/layout.tsx`: minimal header (logo only, linking home), no footer. The split panel comes in M4.
Modify `app/not-found.tsx`: wrap in header and footer (decision 5).
Modify `components/layout/PlaceholderPage.tsx` and `StatusPage.tsx`: they render `<main id="main">` today. Move `<main>` ownership to the layouts so there's exactly one per page, and make these components render content only.
**Check:** Playwright: exactly one `main`, one `h1`, one `banner`, and on marketing pages one `contentinfo`.

### 5. App shell
Create in `src/components/layout/app-shell/`:
- `AppShell.tsx`: grid layout. Sidebar at ≥ lg, rail at md–lg, top bar + bottom tabs below md. Takes `role`.
- `Sidebar.tsx`: navy-900, 256 px, logo-mark tile (decision 1), item list with icon + label, active item white text with blue-600 left indicator.
- `NavRail.tsx`: 72 px, icons with visible text labels underneath (no icon-only buttons, so there's no tooltip dependency).
- `BottomTabs.tsx`: fixed bottom, 5 slots ≥ 44 px tall, safe-area padding, `aria-current`; More sheet for agency (decision 2).
- `AppTopBar.tsx`: workspace name, placeholder slots for notifications and account (M4+), visible on all sizes.
Create `src/components/navigation/icons.ts` (decision 3).
**Check:** unit test: AppShell renders the correct items per role; the More sheet lists the overflow items.

### 6. Workspace layouts and RoleGuard stub
Create `src/features/auth/components/RoleGuard.tsx` and `src/features/auth/index.ts`. RoleGuard is a pass-through for now (decision 6).
Create `app/(app)/family/layout.tsx`, `agency/layout.tsx`, `admin/layout.tsx`: each renders `<RoleGuard role=…><AppShell role=…>{children}</AppShell></RoleGuard>`.
Modify `app/(app)/layout.tsx`: keep the noindex metadata and remove the placeholder wrapper styling (AppShell owns it).
Modify `app/(marketing)/403/page.tsx` copy only if needed after StatusPage changes.
**Check:** build passes; each workspace shows its own nav.

### 7. End-to-end tests
Create `e2e/navigation.spec.ts`:
- Desktop: Tab from the skip link reaches the Services trigger; Enter opens it; Tab/arrows reach each service link; Esc closes and focus returns to the trigger.
- Mobile (375 px): hamburger opens the drawer; Tab cycles inside it (focus trapped); Esc closes and focus returns; clicking a link navigates and closes it.
- App shell: at 1280 the sidebar is visible and the bottom tabs are hidden; at 768 the rail is visible; at 375 the bottom tabs are visible. Active item has `aria-current="page"` on a nested route. Agency More sheet at 375 lists Billing and Settings.
- Landmarks per page as in step 4.
Update `e2e/routes.spec.ts` only where landmark expectations change.
**Check:** full Chromium e2e suite green, axe zero violations on every route.

### 8. Docs and report
Update `docs/architecture.md` (components/navigation, app-shell), `docs/placeholders.md` (sidebar logo tile pending a white logo), `docs/reference-adaptation.md` (header dropdown and footer adapted from joincolab), `docs/CHANGELOG.md` (M2 report), `CLAUDE.md` phase block.

## M2 acceptance criteria (from the testing reference)

- [ ] Keyboard navigation works through all menus (header dropdowns, mobile drawer, sidebar, rail, bottom tabs, More sheet)
- [ ] Mobile drawer traps focus and returns it on close
- [ ] Correct nav per role at 375, 768 and 1280 px
- [ ] Marketing header with grouped menus, mobile drawer, footer
- [ ] AppShell with sidebar / rail / bottom tabs per role
- [ ] RoleGuard stub in every workspace layout
- [ ] 404, 403 and error pages render inside an appropriate frame
- [ ] lint, typecheck, unit tests, build and Chromium e2e + axe all pass

## Risks

- **Radix NavigationMenu on touch/hover:** it opens on hover by default, which can feel jumpy. It will open on click/Enter only, which is also more predictable for keyboard users.
- **Bottom tabs overlap content:** page content needs bottom padding equal to the tab bar height plus the safe area; covered by an e2e check that the last element on a page is not hidden behind the bar.
- **Slow network:** three new packages; install may take several minutes.
