"use client";

import { useEffect, useState } from "react";
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

export default function PropertyPage() {
  const [site, setSite] = useState<Site | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/resident/login"; return; }

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).maybeSingle();

      if (!profile || profile.role !== "property_admin") {
        window.location.href = "/dashboard";
        return;
      }

      const { data: siteData } = await supabase
        .from("sites").select("id, name, slug")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();

      if (!siteData) { window.location.href = "/dashboard"; return; }

      setSite(siteData as Site);
      setNameDraft(siteData.name);

      const { data: unitsData } = await supabase
        .from("units").select("id, name, display_name, slug")
        .eq("site_id", siteData.id)
        .order("created_at", { ascending: true });

      setUnits((unitsData as Unit[]) || []);
      setLoading(false);
    }

    load();
  }, []);

  async function savePropertyName() {
    if (!site || !nameDraft.trim()) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase
      .from("sites").update({ name: nameDraft.trim() }).eq("id", site.id);
    if (!error) {
      setSite({ ...site, name: nameDraft.trim() });
      setEditingName(false);
      setMessage("Property name updated.");
    } else {
      setMessage("Could not update property name.");
    }
    setSaving(false);
  }

  async function addUnit() {
    if (!site || !newUnitName.trim()) return;
    setSaving(true);
    const slug = newUnitName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
    const { data, error } = await supabase
      .from("units")
      .insert({
        site_id: site.id,
        name: newUnitName.trim(),
        display_name: newUnitName.trim(),
        slug,
      })
      .select().single();
    if (!error && data) {
      setUnits([...units, data as Unit]);
      setNewUnitName("");
      setAddingUnit(false);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-white/10" />
          <p className="text-white/70">Loading property...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">

        {/* Back */}
        <button
          type="button"
          onClick={() => window.location.href = "/dashboard"}
          className="mb-6 flex items-center gap-2 text-sm text-white/60 transition active:scale-95"
        >
          ← Back to dashboard
        </button>

        <p className="text-sm text-white/60">Property Management</p>
        <h1 className="mt-1 text-3xl font-bold">{site?.name}</h1>

        {message ? (
          <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">
            {message}
          </div>
        ) : null}

        {/* Property name */}
        <div className="mt-6 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <div className="flex items-center justify-between">
            <p className="font-bold">Property name</p>
            <button
              type="button"
              onClick={() => setEditingName(!editingName)}
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold transition active:scale-95 active:bg-gray-200"
            >
              {editingName ? "Cancel" : "Edit"}
            </button>
          </div>

          {editingName ? (
            <div className="mt-4 flex flex-col gap-3">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A]"
              />
              <button
                type="button"
                disabled={saving}
                onClick={savePropertyName}
                className="w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white transition active:scale-95 active:bg-[#162d52] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save name"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-gray-500">{site?.name}</p>
          )}
        </div>

        {/* Units */}
        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">Units</p>
              <p className="mt-1 text-sm text-gray-500">
                {units.length === 0 ? "No units yet" : `${units.length} unit${units.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddingUnit(!addingUnit)}
              className="rounded-full bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-white transition active:scale-95 active:bg-[#162d52]"
            >
              {addingUnit ? "Cancel" : "+ Add"}
            </button>
          </div>

          {addingUnit ? (
            <div className="mt-4 flex flex-col gap-3">
              <input
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                placeholder="e.g. Unit 1, Flat A, Main House"
                className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A]"
              />
              <button
                type="button"
                disabled={saving || !newUnitName.trim()}
                onClick={addUnit}
                className="w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white transition active:scale-95 disabled:opacity-60"
              >
                {saving ? "Adding..." : "Add unit"}
              </button>
            </div>
          ) : null}

          {units.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {units.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => window.location.href = `/dashboard/property/unit/${unit.id}`}
                  className="flex items-center justify-between rounded-2xl bg-gray-50 p-4 transition active:scale-[0.98] active:bg-gray-100"
                >
                  <div className="text-left">
                    <p className="font-semibold">{unit.display_name || unit.name}</p>
                    <p className="mt-0.5 text-xs text-gray-400">Tap to manage residents</p>
                  </div>
                  <span className="text-gray-400">→</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
}