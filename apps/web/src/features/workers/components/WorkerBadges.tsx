import { Badge } from "@/components/ui/Badge";
import { verificationKindInfo } from "@/features/verification";
import { formatDate } from "@/lib/format";
import { verificationKinds } from "@/types/domain";
import type { WorkerPublic } from "../types";

/**
 * The four checks as a family sees them: verified ones as yellow badges with their date, any others
 * plainly marked. Families never see documents, only outcomes and dates.
 */
export function WorkerBadges({ badges, showDates = true }: { badges: WorkerPublic["badges"]; showDates?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Checks">
      {verificationKinds.map((kind) => {
        const badge = badges.find((b) => b.kind === kind);
        const label = verificationKindInfo[kind].label;
        return (
          <li key={kind}>
            {badge ? (
              <Badge tone="verified">
                {label}
                {showDates ? (
                  <span className="font-normal"> · {formatDate(badge.verified_at.slice(0, 10))}</span>
                ) : null}
              </Badge>
            ) : (
              <Badge tone="neutral">{label} · not verified</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}
