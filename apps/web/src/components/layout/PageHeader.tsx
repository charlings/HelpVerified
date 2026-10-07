import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: { label: string; href: string };
};

/** Workspace page heading: the page's only h1, an optional back link and actions. */
export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <div className="mb-6 grid gap-3">
      {back ? (
        <Link
          href={back.href}
          className="inline-flex min-h-11 items-center gap-1 justify-self-start text-sm font-semibold text-blue-600 hover:underline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-(--container-prose)">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Standard padding and width for workspace pages. */
export function WorkspacePage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-(--container-app) px-4 py-6 sm:px-6 md:py-8">{children}</div>;
}
