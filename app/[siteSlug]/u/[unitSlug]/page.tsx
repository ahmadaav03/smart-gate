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
};

type Resident = {
  id: string;
  slug: string;
  full_name: string;
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
        .select("id, slug, name")
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
            full_name
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
    if (!unit) return;

    setCallingResident(resident.slug);

    const { data, error } = await supabase
      .from("calls")
      .insert([
        {
          house_slug: siteSlug,
          resident_slug: resident.slug,
          status: "calling",
          site_id: site?.id ?? null,
          unit_id: unit.id,
          resident_id: resident.id,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      console.log(error);
      setCallingResident(null);
      return;
    }

    window.location.href = `/${siteSlug}/u/${unitSlug}/call/${resident.slug}?callId=${data.id}`;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Loading...</h1>
          <p className="mt-2 text-gray-500">Please wait</p>
        </div>
      </div>
    );
  }

  if (notFound || !site || !unit) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Unit not found</h1>
          <p className="mt-2 text-gray-500">
            We could not find this unit.
          </p>
        </div>
      </div>
    );
  }

  if (residents.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{unit.name}</h1>
          <p className="mt-2 text-gray-500">
            No residents are available for this unit yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold text-center">{unit.name}</h1>

      <p className="text-center text-gray-500">
        Who would you like to contact?
      </p>

      <div className="flex w-full max-w-xs flex-col gap-4">
        {residents.map((resident) => (
          <button
            key={resident.id}
            type="button"
            onClick={() => createCall(resident)}
            disabled={callingResident === resident.slug}
            className="rounded-lg bg-black py-3 text-white"
          >
            {callingResident === resident.slug
              ? "Calling..."
              : `Call ${resident.full_name}`}
          </button>
        ))}
      </div>
    </div>
  );
}