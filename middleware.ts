import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for any Supabase auth cookie
  const cookies = request.cookies.getAll();
  const hasSession = cookies.some(
    (cookie) =>
      cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")
  );

  // Protected routes — must be logged in
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding");

  // Auth routes — redirect to dashboard if already logged in
  const isAuthRoute = pathname === "/resident/login";

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/resident/login", request.url));
  }

  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/resident/login",
  ],
};