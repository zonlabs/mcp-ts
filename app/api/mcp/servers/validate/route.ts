import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ValidateBody = {
  name?: string;
  url?: string;
  transport?: "sse" | "streamable_http";
  headers?: Array<{ key?: string; value?: string }>;
};

function toHeaderRecord(headers: ValidateBody["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(headers)) return result;

  for (const item of headers) {
    const key = String(item?.key || "").trim();
    const value = String(item?.value || "").trim();
    if (!key || !value) continue;
    result[key] = value;
  }
  return result;
}

function isReachableStatus(status: number): boolean {
  // 2xx/3xx/4xx indicate a responding endpoint.
  return status >= 200 && status < 500;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ValidateBody;
    const name = String(body?.name || "").trim();
    const urlRaw = String(body?.url || "").trim();
    const transport = body?.transport;

    if (!name || !urlRaw || !transport) {
      return NextResponse.json(
        { ok: false, error: "name, url, and transport are required" },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlRaw);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid URL format" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { ok: false, error: "URL must use http or https" },
        { status: 400 }
      );
    }

    const requestHeaders = toHeaderRecord(body?.headers);
    if (transport === "sse" && !requestHeaders.accept) {
      requestHeaders.accept = "text/event-stream";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const method = transport === "sse" ? "GET" : "POST";
      const response = await fetch(parsedUrl.toString(), {
        method,
        headers: requestHeaders,
        body:
          transport === "streamable_http"
            ? JSON.stringify({ jsonrpc: "2.0", id: "validation", method: "initialize", params: {} })
            : undefined,
        signal: controller.signal,
        cache: "no-store",
      });

      if (!isReachableStatus(response.status)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Endpoint responded with status ${response.status}`,
            status: response.status,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        status: response.status,
        message: "Server endpoint is reachable",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.name === "AbortError"
            ? "Validation timed out while contacting server endpoint"
            : error.message
          : "Failed to validate server endpoint";

      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

