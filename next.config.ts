import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const weblogUrl =
      process.env.WEBLOG_URL ||
      process.env.NEXT_PUBLIC_WEBLOG_URL ||
      "https://nn-weblog.vercel.app";

    return [
      {
        source: "/nn-weblog",
        destination: `${weblogUrl}/nn-weblog`,
      },
      {
        source: "/nn-weblog/:path*",
        destination: `${weblogUrl}/nn-weblog/:path*`,
      },
    ];
  },
};

export default nextConfig;
