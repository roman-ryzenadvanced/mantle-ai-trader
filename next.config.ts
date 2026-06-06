import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false, // Fixed: Was true, hiding type errors
  },
  reactStrictMode: true, // Fixed: Was false, should be enabled for better quality
};

export default nextConfig;
