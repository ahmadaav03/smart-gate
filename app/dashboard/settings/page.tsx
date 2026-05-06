"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type SiteItem = {
  id: string;
  name: string;
  subscription_status: string;
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/resident/login"; return; }

      setEmail(user.email || "");

      const providers = user.app_metadata?.providers || [];
      setIsGoogleUser(providers.includes("google") && !providers.includes("email"));

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).maybeSingle();

      if (profile?.role === "property_admin") {
        setIsAdmin(true);
        const { data: sitesData } = await supabase
          .from("sites")
          .select("id, name, subscription_status")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true });
        setSites((sitesData as SiteItem[]) || []);
      }

      setLoading(false);
    }
    load();
  }, []);

  async function changePassword() {
    if (!newPassword || !confirmPassword) {
      setPasswordMessage("Please fill in both password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage("Password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setPasswordMessage("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMessage("Could not update password. Please try again.");
    } else {
      setPasswordMessage("Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  }

  async function deleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { data: resident } = await supabase
        .from("residents").select("id").eq("auth_user_id", user.id).maybeSingle();

      if (resident) {
        await supabase.from("unit_residents").delete().eq("resident_id", resident.id);
        await supabase.from("calls").delete().eq("resident_id", resident.id);
        await supabase.from("residents").delete().eq("id", resident.id);
      }

      if (isAdmin && sites.length > 0) {
        for (const s of sites) {
          const { data: units } = await supabase
            .from("units").select("id").eq("site_id", s.id);

          if (units) {
            for (const unit of units) {
              await supabase.from("unit_residents").delete().eq("unit_id", unit.id);
              await supabase.from("invites").delete().eq("unit_id", unit.id);
            }
          }

          await supabase.from("units").delete().eq("site_id", s.id);
          await supabase.from("calls").delete().eq("site_id", s.id);
          await supabase.from("sites").delete().eq("id", s.id);
        }
      }

      await supabase.from("profiles").delete().eq("id", user.id);
      await supabase.auth.signOut();
      window.location.href = "/resident/login";
    } catch (err) {
      console.log(err);
      setDeleting(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/resident/login";
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-white/10" />
          <p className="text-white/70">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">

        <button
          type="button"
          onClick={() => window.location.href = "/dashboard"}
          className="mb-6 flex items-center gap-2 text-sm text-white/60 transition active:scale-95"
        >
          ← Back to dashboard
        </button>

        <p className="text-sm text-white/60">Settings</p>
        <h1 className="mt-1 text-3xl font-bold">Account</h1>

        {/* Account info */}
        <div className="mt-6 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <p className="font-bold">Account details</p>
          <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-400">Email address</p>
            <p className="mt-1 text-sm font-semibold">{email}</p>
          </div>
          {isGoogleUser ? (
            <div className="mt-3 rounded-2xl bg-blue-50 px-4 py-3">
              <p className="text-sm text-blue-700 font-semibold">Signed in with Google</p>
              <p className="mt-1 text-xs text-blue-500">Your account is managed through Google.</p>
            </div>
          ) : null}
        </div>

        {/* Properties & Subscription — admin only */}
        {isAdmin ? (
          <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
            <p className="font-bold">My Properties</p>
            <p className="mt-1 text-sm text-gray-500">
              R69/month for first property · R49/month for each additional property.
            </p>

            <div className="mt-4 flex flex-col gap-3">
              {sites.map((s, index) => (
                <div key={s.id} className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
                  <div>
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {index === 0 ? "R69/month" : "R49/month"}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    s.subscription_status === "active" ? "bg-green-100 text-green-700"
                    : s.subscription_status === "trialing" ? "bg-blue-100 text-blue-700"
                    : "bg-red-100 text-red-700"
                  }`}>
                    {s.subscription_status === "trialing" ? "Trial" : s.subscription_status}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => window.location.href = "/dashboard/new-property"}
              className="mt-4 w-full rounded-full border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition active:scale-95 active:bg-gray-50"
            >
              + Add another property
            </button>

            <p className="mt-4 text-xs text-gray-400">
              Subscription billing coming soon. Your trial covers all properties.
            </p>
          </div>
        ) : null}

        {/* Change password — email users only */}
        {!isGoogleUser ? (
          <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
            <p className="font-bold">Change password</p>
            <div className="mt-4 flex flex-col gap-3">
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A] placeholder:text-gray-400"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A] placeholder:text-gray-400"
              />
              {passwordMessage ? (
                <p className={`text-sm ${passwordMessage.includes("success") ? "text-green-600" : "text-red-600"}`}>
                  {passwordMessage}
                </p>
              ) : null}
              <button
                type="button"
                disabled={saving}
                onClick={changePassword}
                className="w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white transition active:scale-95 active:bg-[#162d52] disabled:opacity-60"
              >
                {saving ? "Updating..." : "Update password"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Sign out */}
        <button
          type="button"
          onClick={signOut}
          className="mt-5 w-full rounded-full bg-white/10 py-4 text-sm font-semibold text-white transition active:scale-95 active:bg-white/20"
        >
          Sign out
        </button>

        {/* Delete account */}
        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <p className="font-bold text-red-600">Delete account</p>
          <p className="mt-1 text-sm text-gray-500">
            {isAdmin
              ? "This will permanently delete your account, all properties, all units, all residents and all call history. This cannot be undone."
              : "This will permanently delete your account and all associated data. This cannot be undone."}
          </p>

          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-4 w-full rounded-full border-2 border-red-200 py-4 text-sm font-semibold text-red-600 transition active:scale-95 active:bg-red-50"
            >
              Delete my account
            </button>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-red-600">Type DELETE to confirm</p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-2xl border-2 border-red-200 px-4 py-4 text-sm outline-none focus:border-red-500 placeholder:text-gray-400"
              />
              <button
                type="button"
                disabled={deleteConfirmText !== "DELETE" || deleting}
                onClick={deleteAccount}
                className="w-full rounded-full bg-red-600 py-4 font-semibold text-white transition active:scale-95 disabled:opacity-40"
              >
                {deleting ? "Deleting..." : "Permanently delete everything"}
              </button>
              <button
                type="button"
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
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