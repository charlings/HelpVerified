import { brand } from "@/assets/brand";
import { imageWidths, type ImageEntry } from "@/assets/images";
import { cn } from "@/lib/cn";

type ResponsiveImageProps = {
  /** Entry from the asset map; undefined renders the brand placeholder. */
  image: ImageEntry | undefined;
  /** HTML `sizes` describing the rendered width at each breakpoint. */
  sizes: string;
  priority?: boolean;
  decorative?: boolean;
  /** Overrides the entry's ratio, e.g. for a square crop. */
  ratio?: number;
  className?: string;
};

const srcSet = (base: string, ext: string) => imageWidths.map((w) => `${base}-${w}.${ext} ${w}w`).join(", ");

/**
 * Serves the pre-optimised AVIF/WebP/JPEG variants from public/images inside a fixed-ratio box,
 * so layout never depends on the source image's dimensions.
 */
export function ResponsiveImage({
  image,
  sizes,
  priority = false,
  decorative = false,
  ratio,
  className,
}: ResponsiveImageProps) {
  const aspect = ratio ?? image?.ratio ?? 3 / 2;

  if (!image) {
    return (
      <div
        data-placeholder="true"
        aria-hidden="true"
        className={cn(
          "relative grid place-items-center overflow-hidden rounded-lg bg-(image:--gradient-brand)",
          className,
        )}
        style={{ aspectRatio: aspect }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, no optimisation needed */}
        <img src={brand.logoMark.src.src} alt="" className="w-1/5 opacity-20" />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)} style={{ aspectRatio: aspect }}>
      <picture>
        <source type="image/avif" srcSet={srcSet(image.src, "avif")} sizes={sizes} />
        <source type="image/webp" srcSet={srcSet(image.src, "webp")} sizes={sizes} />
        <img
          src={`${image.src}-1600.jpg`}
          srcSet={srcSet(image.src, "jpg")}
          sizes={sizes}
          alt={decorative ? "" : image.alt}
          aria-hidden={decorative || undefined}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: image.focal }}
        />
      </picture>
    </div>
  );
}
