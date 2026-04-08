import type { NextConfig } from "next";

const apiBase = process.env.API_BASE_URL;

const nextConfig: NextConfig = {
  reactStrictMode: false,
  async rewrites() {
    if (!apiBase) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
