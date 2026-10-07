# Route map

Source of truth: `apps/web/src/config/routes.ts`. Never write a path string in a component. Add a page by adding the route, the nav entry (`config/nav.ts`), the route file and the feature screen.

| Key | Path | Group | Access | Milestone |
| --- | --- | --- | --- | --- |
| `home` | `/` | marketing | public | M3 |
| `services` | `/services` | marketing | public | M3 |
| `service(slug)` | `/services/{nanny,driver,cleaner}` | marketing | public | M3 |
| `howItWorks` | `/how-it-works` | marketing | public | M3 |
| `forAgencies` | `/for-agencies` | marketing | public | M3 |
| `pricing` | `/pricing` | marketing | public | M3 |
| `about` | `/about` | marketing | public | M3 |
| `contact` | `/contact` | marketing | public | M3 |
| `privacy` | `/privacy` | marketing | public | M3 |
| `terms` | `/terms` | marketing | public | M3 |
| `forbidden` | `/403` | marketing | public, noindex | M2 |
| `styleguide` | `/styleguide` | dev | development only | M1 |
| `auth.login` | `/login` | auth | public | M4 |
| `auth.signup` | `/signup` | auth | public | M4 |
| `auth.agencySignup` | `/signup/agency` | auth | public | M4 |
| `auth.forgot` | `/forgot-password` | auth | public | M4 |
| `auth.reset` | `/reset-password` | auth | public | M4 |
| `auth.verifyEmail` | `/verify-email` | auth | public | M4 |
| `family.home` | `/family` | app | family | M6 |
| `family.requests` | `/family/requests` | app | family | M6 |
| `family.newRequest` | `/family/requests/new` | app | family | M6 |
| `family.request(id)` | `/family/requests/{id}` | app | family | M6 |
| `family.worker(id)` | `/family/workers/{id}` | app | family | M6 |
| `family.placements` | `/family/placements` | app | family | M6 |
| `family.placement(id)` | `/family/placements/{id}` | app | family | M6 |
| `family.payments` | `/family/payments` | app | family | M6 |
| `family.paymentCallback` | `/family/payments/callback?reference=` | app | family | M6 |
| `demoCheckout` | `/demo/checkout?reference=` | demo | demo mode only (404 otherwise), noindex | M6 |
| `family.settings` | `/family/settings` | app | family | M6 |
| `agency.home` | `/agency` | app | agency_admin | M5 |
| `agency.workers` | `/agency/workers` | app | agency_admin | M5 |
| `agency.newWorker` | `/agency/workers/new` | app | agency_admin | M5 |
| `agency.worker(id)` | `/agency/workers/{id}` | app | agency_admin | M5 |
| `agency.requests` | `/agency/requests` | app | agency_admin | M5 |
| `agency.request(id)` | `/agency/requests/{id}` | app | agency_admin | M5 |
| `agency.placements` | `/agency/placements` | app | agency_admin | M5 |
| `agency.placement(id)` | `/agency/placements/{id}` | app | agency_admin | M5 |
| `agency.billing` | `/agency/billing` | app | agency_admin | M5 |
| `agency.settings` | `/agency/settings` | app | agency_admin | M5 |
| `admin.home` | `/admin` | app | super_admin | M7 |
| `admin.agencies` | `/admin/agencies` | app | super_admin | M7 |
| `admin.agency(id)` | `/admin/agencies/{id}` | app | super_admin | M7 |
| `admin.agencies?status=` | `/admin/agencies?status=pending` | app | super_admin; filter kept in the URL | M7 |
| `admin.workers` | `/admin/workers` | app | super_admin | M7 |
| `admin.worker(id)` | `/admin/workers/{id}` | app | super_admin | M7 |
| `admin.placements` | `/admin/placements` | app | super_admin | M7 |
| `admin.placement(id)` | `/admin/placements/{id}` | app | super_admin | M7 |
| `admin.audit` | `/admin/audit-log` | app | super_admin | M7 |

All `app` routes are `noindex` and disallowed in `robots.txt`. Role guarding arrives in M2 (stub) and M4 (session).
