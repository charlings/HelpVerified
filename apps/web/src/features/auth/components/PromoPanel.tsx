"use client";

import { ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { images } from "@/assets/images";
import { VerifiedMark } from "@/components/brand/VerifiedMark";
import { ResponsiveImage } from "@/components/shared/ResponsiveImage";
import { routes } from "@/config/routes";
import { authCopy } from "@/content/auth";

function headlineFor(pathname: string): string {
  if (pathname.startsWith(routes.auth.agencySignup)) return authCopy.panel.agency;
  if (pathname.startsWith(routes.auth.signup)) return authCopy.panel.signup;
  if (pathname.startsWith(routes.auth.forgot) || pathname.startsWith(routes.auth.reset)) return authCopy.panel.recovery;
  if (pathname.startsWith(routes.auth.verifyEmail)) return authCopy.panel.verify;
  return authCopy.panel.login;
}

/** Decorative: hidden from assistive technology, so its message must not be the only place information appears. */
export function PromoPanel() {
  const pathname = usePathname();
  return (
    <div
      aria-hidden="true"
      className="relative m-4 hidden overflow-hidden rounded-lg bg-(image:--gradient-panel) lg:flex lg:flex-col"
    >
      <Waves />
      <p className="relative max-w-sm px-12 pt-14 font-display text-4xl leading-tight font-bold text-white">
        {headlineFor(pathname)}
      </p>

      <div className="relative mt-auto px-12">
        <div className="relative mx-auto w-4/5 overflow-hidden rounded-t-lg shadow-lg">
          <ResponsiveImage image={images.driver} sizes="440px" ratio={4 / 5} decorative />
        </div>
        <span className="absolute top-6 right-6 inline-flex size-16 animate-float items-center justify-center rounded-full bg-white shadow-lg">
          <VerifiedMark />
        </span>
        <span className="absolute bottom-24 left-6 inline-flex size-16 animate-float items-center justify-center rounded-full bg-white text-blue-600 shadow-lg [animation-delay:1.5s]">
          <ShieldCheck className="size-8" />
        </span>
      </div>
    </div>
  );
}

function Waves() {
  return (
    <svg
      className="absolute inset-0 size-full text-cyan-400 opacity-30"
      viewBox="0 0 400 600"
      preserveAspectRatio="none"
      fill="none"
      stroke="currentColor"
      strokeWidth="14"
      strokeLinecap="round"
    >
      <path d="M-40 420 C 60 360, 120 480, 220 420 S 380 360, 460 420" />
      <path d="M-40 470 C 60 410, 120 530, 220 470 S 380 410, 460 470" />
      <path d="M-40 520 C 60 460, 120 580, 220 520 S 380 460, 460 520" />
      <path d="M-40 570 C 60 510, 120 630, 220 570 S 380 510, 460 570" />
    </svg>
  );
}
