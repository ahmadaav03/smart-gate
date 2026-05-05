"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function OnboardingPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<"choose" | "admin-setup" | "resident-join">("choose");
  const [propertyName, setPropertyName] = useState("");
  const [isMultiUnit, setIsMultiUnit] = useState<boolean | null>(null);
  const [unitName, setUnitName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/resident/login";
        return;
      }
      setUserId(user.id);
    }
    getUser();
  }, []);

  async function setupAsAdmin() {
    if (!propertyName.trim()) {
      setError("Please enter your property name.");
      return;
    }
    if (isMultiUnit === null) {
      setError("Please select whether your property has multiple units.");
      return;
    }
    if (!userId) return;

    setLoading(true);
    setError("");

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({ id: userId, role: "property_admin" });

      if (profileError) throw profileError;

      const slug =
        propertyName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") +
        "-" +
        Date.now();

      const { data: site, error: siteError } = await supabase
        .from("sites")
        .insert({
          name: propertyName.trim(),
          slug,
          owner_id: userId,
        })
        .select()
        .single();

      if (siteError) throw siteError;

      if (!isMultiUnit) {
        await supabase.from("units").insert({
          site_id: site.id,
          name: "main",
          display_name: "Main House",
          slug: "main",
        });
      } else if (unitName.trim()) {
        await supabase.from("units").insert({
          site_id: site.id,
          name: unitName.toLowerCase().replace(/\s+/g, "-"),
          display_name: unitName.trim(),
          slug: unitName.toLowerCase().replace(/\s+/g, "-"),
        });
      }

      window.location.href = "/dashboard";
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
      console.log(err);
    }

    setLoading(false);
  }

  async function joinAsResident() {
    if (!inviteCode.trim()) {
      setError("Please enter your invite code.");
      return;
    }
    if (!userId) return;

    setLoading(true);
    setError("");

    try {
      const { data: invite, error: inviteError } = await supabase
        .from("invites")
        .select("*")
        .eq("token", inviteCode.trim())
        .eq("status", "pending")
        .maybeSingle();

      if (inviteError || !invite) {
        setError("Invalid or expired invite code. Please check with your property manager.");
        setLoading(false);
        return;
      }

      if (new Date(invite.expires_at) < new Date()) {
        setError("This invite has expired. Please ask your property manager for a new one.");
        setLoading(false);
        return;
      }

      await supabase
        .from("profiles")
        .insert({ id: userId, role: "resident" });

      const { data: authUser } = await supabase.auth.getUser();
      const fullName =
        authUser.user?.user_metadata?.full_name ||
        authUser.user?.email ||
        "Resident";
      const slug =
        fullName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") +
        "-" +
        Date.now();

      const { data: resident, error: residentError } = await supabase
        .from("residents")
        .insert({
          full_name: fullName,
          display_name: fullName,
          slug,
          auth_user_id: userId,
          availability_status: "available",
          ringtone: "classic",
        })
        .select()
        .single();

      if (residentError) throw residentError;

      await supabase.from("unit_residents").insert({
        unit_id: invite.unit_id,
        resident_id: resident.id,
      });

      await supabase
        .from("invites")
        .update({
          status: "used",
          used_at: new Date().toISOString(),
          used_by: userId,
        })
        .eq("id", invite.id);

      window.location.href = "/dashboard";
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
      console.log(err);
    }

    setLoading(false);
  }

  if (step === "choose") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-3xl">
              👋
            </div>
            <h1 className="text-3xl font-bold text-white">Welcome</h1>
            <p className="mt-2 text-sm text-white/60">
              Let's get you set up. What brings you here?
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setStep("admin-setup")}
              className="rounded-3xl bg-white p-5 text-left shadow-2xl transition active:scale-95"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B1F3A] text-xl text-white">
                  🏠
                </div>
                <div>
                  <p className="font-bold text-black">I'm setting up a property</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Create your intercom system
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStep("resident-join")}
              className="rounded-3xl bg-white p-5 text-left shadow-2xl transition active:scale-95"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B1F3A] text-xl text-white">
                  👤
                </div>
                <div>
                  <p className="font-bold text-black">I was invited as a resident</p>
                  <p className="mt-1 text-sm text-gray-500">
                    I have an invite link or code
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "admin-setup") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">Your property</h1>
            <p className="mt-2 text-sm text-white/60">
              Tell us about your property
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-2xl">
            {error ? (
              <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Property name
                </label>
                <input
                  value={propertyName}
                  onChange={(e) => setPropertyName(e.target.value)}
                  placeholder="e.g. Smith Residence, 12 Oak Street"
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A]"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Property type
                </label>
                <div className="mt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMultiUnit(false)}
                    className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition ${
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
                    className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition ${
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
                  <label className="text-sm font-semibold text-gray-700">
                    First unit name
                  </label>
                  <input
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                    placeholder="e.g. Unit 1, Flat A"
                    className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A]"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    You can add more units from your dashboard
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={setupAsAdmin}
                disabled={loading}
                className="w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white transition active:scale-95 disabled:opacity-60"
              >
                {loading ? "Setting up..." : "Create my property"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("choose"); setError(""); }}
                className="w-full rounded-full border border-gray-200 py-4 text-sm font-semibold text-gray-600 transition active:scale-95"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "resident-join") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">Join your home</h1>
            <p className="mt-2 text-sm text-white/60">
              Enter the invite code sent to you
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-2xl">
            {error ? (
              <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Invite code
                </label>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Paste your invite code here"
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-4 text-sm outline-none focus:border-[#0B1F3A]"
                />
              </div>

              <button
                type="button"
                onClick={joinAsResident}
                disabled={loading}
                className="w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white transition active:scale-95 disabled:opacity-60"
              >
                {loading ? "Joining..." : "Join property"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("choose"); setError(""); }}
                className="w-full rounded-full border border-gray-200 py-4 text-sm font-semibold text-gray-600 transition active:scale-95"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}