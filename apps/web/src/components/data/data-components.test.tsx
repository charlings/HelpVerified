import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileDrop, validateUpload } from "@/components/forms/FileDrop";
import { DataTable } from "./DataTable";

describe("DataTable", () => {
  it("renders a captioned table and an equivalent card list", () => {
    render(
      <DataTable
        caption="Workers"
        rows={[{ id: "1", name: "Amaka", role: "Nanny" }]}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Worker", primary: true, cell: (r) => r.name },
          { key: "role", header: "Role", cell: (r) => r.role },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Workers" });
    expect(within(table).getByRole("columnheader", { name: "Role" })).toHaveAttribute("scope", "col");
    const cards = screen.getByRole("list", { name: "Workers" });
    expect(within(cards).getByText("Role")).toBeInTheDocument();
    expect(within(cards).getByText("Nanny")).toBeInTheDocument();
  });
});

describe("FileDrop", () => {
  const file = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });

  it("accepts JPG, PNG and PDF up to 10 MB", () => {
    expect(validateUpload(file("a.pdf", "application/pdf", 1000))).toBeNull();
    expect(validateUpload(file("a.png", "image/png", 1000))).toBeNull();
    expect(validateUpload(file("a.docx", "application/msword", 1000))).toMatch(/JPG, PNG or PDF/);
    expect(validateUpload(file("a.pdf", "application/pdf", 10 * 1024 * 1024 + 1))).toMatch(/10 MB/);
  });

  it("is a labelled file input that reports invalid files", async () => {
    const onFile = vi.fn();
    render(<FileDrop label="Upload evidence" onFile={onFile} />);
    const input = screen.getByLabelText(/Upload evidence/);
    await userEvent.upload(input, file("a.pdf", "application/pdf", 10));
    expect(onFile).toHaveBeenCalledTimes(1);
    await userEvent.upload(input, file("a.gif", "image/gif", 10), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a JPG, PNG or PDF file.");
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("shows upload progress", () => {
    render(<FileDrop label="Upload evidence" onFile={() => {}} progress={40} />);
    expect(screen.getByRole("progressbar", { name: "Upload progress" })).toHaveAttribute("aria-valuenow", "40");
  });
});
