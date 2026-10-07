import { env } from "./env";

export const site = {
  name: "HelpVerified",
  description:
    "Hire nannies, drivers and cleaners whose ID, guarantor, references and address have been checked by a registered agency.",
  titleTemplate: "%s · HelpVerified",
  url: env.NEXT_PUBLIC_SITE_URL,
  locale: "en_NG",
  // eslint-disable-next-line no-restricted-syntax -- browser chrome colour must be a literal; mirrors --color-blue-600
  themeColor: "#0158E1",
} as const;
