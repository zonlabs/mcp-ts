import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes that require authentication
  const protectedRoutes = ["/chat", "/projects", "/mcp", "/settings"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  // If unauthorized and trying to access protected routes, redirect to signin
  if (!user && isProtectedRoute) {
    const redirectUrl = new URL("/signin", request.url);
    const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    redirectUrl.searchParams.set("redirect", destination);
    return NextResponse.redirect(redirectUrl);
  }

  // If authorized and trying to access /signin, redirect to destination or home
  if (user && request.nextUrl.pathname.startsWith("/signin")) {
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    const safeRedirect =
      redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")
        ? redirectParam
        : "/";
    return NextResponse.redirect(new URL(safeRedirect, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/chat/:path*",
    "/projects/:path*",
    "/mcp/:path*",
    "/settings/:path*",
    "/signin",
  ],
};
