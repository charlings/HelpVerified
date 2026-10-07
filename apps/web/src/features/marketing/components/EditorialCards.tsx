import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { images } from "@/assets/images";
import { Stagger } from "@/components/animation/Stagger";
import { ResponsiveImage } from "@/components/shared/ResponsiveImage";
import type { EditorialCard } from "@/content/types";

export function EditorialCards({ cards }: { cards: readonly EditorialCard[] }) {
  return (
    <Stagger className="mt-10 grid gap-6 md:grid-cols-3">
      {cards.map((card) => (
        <article
          key={card.href}
          className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-white shadow-sm hover:shadow-md"
        >
          <ResponsiveImage
            image={card.image ? images[card.image] : undefined}
            sizes="(min-width: 768px) 33vw, 100vw"
            decorative
            ratio={16 / 10}
            className="rounded-none"
          />
          <div className="flex flex-1 flex-col p-6">
            <p className="text-sm font-semibold tracking-(--tracking-eyebrow) text-blue-600 uppercase">
              {card.eyebrow}
            </p>
            <h3 className="mt-2 text-xl">{card.title}</h3>
            <p className="mt-2 flex-1">{card.summary}</p>
            <Link
              href={card.href}
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 outline-none after:absolute after:inset-0 hover:underline"
            >
              {card.linkLabel}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </article>
      ))}
    </Stagger>
  );
}
