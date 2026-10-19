export const serviceSlugs = ["nanny", "driver", "cleaner"] as const;
export type ServiceSlug = (typeof serviceSlugs)[number];

export type Role = "family" | "agency_admin" | "super_admin";

export const routes = {
  home: "/",
  services: "/services",
  service: (slug: ServiceSlug) => `/services/${slug}`,
  howItWorks: "/how-it-works",
  forAgencies: "/for-agencies",
  pricing: "/pricing",
  about: "/about",
  contact: "/contact",
  privacy: "/privacy",
  terms: "/terms",
  forbidden: "/403",
  styleguide: "/styleguide",
  /** Demo mode only: stands in for Paystack's hosted checkout. */
  demoCheckout: "/demo/checkout",
  auth: {
    login: "/login",
    signup: "/signup",
    signupFor: (role: ServiceSlug) => `/signup?role=${role}`,
    agencySignup: "/signup/agency",
    /** A new Google user chooses family or agency (the API's callback redirects here). */
    googleSignup: "/signup/google",
    forgot: "/forgot-password",
    reset: "/reset-password",
    verifyEmail: "/verify-email",
  },
  family: {
    home: "/family",
    requests: "/family/requests",
    newRequest: "/family/requests/new",
    request: (id: string) => `/family/requests/${id}`,
    worker: (id: string) => `/family/workers/${id}`,
    placements: "/family/placements",
    placement: (id: string) => `/family/placements/${id}`,
    payments: "/family/payments",
    paymentCallback: "/family/payments/callback",
    settings: "/family/settings",
  },
  agency: {
    home: "/agency",
    workers: "/agency/workers",
    newWorker: "/agency/workers/new",
    worker: (id: string) => `/agency/workers/${id}`,
    requests: "/agency/requests",
    request: (id: string) => `/agency/requests/${id}`,
    placements: "/agency/placements",
    placement: (id: string) => `/agency/placements/${id}`,
    billing: "/agency/billing",
    settings: "/agency/settings",
  },
  admin: {
    home: "/admin",
    agencies: "/admin/agencies",
    agency: (id: string) => `/admin/agencies/${id}`,
    workers: "/admin/workers",
    worker: (id: string) => `/admin/workers/${id}`,
    placements: "/admin/placements",
    placement: (id: string) => `/admin/placements/${id}`,
    audit: "/admin/audit-log",
    alerts: "/admin/alerts",
  },
} as const;

export const homeForRole: Record<Role, string> = {
  family: routes.family.home,
  agency_admin: routes.agency.home,
  super_admin: routes.admin.home,
};

/** Public, indexable pages (used by the sitemap). */
export const publicRoutes: readonly string[] = [
  routes.home,
  routes.services,
  ...serviceSlugs.map((slug) => routes.service(slug)),
  routes.howItWorks,
  routes.forAgencies,
  routes.pricing,
  routes.about,
  routes.contact,
  routes.privacy,
  routes.terms,
];

/** Path prefixes that require a signed-in user. */
export const privatePrefixes = [routes.family.home, routes.agency.home, routes.admin.home] as const;
