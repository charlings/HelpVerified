"use client";

import { useEffect, useState } from "react";
import { contrastRatio } from "@/lib/contrast";

type Ratios = { value: string; onWhite: number; onNavy: number };

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
}

export function ColorSwatch({ token }: { token: string }) {
  const [ratios, setRatios] = useState<Ratios | null>(null);

  useEffect(() => {
    const value = readToken(token);
    const white = readToken("white");
    const navy = readToken("navy-900");
    try {
      setRatios({ value, onWhite: contrastRatio(value, white), onNavy: contrastRatio(value, navy) });
    } catch {
      setRatios({ value, onWhite: Number.NaN, onNavy: Number.NaN });
    }
  }, [token]);

  return (
    <li className="overflow-hidden rounded-md border border-border bg-white">
      <div className="h-16 border-b border-border" style={{ backgroundColor: `var(--color-${token})` }} />
      <dl className="grid gap-0.5 p-3 text-xs">
        <dt className="font-semibold text-navy-900">{token}</dt>
        <dd className="font-mono uppercase">{ratios?.value ?? "…"}</dd>
        <dd>
          On white: <Ratio value={ratios?.onWhite} />
        </dd>
        <dd>
          On navy: <Ratio value={ratios?.onNavy} />
        </dd>
      </dl>
    </li>
  );
}

function Ratio({ value }: { value: number | undefined }) {
  if (value === undefined || Number.isNaN(value)) return <span>…</span>;
  const rating = value >= 7 ? "AAA" : value >= 4.5 ? "AA" : value >= 3 ? "AA large" : "fail";
  return (
    <span>
      {value.toFixed(2)}:1 <span className="font-semibold">({rating})</span>
    </span>
  );
}
