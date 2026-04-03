import { NextRequest, NextResponse } from 'next/server';
import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const GRAPHQL_ENDPOINT = `${BACKEND_URL}/api/graphql`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, variables } = body;

    // We use getSession() here (not getUser()) to avoid an extra auth round-trip
    // for public queries. user is derived from the session, matching the chat route pattern.
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    // Determine which queries require authentication
    const requiresAuth = query.includes('getUserMcpServers') ||
      query.includes('myAssistants') ||
      query.includes('myAssistant') ||
      query.includes('createAssistant') ||
      query.includes('updateAssistant') ||
      query.includes('deleteAssistant');

    if (requiresAuth && !user) {
      return NextResponse.json(
        {
          errors: [{
            message: 'Authentication required. Please log in first.',
            extensions: { code: 'UNAUTHENTICATED' }
          }]
        },
        { status: 401 }
      );
    }

    // Prepare headers, attaching the token if available
    // (even for public queries, in case the backend uses it optionally)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    // Forward request to backend GraphQL endpoint
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      await response.text();
      return NextResponse.json(
        {
          errors: [{
            message: 'Backend server returned non-JSON response. Please check your GraphQL endpoint configuration.'
          }]
        },
        { status: 500 }
      );
    }

    const data = await response.json();

    // Handle authentication errors
    if (response.status === 401) {
      return NextResponse.json(
        {
          errors: [{
            message: 'Authentication failed. Please log in again.'
          }]
        },
        { status: 401 }
      );
    }

    // Handle backend errors
    if (!response.ok) {
      return NextResponse.json(
        {
          errors: [{
            message: data.message || 'Backend server error'
          }]
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data);

  } catch (error) {
    // Handle specific error types
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          errors: [{
            message: 'Invalid JSON response from backend server'
          }]
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        errors: [{
          message: 'Internal server error'
        }]
      },
      { status: 500 }
    );
  }
}
