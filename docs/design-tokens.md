# Design tokens

All values live in `apps/web/src/styles/tokens.css` (Tailwind v4 `@theme static`). Tailwind's default palette is removed, so only these colours exist as utilities. See them rendered, with live contrast ratios, at `/styleguide`.

## Colour rules

| Token | Use | Never |
| --- | --- | --- |
| `blue-600` #0158E1 | Primary buttons, links, focus ring (6.03:1 on white) | — |
| `blue-700` #0047B8 | Hover/pressed | — |
| `blue-500` #0779FB | Large text (≥ 24 px) and icons | Body or small text (4.09:1) |
| `navy-900` #0A2249 | Headings, dark sections, text on amber | — |
| `cyan-400` #00C2FD | Gradient end, shapes | Text |
| `amber-400` / `yellow-300` | **Verified** only (badge, check motif) | Warnings, decoration, text on white |
| `slate-600` | Body text (7.58:1) | — |
| `slate-500` | Muted text, placeholders | — |
| `danger-600` | Borders, error text on white (4.83:1) | Text on `danger-50` |
| `danger-700` | Text on `danger-50` | — |

Role aliases used by components: `bg`, `surface`, `surface-muted`, `text`, `text-body`, `text-muted`, `border`, `border-strong`, `primary`, `primary-hover`, `on-primary`, `verified`, `on-verified`.

Every text/background pair used by components is asserted ≥ 4.5:1 in `src/styles/tokens.test.ts`.

## Type

- Display: Plus Jakarta Sans 600/700/800 (`font-display`). Body: Inter 400/500/600 (`font-body`, default). Loaded via `next/font`. *Fonts pending owner confirmation.*
- Scale: `xs` 12 · `sm` 14 · `base` 16 · `lg` 18 · `xl` 20 · `2xl` 24 · `3xl` 30 · `4xl` 38 · `5xl` 48 · `6xl` 60 px.
- Headings: line-height 1.1 (h1–h2) / 1.2 (h3–h4), tracking −0.02em on h1–h2. Body: 1.6. Prose max width `68ch`.

## Space, layout, shape, motion

- Spacing: 4 px base (`p-4` = 16 px). Section padding `--section-y` 96 px / `--section-y-mobile` 64 px.
- Containers: marketing 1200 px, app 1440 px, auth form 480 px.
- Controls: `--control-h-md` 44 px (minimum touch target), `--control-h-lg` 52 px.
- Radii: `sm` 8 · `md` 12 · `lg` 24 · `full`. Pill controls on marketing/auth, `md` in the app.
- Shadows: navy-tinted `sm`, `md`, `lg`.
- Motion: `fast` 150 · `base` 250 · `slow` 400 · `reveal` 600 ms, `ease-brand` cubic-bezier(0.22, 1, 0.36, 1); reveal distance 24 px, stagger step 80 ms. Reduced motion renders final state.
- Breakpoints: Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536). Dark mode out of scope.
