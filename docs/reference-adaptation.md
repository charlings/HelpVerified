# Reference-site adaptation

What we take from each reference, what we deliberately don't, and any significant deviations. Code, text, images and branding are never copied.

| Page(s) | Reference | Take | Do not take |
| --- | --- | --- | --- |
| Global, Home | joincolab.io | Section rhythm, generous whitespace, short headline + one-line sub, people photos on soft abstract shapes, stats band, testimonial cards, grouped dropdown nav, 4-column footer | Their colours, fonts, copy, imagery, logos |
| Services | themewagon Profusion services | One block per service, reveal-on-scroll entry, steady visual rhythm | Its colours, fonts, jQuery carousel, map embed |
| How it works, For agencies, About | joincolab.io/partnerships-menu | Statement block + stacked editorial cards (eyebrow, image, title, summary, link) | Mailto-only CTAs, their banner |
| Auth | `login` image (`specs/frontend/brandfiles/login.jpg`) | Split card, pill controls, social sign-in above divider, promo panel with floating round badges | Purple, emoji, Facebook, lorem text, the model photo |

Priority when a reference conflicts with the product: user clarity → accessibility → responsive behaviour → brand → performance → reference similarity.

## Deviations log

| Date | Page | Deviation | Why it is better |
| --- | --- | --- | --- |
| 2026-10-04 | Global | No carousels, scroll-jacking or autoplay anywhere | Accessibility and predictability; carousels hide content |
| 2026-10-05 | Header | Grouped dropdown nav adapted from joincolab, but menus open on click/Enter, not hover | Hover menus misfire on touch and trackpads and are harder to use by keyboard |
| 2026-10-05 | Footer | Four link columns as in joincolab, on slate-50 rather than a dark band | The full-colour logo can't sit on dark backgrounds until a white variant exists |
| 2026-10-05 | Home | joincolab's stats band becomes a "What we check" band (the four checks) | We have no real numbers yet; describing the checks is true by design and is the product's core promise |
| 2026-10-05 | Home | No testimonial cards until real testimonials exist | Invented testimonials would mislead families |
| 2026-10-05 | Services | Profusion's reveal-on-scroll and alternating blocks kept; no parallax | Optional parallax was dropped to protect the mobile performance target; reveal and stagger carry the motion |
| 2026-10-05 | Services | Sticky in-page chips with scroll tracking (not in Profusion) | Lets readers jump to a role and always see where they are on a long page |
| 2026-10-05 | CTA banner | Navy banner with a decorative gradient, not text on the gradient | White text fails contrast on the cyan end of the brand gradient |
| 2026-10-05 | Auth | Split card, pill controls, social button above an "or" divider and promo panel with floating badges kept; Google only (no Facebook) | Facebook sign-in isn't in scope |
| 2026-10-05 | Auth | Promo panel headline sits on a dark-blue-to-blue gradient; cyan only at the far corner | White on the cyan end fails contrast (about 2.1:1) |
| 2026-10-05 | Auth | Below 1024 px the panel becomes a 120 px gradient band with the logo mark on a white tile | No white logo variant yet |
| 2026-10-05 | Auth | Driver photo and verified/shield badges instead of the reference's model photo and emoji | Our imagery, and the badges carry meaning (verified checks) |

Add a row whenever an implementation departs significantly from a reference.
