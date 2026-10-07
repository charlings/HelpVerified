# Accessibility and states

How HelpVerified meets the accessibility checklist (skill `frontend.md` §10) and the states requirements (spec 18–20, 22), and how each is checked. Established in M8; keep it current when adding a screen.

## What is checked automatically

| Rule | Check | Where |
| --- | --- | --- |
| Zero axe violations on every route | axe at 375 and 1280 px, real seeded data, after animations settle | `e2e/audit.spec.ts` (own CI job `a11y-audit`) |
| No horizontal scroll | `scrollWidth ≤ innerWidth` at 375, 768, 1280, 1536 px | `e2e/audit.spec.ts` |
| Touch targets ≥ 44 × 44 px | every visible link, button, input, select, textarea, tab | `e2e/audit.spec.ts` |
| One `h1` per page | on every route, including while loading | `e2e/audit.spec.ts`, `routes.spec.ts`, `src/test/states.test.tsx` |
| Loading and error states | every data screen, API held open / failing | `src/test/states.test.tsx` |
| Empty states | every list's empty message | screen tests + `src/test/empty-states.test.tsx` |
| Forms | focus moves to the first problem; submit disabled while sending | `src/test/forms.test.tsx` + screen tests |
| Keyboard-only flows | one main flow per milestone, Tab/Enter/Space/arrows/Escape only, focus always visible | `e2e/keyboard.spec.ts` |
| Focus after dialogs | back to the opener; to the page `h1` if the opener is gone | `components/ui/Dialog.tsx`, `e2e/keyboard.spec.ts` |
| Colour contrast | every semantic pairing, read from `tokens.css` | `src/styles/tokens-contrast.test.ts` |
| Reduced motion | content renders in its final state | `e2e/marketing.spec.ts` |

Run the audit locally with one worker (it's heavy): `pnpm exec playwright test e2e/audit.spec.ts --project=chromium --workers=1` (add `--shard=1/4` etc. on a low-memory machine).

## Touch-target exceptions (WCAG 2.5.5)

Coded in `e2e/audit.spec.ts`, not decided case by case:

- **Links inside a sentence** ("Contact us", "Terms") stay inline.
- **Checkboxes and radios** are measured by their label: the whole row is the target (`CheckboxField`, `RadioCards`).
- **Stretched card links** (`after:absolute after:inset-0`) are measured by the card they cover.

Standalone text links (table cells, cards, lists) use `textLink` from `components/ui/link-styles.ts`, which keeps the text look with a 44 px target.

## Patterns to reuse

- **Loading:** `LoadingRegion` (labelled `role="status"`, `aria-busy`) with `Skeleton` shapes. Detail screens keep their `PageHeader` (generic title, back link) while loading.
- **Empty:** `EmptyState` with a title, what happens next, and an action where there is one.
- **Error:** `ErrorState` with "Try again", except for "not found", which is final. Messages come from `lib/error-messages.ts`; raw codes never show.
- **Forms:** React Hook Form focuses the first invalid field. Hand-built dialogs (`ReasonDialog`, `RejectDialog`) focus their field on an error. Radio groups mark the `radiogroup` invalid and each radio points at the error. Buttons with `loading` are disabled.
- **Dialogs:** `components/ui/Dialog` traps focus, closes on Escape and returns focus (see above).
- **Colour:** status badges always include text; yellow/amber means "verified" only.

## Text over gradients

axe can't judge text over a gradient (it reports "needs review"), so these are covered by calculation in `tokens-contrast.test.ts`:

- Auth promo headline: white over the darker part of the panel gradient (≥ 6:1; large text needs 3:1).
- CTA banner: the brand glow behind the navy box was lowered from 60% to 40% opacity in M8 so 80%-white body text stays ≥ 4.5:1 where they overlap.

## Not covered here

Cross-browser (WebKit, Firefox) and screen-reader spot checks happen in M9.
