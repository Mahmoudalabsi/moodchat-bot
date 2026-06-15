import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel serverless - no need for standalone output */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
