import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routes } from "@/config/routes";
import type { AuditEntry } from "../types";
import { AuditList, auditEntityHref } from "./AuditList";

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
  id: "1",
  action: "worker.check_flagged",
  actor: null,
  entity: "worker",
  entity_id: "w-1",
  entity_label: "Amaka Obi",
  worker_id: null,
  reason: null,
  created_at: "2026-10-13T09:00:00Z",
  ...overrides,
});

describe("AuditList", () => {
  // The retention job writes this action (ADR 0015); the API reports it, so the list must label it.
  it("labels evidence deleted by the retention job, by the system", () => {
    render(<AuditList entries={[entry({ action: "worker.evidence_deleted" })]} />);
    expect(screen.getByText(/Deleted old evidence:/)).toBeInTheDocument();
    expect(screen.getByText(/System/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Amaka Obi" })).toHaveAttribute("href", routes.admin.worker("w-1"));
  });

  it("doesn't link an entry without an entity id", () => {
    expect(auditEntityHref(entry({ entity_id: null }))).toBeNull();
    expect(auditEntityHref(entry({ entity: "agency", entity_id: null }))).toBeNull();
  });
});
