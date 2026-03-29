import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALIDATE_A2A_AGENT_MUTATION = `
  mutation ValidateA2aAgent($agentUrl: String!) {
    validateA2aAgent(agentUrl: $agentUrl) {
      success
      agentCard
      error
    }
  }
`;

export async function POST(req: NextRequest) {
  try {
    // Get user session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return NextResponse.json(
        { error: "Authentication failed - No access token" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { agentUrl } = body;

    if (!agentUrl || typeof agentUrl !== "string") {
      return NextResponse.json(
        { error: "Invalid request - agentUrl is required" },
        { status: 400 }
      );
    }

    // Call backend GraphQL API
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    const response = await fetch(`${backendUrl}/api/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        query: VALIDATE_A2A_AGENT_MUTATION,
        variables: { agentUrl },
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend request failed with status ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();

    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      return NextResponse.json(
        { error: result.errors[0]?.message || "GraphQL error" },
        { status: 400 }
      );
    }

    const validationResult = result.data?.validateA2aAgent;

    if (!validationResult) {
      return NextResponse.json(
        { error: "No validation result returned" },
        { status: 500 }
      );
    }

    return NextResponse.json(validationResult);
  } catch (error) {
    console.error("Error validating A2A agent:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
