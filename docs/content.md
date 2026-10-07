# Content

All marketing copy lives in typed modules under `apps/web/src/content/`. Components never contain copy; screens in `features/marketing/screens/` pass content into sections. To change wording, edit the content file. The page updates without touching any component.

| File | What it holds |
| --- | --- |
| `home.ts` | Home hero, section headings, agency teaser, CTA banner |
| `services.ts` | Per role: name, summary, intro, duties, image key, FAQs |
| `checks.ts` | The four checks (ID, guarantor, references, address) |
| `journey.ts` | Family and agency step lists |
| `trial.ts` | Trial and replacement promise (numbers come from `config/business.ts`) |
| `pages.ts` | How it works, For agencies, Pricing, About |
| `contact.ts` | Contact intro, topics, success message, other contact details |
| `legal.ts` | Privacy and Terms outlines |
| `testimonials.ts` | Real testimonials only; the section is hidden while empty |
| `metadata.ts` | Title, description and path for every public page |

Numbers that are business rules (trial length, replacement window, free replacements, re-check interval) come from `apps/web/src/config/business.ts`, which mirrors the API settings. Change them there, never in copy.

## Open content markers

Search for `TODO(content)` and `TODO(legal)` to find these in code. Resolve each before launch.

| File | Marker | Needed from |
| --- | --- | --- |
| `home.ts` | Headline and supporting copy are drafts | Owner |
| `services.ts` | Review duties and summaries for each role | Owner |
| `services.ts` | Confirm the employment relationship (who employs and pays the worker) | Owner |
| `services.ts` | Confirm whether driving licences are checked, and by whom | Owner |
| `checks.ts` | Confirm how agencies carry out each check | Owner |
| `trial.ts` | Trial length, replacement window, free replacements are defaults | Owner (open decision in `CLAUDE.md`) |
| `pages.ts` | Agency value proposition and requirements are drafts | Owner |
| `pages.ts` | Prices are `null`; inclusions are drafts | Owner |
| `pages.ts` | Company story is a draft | Owner |
| `contact.ts` | Real email, phone and office details | Owner |
| `metadata.ts` | Review titles and descriptions for search | Owner |
| `legal.ts` | Every Privacy and Terms section needs drafting and legal review (NDPA 2023) | Lawyer |

## Rules for copy

- Describe how the product works; never claim scale, results or endorsements we can't show.
- No invented statistics, testimonials or partner logos.
- Yellow/amber visuals mean "verified" only; don't describe other things with verified styling.
- Keep descriptions in `metadata.ts` between 50 and 160 characters (a unit test enforces this).
