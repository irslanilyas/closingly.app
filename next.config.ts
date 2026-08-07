import type { NextConfig } from "next";

const nextConfig: NextConfig & {
  allowedDevOrigins?: string[];
} = {
  allowedDevOrigins: [
    "*.trycloudflare.com",
  ],
};

export default nextConfig;