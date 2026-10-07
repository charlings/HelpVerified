import Link from "next/link";
import { useId } from "react";
import { Reveal } from "@/components/animation/Reveal";
import { buttonVariants } from "@/components/ui/Button";
import type { Cta } from "@/content/types";

type CtaBannerProps = {
  title: string;
  body: string;
  primary: Cta;
  secondary?: Cta;
};

/** Navy banner: white text on the brand gradient fails contrast at its cyan end, so the gradient is decorative only. */
export function CtaBanner({ title, body, primary, secondary }: CtaBannerProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="bg-white py-(--section-y-mobile) md:py-(--section-y)">
      <div className="mx-auto w-full max-w-(--container-marketing) px-4 sm:px-6">
        <Reveal variant="scale">
          <div className="relative overflow-hidden rounded-lg bg-navy-900 px-6 py-12 sm:px-12 md:py-16">
            <div
              aria-hidden="true"
              className="absolute -top-24 -right-24 size-72 rounded-full bg-(image:--gradient-brand) opacity-40 blur-2xl md:size-96"
            />
            <div className="relative max-w-2xl">
              <h2 id={id} className="text-3xl text-white md:text-4xl">
                {title}
              </h2>
              <p className="mt-4 text-lg text-white/80">{body}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={primary.href} className={buttonVariants({ size: "lg" })}>
                  {primary.label}
                </Link>
                {secondary ? (
                  <Link href={secondary.href} className={buttonVariants({ size: "lg", variant: "secondary" })}>
                    {secondary.label}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
