import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    // Exchange code happens client-side via Supabase JS
    // Just redirect to dashboard with the code in the URL
    // The onAuthStateChange listener will handle the session
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/resident/login`);
}