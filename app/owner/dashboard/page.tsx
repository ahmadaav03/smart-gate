"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Site = {
  id: string;
  name: string;
  slug: string;
  subscription_status: string;
  trial_ends_at: string;
};

export default function OwnerDashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/resident/login";
        return;
      }

      const { data } = await supabase
        .from("sites")
        .select("id, name, slug, subscription_status, trial_ends_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      setSites((data as Site[]) || []);
      setLoading(false);
    }

    load();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/resident/login";
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-white/10" />
          <p className="text-white/70">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/60">Owner Dashboard</p>
            <h1 className="mt-1 text-3xl font-bold">My Properties</h1>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold"
          >
            Sign out
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-4">
          {sites.length === 0 ? (
            <div className="rounded-3xl bg-white p-6 text-center text-black shadow-2xl">
              <p className="text-gray-500">No properties yet.</p>
            </div>
          ) : (
            sites.map((site) => {
              const trialEnds = new Date(site.trial_ends_at);
              const daysLeft = Math.ceil(
                (trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );

              let statusLabel = site.subscription_status;
              if (site.subscription_status === "trialing") {
                statusLabel = daysLeft > 0 ? `${daysLeft} days left` : "Trial ended";
              }

              let statusColor = "bg-red-100 text-red-700";
              if (site.subscription_status === "active") {
                statusColor = "bg-green-100 text-green-700";
              } else if (site.subscription_status === "trialing") {
                statusColor = "bg-blue-100 text-blue-700";
              }

              return (
                <div
                  key={site.id}
                  className="rounded-3xl bg-white p-5 text-black shadow-2xl"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold">{site.name}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        /{site.slug}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = `/${site.slug}`;
                      }}
                      className="flex-1 rounded-full bg-[#0B1F3A] py-3 text-center text-sm font-semibold text-white transition active:scale-95"
                    >
                      View property
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = `/owner/property/${site.slug}`;
                      }}
                      className="flex-1 rounded-full border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition active:scale-95"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.href = "/onboarding";
          }}
          className="mt-6 w-full rounded-full bg-white/10 py-4 text-sm font-semibold text-white transition active:scale-95"
        >
          + Add another property
        </button>
      </div>
    </div>
  );
}