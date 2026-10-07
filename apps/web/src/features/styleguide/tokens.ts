export const colorGroups = [
  {
    label: "Brand",
    tokens: ["navy-900", "navy-800", "blue-700", "blue-600", "blue-500", "blue-100", "blue-50", "cyan-400"],
  },
  { label: "Verified", tokens: ["yellow-300", "amber-400"] },
  {
    label: "Neutrals",
    tokens: [
      "white",
      "slate-50",
      "slate-100",
      "slate-200",
      "slate-300",
      "slate-500",
      "slate-600",
      "slate-700",
      "slate-900",
    ],
  },
  {
    label: "Semantic",
    tokens: ["success-600", "success-50", "warning-700", "warning-50", "danger-700", "danger-600", "danger-50"],
  },
] as const;

export const typeScale = [
  { token: "6xl", className: "text-6xl font-display font-bold" },
  { token: "5xl", className: "text-5xl font-display font-bold" },
  { token: "4xl", className: "text-4xl font-display font-bold" },
  { token: "3xl", className: "text-3xl font-display font-bold" },
  { token: "2xl", className: "text-2xl font-display font-bold" },
  { token: "xl", className: "text-xl font-display font-semibold" },
  { token: "lg", className: "text-lg" },
  { token: "base", className: "text-base" },
  { token: "sm", className: "text-sm" },
  { token: "xs", className: "text-xs" },
] as const;

export const spacingSteps = [1, 2, 3, 4, 6, 8, 12, 16, 24] as const;

export const radii = [
  { token: "sm", className: "rounded-sm" },
  { token: "md", className: "rounded-md" },
  { token: "lg", className: "rounded-lg" },
  { token: "full", className: "rounded-full" },
] as const;

export const shadows = [
  { token: "sm", className: "shadow-sm" },
  { token: "md", className: "shadow-md" },
  { token: "lg", className: "shadow-lg" },
] as const;

export const motionTokens = [
  "duration-fast",
  "duration-base",
  "duration-slow",
  "duration-reveal",
  "ease-brand",
] as const;
