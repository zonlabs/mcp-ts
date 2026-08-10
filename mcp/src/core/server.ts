import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MCP_ASSISTANT_SERVER_ID, createInstrumentedMcpServer } from "./instrumentation";
import { registerMcpCoreTools } from "./mcp-core-tools";

let version = "1.0.0";
try {
  const pkgPath = join(__dirname, "..", "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  version = pkg.version || "1.0.0";
} catch {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    version = pkg.version || "1.0.0";
  } catch {
    // fallback
  }
}

export function createMcpServer(options?: { scopes?: string[] }) {
  const server = options?.scopes
    ? createInstrumentedMcpServer({ name: MCP_ASSISTANT_SERVER_ID, version }, options.scopes)
    : createInstrumentedMcpServer({ name: MCP_ASSISTANT_SERVER_ID, version });
  registerMcpCoreTools(server);
  return server;
}
