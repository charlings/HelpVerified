const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Money is stored in kobo (integer); display in naira. */
export function formatNaira(kobo: number): string {
  return naira.format(kobo / 100);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "₦70,000 – ₦120,000 a month", "From ₦70,000 a month", or "Not given". */
export function formatMonthlyRange(minKobo: number | null, maxKobo: number | null): string {
  if (minKobo === null && maxKobo === null) return "Not given";
  if (minKobo !== null && maxKobo !== null) return `${formatNaira(minKobo)} – ${formatNaira(maxKobo)} a month`;
  if (minKobo !== null) return `From ${formatNaira(minKobo)} a month`;
  return `Up to ${formatNaira(maxKobo!)} a month`;
}

/** Whole days from today (local) until an ISO date; negative when it's past. */
export function daysUntil(isoDate: string, now = new Date()): number {
  const target = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}
