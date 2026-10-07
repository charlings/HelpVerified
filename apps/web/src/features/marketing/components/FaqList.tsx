import { ChevronDown } from "lucide-react";
import type { Faq } from "@/content/types";

export function FaqList({ faqs }: { faqs: readonly Faq[] }) {
  return (
    <div className="mt-8 divide-y divide-border rounded-lg border border-border bg-white">
      {faqs.map((faq) => (
        <details key={faq.question} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-display text-lg font-bold text-navy-900">
            <h3 className="text-lg">{faq.question}</h3>
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 transition-transform duration-(--duration-fast) group-open:rotate-180"
            />
          </summary>
          <p className="px-5 pb-5">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
