import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createMcpHandler,
  McpServer,
  fromJsonSchema,
} from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/client";
import type { ServerManager } from "./server-manager.js";

function toWebRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) for (const item of v) headers.append(k, item);
  }
  return (async () => {
    let body: BodyInit | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      if (chunks.length) body = Buffer.concat(chunks);
    }
    return new Request(url, {
      method: req.method ?? "GET",
      headers,
      body,
    });
  })();
}

async function sendWebResponse(res: ServerResponse, webRes: Response): Promise<void> {
  const headers: Record<string, string> = {};
  for (const [k, v] of webRes.headers.entries()) headers[k] = v;
  res.writeHead(webRes.status, headers);
  if (webRes.body) {
    const reader = webRes.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}

export interface LocalHttpServerOptions {
  host: string;
  port: number;
  path: string;
}

/**
 * Serves the aggregated MCP endpoint over Streamable HTTP (stateless,
 * legacy-compatible) on a clean URL like http://local.mcp-assistant.in/mcp.
 */
export class LocalHttpServer {
  private server: ReturnType<typeof createServer> | null = null;
  private handler = createMcpHandler(async () => {
    const mcp = new McpServer(
      { name: "local-mcp-gateway", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    for (const tool of this.manager.aggregatedTools()) {
      mcp.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: fromJsonSchema(tool.inputSchema as never),
        },
        async (args) => {
          const result = await this.manager.callTool(tool.name, (args ?? {}) as Record<string, unknown>);
          return result as unknown as CallToolResult;
        },
      );
    }
    return mcp;
  });

  constructor(
    private manager: ServerManager,
    private options: LocalHttpServerOptions,
  ) {}

  async start(): Promise<string> {
    this.server = createServer(async (req, res) => {
      try {
        const request = await toWebRequest(req);
        if (!request.url.includes(this.options.path)) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        const webRes = await this.handler.fetch(request);
        await sendWebResponse(res, webRes);
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(this.options.port, this.options.host, resolve),
    );
    return `http://${this.options.host}:${this.options.port}${this.options.path}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = null;
  }
}
