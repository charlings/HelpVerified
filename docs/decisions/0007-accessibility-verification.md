# 0007 — How accessibility is verified

- **Status:** Accepted
- **Date:** 2026-10-06 (M8)
- **Decided by:** Owner, approving the M8 plan

## Decision

Accessibility is checked by machines on every route rather than by spot checks:

- `e2e/audit.spec.ts` visits every route with seeded data and requires one `h1`, zero axe violations (375 and 1280 px), no horizontal scroll (375/768/1280/1536 px) and 44 × 44 px touch targets. It runs as its own CI job.
- **Touch-target exceptions** follow WCAG 2.5.5 and are coded in the test: links inside a sentence; checkboxes and radios measured by their label row; stretched card links measured by the card.
- **Dialogs** return focus to the control that opened them, or to the page `h1` if it's gone (`components/ui/Dialog.tsx`); Radix does this only for its own trigger component.
- **Contrast** of every semantic colour pairing is computed from `tokens.css` in a unit test, including text over gradients (which axe can't judge).
- **Keyboard-only flows** run on desktop Chromium; WebKit (Safari) doesn't Tab to links by default, so those tests skip the phone project.

Details and the patterns to reuse: `docs/accessibility.md`.
