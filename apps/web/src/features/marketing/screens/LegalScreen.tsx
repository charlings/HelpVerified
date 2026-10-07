import { Alert } from "@/components/ui/Alert";
import { privacy, terms } from "@/content/legal";
import { formatDate } from "@/lib/format";

const documents = { privacy, terms } as const;

export function LegalScreen({ document: key }: { document: keyof typeof documents }) {
  const document = documents[key];
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 md:py-20">
      <h1 className="text-4xl md:text-5xl">{document.title}</h1>
      <p className="mt-3 text-sm">
        Last updated <time dateTime={document.lastUpdated}>{formatDate(document.lastUpdated)}</time>
      </p>
      <Alert tone="warning" title="Draft" className="mt-8">
        {document.draftNotice}
      </Alert>
      {document.sections.map((section) => (
        <section key={section.heading} className="mt-10">
          <h2 className="text-2xl">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="mt-3 max-w-(--container-prose)">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
