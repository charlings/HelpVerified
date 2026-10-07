import Image from "next/image";
import { brand } from "@/assets/brand";
import { cn } from "@/lib/cn";

type LogoProps = {
  variant?: "full" | "mark";
  /** Largest rendered height in px. Override responsively with `[--logo-h:2rem]` classes. */
  height?: number;
  priority?: boolean;
  className?: string;
};

export function Logo({ variant = "full", height = 40, priority = false, className }: LogoProps) {
  const asset = variant === "full" ? brand.logoFull : brand.logoMark;
  const width = Math.round((asset.src.width / asset.src.height) * height);
  return (
    <Image
      src={asset.src}
      alt={asset.alt}
      width={width}
      height={height}
      priority={priority}
      className={cn("max-w-none", className)}
      style={{ height: `var(--logo-h, ${height}px)`, width: "auto" }}
    />
  );
}
