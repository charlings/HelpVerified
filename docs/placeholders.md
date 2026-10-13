# Temporary assets and placeholders

Everything here must be resolved before production.

| Item | Where used | Current state | Needed from owner | Since |
| --- | --- | --- | --- | --- |
| Photo1 (cleaner) | Services, home (M3), styleguide | Supplied, licence unconfirmed | Licence confirmation or replacement | M1 |
| Photo2 (driver) | Services, home, auth promo panel (M3/M4), styleguide | Supplied, licence unconfirmed | Licence confirmation or replacement | M1 |
| Photo3 (nanny) | Services, home (M3), styleguide | Supplied, licence unconfirmed | Licence confirmation or replacement | M1 |
| `login` reference image | Auth layout reference (M4) | Supplied 2026-10-05 at `specs/frontend/brandfiles/login.jpg` (git-ignored; reference only, never shipped) | — | M1 |
| White logo variant | Navy and gradient sections (M2/M3) | **Not supplied**; logo mark at 20% opacity used in placeholders | Approved white/reversed logo | M1 |
| App sidebar logo | Navy app sidebar and rail (M2) | Logo mark on a white rounded tile, because the full-colour logo can't sit on navy | White logo variant; only `AppShell.tsx` changes | M2 |
| Logo SVG | Header, footer | PNG used | SVG master, if available | M1 |
| Fonts | Site-wide | Plus Jakarta Sans + Inter (proposed) | Confirm or supply brand fonts | M1 |
| Marketing copy | All marketing pages | Draft copy written in M3, marked `TODO(content)` (see `docs/content.md`) | Owner review or final copy | M1 |
| Prices | Pricing page | "Price to be confirmed" (`amountKobo: null`) | Placement fee and agency subscription amounts | M3 |
| Privacy policy, Terms of use | `/privacy`, `/terms` | Section outlines with a visible "Draft — under legal review" notice | Text drafted and reviewed by a lawyer | M3 |
| Contact details | `/contact` | "Contact details will be published before launch." | Email, phone, address | M3 |
| Testimonials | Home | Section hidden (no entries) | Real, attributable testimonials, if wanted | M3 |
| Google sign-in | Login, signup | Button shown; in demo mode it explains Google sign-in isn't live. With mocks off it starts the real flow (ADR 0016) | Nothing: built; checked live at B7 | M4 |
| Transactional email | Signup, forgot password, resend | Not sent; demo mode shows a "Demo: open the link we would have emailed" link | Email provider (backend B6) | M4 |
| Privacy notice version | Signup | `draft-2026-10-05` recorded with each signup | A final, versioned privacy policy | M4 |
| Document storage | Agency verification uploads | Demo mode keeps files in browser memory only (viewable until reload) | Cloudinary account and keys (backend B3) | M5 |
| Subscription amounts | Agency billing | Demo amounts (₦25,000/month) with a visible "Demo amounts" notice | Real price (open decision) | M5 |
| Manage subscription | Agency billing | Button explains Paystack checkout arrives with live payments | Paystack integration (backend B5) | M5 |
| Placement fee | Accept dialog, demo checkout, family payments | Demo value ₦20,000 (`DEMO_PLACEMENT_FEE_KOBO`, `TODO(content)`); family payments shows a "Demo amounts" notice and the checkout says no money moves | Real fee (open decision) | M6 |
| Demo checkout | `/demo/checkout` (demo mode only, 404 otherwise) | Stands in for Paystack's hosted checkout; says no money moves | Paystack integration (backend B5) | M6 |
| Family settings | `/family/settings` | Read-only, with a contact link | Editing, once the backend exists | M6 |
| Agency profile editing | Agency settings | Read-only; "contact us" to change | Self-service editing (later milestone) | M5 |
| Worker photos | Workers | Initials avatars | Photo upload (the signature endpoint already supports `worker_photo`) | M5 |

Missing images render the brand gradient with the logo mark at 20% opacity (`ResponsiveImage` with no entry).
