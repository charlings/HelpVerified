import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const HEX = "/#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\\b/";
const PATH = "/^\\//";

const noHex = [
  {
    selector: `Literal[value=${HEX}]`,
    message: "Raw colours belong in src/styles/tokens.css. Use a token class or var(--color-*).",
  },
  { selector: `TemplateElement[value.raw=${HEX}]`, message: "Raw colours belong in src/styles/tokens.css." },
];

const noPathLiterals = [
  {
    selector: `JSXAttribute[name.name='href'] > Literal[value=${PATH}]`,
    message: "Use routes from @/config/routes, not a path string.",
  },
  {
    selector: `CallExpression[callee.property.name=/^(push|replace|prefetch)$/] > Literal[value=${PATH}]`,
    message: "Use routes from @/config/routes, not a path string.",
  },
  {
    selector: `CallExpression[callee.name=/^(redirect|permanentRedirect)$/] > Literal[value=${PATH}]`,
    message: "Use routes from @/config/routes.",
  },
];

const noRawImagePaths = [
  {
    selector: `JSXAttribute[name.name='src'] > Literal[value=/\\.(png|jpe?g|webp|avif|svg|gif)$/]`,
    message: "Images come from the asset map in @/assets/images or @/assets/brand.",
  },
];

const crossFeatureImport = {
  group: ["@/features/*/*", "**/features/*/*"],
  message: "Import other features only through their index.ts (e.g. @/features/placements).",
};

// Route files may import a feature's screens directly. Re-exporting screens from a barrel makes every
// route bundle every screen's client components (Next collects client references through the barrel).
const routeFeatureImport = {
  regex: "^(@/|(\\.\\./)+)features/[^/]+/(?!screens/[^/]+$)",
  message: "Route files import a feature's screens (@/features/x/screens/Y) or its index.ts, nothing deeper.",
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-*/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      "public/mockServiceWorker.js",
      "lighthouse/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // `role` on our own components (RoleGuard, AppShell) is a user role, not an ARIA role.
      "jsx-a11y/aria-role": ["error", { ignoreNonDOM: true }],
      "no-restricted-syntax": ["error", ...noHex, ...noPathLiterals, ...noRawImagePaths],
      "no-restricted-imports": ["error", { patterns: [crossFeatureImport] }],
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/components",
              from: "./src/features",
              message: "Shared components must not depend on features.",
            },
            { target: "./src/lib", from: "./src/features", message: "lib must not depend on features." },
            { target: "./src/config", from: "./src/features", message: "config must not depend on features." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Route files stay thin. Fetch data in a feature via lib/api-client." },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [routeFeatureImport],
          paths: [
            { name: "@tanstack/react-query", message: "Route files stay thin. Use queries inside feature screens." },
          ],
        },
      ],
    },
  },
  {
    // Tests exercise internals directly; the boundary rules apply to production code.
    files: ["src/**/*.test.{ts,tsx}", "src/test/**", "e2e/**/*.ts"],
    rules: { "no-restricted-syntax": "off", "no-restricted-imports": "off" },
  },
  {
    // next/og renders without CSS, so the OG image mirrors token colours as literals, and it only supports <img>.
    // no-img-element is off here, not inline: the rule skips OG files on Linux but not on Windows (it replaces
    // only the first path separator), so an inline disable is "unused" in CI and needed locally.
    files: ["src/app/opengraph-image.tsx"],
    rules: { "no-restricted-syntax": "off", "@next/next/no-img-element": "off" },
  },
];

export default eslintConfig;
