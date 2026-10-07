import Link from "next/link";
import { Card } from "@/components/ui/Card";

/** A headline number on a dashboard. With `href`, the whole card links to the list behind it. */
export function StatCard({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-navy-900">{value}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-md border border-border bg-white p-5 shadow-sm hover:border-blue-600">
      {body}
    </Link>
  ) : (
    <Card className="p-5">{body}</Card>
  );
}
