import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createMcpHandler,
  McpServer,
  fromJsonSchema,
} from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/client";
import type { ServerManager } from "./server-manager.js";
import type { Traffic } from "../traffic.js";

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
    private traffic: Traffic,
  ) {}

  async start(): Promise<string> {
    this.server = createServer(async (req, res) => {
      try {
        let request = await toWebRequest(req);
        if (!request.url.includes(this.options.path)) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        const started = Date.now();
        let method: string | undefined;
        let tool: string | undefined;
        if (request.method !== "GET" && request.method !== "HEAD") {
          const text = await request.text();
          if (text) {
            try {
              const parsed = JSON.parse(text) as {
                method?: string;
                params?: { name?: string };
              };
              method = parsed.method;
              tool = parsed.params?.name;
            } catch {
              // not JSON; log the request without method/tool detail
            }
            request = new Request(request, { body: text });
          }
        }
        const webRes = await this.handler.fetch(request);
        this.traffic.recordIncoming(
          method ?? "http",
          tool ?? "",
          Date.now() - started,
          webRes.status,
        );
        await sendWebResponse(res, webRes);
      } catch (err) {
        this.traffic.recordError("local endpoint", (err as Error).message);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.options.port, this.options.host, resolve);
    });
    return `http://${this.options.host}:${this.options.port}${this.options.path}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = null;
  }
}
