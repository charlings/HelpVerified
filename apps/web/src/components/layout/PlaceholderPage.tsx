type PlaceholderPageProps = {
  title: string;
  milestone: string;
};

/** Content only; the surrounding layout owns <main>. */
export function PlaceholderPage({ title, milestone }: PlaceholderPageProps) {
  return (
    <div className="mx-auto w-full max-w-(--container-marketing) px-4 py-16 sm:px-6 md:py-24">
      <p className="text-sm font-semibold tracking-(--tracking-eyebrow) text-blue-600 uppercase">
        Coming in {milestone}
      </p>
      <h1 className="mt-3 text-4xl md:text-5xl">{title}</h1>
      <p className="mt-4 max-w-(--container-prose)">
        This page is a placeholder. Its content is built in milestone {milestone}.
      </p>
    </div>
  );
}
