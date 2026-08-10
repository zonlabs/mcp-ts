import { createNextMcpHandler } from "@mcp-ts/sdk/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handler = createNextMcpHandler({
  clientDefaults: {
    clientName: "next-example",
  },
});

export async function GET(req: Request) {
  return (handler.GET as (...args: unknown[]) => Promise<Response>)(req);
}

export async function POST(req: Request) {
  return (handler.POST as (...args: unknown[]) => Promise<Response>)(req);
}
