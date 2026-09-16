import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * OAuth 2.0 Client ID Metadata Document (CIMD) endpoint.
 * Per draft-ietf-oauth-client-id-metadata-document / MCP SDK SEP-2352.
 * 
 * Authorization servers (like WorkOS) fetch this document over HTTPS to verify
 * the client_id and permitted redirect_uris without requiring dynamic client registration (DCR).
 */
export async function GET(request: Request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const origin = host ? `${proto}://${host}` : 'https://app.linkos.in';

  const clientId = `${origin}/api/mcp/client-metadata.json`;

  const metadata = {
    client_id: clientId,
    client_name: 'LinkOS',
    client_uri: origin,
    redirect_uris: [
      `${origin}/auth/callback/success`,
      'http://localhost:3000/auth/callback/success',
    ].filter((uri, index, self) => self.indexOf(uri) === index),
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'native',
  };

  return NextResponse.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
