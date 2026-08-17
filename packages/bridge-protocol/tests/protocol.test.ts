import { describe, expect, it } from "vitest";
import {
  BRIDGE_CLOSE_CODES,
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION,
  JSON_RPC_ERROR_CODES,
  BridgeProtocolError,
  createErrorResponse,
  createNotification,
  createRequest,
  createSuccessResponse,
  parseBridgeMessage,
} from "../src/index.js";

const catalog = {
  servers: [
    {
      serverId: "filesystem",
      serverName: "Filesystem",
      tools: [
        {
          name: "read_file",
          inputSchema: { type: "object" },
        },
      ],
    },
  ],
};

describe("bridge protocol", () => {
  it("validates bridge initialization requests", () => {
    const request = createRequest("request-1", BRIDGE_METHODS.initialize, {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      clientInfo: { name: "@mcp-ts/cli", version: "1.0.0" },
      localCatalog: catalog,
    });

    expect(parseBridgeMessage(JSON.stringify(request))).toEqual(request);
  });

  it("validates catalog and cancellation notifications", () => {
    const local = createNotification(BRIDGE_METHODS.localCatalogChanged, catalog);
    const remote = createNotification(BRIDGE_METHODS.remoteCatalogChanged, catalog);
    const cancelled = createNotification(BRIDGE_METHODS.cancelled, {
      requestId: "request-1",
      reason: "caller cancelled",
    });

    expect(parseBridgeMessage(local)).toEqual(local);
    expect(parseBridgeMessage(remote)).toEqual(remote);
    expect(parseBridgeMessage(cancelled)).toEqual(cancelled);
  });

  it("validates bidirectional tool calls", () => {
    const request = createRequest("request-2", BRIDGE_METHODS.callTool, {
      serverId: "filesystem",
      toolName: "read_file",
      arguments: { path: "README.md" },
    });

    expect(parseBridgeMessage(request)).toEqual(request);
  });

  it("validates success and error responses", () => {
    const success = createSuccessResponse("request-1", { content: [] });
    const failure = createErrorResponse(
      "request-2",
      JSON_RPC_ERROR_CODES.toolNotFound,
      "Tool not found",
    );

    expect(parseBridgeMessage(success)).toEqual(success);
    expect(parseBridgeMessage(failure)).toEqual(failure);
  });

  it("returns parse and invalid-params errors for malformed frames", () => {
    expect(() => parseBridgeMessage("{")).toThrowError(
      expect.objectContaining({ code: JSON_RPC_ERROR_CODES.parseError }),
    );
    expect(() =>
      parseBridgeMessage({
        jsonrpc: "2.0",
        id: "request-1",
        method: BRIDGE_METHODS.callTool,
        params: { server_id: "filesystem", tool_name: "read_file" },
      }),
    ).toThrowError(expect.objectContaining({ code: JSON_RPC_ERROR_CODES.invalidParams }));
  });

  it("rejects unknown methods with a method-not-found error", () => {
    expect(() =>
      parseBridgeMessage({ jsonrpc: "2.0", id: "request-1", method: "bridge/unknown", params: {} }),
    ).toThrowError(expect.objectContaining({ code: JSON_RPC_ERROR_CODES.methodNotFound }));
  });

  it("exports stable private close codes", () => {
    expect(BRIDGE_CLOSE_CODES).toEqual({
      replaced: 4001,
      incompatibleProtocol: 4002,
      loggedOut: 4003,
      normal: 1000,
    });
    expect(new BridgeProtocolError(-1, "failure").code).toBe(-1);
  });
});
