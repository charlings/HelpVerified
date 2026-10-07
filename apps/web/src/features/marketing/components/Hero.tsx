import Link from "next/link";
import { images, type ImageKey } from "@/assets/images";
import { ResponsiveImage } from "@/components/shared/ResponsiveImage";
import { buttonVariants } from "@/components/ui/Button";
import type { Cta } from "@/content/types";
import { SoftShape } from "./SoftShape";

type HeroProps = {
  eyebrow: string;
  title: string;
  body: string;
  primary?: Cta;
  secondary?: Cta;
  image?: ImageKey;
  shapeTone?: "blue" | "amber";
};

/** Page-opening block with the page's only h1. Not animated, so the largest content paints immediately. */
export function Hero({ eyebrow, title, body, primary, secondary, image, shapeTone }: HeroProps) {
  return (
    <section className="bg-white">
      <div className="mx-auto grid w-full max-w-(--container-marketing) items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <p className="text-sm font-semibold tracking-(--tracking-eyebrow) text-blue-600 uppercase">{eyebrow}</p>
          <h1 className="mt-3 text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-5 max-w-(--container-prose) text-lg">{body}</p>
          {primary || secondary ? (
            <div className="mt-8 flex flex-wrap gap-3">
              {primary ? (
                <Link href={primary.href} className={buttonVariants({ size: "lg" })}>
                  {primary.label}
                </Link>
              ) : null}
              {secondary ? (
                <Link href={secondary.href} className={buttonVariants({ size: "lg", variant: "secondary" })}>
                  {secondary.label}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        {image ? (
          <SoftShape tone={shapeTone} className="mx-3 sm:mx-5">
            <ResponsiveImage
              image={images[image]}
              sizes="(min-width: 1200px) 560px, (min-width: 1024px) 45vw, 100vw"
              priority
            />
          </SoftShape>
        ) : null}
      </div>
    </section>
  );
}
