import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  async redirects() {
    return [
      { source: "/onboarding", destination: "/onboard", permanent: false },
      { source: "/onboarding/:step", destination: "/onboard?step=:step", permanent: false },
    ];
  },
};

export default nextConfig;
