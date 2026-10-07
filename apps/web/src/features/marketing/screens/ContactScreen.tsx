import { contact } from "@/content/contact";
import { ContactForm } from "../contact/ContactForm";
import { textLink } from "@/components/ui/link-styles";

export function ContactScreen() {
  const { intro, otherWays } = contact;
  return (
    <div className="mx-auto grid w-full max-w-(--container-marketing) gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="text-sm font-semibold tracking-(--tracking-eyebrow) text-blue-600 uppercase">{intro.eyebrow}</p>
        <h1 className="mt-3 text-5xl">{intro.title}</h1>
        <p className="mt-5 text-lg">{intro.body}</p>

        <h2 className="mt-12 text-xl">{otherWays.title}</h2>
        {otherWays.items.length > 0 ? (
          <dl className="mt-4 grid gap-3">
            {otherWays.items.map((item) => (
              <div key={item.label}>
                <dt className="text-sm font-semibold text-navy-900">{item.label}</dt>
                <dd>
                  <a href={item.href} className={textLink}>
                    {item.value}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3">{otherWays.empty}</p>
        )}
      </div>
      <ContactForm />
    </div>
  );
}
