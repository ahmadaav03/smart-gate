"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Site = {
  id: string;
  slug: string;
  name: string;
};

type Unit = {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
};

type Resident = {
  id: string;
  slug: string;
  full_name: string;
  display_name: string | null;
};

export default function UnitPage({
  params,
}: {
  params: Promise<{ siteSlug: string; unitSlug: string }>;
}) {
  const { siteSlug, unitSlug } = use(params);

  const [site, setSite] = useState<Site | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [callingResident, setCallingResident] = useState<string | null>(null);
  const [callError, setCallError] = useState("");

  function getUnitDisplayName(unit: Unit) {
    return unit.display_name || unit.name;
  }

  function getResidentDisplayName(resident: Resident) {
    return resident.display_name || resident.full_name;
  }

  useEffect(() => {
    let active = true;

    async function loadPage() {
      setLoading(true);
      setNotFound(false);

      const { data: siteData, error: siteError } = await supabase
        .from("sites")
        .select("id, slug, name")
        .eq("slug", siteSlug)
        .maybeSingle();

      if (siteError || !siteData) {
        console.log(siteError);
        if (active) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      const { data: unitData, error: unitError } = await supabase
        .from("units")
        .select("id, slug, name, display_name")
        .eq("site_id", siteData.id)
        .eq("slug", unitSlug)
        .maybeSingle();

      if (unitError || !unitData) {
        console.log(unitError);
        if (active) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      const { data: residentLinks, error: residentLinksError } = await supabase
        .from("unit_residents")
        .select(`
          residents (
            id,
            slug,
            full_name,
            display_name
          )
        `)
        .eq("unit_id", unitData.id)
        .order("display_order", { ascending: true });

      if (residentLinksError) {
        console.log(residentLinksError);
        if (active) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      const residentList =
        residentLinks
          ?.map((item: any) => item.residents)
          .filter(Boolean) || [];

      if (!active) return;

      setSite(siteData as Site);
      setUnit(unitData as Unit);
      setResidents(residentList as Resident[]);
      setLoading(false);
    }

    loadPage();

    return () => {
      active = false;
    };
  }, [siteSlug, unitSlug]);

  async function createCall(resident: Resident) {
    if (!site || !unit) return;

    setCallError("");
    setCallingResident(resident.slug);

    const { data: residentStatus, error: statusError } = await supabase
  .from("residents")
  .select("availability_status")
  .eq("id", resident.id)
  .maybeSingle();

if (statusError) {
  console.log(statusError);
  setCallingResident(null);
  setCallError("Could not check resident availability. Please try again.");
  return;
}

if (residentStatus?.availability_status === "dnd") {
  setCallingResident(null);
  setCallError("This resident is not available right now.");
  return;
}

    const { data, error } = await supabase
      .from("calls")
      .insert([
        {
          house_slug: siteSlug,
          resident_slug: resident.slug,
          status: "calling",
          site_id: site.id,
          unit_id: unit.id,
          resident_id: resident.id,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      console.log(error);
      setCallingResident(null);
      setCallError(
        "This resident may already be on a call. Please try again shortly."
      );
      return;
    }

    window.location.href = `/${siteSlug}/u/${unitSlug}/call/${resident.slug}?callId=${data.id}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] text-white flex items-center justify-center px-6 text-center">
        <div>
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-white/10" />
          <h1 className="text-2xl font-bold">Loading</h1>
          <p className="mt-2 text-white/70">Preparing unit details...</p>
        </div>
      </div>
    );
  }

  if (notFound || !site || !unit) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] text-white flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold">Unit not found</h1>
          <p className="mt-3 text-white/70">We could not find this unit.</p>
        </div>
      </div>
    );
  }

  const unitDisplayName = getUnitDisplayName(unit);

  if (residents.length === 0) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] text-white flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold">{unitDisplayName}</h1>
          <p className="mt-3 text-white/70">
            No residents are available for this unit yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] text-white px-5 py-8">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl">
            🏠
          </div>

          <p className="text-sm text-white/60">{site.name}</p>

          <h1 className="mt-2 text-3xl font-bold">{unitDisplayName}</h1>

          {unit.display_name && unit.display_name !== unit.name ? (
            <p className="mt-1 text-xs text-white/50">{unit.name}</p>
          ) : null}

          <p className="mt-3 text-sm text-white/70">
            Select who you would like to contact.
          </p>
        </div>

        {callError ? (
          <div className="mt-6 rounded-2xl bg-red-600/90 px-4 py-3 text-center text-sm text-white">
            {callError}
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-4">
          {residents.map((resident) => {
            const isCalling = callingResident === resident.slug;
            const residentDisplayName = getResidentDisplayName(resident);

            return (
              <button
                key={resident.id}
                type="button"
                onClick={() => createCall(resident)}
                disabled={!!callingResident}
                className="group rounded-3xl bg-white p-5 text-left text-black shadow-xl active:scale-95 transition disabled:opacity-70"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0B1F3A] text-xl text-white">
                    {isCalling ? "…" : "📞"}
                  </div>

                  <div className="flex-1">
                    <p className="text-lg font-bold">{residentDisplayName}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {isCalling ? "Starting call..." : "Tap to call resident"}
                    </p>
                  </div>

                  <div className="text-2xl text-gray-300 group-active:translate-x-1 transition">
                    →
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.href = `/${siteSlug}`;
          }}
          className="mt-8 w-full rounded-full bg-white/10 py-4 text-sm font-semibold text-white active:scale-95 transition"
        >
          Back to units
        </button>
      </div>
    </div>
  );
}