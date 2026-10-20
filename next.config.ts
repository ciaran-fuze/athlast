import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Ciarán's before-race demo was renamed when it moved to the Dublin Marathon
      { source: "/dublin-half-2026-upcoming", destination: "/ciaran-dublin-marathon", permanent: false },
      { source: "/race/dublin-half-2026-upcoming/v2", destination: "/ciaran-dublin-marathon", permanent: false },
    ];
  },
};

export default nextConfig;
