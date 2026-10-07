export const contactTopics = [
  { value: "family", label: "I'm looking to hire" },
  { value: "agency", label: "I run an agency" },
  { value: "partnership", label: "Partnerships" },
  { value: "press", label: "Press" },
  { value: "other", label: "Something else" },
] as const;

export type ContactTopic = (typeof contactTopics)[number]["value"];

export const contact = {
  intro: {
    eyebrow: "Contact",
    title: "Talk to us.",
    body: "Questions about hiring, joining as an agency or anything else. We reply on working days.",
  },
  success: {
    title: "Thanks, your message is on its way.",
    body: "We'll reply to the email address you gave us.",
    again: "Send another message",
  },
  // TODO(content): real email, phone and office details.
  otherWays: {
    title: "Other ways to reach us",
    items: [] as { label: string; value: string; href: string }[],
    empty: "Contact details will be published before launch.",
  },
} as const;
