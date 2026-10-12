import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow server actions and larger body parser for bulk import chunks
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
