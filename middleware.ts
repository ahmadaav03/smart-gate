import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Log all cookies to see what Supabase actually sets
  const cookies = request.cookies.getAll();
  console.log("MIDDLEWARE COOKIES:", cookies.map(c => c.name));

  const hasSession = cookies.some(
    (cookie) =>
      cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")
  );

  console.log("HAS SESSION:", hasSession, "PATH:", pathname);

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding");

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