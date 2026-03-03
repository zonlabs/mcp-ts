import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  transpilePackages: ['@mcp-ts/sdk'],
  serverExternalPackages: [
    'ioredis',
    '@modelcontextprotocol/sdk',
  ],
  images: {
    qualities: [25, 50, 75, 90, 95, 100],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'www.google.com',
      },
      {
        protocol: 'https',
        hostname: '**.gstatic.com',
      },
      {
        protocol: 'https',
        hostname: '**', // Allow all HTTPS images for registry icons
      },
    ],
  },
};

export default nextConfig;
