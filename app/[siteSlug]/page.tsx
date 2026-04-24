"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Site = {
  id: string;
  name: string;
  slug: string;
};

type Unit = {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
};

export default function SitePage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = use(params);

  const [site, setSite] = useState<Site | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitInput, setUnitInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSiteAndUnits() {
      const { data: siteData } = await supabase
        .from("sites")
        .select("id, name, slug")
        .eq("slug", siteSlug)
        .maybeSingle();

      if (!siteData) {
        setError("Site not found.");
        return;
      }

      setSite(siteData as Site);

      const { data: unitsData } = await supabase
        .from("units")
        .select("id, name, display_name, slug")
        .eq("site_id", siteData.id)
        .order("name", { ascending: true });

      setUnits((unitsData as Unit[]) || []);
    }

    loadSiteAndUnits();
  }, [siteSlug]);

  function getUnitDisplayName(unit: Unit) {
    return unit.display_name || unit.name;
  }

  function goToUnit() {
    const cleaned = unitInput.trim().toLowerCase();

    if (!cleaned) {
      setError("Enter a unit number or select one below.");
      return;
    }

    const matchedUnit = units.find((unit) => {
      const displayName = getUnitDisplayName(unit).toLowerCase();

      return (
        unit.slug.toLowerCase() === cleaned ||
        unit.name.toLowerCase() === cleaned ||
        displayName === cleaned
      );
    });

    if (!matchedUnit) {
      setError("Unit not found. Check the unit name or number and try again.");
      return;
    }

    window.location.href = `/${siteSlug}/u/${matchedUnit.slug}`;
  }

  if (error && !site) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] text-white flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Site not found</h1>
          <p className="mt-3 text-white/70">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] text-white px-5 py-8">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl">
            🛡️
          </div>

          <h1 className="text-3xl font-bold">{site?.name || "Loading..."}</h1>

          <p className="mt-3 text-sm text-white/70">
            Enter or select the unit you want to contact.
          </p>
        </div>

        <div className="mt-8 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <label className="text-sm font-semibold text-gray-700">
            Unit name or number
          </label>

          <input
            value={unitInput}
            onChange={(e) => {
              setUnitInput(e.target.value);
              setError("");
            }}
            placeholder="e.g. 12, A4, or Deer Residence"
            className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-4 text-lg outline-none focus:border-[#0B1F3A]"
          />

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <button
            type="button"
            onClick={goToUnit}
            className="mt-4 w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white active:scale-95 transition"
          >
            Continue
          </button>
        </div>

        <div className="mt-7">
          <p className="mb-3 text-sm font-semibold text-white/80">
            Available units
          </p>

          <div className="grid grid-cols-2 gap-3">
            {units.map((unit) => (
              <button
                key={unit.id}
                type="button"
                onClick={() => {
                  window.location.href = `/${siteSlug}/u/${unit.slug}`;
                }}
                className="rounded-2xl bg-white/10 px-4 py-4 text-left active:scale-95 transition"
              >
                <p className="font-semibold">{getUnitDisplayName(unit)}</p>
                {unit.display_name && unit.display_name !== unit.name ? (
                  <p className="mt-1 text-xs text-white/50">{unit.name}</p>
                ) : (
                  <p className="mt-1 text-xs text-white/60">Tap to select</p>
                )}
              </button>
            ))}
          </div>

          {units.length === 0 ? (
            <p className="mt-4 text-sm text-white/60 text-center">
              No units found for this site.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}