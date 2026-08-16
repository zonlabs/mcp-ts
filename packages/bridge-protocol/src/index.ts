import { z } from "zod";

export const BRIDGE_PROTOCOL_VERSION = "1.0" as const;

export const BRIDGE_METHODS = {
  initialize: "bridge/initialize",
  localCatalogChanged: "notifications/local/catalog_changed",
  remoteCatalogChanged: "notifications/remote/catalog_changed",
  callTool: "tools/call",
  cancelled: "notifications/cancelled",
} as const;

export const BRIDGE_CLOSE_CODES = {
  replaced: 4001,
  incompatibleProtocol: 4002,
  loggedOut: 4003,
  normal: 1000,
} as const;

export const JSON_RPC_ERROR_CODES = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  notInitialized: -32001,
  serverUnavailable: -32002,
  toolNotFound: -32003,
  timeout: -32004,
  cancelled: -32005,
} as const;

const jsonObjectSchema = z.record(z.string(), z.unknown());
const requestIdSchema = z.union([z.string().min(1), z.number().int()]);

export const mcpToolDescriptorSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: jsonObjectSchema,
  outputSchema: jsonObjectSchema.optional(),
  annotations: z.unknown().optional(),
});

export const mcpServerDescriptorSchema = z.strictObject({
  serverId: z.string().min(1),
  serverName: z.string().min(1),
  tools: z.array(mcpToolDescriptorSchema),
});

export const catalogSnapshotSchema = z.strictObject({
  servers: z.array(mcpServerDescriptorSchema),
});

export const bridgeInitializeParamsSchema = z.strictObject({
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  clientInfo: z.strictObject({ name: z.string().min(1), version: z.string().min(1) }),
  localCatalog: catalogSnapshotSchema,
});

export const bridgeInitializeResultSchema = z.strictObject({
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  serverInfo: z.strictObject({ name: z.string().min(1), version: z.string().min(1) }),
  remoteCatalog: catalogSnapshotSchema,
});

export const toolCallParamsSchema = z.strictObject({
  serverId: z.string().min(1),
  toolName: z.string().min(1),
  arguments: jsonObjectSchema.default({}),
});

export const cancellationParamsSchema = z.strictObject({
  requestId: requestIdSchema,
  reason: z.string().optional(),
});

const requestSchemas = {
  [BRIDGE_METHODS.initialize]: z.strictObject({
    jsonrpc: z.literal("2.0"),
    id: requestIdSchema,
    method: z.literal(BRIDGE_METHODS.initialize),
    params: bridgeInitializeParamsSchema,
  }),
  [BRIDGE_METHODS.callTool]: z.strictObject({
    jsonrpc: z.literal("2.0"),
    id: requestIdSchema,
    method: z.literal(BRIDGE_METHODS.callTool),
    params: toolCallParamsSchema,
  }),
  [BRIDGE_METHODS.localCatalogChanged]: z.strictObject({
    jsonrpc: z.literal("2.0"),
    method: z.literal(BRIDGE_METHODS.localCatalogChanged),
    params: catalogSnapshotSchema,
  }),
  [BRIDGE_METHODS.remoteCatalogChanged]: z.strictObject({
    jsonrpc: z.literal("2.0"),
    method: z.literal(BRIDGE_METHODS.remoteCatalogChanged),
    params: catalogSnapshotSchema,
  }),
  [BRIDGE_METHODS.cancelled]: z.strictObject({
    jsonrpc: z.literal("2.0"),
    method: z.literal(BRIDGE_METHODS.cancelled),
    params: cancellationParamsSchema,
  }),
} as const;

export const jsonRpcSuccessSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: requestIdSchema,
  result: z.unknown(),
});

export const jsonRpcErrorSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: requestIdSchema.nullable(),
  error: z.strictObject({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});

export type McpToolDescriptor = z.infer<typeof mcpToolDescriptorSchema>;
export type McpServerDescriptor = z.infer<typeof mcpServerDescriptorSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export type BridgeInitializeParams = z.infer<typeof bridgeInitializeParamsSchema>;
export type BridgeInitializeResult = z.infer<typeof bridgeInitializeResultSchema>;
export type ToolCallParams = z.infer<typeof toolCallParamsSchema>;
export type CancellationParams = z.infer<typeof cancellationParamsSchema>;
export type JsonRpcSuccess = z.infer<typeof jsonRpcSuccessSchema>;
export type JsonRpcError = z.infer<typeof jsonRpcErrorSchema>;
export type JsonRpcId = string | number;
export type BridgeMethod = (typeof BRIDGE_METHODS)[keyof typeof BRIDGE_METHODS];
export type BridgeRequest = z.infer<(typeof requestSchemas)[BridgeMethod]>;
export type BridgeMessage = BridgeRequest | JsonRpcSuccess | JsonRpcError;

export class BridgeProtocolError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "BridgeProtocolError";
  }
}

export function createRequest<M extends typeof BRIDGE_METHODS.initialize | typeof BRIDGE_METHODS.callTool>(
  id: JsonRpcId,
  method: M,
  params: M extends typeof BRIDGE_METHODS.initialize ? BridgeInitializeParams : ToolCallParams,
) {
  return { jsonrpc: "2.0" as const, id, method, params };
}

export function createNotification(
  method:
    | typeof BRIDGE_METHODS.localCatalogChanged
    | typeof BRIDGE_METHODS.remoteCatalogChanged
    | typeof BRIDGE_METHODS.cancelled,
  params: CatalogSnapshot | CancellationParams,
) {
  return { jsonrpc: "2.0" as const, method, params };
}

export function createSuccessResponse(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

export function createErrorResponse(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function parseJson(input: string | unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    throw new BridgeProtocolError(JSON_RPC_ERROR_CODES.parseError, "Parse error");
  }
}

export function parseBridgeMessage(input: string | unknown): BridgeMessage {
  const value = parseJson(input);
  const envelope = z
    .object({ jsonrpc: z.literal("2.0"), method: z.string().optional() })
    .safeParse(value);
  if (!envelope.success) {
    throw new BridgeProtocolError(JSON_RPC_ERROR_CODES.invalidRequest, "Invalid Request", envelope.error.issues);
  }

  if (!envelope.data.method) {
    const response = z.union([jsonRpcSuccessSchema, jsonRpcErrorSchema]).safeParse(value);
    if (!response.success) {
      throw new BridgeProtocolError(JSON_RPC_ERROR_CODES.invalidRequest, "Invalid Request", response.error.issues);
    }
    return response.data;
  }

  const schema = requestSchemas[envelope.data.method as BridgeMethod];
  if (!schema) {
    throw new BridgeProtocolError(JSON_RPC_ERROR_CODES.methodNotFound, "Method not found");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BridgeProtocolError(JSON_RPC_ERROR_CODES.invalidParams, "Invalid params", parsed.error.issues);
  }
  return parsed.data;
}
