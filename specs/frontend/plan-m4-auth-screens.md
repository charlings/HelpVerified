# Plan: M4 — Auth screens

**Spec:** `specs/frontend/project-helpverified-web.md` (requirements 13, 18–20, 23–25; milestone M4)
**Reference:** `specs/frontend/brandfiles/login.jpg` (layout and mood only)
**Status:** Approved 2026-10-05 · Implemented 2026-10-05 (see `docs/CHANGELOG.md`)

## Objective

Every authentication screen and state works end to end against the mock API: sign in, sign up with a role picker, agency onboarding, forgot and reset password, email verification, session expiry and role-based redirects. The session lives in memory, survives a reload through a mock refresh cookie, and the workspaces from M2 become protected for real.

Out of scope: workspace content (M5–M7), real Google OAuth and real email (B2, B6).

## Reference adaptation (login.jpg)

| Take | Change | Why |
| --- | --- | --- |
| Split card on a tinted page, form left, promo panel right | Same, on `blue-50` with our card tokens | — |
| Pill inputs and buttons, social sign-in above an "or" divider | Google only | Facebook isn't in our scope |
| Promo panel with wave shapes, headline, person photo, floating round badges | Brand gradient, cyan waves, our driver photo, badges with the verified check and a shield | Purple, emoji, lorem text and the model photo are the reference's, not ours |
| White headline on the purple panel | Headline sits on the darker (blue-700 → blue-600) end of the gradient; cyan only appears at the far corner | White on the cyan end of our gradient fails contrast (about 2.1:1) |
| Single layout | Below 1024 px the panel collapses to a 120 px band with the logo mark on a white tile | No white logo variant exists yet (same rule as the app sidebar) |

## Decisions needing approval

1. **Session model (from the skill):** access token in memory (Zustand), refreshed through `POST /auth/refresh`, which uses an httpOnly cookie on the real API. **In demo mode** the mock can't set httpOnly cookies, so it uses a plain `hv_mock_refresh` cookie. It exists only while mocking is on and is clearly named as such. A non-sensitive `hv_role` cookie lets `middleware.ts` redirect quickly; the API stays the real authority.
2. **Demo inbox.** Mock signup, forgot-password and resend don't send email. In demo mode, the "Check your email" screens show a clearly labelled **Demo: open the link we would have emailed** link, so verification and reset can be tested in the browser. It never renders when mocking is off.
3. **Google sign-in button is shown but honest.** In demo mode, clicking it shows "Google sign-in becomes available when the live service launches" instead of pretending to sign in. B2 wires the real OAuth flow.
4. **Agency onboarding needs an account first.** `/signup/agency` is a 3-step form (business details → address and roles → review) that requires a signed-in, email-verified agency admin, matching `POST /agencies`. Visiting it signed out sends you to `/signup?role=agency&next=/signup/agency`. After submitting, it shows "Application received — we'll email you when it's approved".
5. **Service CTAs carry intent.** `/signup?role=nanny|driver|cleaner` preselects Family and keeps the role in the URL so M6 can prefill the first request. `?role=agency` preselects Agency.
6. **Privacy notice acceptance at signup** is a required checkbox, and the accepted notice version is sent with the signup request (NDPA obligation in `security-and-compliance.md`). Since the policy is still a draft (M3), the version is `draft-2026-10-05`.
7. **Mock rate limit on login:** 5 attempts per email per minute, then `RATE_LIMITED`, matching the API rule. Other limits use `?mock_error=`.
8. **New dependency:** `zustand` (already in the stack).
9. **Existing e2e tests sign in first.** Workspace routes now redirect when signed out, so `routes.spec.ts` and `navigation.spec.ts` use a `signInAs(role)` helper that sets the demo session cookies for a seeded user.

## Screens and states

| Route | States |
| --- | --- |
| `/login` | Default · field errors · submitting · `INVALID_CREDENTIALS` · `RATE_LIMITED` · `ACCOUNT_SUSPENDED` · session-expired banner (`?expired=1`) · redirecting ("Signing you in…") → safe `next` or role home · Google (demo notice) |
| `/signup` | Role picker (Family / Agency) · fields: full name, email, password (show/hide, ≥ 8 chars), privacy checkbox · `EMAIL_TAKEN` (with sign-in link) · submitting · success → "Check your email" with resend and demo inbox |
| `/signup/agency` | Signed-out redirect · `EMAIL_NOT_VERIFIED` notice with resend · stepper (3 steps, per-step validation, back keeps values) · `VALIDATION_ERROR` mapped to the right step · submitted → pending approval |
| `/forgot-password` | Email · submitting · always "If an account exists, we've sent a link" · `RATE_LIMITED` · demo inbox |
| `/reset-password?token=` | Missing token → invalid link · new password + confirm · `TOKEN_EXPIRED` → request a new link · success → sign in |
| `/verify-email?token=` | Verifying (auto) · success → continue · `TOKEN_EXPIRED` → resend · no token → "Check your inbox" + resend |
| Any workspace route | Restoring session (skeleton) · signed out → `/login?next=<path>` · wrong role → `/403` · refresh fails mid-session → `/login?expired=1&next=<path>` |

Copy for every state lives in `src/content/auth.ts`.

## Steps

### 1. Auth layout and shared form pieces
Create `components/layout/AuthLayout.tsx` (split card, panel, mobile band; replaces M2's `AuthFrame`), `features/auth/components/PromoPanel.tsx` (gradient, inline SVG waves, driver photo, two floating badges with a 4 s float that's off under reduced motion, whole panel `aria-hidden`), `components/forms/PasswordInput.tsx` (show/hide toggle with `aria-pressed` and `aria-controls`), `components/ui/Checkbox.tsx`, `components/forms/RadioCards.tsx` (fieldset/legend), `components/forms/Stepper.tsx` (step list with `aria-current="step"`, one form instance, per-step validation), `assets/icons/google.svg` + icon map.
**Check:** unit tests for PasswordInput, RadioCards and Stepper keyboard behaviour; axe on `/login`.

### 2. Session, API client wiring and mocks
Add `zustand`. Create `features/auth/session.ts` (store: `status: "restoring" | "authenticated" | "anonymous"`, `accessToken`, `user`), `features/auth/api.ts` (signup, login, refresh, logout, verify, resend, forgot, reset, me, createAgency), `features/auth/schemas.ts`, `features/auth/redirects.ts` (`safeNext`, `homeForRole`), `features/auth/AuthProvider.tsx` (restores the session once on load and configures the API client).
Modify `lib/api-client.ts`: add `configureAuth({ getToken, refresh, onAuthFailure })`; attach the bearer token; on `401 UNAUTHENTICATED` refresh once and retry; on refresh failure call `onAuthFailure` (clear session, redirect to `/login?expired=1&next=`).
Create `mocks/handlers/auth.ts` and `agencies.ts`, and extend `mocks/db.ts` with seeded users (`family@demo.hv`, `agency@demo.hv`, `admin@demo.hv`, password `demo1234`, all verified; plus `unverified@demo.hv` and `suspended@demo.hv`), refresh tokens, one-time tokens and agencies. Handlers implement the same rules as `api-contracts.md`: generic login error, single-use tokens, `EMAIL_TAKEN`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_SUSPENDED`, one agency per admin, login rate limit.
Modify `app/providers.tsx` to include `AuthProvider`.
**Check:** unit tests: `safeNext` rejects `//evil.com`, `https://…`, `/\evil` and non-app paths; api-client retries once after refresh and calls `onAuthFailure` when refresh fails; mock handlers enforce each rule.

### 3. Guards
Create `middleware.ts`: workspace paths without `hv_role` → `/login?next=<path>`; with the wrong role → `/403`.
Modify `features/auth/components/RoleGuard.tsx`: skeleton while restoring; anonymous → login with `next`; wrong role → `/403`; otherwise render.
**Check:** unit test for RoleGuard states; e2e in step 6.

### 4. Screens
Create in `features/auth/screens/`: `LoginScreen`, `SignupScreen`, `AgencyOnboardingScreen`, `ForgotPasswordScreen`, `ResetPasswordScreen`, `VerifyEmailScreen`, plus `components/CheckEmail.tsx` (with resend and demo inbox) and `components/GoogleButton.tsx`. Content in `src/content/auth.ts`.
Modify the six `app/(auth)/…/page.tsx` route files and `app/(auth)/layout.tsx`. Pages with `useSearchParams` get a `Suspense` boundary.
**Check:** a test per screen for each state in the table above, using MSW.

### 5. Sign-out and account entry in the app shell
Modify `components/layout/app-shell/AppShell.tsx` top bar: the user's name and a **Sign out** button (calls logout, clears the session, returns to `/login`). This replaces the M2 placeholder comment.
**Check:** unit test: sign out clears the session and redirects.

### 6. End-to-end
Create `e2e/helpers/session.ts` (`signInAs(page, role)`) and `e2e/auth.spec.ts`:
- Sign in as each role → lands on that role's home; wrong password → error; 6th attempt → rate-limit message.
- Signed out on `/family/requests` → login with `next` → after sign-in returns to `/family/requests`.
- Family on `/agency` → `/403`.
- Signup (family) → check email → demo link → verified → sign in.
- Forgot → demo link → reset → sign in with the new password; reused link → `TOKEN_EXPIRED` state.
- Agency: signup → verify → onboarding 3 steps → pending approval.
- Session expiry: invalidate the mock refresh token, trigger a request → `/login?expired=1` with banner.
- Keyboard-only sign-in; axe on every auth state screen.
Update `routes.spec.ts` and `navigation.spec.ts` to sign in before visiting workspace routes.
**Check:** full Chromium e2e green.

### 7. Docs and report
Update `docs/architecture.md` (session, guards, mocks), `docs/reference-adaptation.md` (auth table above), `docs/placeholders.md` (Google sign-in, email delivery), `README.md` (demo accounts), the skill's `frontend.md` §7 if anything differs, `docs/CHANGELOG.md` (M4 report), `CLAUDE.md`.

## M4 acceptance criteria (from the testing reference)

- [ ] Every state in design-system §8 and frontend §7 is reachable and covered by tests
- [ ] Login, signup + role picker, agency onboarding, forgot, reset, verify email, session expired, Google button
- [ ] MSW auth handlers, session store, redirects
- [ ] "Demo mode" notice visible (done in M3)
- [ ] lint, typecheck, unit tests, build, Chromium e2e + axe all pass

## Risks

- **Test run time and memory:** the e2e suite grows by about 20 tests plus sign-in steps. Runs use 2 workers on this laptop.
- **Middleware and the demo cookie:** if `hv_role` and the session drift (e.g. the cookie is left from a previous demo user), RoleGuard corrects it after the session restores; middleware is only the fast path.
