"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Unit = {
  id: string;
  name: string;
  display_name: string | null;
  site_id: string;
};

type Resident = {
  id: string;
  full_name: string;
  display_name: string | null;
  availability_status: string;
  avatar_url: string | null;
};

type Invite = {
  id: string;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
};

export default function UnitPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = use(params);

  const [unit, setUnit] = useState<Unit | null>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [message, setMessage] = useState("");
  const [showDeleteUnit, setShowDeleteUnit] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: unitData } = await supabase
        .from("units").select("id, name, display_name, site_id")
        .eq("id", unitId).maybeSingle();

      if (!unitData) { window.location.href = "/dashboard/property"; return; }

      setUnit(unitData as Unit);
      setNameDraft(unitData.display_name || unitData.name);

      const { data: linkData } = await supabase
        .from("unit_residents")
        .select("residents ( id, full_name, display_name, availability_status, avatar_url )")
        .eq("unit_id", unitId);

      const residentList = linkData?.map((item: any) =>
        Array.isArray(item.residents) ? item.residents[0] : item.residents
      ).filter(Boolean) || [];

      setResidents(residentList as Resident[]);

      const { data: inviteData } = await supabase
        .from("invites")
        .select("id, token, status, expires_at, created_at")
        .eq("unit_id", unitId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      setInvites((inviteData as Invite[]) || []);
      setLoading(false);
    }

    load();
  }, [unitId]);

  async function saveUnitName() {
    if (!unit || !nameDraft.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("units")
      .update({ display_name: nameDraft.trim() })
      .eq("id", unit.id);
    if (!error) {
      setUnit({ ...unit, display_name: nameDraft.trim() });
      setEditingName(false);
      setMessage("Unit name updated.");
    }
    setSaving(false);
  }

  async function generateInvite() {
    if (!unit) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("invites")
      .insert({
        unit_id: unit.id,
        site_id: unit.site_id,
        created_by: user?.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select().single();

    if (!error && data) {
      setInvites([data as Invite, ...invites]);
    }

    setSaving(false);
  }

  async function cancelInvite(inviteId: string) {
    await supabase.from("invites").update({ status: "expired" }).eq("id", inviteId);
    setInvites(invites.filter((i) => i.id !== inviteId));
  }

  async function removeResident(residentId: string) {
    await supabase
      .from("unit_residents")
      .delete()
      .eq("unit_id", unitId)
      .eq("resident_id", residentId);
    setResidents(residents.filter((r) => r.id !== residentId));
  }

  async function deleteUnit() {
    if (!unit) return;
    setSaving(true);
    await supabase.from("unit_residents").delete().eq("unit_id", unit.id);
    await supabase.from("invites").delete().eq("unit_id", unit.id);
    await supabase.from("units").delete().eq("id", unit.id);
    window.location.href = "/dashboard/property";
  }

  function copyToClipboard(text: string, token: string) {
    navigator.clipboard.writeText(text);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-white/10" />
          <p className="text-white/70">Loading unit...</p>
        </div>
      </div>
    );
  }

  const unitDisplayName = unit?.display_name || unit?.name || "Unit";

  return (
    <div className="min-h-screen bg-[#0B1F3A] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">

        <button
          type="button"
          onClick={() => window.location.href = "/dashboard/property"}
          className="mb-6 flex items-center gap-2 text-sm text-white/60 transition active:scale-95"
        >
          ← Back to property
        </button>

        <p className="text-sm text-white/60">Unit</p>
        <h1 className="mt-1 text-3xl font-bold">{unitDisplayName}</h1>

        {message ? (
          <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">{message}</div>
        ) : null}

        {/* Unit name */}
        <div className="mt-6 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <div className="flex items-center justify-between">
            <p className="font-bold">Unit name</p>
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
                onClick={saveUnitName}
                className="w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white transition active:scale-95 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-gray-500">{unitDisplayName}</p>
          )}
        </div>

        {/* Residents */}
        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">Residents</p>
              <p className="mt-1 text-sm text-gray-500">
                {residents.length === 0 ? "No residents yet" : `${residents.length} resident${residents.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={generateInvite}
              className="rounded-full bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-white transition active:scale-95 active:bg-[#162d52] disabled:opacity-60"
            >
              + Invite
            </button>
          </div>

          {residents.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {residents.map((resident) => (
                <div key={resident.id} className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-lg">
                      {resident.avatar_url
                        ? <img src={resident.avatar_url} alt="" className="h-full w-full object-cover" />
                        : "👤"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{resident.display_name || resident.full_name}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {resident.availability_status === "available" ? "Available" : "DND"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeResident(resident.id)}
                    className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition active:scale-95 active:bg-red-100"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Pending invites */}
        {invites.length > 0 ? (
          <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
            <p className="font-bold">Pending invites</p>
            <p className="mt-1 text-sm text-gray-500">These invites expire after 7 days.</p>
            <div className="mt-4 flex flex-col gap-4">
              {invites.map((invite) => {
                const expires = new Date(invite.expires_at);
                const daysLeft = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const inviteLink = `${typeof window !== "undefined" ? window.location.origin : ""}/resident/login?invite=${invite.token}`;

                return (
                  <div key={invite.id} className="rounded-2xl bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">
                        Expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}
                      </p>
                      <button
                        type="button"
                        onClick={() => cancelInvite(invite.id)}
                        className="text-xs font-semibold text-red-500 transition active:scale-95"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 border border-gray-200">
                        <p className="text-xs text-gray-500 font-mono truncate flex-1 mr-2">
                          {invite.token}
                        </p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(invite.token, invite.token + "-code")}
                          className="text-xs font-semibold text-[#0B1F3A] whitespace-nowrap transition active:scale-95"
                        >
                          {copiedToken === invite.token + "-code" ? "Copied!" : "Copy code"}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => copyToClipboard(inviteLink, invite.token + "-link")}
                        className="w-full rounded-full bg-[#0B1F3A] py-3 text-sm font-semibold text-white transition active:scale-95 active:bg-[#162d52]"
                      >
                        {copiedToken === invite.token + "-link" ? "Link copied!" : "Copy invite link"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Delete unit */}
        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <p className="font-bold">Danger zone</p>
          <p className="mt-1 text-sm text-gray-500">
            Deleting this unit will remove all residents and invites linked to it.
          </p>
          {!showDeleteUnit ? (
            <button
              type="button"
              onClick={() => setShowDeleteUnit(true)}
              className="mt-4 w-full rounded-full border-2 border-red-200 py-4 text-sm font-semibold text-red-600 transition active:scale-95 active:bg-red-50"
            >
              Delete this unit
            </button>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-red-600">
                Are you sure? This cannot be undone.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={deleteUnit}
                className="w-full rounded-full bg-red-600 py-4 font-semibold text-white transition active:scale-95 disabled:opacity-60"
              >
                {saving ? "Deleting..." : "Yes, delete unit"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteUnit(false)}
                className="w-full rounded-full border border-gray-200 py-4 text-sm font-semibold text-gray-600 transition active:scale-95"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}