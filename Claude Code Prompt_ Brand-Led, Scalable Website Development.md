# Claude Code Prompt: Brand-Led, Scalable Website Development

## Role

Act as a senior product designer, UI/UX designer, frontend engineer, backend architect, and full-stack developer. Help me build this website from scratch to production using Claude Code.

Work in deliberate, reviewable phases. Begin with discovery, planning, architecture, and scaffolding before implementing the full application. Build the frontend first and the backend second. Do not make major architectural or product assumptions silently; document decisions and surface anything that requires review.

## Project Objective

Build a polished, responsive, accessible, and scalable website for:

> **[Insert project or company name]**

The website must combine my brand identity with carefully selected design references. The result should feel original, cohesive, premium, and production-ready rather than like a copied template.

The codebase must be modular enough that a specific route, page, component, asset, or service can be corrected independently without causing unnecessary changes throughout the application.

---

## Development Phases

### Phase 0: Discovery, Design Analysis, and Architecture

Before writing significant code:

1. Review this brief and all available attachments.
2. Inspect the supplied logo, favicon, brand files, image assets, and login reference image.
3. Analyze the visual references listed below.
4. Identify missing information, risks, conflicts, and assumptions.
5. Create a page inventory and route map.
6. Recommend the technology stack and explain the reasoning.
7. Propose the scalable folder structure.
8. Define the design-system and component strategy.
9. Define the frontend-to-backend contracts that will later be required.
10. Break the work into small milestones with acceptance criteria.

Do not begin full implementation until this plan has been presented for review.

### Phase 1: Frontend

Plan, scaffold, and implement the complete frontend, including:

- Application shell and global layout
- Centralized routing
- Navigation and responsive menus
- Design tokens and theme configuration
- Reusable UI components
- Page-specific sections
- Services page interactions and scroll behavior
- Login, registration, password recovery, and related authentication screens
- Forms and client-side validation
- Loading, empty, success, and error states
- Responsive behavior across desktop, tablet, and mobile
- Accessibility and keyboard navigation
- SEO-friendly page structure and metadata
- Mock data and API interfaces for future backend integration
- Frontend tests, linting, type checking, and production build validation

### Phase 2: Backend

Begin only after the frontend architecture and requirements have been reviewed.

Implement, where required:

- Backend architecture and service boundaries
- Database schema and migrations
- Authentication and authorization
- User roles and permissions
- API routes and request/response contracts
- Validation and business logic
- Error handling and logging
- File and image handling
- Third-party integrations
- Security controls
- Unit, integration, and API tests
- Frontend-backend integration
- Environment configuration and deployment documentation

---

## Visual Direction and Reference Rules

Use the following references as design inspiration. Treat them as separate sources for different aspects of the experience. Do not blindly merge their styles or copy their source code, text, images, branding, or proprietary assets.

### Global Styling Reference

For the general visual language of the website, use:

**Reference:** https://www.joincolab.io

Use this reference for inspiration for:

- Overall styling direction
- Spacing and rhythm
- Whitespace and visual breathing room
- Color balance and contrast principles
- Button proportions and treatment
- Typography scale and hierarchy
- Font pairing and text density
- Navigation and general page composition
- Premium, modern, editorial feel
- Section transitions and visual pacing

The reference is a starting point, not a requirement to copy exact values. Adapt the visual language to my own logo, brand identity, content, and product requirements.

Centralize all resulting design values in a theme or design-token system, including:

- Font families and weights
- Font sizes and line heights
- Colors
- Spacing scale
- Container widths
- Breakpoints
- Border radii
- Borders
- Shadows
- Button variants
- Transition durations and easing
- Animation preferences

### Services Page Reference

For the Services page, use:

**Reference:** https://themewagon.github.io/Profusion/services.html

Use this reference primarily for:

- Page composition
- Service-card or service-section layouts
- Scroll behavior
- Reveal animations
- Section transitions
- Interaction patterns
- Animation timing and visual rhythm
- The overall way service content is introduced as the user scrolls

Do **not** copy the reference website's colors or fonts. The Services page must use my own brand colors, logo, typography, and design tokens while adapting the structural and interaction ideas from the reference.

Animations should be:

- Subtle and purposeful
- Responsive and performant
- Respectful of `prefers-reduced-motion`
- Implemented with reusable patterns rather than duplicated page-specific code
- Free from distracting, excessive, or inaccessible motion

### Other Pages

For other pages, use:

**Reference:** https://www.joincolab.io/partnerships-menu

Use this reference for inspiration for:

- Page layout and hierarchy
- Navigation and menus
- Content grouping
- Section spacing
- Editorial composition
- Responsive behavior
- Visual storytelling
- Page transitions and interaction patterns

However, prioritize better design, clarity, usability, accessibility, and functionality whenever an adaptation would improve the experience. The final result should not be a pixel-for-pixel copy. It should be an original implementation that is stronger where necessary and consistent with my brand.

### General Design Judgment

When references conflict with usability, accessibility, performance, mobile behavior, or the product's needs, prioritize the following order:

1. User clarity and functionality
2. Accessibility
3. Responsive behavior
4. Brand consistency
5. Performance
6. Reference-site similarity

Document significant deviations from the references and explain why they improve the product.

---

## Brand and Asset Instructions

I have supplied brand assets that must be integrated into the frontend.

### Logo and Favicon

Use the supplied branding logo as the primary logo throughout the website. Use the appropriate logo variant for:

- Header and navigation
- Footer
- Authentication pages
- Mobile layouts
- Dark or colored backgrounds, if applicable

Use the supplied branding logo or approved favicon asset for the browser favicon. Configure all relevant favicon and metadata references correctly.

Do not redraw, distort, recolor, crop, or replace the logo unless a specific variant is required and the change is consistent with the supplied brand assets.

### Image Assets

I have supplied images named:

- `Photo1`
- `Photo2`
- `Photo3`

Use these images across the frontend wherever suitable imagery is required. I will replace or update these images later, so:

- Store all images in a centralized and clearly documented assets directory.
- Use stable, descriptive asset references rather than scattering hardcoded paths throughout components.
- Create a simple asset-mapping or content configuration layer where useful.
- Preserve appropriate aspect ratios.
- Add meaningful alt text.
- Use responsive image behavior and optimized loading.
- Avoid making the layout dependent on one exact image dimension.
- Use placeholders or neutral fallbacks if an image is not yet available.

Do not invent final branded imagery when the supplied temporary assets are sufficient. If a section needs an image that has not been supplied, use an intentional placeholder and document it so it can be replaced later.

### Missing Assets

Some imagery shown in the login reference design has not been uploaded. Recreate the composition and visual balance without blocking development:

- Use an available supplied image if it fits.
- Otherwise use a neutral placeholder, gradient, abstract shape, or clearly marked temporary image area.
- Keep the image area modular so the final image can be added later without restructuring the page.
- Do not use an unlicensed image as a final production asset.
- Record all temporary placeholders in the project documentation.

---

## Login and Authentication Page Design

The supplied image named `login` is the primary visual reference for the authentication experience.

Use it as inspiration for a clean, modern, split-panel login layout with:

- A calm, spacious visual presentation
- A clear form hierarchy
- Strong but restrained branding
- A prominent login heading
- Optional social sign-in actions where supported
- Email and password fields
- Password visibility control where appropriate
- Forgot-password link
- Primary login button
- Link to account creation
- Clear validation and error messages
- A supporting visual or promotional panel on larger screens
- A single-column mobile layout that preserves usability

The login page should feel clean and intentional rather than overloaded. Prioritize legibility, form completion, accessibility, and responsive behavior.

Use the supplied `login` image as a layout and mood reference, not as an asset to reproduce literally. Use the supplied logo and brand system instead of the reference image's logo, colors, typography, or copy.

The authentication experience should include, as applicable:

- Login
- Registration or sign-up
- Forgot password
- Reset password
- Email verification
- Authentication loading state
- Authentication failure state
- Successful redirect state
- Session-expired state

If the backend is not yet available during Phase 1, implement the screens with mocked submission behavior and clearly defined API interfaces. Do not imply that authentication is functional until the backend is connected.

---

## Scalable Codebase Requirements

Use the simplest architecture that supports long-term growth. Adapt the exact syntax to the selected framework, but maintain a structure similar to the following where appropriate:

```text
project-root/
├── public/
│   ├── favicon/
│   └── static-assets/
├── src/
│   ├── app/
│   │   ├── routes/
│   │   ├── layouts/
│   │   ├── providers/
│   │   └── config/
│   ├── assets/
│   │   ├── images/
│   │   ├── icons/
│   │   ├── fonts/
│   │   └── brand/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── navigation/
│   │   ├── forms/
│   │   └── animation/
│   ├── features/
│   │   ├── authentication/
│   │   ├── services/
│   │   └── [other-domain-features]/
│   ├── pages/
│   ├── services/
│   │   ├── api/
│   │   └── integrations/
│   ├── hooks/
│   ├── lib/
│   ├── utils/
│   ├── schemas/
│   ├── types/
│   ├── content/
│   ├── styles/
│   │   ├── tokens/
│   │   ├── globals/
│   │   └── components/
│   └── tests/
├── docs/
├── .env.example
└── README.md
```

Do not use this structure mechanically if the selected framework has a better convention. Explain any significant variation.

Required architectural principles:

- Routes should be centralized and easy to locate.
- Page components should not contain unrelated business logic.
- Shared UI components should be independent of individual pages where possible.
- API clients and data-fetching logic should be centralized.
- Design tokens should be defined in one place.
- Assets should be centralized and replaceable.
- Feature modules should own their feature-specific logic.
- Environment variables should be documented in `.env.example`.
- Tests should be easy to find and maintain.
- Large files should be split when they contain multiple unrelated responsibilities.

---

## Required Documentation and Deliverables

Maintain the following throughout the project:

- Project overview
- Technology decisions
- Folder structure explanation
- Route map
- Page inventory
- Design-token documentation
- Asset inventory
- Reference-site adaptation matrix
- API contracts
- Database schema documentation
- Environment variable documentation
- Setup instructions
- Local development instructions
- Testing instructions
- Build and deployment instructions
- Temporary asset and placeholder list
- Known issues and future improvements
- Changelog by milestone

For each milestone, report:

1. Objective
2. Files expected to change
3. Implementation completed
4. Architectural decisions
5. Tests and checks performed
6. Known issues
7. Assumptions
8. Acceptance criteria status
9. Recommended next step

---

## Project Information

Complete or ask me for the following information where it is missing:

- **Project name:** [Insert name]
- **Website purpose:** [Insert description]
- **Target audience:** [Insert audience]
- **Primary user actions:** [Insert actions]
- **Required pages:** [Insert pages]
- **Required features:** [Insert features]
- **Brand files:** Supplied in the project attachments
- **Logo and favicon:** Supplied branding assets
- **Temporary images:** `Photo1`, `Photo2`, and `Photo3`
- **Login reference:** Supplied image named `login`
- **Backend requirements:** [Insert accounts, data, admin, payments, integrations, etc.]
- **Deployment target:** [Insert preferred platform]
- **Technology constraints:** [Insert constraints]

---

## First Task: Planning Only

Do not immediately build the entire application.

First, return a structured implementation plan containing:

1. Your understanding of the product and intended user experience
2. The essential questions and missing requirements
3. A visual analysis of each supplied reference
4. A page and route inventory
5. A reference-site adaptation matrix
6. A recommended technology stack
7. A proposed scalable folder structure
8. A component and feature-module plan
9. A branding, typography, color, and design-token strategy
10. An asset inventory and replacement strategy
11. A login and authentication UX plan
12. A Services page animation and scroll-interaction plan
13. The Phase 1 frontend milestone breakdown
14. The Phase 2 backend milestone breakdown
15. Risks, assumptions, and decisions requiring approval
16. Acceptance criteria for the first milestone

Wait for my review before starting full implementation. Once implementation begins, work milestone by milestone, keep changes modular, validate the result after each meaningful step, and document all important decisions.
