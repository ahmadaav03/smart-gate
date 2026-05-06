"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NewPropertyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [isMultiUnit, setIsMultiUnit] = useState<boolean | null>(null);
  const [unitName, setUnitName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [existingCount, setExistingCount] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/resident/login"; return; }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).maybeSingle();

      if (!profile || profile.role !== "property_admin") {
        window.location.href = "/dashboard";
        return;
      }

      const { count } = await supabase
        .from("sites")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);

      setExistingCount(count || 0);
    }
    load();
  }, []);

  async function createProperty() {
    if (!propertyName.trim()) {
      setError("Please enter a property name.");
      return;
    }
    if (isMultiUnit === null) {
      setError("Please select the property type.");
      return;
    }
    if (!userId) return;

    setLoading(true);
    setError("");

    try {
      // Generate unique 6 digit slug
      let slug = "";
      let isUnique = false;
      while (!isUnique) {
        slug = Math.floor(100000 + Math.random() * 900000).toString();
        const { data: existing } = await supabase
          .from("sites").select("id").eq("slug", slug).maybeSingle();
        if (!existing) isUnique = true;
      }

      const { data: site, error: siteError } = await supabase
        .from("sites")
        .insert({
          name: propertyName.trim(),
          slug,
          owner_id: userId,
          subscription_status: "trialing",
        })
        .select().single();

      if (siteError) throw siteError;

      if (!isMultiUnit) {
        await supabase.from("units").insert({
          site_id: site.id,
          name: "main",
          display_name: "Main House",
          slug: "main",
        });
      } else if (unitName.trim()) {
        const unitSlug = unitName
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");

        await supabase.from("units").insert({
          site_id: site.id,
          name: unitSlug,
          display_name: unitName.trim(),
          slug: unitSlug,
        });
      }

      window.location.href = "/dashboard";
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
      console.log(err);
    }

    setLoading(false);
  }

  const additionalPrice = existingCount > 0 ? "R49/month" : "R69/month";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6">
      <div className="w-full max-w-sm">

        <button
          type="button"
          onClick={() => window.location.href = "/dashboard"}
          className="mb-6 flex items-center gap-2 text-sm text-white/60 transition active:scale-95"
        >
          ← Back to dashboard
        </button>

        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-3xl">
            🏠
          </div>
          <h1 className="text-3xl font-bold text-white">Add a property</h1>
          <p className="mt-2 text-sm text-white/60">
            This property will be added to your account at {additionalPrice} after your trial ends.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-2xl">
          {error ? (
            <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          ) : null}

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-700">Property name</label>
              <input
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                placeholder="e.g. 14 Oak Avenue, Beach House"
                className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A] placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">Property type</label>
              <div className="mt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsMultiUnit(false)}
                  className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition active:scale-95 ${
                    isMultiUnit === false
                      ? "border-[#0B1F3A] bg-[#0B1F3A] text-white"
                      : "border-gray-200 text-gray-700"
                  }`}
                >
                  🏠 Single home
                </button>
                <button
                  type="button"
                  onClick={() => setIsMultiUnit(true)}
                  className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition active:scale-95 ${
                    isMultiUnit === true
                      ? "border-[#0B1F3A] bg-[#0B1F3A] text-white"
                      : "border-gray-200 text-gray-700"
                  }`}
                >
                  🏢 Multiple units
                </button>
              </div>
            </div>

            {isMultiUnit ? (
              <div>
                <label className="text-sm font-semibold text-gray-700">First unit name</label>
                <input
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="e.g. Unit 1, Flat A"
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A] placeholder:text-gray-400"
                />
              </div>
            ) : null}

            <button
              type="button"
              onClick={createProperty}
              disabled={loading}
              className="w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white transition active:scale-95 active:bg-[#162d52] disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create property"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}