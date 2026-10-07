import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label: string;
};

export function Pagination({ page, pageSize, total, onPageChange, label }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label={`${label} pages`} className="mt-4 flex items-center justify-between gap-4 text-sm">
      <p>
        Showing {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" shape="app" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous
        </Button>
        <Button variant="secondary" shape="app" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
