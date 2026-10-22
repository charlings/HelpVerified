import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tests build into their own folder (playwright.config.ts) so `bun run dev` on .next keeps working alongside.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // ~9 KB of CSS inlined into the HTML removes a render-blocking request before the hero heading paints.
    inlineCss: true,
  },
  webpack: (config, { isServer }) => {
    // msw/browser refuses to resolve under Node. It is only imported inside a browser-only effect
    // (app/providers.tsx), so the server bundle gets an empty module instead.
    if (isServer) {
      config.resolve.alias = { ...config.resolve.alias, "msw/browser": false };
    }
    return config;
  },
};

export default nextConfig;
