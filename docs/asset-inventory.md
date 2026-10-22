# Asset inventory

## Brand

| Key | File | Source | Notes |
| --- | --- | --- | --- |
| `brand.logoFull` | `apps/web/src/assets/brand/logo-full.png` (1645×356, transparent) | `specs/frontend/brandfiles/HelpVerified Gradient Logo.png` via `bun --filter web brand` | Header 32/40 px tall, footer, auth. Min width 120 px. Not for navy/gradient backgrounds. |
| `brand.logoMark` | `apps/web/src/assets/brand/logo-mark.png` (357×356, transparent) | Cropped from the same source | Mobile header, favicon, loaders, image placeholders |
| — | `apps/web/public/favicon/` | Generated from the mark | `favicon.ico` (16/32/48), `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180, white bg), `icon-192.png`, `icon-512.png`, `site.webmanifest` (theme #0158E1) |
| `brand.logoWhite` | — | **Not supplied** | Needed for dark sections; owner approval required |

## Photos

Map: `apps/web/src/assets/images/index.ts`. Variants: `apps/web/public/images/<key>-{640,1024,1600,2400}.{avif,webp,jpg}`.

| Key | Original | Subject | Focal point | 1600 px size (AVIF / WebP / JPEG) | Status |
| --- | --- | --- | --- | --- | --- |
| `cleaner` | Photo1.jpg (7990×5327) | Cleaner in gloves wiping a stair rail | 50% 30% | 39 / 47 / 85 KB | Temporary — licence unconfirmed |
| `driver` | Photo2.jpg (7360×4912) | Smiling driver at the wheel | 45% 30% | 39 / 56 / 94 KB | Temporary — licence unconfirmed |
| `nanny` | Photo3.jpg (6626×4422) | Nanny with two babies at home | 45% 35% | 44 / 57 / 96 KB | Temporary — licence unconfirmed |

## Replacing an asset

1. Put the new original in `specs/frontend/brandfiles/` with the same file name.
2. Run `bun --filter web images` (or `brand` for the logo).
3. Update alt text and focal point in the asset map if the subject changed.
4. Update this file and `docs/placeholders.md`.
