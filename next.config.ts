import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship-first: allow Vercel builds even when TS types are mid-migration.
  // Turn this OFF once the codebase is cleaned up.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;