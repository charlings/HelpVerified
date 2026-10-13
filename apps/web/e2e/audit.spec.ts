import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Role } from "../src/config/routes";
import { routes } from "../src/config/routes";
import { signInAs, signInWithToken } from "./helpers/session";

/*
 * M8 accessibility and layout audit (plan decisions 1–2). Every route, with real seeded data:
 *   - one h1, and zero axe violations at 375 and 1280 px;
 *   - no horizontal scroll at 375, 768, 1280 and 1536 px;
 *   - every visible interactive target at least 44 × 44 px, except links inside a sentence and
 *     checkboxes/radios whose label row is the target (measured as the label).
 * Run locally with one worker: `pnpm exec playwright test e2e/audit.spec.ts --project=chromium --workers=1`.
 */

type Visit = { path: string; as?: Role; token?: string };

const visits: Visit[] = [
  // Marketing and errors
  { path: routes.home },
  { path: routes.services },
  { path: routes.service("nanny") },
  { path: routes.service("driver") },
  { path: routes.service("cleaner") },
  { path: routes.howItWorks },
  { path: routes.forAgencies },
  { path: routes.pricing },
  { path: routes.about },
  { path: routes.contact },
  { path: routes.privacy },
  { path: routes.terms },
  { path: routes.forbidden },
  { path: "/definitely-not-a-page" },
  // Auth
  { path: routes.auth.login },
  { path: routes.auth.signup },
  { path: routes.auth.agencySignup, as: "agency_admin", token: "demo-refresh-newagency" },
  { path: routes.auth.googleSignup },
  { path: routes.auth.forgot },
  { path: routes.auth.reset },
  { path: routes.auth.verifyEmail },
  // Family
  { path: routes.family.home, as: "family" },
  { path: routes.family.requests, as: "family" },
  { path: routes.family.newRequest, as: "family" },
  { path: routes.family.request("r-ada-nanny"), as: "family" },
  { path: routes.family.worker("w-amaka"), as: "family" },
  { path: routes.family.placements, as: "family" },
  { path: routes.family.placement("p-blessing"), as: "family" },
  { path: routes.family.payments, as: "family" },
  { path: `${routes.family.paymentCallback}?reference=HV-PF-PF-BLESSING`, as: "family" },
  { path: routes.family.settings, as: "family" },
  { path: `${routes.demoCheckout}?reference=HV-PF-PF-GRACE`, as: "family", token: "demo-refresh-bola" },
  // Agency
  { path: routes.agency.home, as: "agency_admin" },
  { path: routes.agency.workers, as: "agency_admin" },
  { path: routes.agency.newWorker, as: "agency_admin" },
  { path: routes.agency.worker("w-amaka"), as: "agency_admin" },
  { path: routes.agency.requests, as: "agency_admin" },
  { path: routes.agency.request("r-ada-nanny"), as: "agency_admin" },
  { path: routes.agency.placements, as: "agency_admin" },
  { path: routes.agency.placement("p-blessing"), as: "agency_admin" },
  { path: routes.agency.billing, as: "agency_admin" },
  { path: routes.agency.settings, as: "agency_admin" },
  // Admin
  { path: routes.admin.home, as: "super_admin" },
  { path: routes.admin.agencies, as: "super_admin" },
  { path: routes.admin.agency("a-sunrise"), as: "super_admin" },
  { path: routes.admin.workers, as: "super_admin" },
  { path: routes.admin.worker("w-amaka"), as: "super_admin" },
  { path: routes.admin.placements, as: "super_admin" },
  { path: routes.admin.placement("p-blessing"), as: "super_admin" },
  { path: routes.admin.audit, as: "super_admin" },
];

const WIDTHS = [375, 768, 1280, 1536] as const;
const AXE_WIDTHS: readonly number[] = [375, 1280];
const MIN_TARGET = 44;

async function settle(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
}

/** Elements smaller than 44 × 44 px that aren't covered by an exception. Runs in the page. */
function smallTargets(min: number) {
  const selector =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="link"], [tabindex]:not([tabindex="-1"])';
  const out: string[] = [];
  const isHidden = (el: Element) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      style.visibility === "hidden" ||
      style.display === "none" ||
      rect.width <= 1 ||
      rect.height <= 1 ||
      el.closest('[aria-hidden="true"], [inert]') !== null
    );
  };
  const inSentence = (el: Element) => {
    if (el.tagName !== "A" || getComputedStyle(el).display !== "inline") return false;
    const block = el.parentElement;
    return !!block && (block.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 1;
  };
  const describe = (el: Element) => {
    const name = (el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("name") ?? "").trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${name}"`;
  };

  for (const el of document.querySelectorAll(selector)) {
    if (isHidden(el) || inSentence(el)) continue;
    let target: Element = el;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      target = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null) ?? el;
    } else if (
      el instanceof HTMLElement &&
      getComputedStyle(el, "::after").position === "absolute" &&
      getComputedStyle(el).position === "static" &&
      el.offsetParent
    ) {
      // Stretched link (`after:absolute after:inset-0`): the whole card is the target.
      target = el.offsetParent;
    }
    const r = target.getBoundingClientRect();
    if (r.width < min - 0.5 || r.height < min - 0.5) {
      out.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  return [...new Set(out)];
}

for (const visit of visits) {
  test(`audit ${visit.path}`, async ({ page, context }) => {
    test.setTimeout(180_000);
    if (visit.token && visit.as) await signInWithToken(context, visit.as, visit.token);
    else if (visit.as) await signInAs(context, visit.as);

    const problems: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(visit.path);
      await settle(page);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${width}px: horizontal scroll (${overflow}px wider than the viewport)`);

      for (const t of await page.evaluate(smallTargets, MIN_TARGET)) problems.push(`${width}px: small target ${t}`);

      if (AXE_WIDTHS.includes(width)) {
        // Scan the settled page: a reveal caught mid-fade is semi-transparent and fails contrast falsely.
        // Only finite ones: the auth promo panel floats forever, and its `finished` never resolves.
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => null)),
          ),
        );
        const { violations } = await new AxeBuilder({ page }).analyze();
        for (const v of violations) {
          problems.push(`${width}px: axe ${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(" ")}`);
        }
      }
    }
    expect(problems, `audit findings for ${visit.path}`).toEqual([]);
  });
}
