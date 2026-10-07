import Link from "next/link";
import { useId } from "react";
import { images } from "@/assets/images";
import { Reveal } from "@/components/animation/Reveal";
import { Stagger } from "@/components/animation/Stagger";
import { ResponsiveImage } from "@/components/shared/ResponsiveImage";
import { Badge } from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import type { Check, Service } from "@/content/types";
import { cn } from "@/lib/cn";
import { SoftShape } from "./SoftShape";

type ServiceBlockProps = {
  service: Service;
  checks: readonly Check[];
  reversed?: boolean;
};

/** One alternating section on the Services page. The section id is the anchor target for the chips. */
export function ServiceBlock({ service, checks, reversed = false }: ServiceBlockProps) {
  const headingId = useId();
  return (
    <section
      id={service.slug}
      aria-labelledby={headingId}
      data-service-section={service.slug}
      className={cn("py-(--section-y-mobile) md:py-(--section-y)", reversed ? "bg-blue-50" : "bg-white")}
    >
      <div className="mx-auto grid w-full max-w-(--container-marketing) items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-8">
        <Reveal
          variant="scale"
          delay={100}
          className={cn("lg:col-span-6", reversed ? "lg:order-last lg:col-start-7" : "lg:order-first")}
        >
          <SoftShape tone={reversed ? "amber" : "blue"} className="mx-3 sm:mx-5">
            <ResponsiveImage image={images[service.image]} sizes="(min-width: 1024px) 560px, 100vw" />
          </SoftShape>
        </Reveal>

        <Reveal className={cn("lg:col-span-5", reversed ? "lg:col-start-1 lg:row-start-1" : "lg:col-start-8")}>
          <h2 id={headingId} tabIndex={-1} className="text-3xl outline-none md:text-4xl">
            {service.plural}
          </h2>
          <p className="mt-4 text-lg">{service.summary}</p>
          <ul className="mt-6 grid gap-2">
            {service.duties.map((duty) => (
              <li key={duty} className="flex gap-3">
                <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-blue-600" />
                {duty}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm font-semibold text-navy-900">Every {service.name.toLowerCase()} has passed:</p>
          <Stagger className="mt-2 flex flex-wrap gap-2">
            {checks.map((check) => (
              <Badge key={check.kind} tone="verified">
                {check.title}
              </Badge>
            ))}
          </Stagger>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={routes.auth.signupFor(service.slug)} className={buttonVariants()}>
              Request a {service.name.toLowerCase()}
            </Link>
            <Link href={routes.service(service.slug)} className={buttonVariants({ variant: "ghost" })}>
              About {service.plural.toLowerCase()}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
