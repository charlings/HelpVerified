import { checks, checksIntro } from "@/content/checks";
import { services, servicesIntro } from "@/content/services";
import { trialPromise } from "@/content/trial";
import { home } from "@/content/home";
import { ChecksBand } from "../components/ChecksBand";
import { CtaBanner } from "../components/CtaBanner";
import { Hero } from "../components/Hero";
import { ServiceBlock } from "../components/ServiceBlock";
import { ServiceChips } from "../components/ServiceChips";
import { TrialPromise } from "../components/TrialPromise";

export function ServicesScreen() {
  const list = Object.values(services);
  return (
    <>
      <Hero {...servicesIntro} />
      <ServiceChips items={list.map((s) => ({ slug: s.slug, label: s.plural }))} />
      {list.map((service, index) => (
        <ServiceBlock key={service.slug} service={service} checks={checks} reversed={index % 2 === 1} />
      ))}
      <ChecksBand {...checksIntro} checks={checks} />
      <TrialPromise {...trialPromise} />
      <CtaBanner {...home.cta} />
    </>
  );
}
