import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("sb-xrxhqfsscqokkavleemy-auth-token");
  const hasSession = !!token;

  if (request.nextUrl.pathname.includes("/dashboard")) {
    if (!hasSession) {
      return NextResponse.redirect(new URL("/resident/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/resident/:path*/dashboard"],
};