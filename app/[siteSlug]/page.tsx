"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Site = {
  id: string;
  slug: string;
  name: string;
  site_type: string;
};

type Unit = {
  id: string;
  slug: string;
  name: string;
  unit_type: string;
};

export default function SitePage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = use(params);
  const router = useRouter();

  const [site, setSite] = useState<Site | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSiteAndUnits() {
      setLoading(true);
      setNotFound(false);

      const { data: siteData, error: siteError } = await supabase
        .from("sites")
        .select("id, slug, name, site_type")
        .eq("slug", siteSlug)
        .maybeSingle();

      if (siteError) {
        console.log(siteError);
        if (active) {
          setLoading(false);
          setNotFound(true);
        }
        return;
      }

      if (!siteData) {
        if (active) {
          setLoading(false);
          setNotFound(true);
        }
        return;
      }

      const { data: unitData, error: unitError } = await supabase
        .from("units")
        .select("id, slug, name, unit_type")
        .eq("site_id", siteData.id)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (unitError) {
        console.log(unitError);
        if (active) {
          setLoading(false);
          setNotFound(true);
        }
        return;
      }

      if (!active) return;

      setSite(siteData as Site);
      setUnits((unitData as Unit[]) || []);
      setLoading(false);

      if (unitData && unitData.length === 1) {
        router.replace(`/${siteSlug}/u/${unitData[0].slug}`);
      }
    }

    loadSiteAndUnits();

    return () => {
      active = false;
    };
  }, [siteSlug, router]);

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

  if (notFound || !site) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Location not found</h1>
          <p className="mt-2 text-gray-500">
            We could not find this property.
          </p>
        </div>
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{site.name}</h1>
          <p className="mt-2 text-gray-500">
            No units are available for this property yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold text-center">{site.name}</h1>

      <p className="text-center text-gray-500">
        Choose the unit you want to contact
      </p>

      <div className="flex w-full max-w-xs flex-col gap-4">
        {units.map((unit) => (
          <Link
            key={unit.id}
            href={`/${siteSlug}/u/${unit.slug}`}
            className="rounded-lg bg-black py-3 text-center text-white"
          >
            {unit.name}
          </Link>
        ))}
      </div>
    </div>
  );
}