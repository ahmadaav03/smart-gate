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
  availability_status?: "available" | "dnd";
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
      setCallError("");

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
            display_name,
            availability_status
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
          ?.map((item: any) =>
            Array.isArray(item.residents)
              ? item.residents[0] || null
              : item.residents
          )
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
    if (!site || !unit || callingResident) return;

    setCallError("");
    setCallingResident(resident.slug);

    const { data: residentStatus, error: statusError } = await supabase
      .from("residents")
      .select("availability_status")
      .eq("id", resident.id)
      .maybeSingle();

    if (statusError || !residentStatus) {
      console.log(statusError);
      setCallingResident(null);
      setCallError("Could not check resident availability. Please try again.");
      return;
    }

    if (residentStatus.availability_status === "dnd") {
      setCallingResident(null);
      setCallError("This resident is not available right now.");
      return;
    }

    const { data: activeCall, error: activeCallError } = await supabase
      .from("calls")
      .select("id, status")
      .eq("resident_id", resident.id)
      .in("status", ["calling", "answered"])
      .maybeSingle();

    if (activeCallError) {
      console.log(activeCallError);
      setCallingResident(null);
      setCallError("Could not check if the resident is busy. Please try again.");
      return;
    }

    if (activeCall) {
      setCallingResident(null);
      setCallError("This resident is currently busy. Please try again shortly.");
      return;
    }

    const timeoutAt = new Date(Date.now() + 45_000).toISOString();

    const { data, error } = await supabase
      .from("calls")
      .insert([
        {
          house_slug: siteSlug,
          resident_slug: resident.slug,
          status: "calling",
          visitor_ready: false,
          expires_at: timeoutAt,
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
      setCallError("Could not start the call. Please try again shortly.");
      return;
    }

    window.location.href = `/${siteSlug}/u/${unitSlug}/call/${resident.slug}?callId=${data.id}`;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6 text-center text-white">
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
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6 text-center text-white">
        <div>
          <h1 className="text-3xl font-bold">Unit not found</h1>
          <p className="mt-3 text-white/70">We could not find this unit.</p>

          <button
            type="button"
            onClick={() => {
              window.location.href = `/${siteSlug}`;
            }}
            className="mt-6 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black active:scale-95 transition"
          >
            Back to property
          </button>
        </div>
      </div>
    );
  }

  const unitDisplayName = getUnitDisplayName(unit);

  if (residents.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6 text-center text-white">
        <div>
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl">
            🏠
          </div>

          <h1 className="text-3xl font-bold">{unitDisplayName}</h1>
          <p className="mt-3 text-white/70">
            No residents are available for this unit yet.
          </p>

          <button
            type="button"
            onClick={() => {
              window.location.href = `/${siteSlug}`;
            }}
            className="mt-6 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black active:scale-95 transition"
          >
            Back to units
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] px-5 py-8 text-white">
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
            const isUnavailable = resident.availability_status === "dnd";
            const residentDisplayName = getResidentDisplayName(resident);

            return (
              <button
                key={resident.id}
                type="button"
                onClick={() => createCall(resident)}
                disabled={!!callingResident || isUnavailable}
                className="group rounded-3xl bg-white p-5 text-left text-black shadow-xl active:scale-95 transition disabled:opacity-60"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-full text-xl text-white ${
                      isUnavailable
                        ? "bg-gray-400"
                        : isCalling
                        ? "bg-[#F59E0B]"
                        : "bg-[#0B1F3A]"
                    }`}
                  >
                    {isCalling ? "…" : isUnavailable ? "⛔" : "📞"}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold">
                        {residentDisplayName}
                      </p>

                      {isUnavailable ? (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          DND
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      {isCalling
                        ? "Starting secure call..."
                        : isUnavailable
                        ? "Resident is unavailable"
                        : "Tap to call resident"}
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
          disabled={!!callingResident}
          className="mt-8 w-full rounded-full bg-white/10 py-4 text-sm font-semibold text-white active:scale-95 transition disabled:opacity-50"
        >
          Back to units
        </button>
      </div>
    </div>
  );
}