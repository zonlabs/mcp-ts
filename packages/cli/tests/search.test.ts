import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdSearch } from "../src/commands/search.js";
import * as clientModule from "../src/client.js";
import * as context from "../src/gateway/context.js";
import * as resolution from "../src/gateway/command-resolution.js";

describe("cmdSearch bridge-safe routing", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("treats an empty healthy-gateway search as authoritative", async () => {
    vi.spyOn(resolution, "resolveGateway").mockResolvedValue({
      endpoint: "http://127.0.0.1:8765/mcp",
      port: 8765,
      state: "external",
      managed: false,
    });
    vi.spyOn(clientModule, "connectMcpEndpoint").mockResolvedValue({
      listTools: async () => ({ tools: [] }),
      close: vi.fn(),
    } as never);
    const fallback = vi.spyOn(context, "withMcpGateway");
    let output = "";

    await cmdSearch("definitely-missing", 5, undefined, { write: (text) => { output += text; return true; } });

    expect(output).toContain("No matching tools found.");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("disables the WebSocket bridge for standalone local discovery", async () => {
    vi.spyOn(resolution, "resolveGateway").mockResolvedValue({ endpoint: null, port: 8765, state: "stopped", managed: false });
    vi.spyOn(resolution, "createAuthenticatedRemoteClient").mockResolvedValue(null);
    const fallback = vi.spyOn(context, "withMcpGateway").mockImplementation(async (options, action) => {
      expect(options?.enableBridge).toBe(false);
      return action({ searchTools: async () => [] } as never);
    });

    await cmdSearch("github", 5, undefined, { write: () => true });

    expect(fallback).toHaveBeenCalledOnce();
  });
});
