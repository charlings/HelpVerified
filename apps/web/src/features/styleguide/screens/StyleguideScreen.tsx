import { images } from "@/assets/images";
import { Logo } from "@/components/brand/Logo";
import { ResponsiveImage } from "@/components/shared/ResponsiveImage";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { ColorSwatch } from "../components/ColorSwatch";
import { colorGroups, motionTokens, radii, shadows, spacingSteps, typeScale } from "../tokens";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border py-12">
      <h2 id={id} className="text-3xl">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function StyleguideScreen() {
  return (
    <main id="main" className="mx-auto w-full max-w-(--container-app) px-6 py-16">
      <Logo height={40} priority />
      <h1 className="mt-8 text-5xl">Styleguide</h1>
      <p className="mt-3 max-w-(--container-prose)">
        Every value below comes from <code>src/styles/tokens.css</code>. Contrast ratios are computed live from the
        tokens. Text must be AA (4.5:1) or better against its background.
      </p>

      <Section id="colours" title="Colours">
        {colorGroups.map((group) => (
          <div key={group.label} className="mb-8">
            <h3 className="text-xl">{group.label}</h3>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {group.tokens.map((token) => (
                <ColorSwatch key={token} token={token} />
              ))}
            </ul>
          </div>
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 rounded-lg bg-(image:--gradient-brand)" aria-label="Brand gradient" role="img" />
          <div className="h-24 rounded-lg bg-(image:--gradient-verified)" aria-label="Verified gradient" role="img" />
        </div>
      </Section>

      <Section id="typography" title="Typography">
        <p className="text-sm font-semibold tracking-(--tracking-eyebrow) text-blue-600 uppercase">Eyebrow</p>
        <ul className="mt-4 space-y-3">
          {typeScale.map((t) => (
            <li key={t.token} className="flex items-baseline gap-4">
              <span className="w-12 shrink-0 font-mono text-xs">{t.token}</span>
              <span className={`${t.className} text-navy-900`}>Every worker checked</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-(--container-prose)">
          Body copy is Inter 16px at 1.6 line height in slate-600. Marketing paragraphs are capped at 68 characters so
          lines stay comfortable to read on wide screens.
        </p>
      </Section>

      <Section id="spacing" title="Spacing, radii, shadows">
        <ul className="space-y-2">
          {spacingSteps.map((step) => (
            <li key={step} className="flex items-center gap-4 text-xs">
              <span className="w-16 font-mono">{step * 4}px</span>
              <span className="h-3 rounded-sm bg-blue-600" style={{ width: `calc(var(--spacing) * ${step})` }} />
            </li>
          ))}
        </ul>
        <ul className="mt-8 flex flex-wrap gap-6">
          {radii.map((r) => (
            <li
              key={r.token}
              className={`grid size-24 place-items-center border border-border-strong bg-blue-50 text-xs ${r.className}`}
            >
              {r.token}
            </li>
          ))}
          {shadows.map((s) => (
            <li key={s.token} className={`grid size-24 place-items-center rounded-md bg-white text-xs ${s.className}`}>
              shadow-{s.token}
            </li>
          ))}
        </ul>
        <ul className="mt-8 flex flex-wrap gap-3 font-mono text-xs">
          {motionTokens.map((m) => (
            <li key={m} className="rounded-full bg-slate-100 px-3 py-1">
              --{m}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="buttons" title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button size="lg">Large</Button>
          <Button shape="app">App shape</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section id="inputs" title="Inputs">
        <div className="grid max-w-(--container-auth-form) gap-6">
          <div className="grid gap-2">
            <Label htmlFor="sg-email">Email</Label>
            <Input id="sg-email" type="email" placeholder="you@example.com" autoComplete="off" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sg-error">Email with error</Label>
            <Input
              id="sg-error"
              type="email"
              defaultValue="not-an-email"
              aria-invalid="true"
              aria-describedby="sg-error-msg"
            />
            <p id="sg-error-msg" className="text-sm text-danger-600">
              Enter a valid email address.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sg-disabled">Disabled</Label>
            <Input id="sg-disabled" disabled defaultValue="Read only" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sg-app">App input</Label>
            <Input id="sg-app" shape="app" placeholder="Search workers" />
          </div>
        </div>
      </Section>

      <Section id="badges" title="Badges and alerts">
        <div className="flex flex-wrap gap-2">
          <Badge>Ended</Badge>
          <Badge tone="info">Trial</Badge>
          <Badge tone="success">Confirmed</Badge>
          <Badge tone="warning">Awaiting payment</Badge>
          <Badge tone="danger">Suspended</Badge>
          <Badge tone="verified">Verified</Badge>
        </div>
        <div className="mt-6 grid max-w-2xl gap-3">
          <Alert tone="info" title="Information">
            Your request has been sent to matching agencies.
          </Alert>
          <Alert tone="success" title="Placement confirmed" />
          <Alert tone="warning" title="Trial ends in 2 days" />
          <Alert tone="danger" title="This worker has just been placed with another family" />
        </div>
      </Section>

      <Section id="surfaces" title="Cards, logo and images">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <h3 className="text-xl">App card</h3>
            <p className="mt-2 text-sm">Radius md, shadow sm, 24px padding.</p>
          </Card>
          <Card context="marketing">
            <h3 className="text-xl">Marketing card</h3>
            <p className="mt-2 text-sm">Radius lg for editorial sections.</p>
          </Card>
          <Card className="flex items-center gap-4">
            <Logo variant="mark" height={40} />
            <Logo height={32} />
          </Card>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-4">
          <ResponsiveImage image={images.nanny} sizes="(min-width: 768px) 25vw, 100vw" className="rounded-lg" />
          <ResponsiveImage image={images.driver} sizes="(min-width: 768px) 25vw, 100vw" className="rounded-lg" />
          <ResponsiveImage image={images.cleaner} sizes="(min-width: 768px) 25vw, 100vw" className="rounded-lg" />
          <ResponsiveImage image={undefined} sizes="(min-width: 768px) 25vw, 100vw" />
        </div>
      </Section>
    </main>
  );
}
