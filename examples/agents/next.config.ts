import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@copilotkit/runtime",
    "@mcp-ts/client",
    "ioredis",
    "@modelcontextprotocol/sdk",
  ],
};

export default nextConfig;
