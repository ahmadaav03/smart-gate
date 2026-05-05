"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleAuthenticatedUser(userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    window.location.href = "/onboarding";
    return;
  }

  if (profile.role === "property_admin" || profile.role === "resident") {
    window.location.href = "/dashboard";
    return;
  }

  window.location.href = "/onboarding";
}

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await handleAuthenticatedUser(session.user.id);
      }
    }

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          await handleAuthenticatedUser(session.user.id);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function handleEmailAuth() {
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage("Account created! You can now sign in.");
        setMode("login");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else if (data.user) {
        await handleAuthenticatedUser(data.user.id);
      }
    }

    setLoading(false);
  }

  async function handleGoogleAuth() {
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/resident/login`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-3xl">
            🏠
          </div>
          <h1 className="text-3xl font-bold text-white">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {mode === "login"
              ? "Sign in to your account"
              : "Get started with SmartGate"}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-2xl">
          {error ? (
            <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mb-4 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-600">
              {message}
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A]"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
              className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A]"
            />

            <button
              type="button"
              onClick={handleEmailAuth}
              disabled={loading}
              className="w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white transition active:scale-95 disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 py-4 font-semibold text-gray-700 transition active:scale-95 disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
                <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          <p className="mt-5 text-center text-sm text-gray-500">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
                  className="font-semibold text-[#0B1F3A]"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(""); setMessage(""); }}
                  className="font-semibold text-[#0B1F3A]"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}