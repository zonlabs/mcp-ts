import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addOrUpdateServerConfig,
  disableServerConfig,
  enableServerConfig,
  findMcpJson,
  removeServerConfig,
  toggleServerConfig,
  writeDefaultMcpJson,
} from "../src/gateway/config.js";
import { McpGatewayRegistry } from "../src/gateway/registry.js";
import { runCli } from "../src/cli.js";
import { PassThrough } from "node:stream";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "mcpa-config-test-"));
}

describe("mcp server config enable/disable management", () => {
  it("enables, disables, and toggles server configuration with disabled boolean", () => {
    const dir = tempDir();
    writeDefaultMcpJson(dir);

    addOrUpdateServerConfig("neon", { url: "https://mcp.neon.tech/mcp" }, dir);
    const mcpPath = findMcpJson(dir)!;
    let config = JSON.parse(readFileSync(mcpPath, "utf8"));
    expect(config.mcpServers.neon.url).toBe("https://mcp.neon.tech/mcp");
    expect(config.mcpServers.neon.disabled).toBeUndefined();

    // Disable neon
    disableServerConfig("neon", dir);
    config = JSON.parse(readFileSync(mcpPath, "utf8"));
    expect(config.mcpServers.neon.disabled).toBe(true);

    // Enable neon
    enableServerConfig("neon", dir);
    config = JSON.parse(readFileSync(mcpPath, "utf8"));
    expect(config.mcpServers.neon.disabled).toBeUndefined();

    // Toggle neon (auto-invert to disabled)
    const toggleRes1 = toggleServerConfig("neon", undefined, dir);
    expect(toggleRes1.enabled).toBe(false);
    config = JSON.parse(readFileSync(mcpPath, "utf8"));
    expect(config.mcpServers.neon.disabled).toBe(true);

    // Toggle neon again (auto-invert to enabled)
    const toggleRes2 = toggleServerConfig("neon", undefined, dir);
    expect(toggleRes2.enabled).toBe(true);
    config = JSON.parse(readFileSync(mcpPath, "utf8"));
    expect(config.mcpServers.neon.disabled).toBeUndefined();
  });

  it("skips disabled servers when starting McpGatewayRegistry", async () => {
    const registry = new McpGatewayRegistry({
      enabledServer: {
        command: "node",
        args: ["-e", "process.exit(0)"],
        disabled: true,
      },
    });

    await registry.start();
    expect(registry.getLocalCatalog().servers).toHaveLength(0);
    await registry.close();
  });

  it("handles CLI enable and disable commands", async () => {
    const dir = tempDir();
    writeDefaultMcpJson(dir);
    addOrUpdateServerConfig("test-server", { url: "https://test.example.com/mcp" }, dir);

    const out = new PassThrough();
    const err = new PassThrough();

    const disableCode = await runCli(["disable", "test-server", "--dir", dir], {
      input: process.stdin,
      output: out,
      error: err,
    });
    expect(disableCode).toBe(0);

    let config = JSON.parse(readFileSync(findMcpJson(dir)!, "utf8"));
    expect(config.mcpServers["test-server"].disabled).toBe(true);

    const enableCode = await runCli(["enable", "test-server", "--dir", dir], {
      input: process.stdin,
      output: out,
      error: err,
    });
    expect(enableCode).toBe(0);

    config = JSON.parse(readFileSync(findMcpJson(dir)!, "utf8"));
    expect(config.mcpServers["test-server"].disabled).toBeUndefined();
  });
});
