import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Hide this column's label on mobile cards (e.g. the title cell). */
  primary?: boolean;
};

type DataTableProps<T> = {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
};

/**
 * Table on md+ and a card list below md, with the same data (design-system §4: tables become cards on mobile).
 * The hidden variant is display:none, so assistive tech sees only one.
 */
export function DataTable<T>({ caption, columns, rows, rowKey }: DataTableProps<T>) {
  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  const rest = columns.filter((c) => c !== primary);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-white md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-slate-50 text-navy-900">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-3 font-semibold", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="h-14 hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={caption} className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-lg border border-border bg-white p-4 shadow-sm">
            <div className="font-semibold text-navy-900">{primary.cell(row)}</div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-slate-600">{c.header}</dt>
                  <dd className="text-navy-900">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
