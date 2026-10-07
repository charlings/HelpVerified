import type { LegalDocument } from "./types";

const draftNotice =
  "Draft — under legal review. This page outlines what our final policy will cover. It is not yet our legal policy.";

// TODO(legal): every section below needs drafting and review by a qualified lawyer, including checks against the
// Nigeria Data Protection Act 2023 and NDPC guidance, before launch.
export const privacy: LegalDocument = {
  title: "Privacy policy",
  lastUpdated: "2026-10-05",
  draftNotice,
  sections: [
    {
      heading: "Who we are",
      body: ["Who operates HelpVerified and how to contact us about your data."],
    },
    {
      heading: "What we collect",
      body: [
        "Account details for families and agencies: name, email, phone.",
        "For workers, the information agencies need to complete the four checks. We never store a full National Identification Number.",
        "Payment records. Card details are handled by Paystack and never reach us.",
      ],
    },
    {
      heading: "Why we collect it",
      body: ["The purpose and lawful basis for each kind of data, including worker consent recorded by agencies."],
    },
    {
      heading: "Who can see it",
      body: [
        "Identity documents: only the worker's agency and our verification team, and every view is logged.",
        "Families see which checks were completed and when, never the documents.",
        "Service providers we use and why.",
      ],
    },
    {
      heading: "How long we keep it",
      body: ["Retention periods for documents, placements and payment records."],
    },
    {
      heading: "Your rights",
      body: ["How to access, correct or delete your data, and how to complain to the regulator."],
    },
    {
      heading: "Security",
      body: ["How data is protected in transit and at rest, and what happens if something goes wrong."],
    },
  ],
};

export const terms: LegalDocument = {
  title: "Terms of use",
  lastUpdated: "2026-10-05",
  draftNotice,
  sections: [
    { heading: "Using HelpVerified", body: ["Who may use the platform and account responsibilities."] },
    {
      heading: "Families",
      body: ["Requests, proposals, placement fees, trials and replacements."],
    },
    {
      heading: "Agencies",
      body: ["Approval, subscriptions, the duty to carry out and record the four checks accurately."],
    },
    { heading: "Payments and refunds", body: ["How fees are charged and when refunds apply."] },
    { heading: "Our responsibilities", body: ["What HelpVerified does and does not guarantee."] },
    { heading: "Ending your account", body: ["How either side can close an account."] },
    { heading: "Changes and contact", body: ["How we change these terms and how to reach us."] },
  ],
};
