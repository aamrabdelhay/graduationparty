import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@img/sharp-libvips-*/lib/*.so*",
      "./node_modules/@img/sharp-*/lib/*.node",
    ],
  },
};

export default nextConfig;
