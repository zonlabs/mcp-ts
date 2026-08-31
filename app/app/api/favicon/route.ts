import { NextRequest, NextResponse } from "next/server";

function getRootDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return hostname;
}

async function tryFetch(url: string, timeoutMs: number): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MCP-Assistant/1.0)" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("Content-Type") || "";
    if (!ct.startsWith("image/")) return null;
    return { buffer: await res.arrayBuffer(), contentType: ct };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const hostname = request.nextUrl.searchParams.get("hostname");
  if (!hostname) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=86400" } });
  }

  const rootDomain = getRootDomain(hostname);
  const hasSubdomain = hostname !== rootDomain;

  // 1. Check hostname's /favicon.ico (fastest, 1.5s timeout)
  if (hasSubdomain) {
    const r = await tryFetch(`https://${hostname}/favicon.ico`, 1500);
    if (r) return respond(r.buffer, r.contentType);
  }

  // 2. Check root domain's /favicon.ico (1.5s timeout)
  const r = await tryFetch(`https://${rootDomain}/favicon.ico`, 1500);
  if (r) return respond(r.buffer, r.contentType);

  // 3. Fallback: DuckDuckGo's favicon service (fast, indexed most domains, no cookies)
  const ddg = await tryFetch(`https://icons.duckduckgo.com/ip3/${rootDomain}.ico`, 2000);
  if (ddg) return respond(ddg.buffer, ddg.contentType);

  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=86400" } });
}

function respond(buffer: ArrayBuffer, contentType: string) {
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
