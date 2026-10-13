import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  poweredByHeader: false,
  // A separate build folder lets a production build run next to a dev server that uses .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
