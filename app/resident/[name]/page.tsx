"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Call = {
  id: string;
  house_slug: string;
  resident_slug: string;
  status: "calling" | "answered" | "declined" | "cancelled";
  created_at: string;
};

export default function ResidentPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const residentSlug = name.toLowerCase();

  const [incomingCall, setIncomingCall] = useState<Call | null>(null);

  useEffect(() => {
    let active = true;

    async function loadLatestCallOnce() {
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("resident_slug", residentSlug)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.log(error);
        return;
      }

      if (active) {
        setIncomingCall((data as Call) || null);
      }
    }

    loadLatestCallOnce();

    const channel = supabase
      .channel(`resident-${residentSlug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
          filter: `resident_slug=eq.${residentSlug}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setIncomingCall(null);
            return;
          }

          const row = payload.new as Call;
          setIncomingCall(row);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [residentSlug]);

  async function updateCallStatus(newStatus: "answered" | "declined") {
    if (!incomingCall) return;

    const { error } = await supabase
      .from("calls")
      .update({ status: newStatus })
      .eq("id", incomingCall.id);

    if (error) console.log(error);
  }

  async function clearCall() {
    if (!incomingCall) return;

    const { error } = await supabase
      .from("calls")
      .delete()
      .eq("id", incomingCall.id);

    if (error) console.log(error);

    setIncomingCall(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg text-center">
        <h1 className="text-2xl font-bold capitalize">{name}&apos;s Phone</h1>

        {!incomingCall ? (
          <p className="mt-4 text-gray-500">No incoming calls</p>
        ) : incomingCall.status === "calling" ? (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-lg font-semibold">Incoming Call</p>
            <p className="text-gray-500">
              Someone is calling from House {incomingCall.house_slug}
            </p>

            <button
              onClick={() => updateCallStatus("answered")}
              className="w-full rounded-lg bg-green-600 py-3 text-white font-medium"
            >
              Answer
            </button>

            <button
              onClick={() => updateCallStatus("declined")}
              className="w-full rounded-lg bg-red-600 py-3 text-white font-medium"
            >
              Decline
            </button>
          </div>
        ) : incomingCall.status === "answered" ? (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-lg font-semibold text-green-600">
              Call Answered
            </p>

            <button
              onClick={clearCall}
              className="w-full rounded-lg bg-gray-300 py-3 text-black font-medium"
            >
              End / Clear
            </button>
          </div>
        ) : incomingCall.status === "declined" ? (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-lg font-semibold text-red-600">Call Declined</p>

            <button
              onClick={clearCall}
              className="w-full rounded-lg bg-gray-300 py-3 text-black font-medium"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-lg font-semibold text-gray-700">
              Call Cancelled
            </p>

            <button
              onClick={clearCall}
              className="w-full rounded-lg bg-gray-300 py-3 text-black font-medium"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}