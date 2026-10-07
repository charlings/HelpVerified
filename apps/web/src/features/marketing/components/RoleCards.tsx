import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { images } from "@/assets/images";
import { Stagger } from "@/components/animation/Stagger";
import { ResponsiveImage } from "@/components/shared/ResponsiveImage";
import { routes } from "@/config/routes";
import type { Service } from "@/content/types";

export function RoleCards({ services }: { services: readonly Service[] }) {
  return (
    <Stagger className="mt-10 grid gap-6 md:grid-cols-3">
      {services.map((service) => (
        <article
          key={service.slug}
          className="group relative h-full overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-shadow duration-(--duration-base) focus-within:shadow-md hover:shadow-md"
        >
          <ResponsiveImage
            image={images[service.image]}
            sizes="(min-width: 768px) 33vw, 100vw"
            decorative
            ratio={4 / 3}
          />
          <div className="p-6">
            <h3 className="text-2xl">
              <Link href={routes.service(service.slug)} className="outline-none after:absolute after:inset-0">
                {service.plural}
              </Link>
            </h3>
            <p className="mt-2">{service.summary}</p>
            <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
              Learn more
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-(--duration-fast) group-hover:translate-x-1"
              />
            </p>
          </div>
        </article>
      ))}
    </Stagger>
  );
}
