import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't need auth
  const publicPaths = [
    "/api/health",
    "/api/trading/market",
    "/api/trading/news",
    "/api/auth",
    "/login",
    "/register",
    "/api/",
  ];

  // Allow public routes
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".") // static files
  ) {
    return NextResponse.next();
  }

  // Protect API trading routes
  const protectedApiPrefixes = [
    "/api/trading/demo",
    "/api/trading/live",
    "/api/trading/settings",
    "/api/trading/signals",
    "/api/trading/backtest",
  ];

  const isProtectedApi = protectedApiPrefixes.some((p) => pathname.startsWith(p));

  // Protect main dashboard
  const isDashboard = pathname === "/";

  if (isProtectedApi || isDashboard) {
    try {
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
      });

      if (!token?.userId) {
        // For API routes, return 401 JSON
        if (isProtectedApi) {
          return NextResponse.json(
            { success: false, error: "Authentication required" },
            { status: 401 }
          );
        }
        // For dashboard, redirect to login
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
      }
    } catch {
      if (isProtectedApi) {
        return NextResponse.json(
          { success: false, error: "Authentication failed" },
          { status: 401 }
        );
      }
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
