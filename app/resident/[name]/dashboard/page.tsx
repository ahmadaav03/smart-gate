"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Resident = {
  id: string;
  slug: string;
  full_name: string;
  display_name: string | null;
  availability_status: "available" | "dnd";
  ringtone: string;
};

type UnitLink = {
  units: {
    id: string;
    name: string;
    display_name: string | null;
    sites: {
      id: string;
      name: string;
      slug: string;
    } | null;
  } | null;
};

const ringtones = [
  { value: "classic", label: "Classic Ring" },
  { value: "soft", label: "Soft Chime" },
  { value: "urgent", label: "Urgent Alert" },
  { value: "beep", label: "Short Beep" },
];

export default function ResidentDashboardPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const residentSlug = name.toLowerCase();

  const [resident, setResident] = useState<Resident | null>(null);
  const [unitLinks, setUnitLinks] = useState<UnitLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      const { data: residentData, error: residentError } = await supabase
        .from("residents")
        .select(
          "id, slug, full_name, display_name, availability_status, ringtone"
        )
        .eq("slug", residentSlug)
        .maybeSingle();

      if (residentError || !residentData) {
        console.log(residentError);
        setResident(null);
        setLoading(false);
        return;
      }

      setResident(residentData as Resident);

      const { data: linksData, error: linksError } = await supabase
        .from("unit_residents")
        .select(`
          units (
            id,
            name,
            display_name,
            sites (
              id,
              name,
              slug
            )
          )
        `)
        .eq("resident_id", residentData.id);

      if (linksError) {
        console.log(linksError);
      }

      const cleanedLinks: UnitLink[] =
  linksData?.map((item: any) => ({
    units: Array.isArray(item.units) ? item.units[0] || null : item.units,
  })) || [];

setUnitLinks(cleanedLinks);
      setLoading(false);
    }

    loadDashboard();
  }, [residentSlug]);

  async function updateAvailability(nextStatus: "available" | "dnd") {
    if (!resident) return;

    setSaving(true);

    const { error } = await supabase
      .from("residents")
      .update({ availability_status: nextStatus })
      .eq("id", resident.id);

    if (!error) {
      setResident({
        ...resident,
        availability_status: nextStatus,
      });
    } else {
      console.log(error);
    }

    setSaving(false);
  }

  async function updateRingtone(nextRingtone: string) {
    if (!resident) return;

    setSaving(true);

    const { error } = await supabase
      .from("residents")
      .update({ ringtone: nextRingtone })
      .eq("id", resident.id);

    if (!error) {
      setResident({
        ...resident,
        ringtone: nextRingtone,
      });
    } else {
      console.log(error);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] text-white flex items-center justify-center px-6 text-center">
        <div>
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-white/10" />
          <h1 className="text-2xl font-bold">Loading dashboard</h1>
          <p className="mt-2 text-white/70">Preparing resident profile...</p>
        </div>
      </div>
    );
  }

  if (!resident) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] text-white flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Resident not found</h1>
          <p className="mt-3 text-white/70">
            This resident profile could not be found.
          </p>
        </div>
      </div>
    );
  }

  const displayName = resident.display_name || resident.full_name;
  const isAvailable = resident.availability_status === "available";

  return (
    <div className="min-h-screen bg-[#0B1F3A] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl">
            🛡️
          </div>

          <p className="text-sm text-white/60">Resident Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold">{displayName}</h1>
          <p className="mt-2 text-sm text-white/70">
            {isAvailable
              ? "You are available for visitor calls."
              : "Do not disturb is on."}
          </p>
        </div>

        <div className="mt-8 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-bold">Call availability</p>
              <p className="mt-1 text-sm text-gray-500">
                {isAvailable
                  ? "Visitors can call you."
                  : "Incoming calls should be blocked later."}
              </p>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                updateAvailability(isAvailable ? "dnd" : "available")
              }
              className={`relative h-8 w-16 rounded-full transition ${
                isAvailable ? "bg-green-600" : "bg-red-600"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                  isAvailable ? "left-9" : "left-1"
                }`}
              />
            </button>
          </div>

          <div className="mt-5 rounded-2xl bg-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-700">Current mode</p>
            <p className="mt-1 text-lg font-bold">
              {isAvailable ? "Available" : "Do Not Disturb"}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <p className="font-bold">Ringtone</p>
          <p className="mt-1 text-sm text-gray-500">
            Choose the sound for incoming calls.
          </p>

          <select
            value={resident.ringtone}
            disabled={saving}
            onChange={(e) => updateRingtone(e.target.value)}
            className="mt-4 w-full rounded-2xl border border-gray-200 px-4 py-4 outline-none focus:border-[#0B1F3A]"
          >
            {ringtones.map((ringtone) => (
              <option key={ringtone.value} value={ringtone.value}>
                {ringtone.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <p className="font-bold">Linked property</p>
          <p className="mt-1 text-sm text-gray-500">
            These are the unit details linked to this resident.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {unitLinks.length === 0 ? (
              <p className="text-sm text-gray-500">
                No unit is linked to this resident yet.
              </p>
            ) : (
              unitLinks.map((link, index) => {
                const unit = link.units;
                const site = unit?.sites;

                return (
                  <div
                    key={`${unit?.id || "unit"}-${index}`}
                    className="rounded-2xl bg-gray-100 p-4"
                  >
                    <p className="font-semibold">
                      {unit?.display_name || unit?.name || "Unknown unit"}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {site?.name || "Unknown property"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-white/10 p-4">
            <p className="text-sm text-white/60">Recent calls</p>
            <p className="mt-2 text-lg font-bold">Coming soon</p>
          </div>

          <div className="rounded-3xl bg-white/10 p-4">
            <p className="text-sm text-white/60">Profile settings</p>
            <p className="mt-2 text-lg font-bold">Coming soon</p>
          </div>
        </div>

        <a
          href={`/resident/${resident.slug}`}
          className="mt-8 block w-full rounded-full bg-white/10 py-4 text-center text-sm font-semibold text-white active:scale-95 transition"
        >
          Open test call listener
        </a>
      </div>
    </div>
  );
}