import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";

type StatusPageProps = {
  code: string;
  title: string;
  message: string;
  action: { label: string; href: string };
};

/** Content only; the surrounding layout owns <main>. */
export function StatusPage({ code, title, message, action }: StatusPageProps) {
  return (
    <div className="mx-auto w-full max-w-(--container-marketing) px-4 py-16 sm:px-6 md:py-24">
      <p className="text-sm font-semibold tracking-(--tracking-eyebrow) text-blue-600 uppercase">Error {code}</p>
      <h1 className="mt-3 text-4xl md:text-5xl">{title}</h1>
      <p className="mt-4 max-w-(--container-prose)">{message}</p>
      <Link href={action.href} className={buttonVariants({ className: "mt-8" })}>
        {action.label}
      </Link>
    </div>
  );
}
