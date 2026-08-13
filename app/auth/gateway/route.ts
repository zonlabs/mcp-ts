import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

/**
 * OAuth bounce-back route for the MCP Assistant gateway.
 *
 * The gateway's sign-in flow redirects the browser here (after the user signs
 * in on the MCP Assistant login page). This route reads the Supabase session
 * from the cookie, then redirects back to the gateway's target URL with the
 * Supabase access token attached so the gateway can complete device linking
 * or OAuth authorization for the requesting MCP client.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const next = searchParams.get('next')

    if (!next) {
        return NextResponse.redirect(`${origin}/auth/auth-code-error`)
    }

    // Validate `next` only points back at the gateway authorize endpoint or a
    // loopback callback (local gateway device linking).
    let target: URL
    try {
        target = new URL(next)
    } catch {
        return NextResponse.redirect(`${origin}/auth/auth-code-error`)
    }
    const isAuthorize = target.pathname === '/authorize'
    const isLoopback =
        (target.protocol === 'http:' || target.protocol === 'https:') &&
        LOOPBACK_HOSTS.has(target.hostname)
    if (!isAuthorize && !isLoopback) {
        return NextResponse.redirect(`${origin}/auth/auth-code-error`)
    }

    const supabase = await createClient()
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) {
        // No session on this domain yet — send the user to the login page and
        // preserve the bounce target so they come right back after signing in.
        const signin = new URL('/signin', origin)
        signin.searchParams.set('redirect', `/auth/gateway?next=${encodeURIComponent(next)}`)
        return NextResponse.redirect(signin)
    }

    target.searchParams.set('supabase_token', accessToken)
    return NextResponse.redirect(target)
}
