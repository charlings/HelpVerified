# Plan: M3 — Marketing pages

**Spec:** `specs/frontend/project-helpverified-web.md` (requirements 12, 17, 18 partial, 19 partial, 20, 21, 22; milestone M3)
**Status:** Approved 2026-10-05 · Implemented 2026-10-05 (see `docs/CHANGELOG.md`)

## Objective

Replace the marketing placeholders with real pages: Home, Services, three service detail pages, How it works, For agencies, Pricing, About, Contact (working form against a mock), Privacy and Terms. Copy lives in typed files under `src/content/`. The Services page gets the reveal-on-scroll and scroll-tracking behaviour from the Profusion reference, built from reusable `Reveal`/`Stagger` components. Pages share a generated Open Graph image and per-page metadata.

Out of scope: auth screens (M4), anything behind sign-in.

## Decisions needing approval

1. **Draft copy now, marked `TODO(content)`.** Every string lives in `src/content/*.ts`. Anything you need to confirm or replace carries a `// TODO(content)` comment. The M3 report lists every marker.
2. **No invented proof.** No made-up statistics, testimonials, partner logos or "trusted by" numbers. The joincolab-style stats band becomes a "What we check" band (the four checks, which are true by design). The testimonial section component is built but renders nothing until `content/testimonials.ts` has real entries.
3. **Prices shown as "To be confirmed".** The placement fee and agency subscription amounts are open questions. `content/pricing.ts` holds `null` amounts and the page says "Price to be confirmed". The page structure is real: what's included, trial, free replacement. Supplying numbers is a one-line change per price.
4. **Privacy and Terms are outlines, not legal text.** They get the right headings (NDPA topics for Privacy: what we collect, why, who sees it, retention, your rights, contact) with short plain-language placeholders marked `TODO(legal)`, plus a visible "Draft — under legal review" notice. I won't write text that reads as final legal terms.
5. **Contact form uses the real data pattern, pulled forward from M4.** M3 adds `lib/api-client.ts`, `lib/error-messages.ts` and MSW with a single `POST /contact` handler matching `api-contracts.md`. The "Demo mode" pill appears whenever mocking is on. M4 then only adds auth handlers. This avoids a throwaway fake-submit function.
6. **New dependencies:** `react-hook-form`, `@hookform/resolvers`, `msw` (forms and mocking, already in the stack) and `lighthouse` (dev only, to measure the Lighthouse acceptance criteria locally with Playwright's Chromium).
7. **No parallax.** The design system lists ≤ 20 px parallax as optional. I'm leaving it out to protect the mobile performance target; reveal and stagger carry the motion.

## Pages and sections

| Page | Sections (in order) | Images |
| --- | --- | --- |
| Home | Hero (headline, sub, two CTAs, nanny photo on a soft shape) · Three roles (cards linking to service pages) · What we check (navy band, four checks) · How it works (3 steps, family view) · For agencies teaser · Trial and replacement promise · CTA banner | nanny, driver, cleaner |
| Services | Intro + sticky anchor chips · Nanny / Driver / Cleaner alternating blocks (image on soft blob, duties, four badges, CTA) · What we check band · Trial and replacement strip · CTA banner | all three |
| Service detail ×3 | Hero with photo · What they do · The four checks explained · How hiring works · Trial and replacement · FAQ (`<details>`) · CTA | one each |
| How it works | Statement block · Family journey (steps) · Agency journey (steps) · Editorial cards linking to services, agencies, pricing | placeholders where no photo fits |
| For agencies | Statement block · Why list here · What you need (registration, subscription, four checks per worker) · Onboarding steps · CTA → agency signup | driver |
| Pricing | Families (placement fee, included items) · Agencies (monthly subscription, included items) · FAQ · CTA | — |
| About | Statement block · Why we exist · How we protect families (the two rules, in plain words) · How we handle data (NDPA summary, links to Privacy) | cleaner |
| Contact | Short intro · form (name, email, phone optional, topic, message) · other ways to reach us (`TODO(content)`) | — |
| Privacy, Terms | Draft notice · outline sections · last-updated date | — |

## Steps

Each step ends with its check passing.

### 1. Dependencies, content model and SEO helpers
Add the dependencies in decision 6. Create `src/content/` with typed modules: `home.ts`, `services.ts` (per role: name, slug, summary, duties, image key, FAQ), `checks.ts` (the four checks), `journey.ts` (family and agency steps), `agencies.ts`, `pricing.ts`, `about.ts`, `contact.ts`, `legal.ts`, `testimonials.ts` (empty), `metadata.ts` (title and description per page).
Create `src/lib/metadata.ts`: `pageMetadata(key)` returns title, description, canonical URL and Open Graph fields from `content/metadata.ts`.
**Check:** typecheck; unit test that every marketing route has a metadata entry with a description of 50–160 characters.

### 2. Animation primitives
Create `components/animation/useInView.ts` (IntersectionObserver, threshold 0.2, once), `useReducedMotion.ts`, `Reveal.tsx` (sets `data-reveal` and `data-visible`; CSS from M1's `base.css` does the transition; `delay` and `variant: "rise" | "scale"`), `Stagger.tsx` (sets `--stagger-index` on children, capped at 6).
Extend `styles/base.css` with the `scale` variant (0.96 → 1).
**Check:** unit tests: content is visible immediately with reduced motion; `data-visible` flips when the observer reports an intersection; Stagger caps the index at 6.

### 3. Shared marketing sections
Create in `features/marketing/components/`: `Section`, `SectionHeading` (eyebrow, h2, sub), `Hero`, `RoleCards`, `ChecksBand`, `Steps`, `EditorialCards`, `TrialPromise`, `CtaBanner`, `FaqList`, `Testimonials` (returns null when empty), `SoftShape` (decorative blob behind photos, `aria-hidden`).
Each section takes content as props; none imports from `content/` directly. Screens wire content to sections.
**Check:** styleguide-style smoke render in a unit test per section; axe in e2e later.

### 4. Home and Services
Create `features/marketing/screens/HomeScreen.tsx`, `ServicesScreen.tsx`, and `components/ServiceBlock.tsx` and `ServiceChips.tsx` (sticky below the header; IntersectionObserver scroll-spy sets `aria-current="true"` on the chip for the section in view; chips are in-page anchor links).
Modify `app/(marketing)/page.tsx` and `services/page.tsx` to render the screens with `pageMetadata`.
Hero photo gets `priority`; everything else lazy.
**Check:** dev render at 375/768/1280; e2e (step 8) for chips and reduced motion.

### 5. Service detail, How it works, For agencies, About
Create `ServiceDetailScreen` (driven by `content/services.ts`, so all three pages share one screen), `HowItWorksScreen`, `ForAgenciesScreen`, `AboutScreen`.
Modify the four route files. Service CTAs link to `routes.auth.signup` with `?role=<slug>` via a small helper in `config/routes.ts` (`routes.auth.signupFor(slug)`).
**Check:** build; titles and descriptions per page.

### 6. Pricing, Privacy, Terms
Create `PricingScreen` (decision 3) and `LegalScreen` (decision 4, shared by Privacy and Terms, driven by `content/legal.ts`).
Modify the three route files.
**Check:** no currency amount appears in the rendered Pricing page while amounts are `null` (unit test).

### 7. Contact form, API client and mocks
Create:
- `lib/api-client.ts`: `api.post/get/…`, base URL from `env`, JSON, typed `ApiError { code, message, fields? }` from the error envelope. Bearer token and refresh slots are left as clearly typed parameters for M4.
- `lib/error-messages.ts`: code → user message for every code in `api-contracts.md` §2.
- `components/forms/FormField.tsx` (label, hint, error, `aria-describedby`, `aria-invalid`), `components/ui/Textarea.tsx`, `components/ui/Select.tsx` (native `<select>`, styled).
- `features/marketing/contact/`: `schemas.ts` (Zod), `api.ts` (`submitContact`), `ContactForm.tsx` (RHF + zodResolver; validate on blur, re-validate on change after the first error, focus the first invalid field on submit, server `VALIDATION_ERROR` mapped to fields, other errors as a focused form-level `Alert`, success state replaces the form and receives focus), `ContactScreen.tsx`.
- `mocks/`: `browser.ts`, `server.ts` (Vitest), `handlers/contact.ts` (300–800 ms latency, `?mock_error=<code>` support, 202 on success), `db.ts` (in-memory store), `MockProvider.tsx` (starts the worker before first render when `NEXT_PUBLIC_API_MOCKING=enabled`).
- `components/feedback/DemoModePill.tsx`: fixed, small, "Demo mode — data is not real", visible whenever mocking is on.
- `public/mockServiceWorker.js` via `msw init`.
Modify `app/providers.tsx` (new) and `app/layout.tsx` to wrap children in providers.
**Check:** unit tests for the form: field errors on blur, first invalid field focused on submit, server field errors mapped, `RATE_LIMITED` shows the mapped message, success state. `api-client` test: an error envelope becomes `ApiError`.

### 8. End-to-end, performance and metadata
Create `e2e/marketing.spec.ts`:
- Services chips: scrolling to the Driver section marks the Driver chip current; clicking a chip moves focus to the section heading.
- Reduced motion (`page.emulateMedia({ reducedMotion: "reduce" })`): every `[data-reveal]` element is fully visible without scrolling.
- Contact: submit empty shows field errors and focuses the first; valid submit shows success; `?mock_error=RATE_LIMITED` shows the rate-limit message.
- Each marketing page has a unique title, a meta description and a canonical link; `/opengraph-image` returns a PNG.
- Demo pill visible when mocking is on.
Create `src/app/opengraph-image.tsx` (logo on the brand gradient, 1200×630).
Add `scripts/lighthouse.mts` + `pnpm --filter web lighthouse`: builds once, runs Lighthouse mobile on Home and Services with Playwright's Chromium, fails below performance 90 / accessibility 100 / SEO 100, writes reports to `apps/web/lighthouse/` (git-ignored).
**Check:** Chromium e2e green with axe on all routes; Lighthouse thresholds met.

### 9. Docs and report
Update `docs/placeholders.md` (copy, prices, legal text, contact details), add `docs/content.md` (how to edit copy; the `TODO(content)` and `TODO(legal)` list), update `docs/reference-adaptation.md`, `docs/architecture.md` (content, mocks, api-client), `.env.example` comments, `docs/CHANGELOG.md` (M3 report), `CLAUDE.md`.

## M3 acceptance criteria (from the testing reference)

- [ ] Home, Services (+ Reveal/Stagger), service detail ×3, How it works, For agencies, Pricing, About, Contact (mocked submit), Privacy, Terms
- [ ] Metadata per page, sitemap, robots, OG image
- [ ] Lighthouse mobile ≥ 90 performance, 100 accessibility, 100 SEO on Home and Services
- [ ] Reduced motion verified
- [ ] Copy from `content/`, with every `TODO(content)` marker listed
- [ ] lint, typecheck, unit tests, build, Chromium e2e + axe all pass

## Risks

- **Lighthouse on a slow, busy laptop** can under-report performance. Scores are taken from a production build with CPU throttling as Lighthouse defines it; if the machine is the bottleneck I'll report the raw numbers rather than tune for the test.
- **MSW in the App Router:** the worker must start before the first client request. `MockProvider` renders children only after `worker.start()` resolves, when mocking is enabled. Marketing pages are server-rendered, so they're unaffected.
- **Copy volume:** draft copy is the bulk of this milestone. It's written to be accurate about how the product works (four checks, trial, replacement), never to make claims about scale or results.
