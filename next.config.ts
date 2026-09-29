import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root (a lockfile elsewhere on disk must not be picked up).
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
  poweredByHeader: false,
  // Signed-in pages and auth endpoints are per-user: never stored by browsers or CDNs.
  async headers() {
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Robots-Tag", value: "noindex" },
    ];
    return ["/login", "/onboarding", "/dashboard/:path*", "/dashboard", "/settings/:path*", "/admin/:path*", "/auth/:path*", "/members/:path*"].map((source) => ({
      source,
      headers: privateHeaders,
    }));
  },
};

export default nextConfig;
