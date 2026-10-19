import { routes, serviceSlugs, type Role } from "./routes";

export type NavLink = { label: string; href: string };
export type NavGroup = { label: string; items: readonly NavLink[] };

export type AppIconName =
  | "dashboard"
  | "requests"
  | "placements"
  | "payments"
  | "settings"
  | "workers"
  | "inbox"
  | "billing"
  | "agencies"
  | "audit"
  | "alerts";

export type AppNavItem = NavLink & {
  icon: AppIconName;
  /** Match the path exactly (workspace homes), otherwise match it as a prefix. */
  exact?: boolean;
};

export type AppNav = {
  workspaceLabel: string;
  items: readonly AppNavItem[];
  /** How many items fit in the phone bottom tab bar; the rest go in a "More" sheet. */
  primaryCount: number;
};

const serviceLabels: Record<(typeof serviceSlugs)[number], string> = {
  nanny: "Nannies",
  driver: "Drivers",
  cleaner: "Cleaners",
};

export function isNavGroup(entry: NavLink | NavGroup): entry is NavGroup {
  return "items" in entry;
}

export const marketingNav: readonly (NavLink | NavGroup)[] = [
  {
    label: "Services",
    items: [
      { label: "All services", href: routes.services },
      ...serviceSlugs.map((slug) => ({ label: serviceLabels[slug], href: routes.service(slug) })),
    ],
  },
  { label: "How it works", href: routes.howItWorks },
  { label: "For agencies", href: routes.forAgencies },
  { label: "Pricing", href: routes.pricing },
  { label: "About", href: routes.about },
];

export const headerActions = {
  signIn: { label: "Sign in", href: routes.auth.login },
  getStarted: { label: "Get started", href: routes.auth.signup },
} as const;

export const footerNav: readonly NavGroup[] = [
  {
    label: "Services",
    items: serviceSlugs.map((slug) => ({ label: serviceLabels[slug], href: routes.service(slug) })),
  },
  {
    label: "Company",
    items: [
      { label: "About", href: routes.about },
      { label: "How it works", href: routes.howItWorks },
      { label: "Contact", href: routes.contact },
    ],
  },
  {
    label: "Agencies",
    items: [
      { label: "For agencies", href: routes.forAgencies },
      { label: "Pricing", href: routes.pricing },
      { label: "Register an agency", href: routes.auth.agencySignup },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Privacy", href: routes.privacy },
      { label: "Terms", href: routes.terms },
    ],
  },
];

export const appNav: Record<Role, AppNav> = {
  family: {
    workspaceLabel: "Family",
    primaryCount: 5,
    items: [
      { label: "Dashboard", href: routes.family.home, icon: "dashboard", exact: true },
      { label: "Requests", href: routes.family.requests, icon: "requests" },
      { label: "Placements", href: routes.family.placements, icon: "placements" },
      { label: "Payments", href: routes.family.payments, icon: "payments" },
      { label: "Settings", href: routes.family.settings, icon: "settings" },
    ],
  },
  agency_admin: {
    workspaceLabel: "Agency",
    primaryCount: 4,
    items: [
      { label: "Dashboard", href: routes.agency.home, icon: "dashboard", exact: true },
      { label: "Workers", href: routes.agency.workers, icon: "workers" },
      { label: "Requests", href: routes.agency.requests, icon: "inbox" },
      { label: "Placements", href: routes.agency.placements, icon: "placements" },
      { label: "Billing", href: routes.agency.billing, icon: "billing" },
      { label: "Settings", href: routes.agency.settings, icon: "settings" },
    ],
  },
  super_admin: {
    workspaceLabel: "Admin",
    primaryCount: 4, // Placements and Audit log go in "More" on phones; Alerts stays one tap away
    items: [
      { label: "Overview", href: routes.admin.home, icon: "dashboard", exact: true },
      { label: "Agencies", href: routes.admin.agencies, icon: "agencies" },
      { label: "Workers", href: routes.admin.workers, icon: "workers" },
      { label: "Alerts", href: routes.admin.alerts, icon: "alerts" },
      { label: "Placements", href: routes.admin.placements, icon: "placements" },
      { label: "Audit log", href: routes.admin.audit, icon: "audit" },
    ],
  },
};
