"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function ResidentDashboardRedirect() {
  useEffect(() => {
    async function redirect() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/resident/login";
        return;
      }

      const { data: resident } = await supabase
        .from("residents")
        .select("slug")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (resident?.slug) {
        window.location.href = `/resident/${resident.slug}/dashboard`;
      } else {
        window.location.href = "/resident/login?error=no_profile";
      }
    }

    redirect();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] text-white">
      <div className="text-center">
        <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-white/10" />
        <p className="text-white/70">Loading your dashboard...</p>
      </div>
    </div>
  );
}