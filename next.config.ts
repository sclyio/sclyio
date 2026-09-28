import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root (a lockfile elsewhere on disk must not be picked up).
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
  poweredByHeader: false,
};

export default nextConfig;
