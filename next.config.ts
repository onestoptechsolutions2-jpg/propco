import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained server (.next/standalone) for the
  // Docker runner stage — no need for a full node_modules copy.
  output: "standalone",
};

export default nextConfig;
