import { NextRequest, NextResponse } from "next/server";
import type { RegistryListResponse, ParsedRegistryServer } from "@/types/mcp";

/**
 * GET /api/registry - List MCP servers from the official registry
 *
 * Query Parameters:
 * - search: string - Search query to filter servers
 * - cursor: string - Pagination cursor
 * - limit: number - Number of servers per page (default: 24)
 * - updated_since: string - Filter servers updated since timestamp (RFC3339 datetime)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");
    const cursor = searchParams.get("cursor");
    const limit = searchParams.get("limit") || "10";

    const updatedSince = searchParams.get("updated_since");

    // Build query parameters for registry API
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (cursor) params.append("cursor", cursor);
    if (updatedSince) params.append("updated_since", updatedSince);
    params.append("limit", limit);
    // params.append("version", "latest"); // Only fetch latest versions - Commented out to allow seeing all if needed, or keep it? 
    // The user didn't ask to remove "latest", but "updated_since" might conflict if we only want latest. 
    // Let's keep "version=latest" as it was there before, unless it breaks "updated_since".
    // Registry API docs say "Filter by version ('latest' for latest version...)". 
    // It's likely fine to keep it.
    params.append("version", "latest");

    const url = `${process.env.REGISTRY_API_BASE}/v0.1/servers?${params.toString()}`;
    
    console.log("Fetching registry URL:", url);
    console.log("Query params:", {
      search,
      cursor,
      limit
    });

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Registry API error:", errorText);
      return NextResponse.json(
        { error: `Registry API returned ${response.status}` },
        { status: response.status }
      );
    }

    let apiData: RegistryListResponse;
    try {
      apiData = await response.json();
      console.log("API response received successfully");
      console.log("Servers count:", apiData.servers?.length);
      console.log("Next cursor:", apiData.metadata?.nextCursor);
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      throw new Error("Invalid JSON response from registry API");
    }

    // Parse and simplify the data for the UI
    const servers: ParsedRegistryServer[] = apiData.servers.map((entry, index) => {
      const { server, _meta } = entry;
      const meta = _meta["io.modelcontextprotocol.registry/official"];
      // Extract vendor and name from full name (e.g., "ai.exa/exa" -> vendor: "ai.exa", name: "exa")
      const nameParts = server.name.split("/");
      const vendor = nameParts.length > 1 ? nameParts[0] : "unknown";
      const shortName = nameParts.length > 1 ? nameParts[1] : server.name;

      // Get the first icon URL if available (from the icons array, not the MCP URL)
      const iconUrl = server.icons && server.icons.length > 0 ? server.icons[0].src : null;

      // Get transport type from remotes
      const transportType = server.remotes?.[0]?.type === "sse" ? "sse" :
                           server.remotes?.[0]?.type === "streamable-http" ? "streamable-http" : null;

      return {
        id: `${server.name}:${server.version}`, // Unique ID combining name and version
        name: server.name,
        shortName: shortName,
        vendor,
        title: server.title || null,
        description: server.description || null,
        version: server.version,
        iconUrl,
        repositoryUrl: server.repository?.url || null,
        websiteUrl: server.websiteUrl || null,
        hasRemote: !!server.remotes && server.remotes.length > 0,
        hasPackage: !!server.packages && server.packages.length > 0,
        remoteUrl: server.remotes?.[0]?.url || null,
        transportType,
        publishedAt: meta.publishedAt,
        updatedAt: meta.updatedAt,
        isLatest: meta.isLatest,
      };
    });

    return NextResponse.json({
      data: {
        servers,
        nextCursor: apiData.metadata.nextCursor || null,
        totalCount: apiData.metadata.count,
      },
    });
  } catch (error) {
    console.error("Error fetching registry servers:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Failed to fetch registry servers" },
      { status: 500 }
    );
  }
}
