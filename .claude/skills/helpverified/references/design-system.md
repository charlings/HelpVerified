# Design system reference

Contents: 1. Principles · 2. Tokens (tokens.css) · 3. Typography · 4. Components look · 5. Brand assets · 6. Images · 7. Reference adaptation rules · 8. Login page · 9. Services page

## 1. Principles

- The brand is blue-led with one warm accent. Yellow means **verified**; do not use it for anything else (not warnings, not decoration without meaning).
- Marketing pages: editorial, spacious, calm. App pages: dense, clear, task-first.
- Priority when choices conflict: user clarity → accessibility → responsive behaviour → brand consistency → performance → reference similarity.
- All values come from `apps/web/src/styles/tokens.css`. A lint rule (stylelint `color-no-hex` outside tokens, ESLint ban on hex in TSX) enforces this.

## 2. Tokens

```css
/* apps/web/src/styles/tokens.css */
@theme {
  /* Brand colours (sampled from HelpVerified_Gradient_Logo.png) */
  --color-navy-900: #0A2249;   /* "Help" wordmark — headings, dark sections. 15.7:1 on white */
  --color-navy-800: #142E5C;
  --color-blue-700: #0047B8;   /* hover/pressed. 8.1:1 */
  --color-blue-600: #0158E1;   /* PRIMARY: buttons, links, focus. 6.03:1 */
  --color-blue-500: #0779FB;   /* "Verified" wordmark — large text ≥24px, icons only. 4.09:1 */
  --color-blue-100: #E6F0FE;
  --color-blue-50:  #F3F8FF;   /* page tint, auth background */
  --color-cyan-400: #00C2FD;   /* gradient end, shapes. Never text */
  --color-yellow-300: #FDF15C; /* check stroke light */
  --color-amber-400: #FDCA26;  /* check stroke dark — verified badge. Navy text on it (10.2:1). Never text on white */

  /* Neutrals */
  --color-white: #FFFFFF;
  --color-slate-50: #F8FAFC;  --color-slate-100: #F1F5F9; --color-slate-200: #E2E8F0;
  --color-slate-300: #CBD5E1; --color-slate-500: #64748B; --color-slate-600: #475569; /* body 7.58:1 */
  --color-slate-700: #334155; --color-slate-900: #0F172A;

  /* Semantic (verify each ≥4.5:1 on its background in the styleguide) */
  --color-success-600: #15803D; --color-success-50: #F0FDF4;
  --color-warning-700: #B45309; --color-warning-50: #FFFBEB;
  --color-danger-700:  #B91C1C; /* text on danger-50 — danger-600 there is only 4.41:1 */
  --color-danger-600:  #DC2626; --color-danger-50:  #FEF2F2; /* danger-600: borders, error text on white (4.83:1) */
  --color-info-600: var(--color-blue-600);

  /* Gradient */
  --gradient-brand: linear-gradient(135deg, #0158E1 0%, #00C2FD 100%);
  --gradient-verified: linear-gradient(135deg, #FDF15C 0%, #FDCA26 100%);

  /* Typography */
  --font-display: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Inter", ui-sans-serif, system-ui, sans-serif;
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem; --text-lg: 1.125rem; --text-xl: 1.25rem;
  --text-2xl: 1.5rem; --text-3xl: 1.875rem; --text-4xl: 2.375rem; --text-5xl: 3rem; --text-6xl: 3.75rem;

  /* Spacing (4px base) */
  --spacing: 0.25rem;  /* Tailwind multiplier: p-4 = 16px */
  --section-y: 6rem;   --section-y-mobile: 4rem;

  /* Layout */
  --container-marketing: 75rem;  /* 1200px */
  --container-app: 90rem;        /* 1440px */
  --container-auth-form: 30rem;  /* 480px */

  /* Radii */
  --radius-sm: 0.5rem;  --radius-md: 0.75rem;  --radius-lg: 1.5rem;  --radius-full: 9999px;

  /* Shadows (navy-tinted) */
  --shadow-sm: 0 1px 2px rgb(10 34 73 / 0.06), 0 1px 3px rgb(10 34 73 / 0.08);
  --shadow-md: 0 4px 12px rgb(10 34 73 / 0.08);
  --shadow-lg: 0 16px 40px rgb(10 34 73 / 0.12);

  /* Motion */
  --duration-fast: 150ms; --duration-base: 250ms; --duration-slow: 400ms; --duration-reveal: 600ms;
  --ease-brand: cubic-bezier(0.22, 1, 0.36, 1);

  /* Focus */
  --focus-ring: 0 0 0 2px var(--color-white), 0 0 0 4px var(--color-blue-600);
}
```

Breakpoints are Tailwind defaults: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. Dark mode is out of scope; tokens are role-named so it can be added.

Role aliases used by components (define in the same file): `--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-primary`, `--color-primary-hover`, `--color-on-primary`.

## 3. Typography

- Fonts loaded with `next/font/google` (`Plus_Jakarta_Sans` weights 600/700/800, `Inter` 400/500/600), `display: swap`, exposed as CSS variables.
- Headings: display font, `font-weight 700`, `line-height 1.1` (h1–h2) / `1.2` (h3–h4), `letter-spacing -0.02em` on ≥ 3xl.
- Body: Inter 16px, `line-height 1.6`, colour slate-600; marketing paragraphs `max-width: 68ch`.
- Hero h1: 5xl mobile → 6xl desktop. Section h2: 3xl → 4xl. Eyebrows: sm, 600, uppercase, `letter-spacing 0.08em`, blue-600.

## 4. Component look

| Component | Spec |
| --- | --- |
| Button primary | bg blue-600, text white, hover blue-700, radius full (marketing/auth) or md (app), height 44 (md) / 52 (lg), padding x 20/28, font 600 |
| Button secondary | white bg, navy text, 1px slate-200 border, hover slate-50 |
| Button ghost / link | blue-600 text, underline on hover for link |
| Input | height 44, radius full on auth/marketing, md in app; border slate-300; focus ring token; error border danger-600 + message below |
| Card | white, radius md (app) / lg (marketing), shadow-sm, padding 24 |
| Badge | radius full, sm text, 600; tones: neutral, info, success, warning, danger, **verified** (amber gradient bg, navy text, check icon) |
| Status badges | Placement: pending_payment = warning "Awaiting payment", trial = info "Trial", confirmed = success "Confirmed", ended = neutral "Ended", cancelled = neutral "Cancelled". Worker: draft = neutral, listed = verified, delisted = warning, suspended = danger |
| Table | header slate-50, row height 56, hover slate-50; mobile → stacked cards |
| Sidebar | navy-900 background, white/70 text, active item white text with blue-600 left indicator |

## 5. Brand assets

| Key | File | Rules |
| --- | --- | --- |
| `brand.logoFull` | `assets/brand/logo-full.png` (trimmed, transparent; SVG when supplied) | Header (height 32 mobile, 40 desktop), footer, auth. Min width 120 px. Clear space = height of the "H" mark's yellow stroke on all sides |
| `brand.logoMark` | `assets/brand/logo-mark.png` | Mobile header, favicon, loaders, social avatar |
| `brand.logoWhite` | `assets/brand/logo-white.png` | Only after owner approval; for navy/gradient backgrounds |
| Favicons | `public/favicon/` 16, 32, 180 (apple-touch), 192, 512, `favicon.ico`, `site.webmanifest` (theme colour #0158E1) | Generated from the mark |

Never stretch, rotate, recolour (except approved white variant), add effects, or place the full-colour logo on the blue gradient.

## 6. Images

`src/assets/images/index.ts` is the only place image paths appear:

```ts
export const images = {
  nanny:   { src: "/images/nanny",   alt: "Nanny caring for two babies at home",              focal: "45% 35%", ratio: 3 / 2, temporary: true },
  driver:  { src: "/images/driver",  alt: "Smiling driver at the wheel of a car",             focal: "45% 30%", ratio: 3 / 2, temporary: true },
  cleaner: { src: "/images/cleaner", alt: "Domestic cleaner in gloves wiping a stair rail",   focal: "50% 30%", ratio: 3 / 2, temporary: true },
} as const;
```

- Originals: `Photo3.jpg` → nanny, `Photo2.jpg` → driver, `Photo1.jpg` → cleaner (6600–8000 px, 14–25 MB each). `pnpm images` writes 640/1024/1600/2400 px AVIF + WebP + JPEG to `public/images/`, target ≤ 300 KB at 1600 px.
- Render via `components/shared/ResponsiveImage` (wraps `next/image`) with `sizes`, a fixed aspect-ratio box and `object-position` from `focal`. Above-the-fold hero gets `priority`; everything else lazy.
- Missing image → brand gradient block with the logo mark at 20% opacity. Every placeholder is listed in `docs/placeholders.md`.
- All three photos are temporary until the owner confirms licences.

## 7. Reference adaptation rules

| Page(s) | Reference | Take | Do not take |
| --- | --- | --- | --- |
| Global, Home | joincolab.io | Section rhythm, generous whitespace, short headline + one-line sub, people photos on soft abstract shapes, stats band, testimonial cards, grouped dropdown nav, 4-column footer | Their colours, fonts, copy, imagery, logos |
| Services | themewagon Profusion services | One block per service, reveal-on-scroll entry, steady visual rhythm | Its colours, fonts, jQuery carousel, map embed |
| How it works, For agencies, About | joincolab.io/partnerships-menu | Statement block + stacked editorial cards (eyebrow, image, title, summary, link) | Mailto-only CTAs, their banner |
| Auth | `login.jpg` | Split card, pill controls, social sign-in above divider, promo panel with floating round badges | Purple, emoji, Facebook, lorem text, the model photo |

Record any significant deviation in `docs/reference-adaptation.md` with the reason.

## 8. Login page

- Page bg `--color-blue-50`; centred card max 1120 px, radius lg, shadow-lg, two equal columns ≥ 1024 px.
- Left: logo, h1 "Welcome back", sub "Sign in to manage your requests and placements.", Google button (secondary style with Google mark), divider "or sign in with email", Email, Password (show/hide), "Forgot password?" right-aligned link, primary lg full-width button "Sign in", "New to HelpVerified? Create an account", legal line.
- Right: `--gradient-brand` panel, radius lg inset 24 px, 3–4 soft wave paths in cyan-400 at 30% opacity, headline in white display font ("Every worker checked. ID, guarantor, references, address."), driver image in rounded-lg frame bottom-aligned, two 64 px white circles with the verified check and a shield icon, gently floating (4 s ease-in-out, off for reduced motion). Whole panel `aria-hidden="true"`.
- < 1024 px: panel becomes a 120 px gradient band with the white logo mark; form single column, 24 px side padding.
- Same layout for sign up, forgot, reset, verify email with different copy and panel headline.

## 9. Services page

- Intro: eyebrow, h1, sub, three anchor chips (sticky under the header on scroll, active chip follows section in view).
- Three alternating sections (nanny → driver → cleaner): 12-col grid, image 6 cols on a rotated soft blob (blue-100 or amber at 20%), text 5 cols with role title, three duties, four verification badges, CTA "Request a <role>" → `routes.auth.signup` with `?role=`.
- "What we check" band on navy-900: four steps with the yellow check, stagger reveal.
- Trial and replacement strip, then gradient CTA banner.
- Motion: text fade + 24 px rise 600 ms; image fade + scale 0.96→1 delayed 100 ms; badge stagger 80 ms; optional ≤ 20 px parallax on desktop pointer devices only. All via `Reveal`/`Stagger`; reduced motion renders final state.
