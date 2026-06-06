import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false, // Fixed: Was true, hiding type errors
  },
  reactStrictMode: true, // Fixed: Was false, should be enabled for better quality
  serverExternalPackages: ["chromadb-client"],
};

export default nextConfig;
