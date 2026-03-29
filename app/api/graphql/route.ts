import { NextRequest, NextResponse } from 'next/server';
import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const GRAPHQL_ENDPOINT = `${BACKEND_URL}/api/graphql`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, variables } = body;

    // Get user for authentication verification
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return new Response(JSON.stringify({ errors: [{ message: "Unauthorized" }] }), { status: 401 });
    }

    // Get session for tokens
    const { data: { session } } = await supabase.auth.getSession();

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authorization header if session exists and query requires auth
    const requiresAuth = query.includes('getUserMcpServers') ||
      query.includes('myAssistants') ||
      query.includes('myAssistant') ||
      query.includes('createAssistant') ||
      query.includes('updateAssistant') ||
      query.includes('deleteAssistant');

    if (requiresAuth && !session?.access_token) {
      // Return authentication error for queries that require auth
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
