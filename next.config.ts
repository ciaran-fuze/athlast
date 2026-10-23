import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RTRT scraper launches headless Chromium on Vercel; these packages read their own files at runtime
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/race/tracking": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
  async redirects() {
    return [
      // Ciarán's before-race demo was renamed when it moved to the Dublin Marathon
      { source: "/dublin-half-2026-upcoming", destination: "/ciaran-dublin-marathon", permanent: false },
      { source: "/race/dublin-half-2026-upcoming/v2", destination: "/ciaran-dublin-marathon", permanent: false },
    ];
  },
};

export default nextConfig;
