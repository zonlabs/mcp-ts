import { NextRequest, NextResponse } from 'next/server';
import { MCPClient } from '@mcp-ts/sdk/server';
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from '@/lib/url';
export async function GET(request: NextRequest) {
  return handleCallback(request);
}

export async function POST(request: NextRequest) {
  return handleCallback(request);
}

async function handleCallback(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  // Parse state - it's the sessionId
  const sessionId = state;
  const sourceUrl = '/auth/callback/success'; // Default fallback

  if (!sessionId) {
    const errorUrl = new URL(sourceUrl, getAppUrl());
    errorUrl.searchParams.set('step', 'error');
    errorUrl.searchParams.set('error', 'Session ID is required (state parameter missing)');
    return NextResponse.redirect(errorUrl);
  }

  console.log('[Callback] Received state (sessionId):', sessionId);

  // Check if OAuth provider returned an error
  if (error) {
    const errorUrl = new URL(sourceUrl, getAppUrl());
    errorUrl.searchParams.set('step', 'error');
    errorUrl.searchParams.set('error', errorDescription || error);
    return NextResponse.redirect(errorUrl);
  }

  if (!code) {
    const errorUrl = new URL(sourceUrl, getAppUrl());
    errorUrl.searchParams.set('step', 'error');
    errorUrl.searchParams.set('error', 'Authorization code is required');
    return NextResponse.redirect(errorUrl);
  }

  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { session: userSession } } = await supabase.auth.getSession();

    if (!userSession?.user) {
      const errorUrl = new URL(sourceUrl, getAppUrl());
      errorUrl.searchParams.set('step', 'error');
      errorUrl.searchParams.set('error', 'Unauthorized - Please log in');
      return NextResponse.redirect(errorUrl);
    }

    const userId = userSession.user.id;

    // Create MCP client - it will load serverId from session
    const client = new MCPClient({
      onRedirect: (url) => {
        console.log('[Callback] Redirect requested:', url);
      },
      identity: userId,
      sessionId,
    });


    // Complete OAuth authorization with the code
    console.log('[Callback] Finishing OAuth with code...');
    await client.finishAuth(code);
    console.log('[Callback] OAuth finished successfully');

    // Update session to mark as active
    // Session is updated to active=true internally by client.finishAuth()
    console.log('[Callback] Session updated successfully');

    // Redirect back to source page with success parameters
    const successUrl = new URL(sourceUrl, getAppUrl());
    successUrl.searchParams.set('sessionId', sessionId);
    successUrl.searchParams.set('step', 'success');

    // Add server metadata for the UI
    const serverName = client.getServerName();
    const serverId = client.getServerId();
    const serverUrl = client.getServerUrl();

    if (serverName) successUrl.searchParams.set('server', serverName);
    if (serverId) successUrl.searchParams.set('serverId', serverId);
    if (serverUrl) successUrl.searchParams.set('serverUrl', serverUrl);

    return NextResponse.redirect(successUrl);
  } catch (error: unknown) {
    // Handle any errors during OAuth completion
    const errorUrl = new URL(sourceUrl, getAppUrl());
    errorUrl.searchParams.set('step', 'error');

    if (error instanceof Error) {
      errorUrl.searchParams.set('error', error.message);
    } else {
      errorUrl.searchParams.set('error', 'Failed to complete OAuth authorization');
    }

    return NextResponse.redirect(errorUrl);
  }
}
