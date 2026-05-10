"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { StreamVideoClient, Call, StreamCall, StreamVideo, CallingState, useCallStateHooks } from "@stream-io/video-react-sdk";

type CallStatus = "calling" | "answered" | "declined" | "cancelled";

export default function UnitCallPage({
  params,
}: {
  params: Promise<{ siteSlug: string; unitSlug: string; name: string }>;
}) {
  const { siteSlug, unitSlug, name } = use(params);
  const searchParams = useSearchParams();
  const callId = searchParams.get("callId");

  const fallbackDisplayName = name.charAt(0).toUpperCase() + name.slice(1);
  const fallbackBackHref = `/${siteSlug}/u/${unitSlug}`;

  const [status, setStatus] = useState<CallStatus>("calling");
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState(fallbackDisplayName);
  const [residentAvatarUrl, setResidentAvatarUrl] = useState<string | null>(null);
  const [backHref, setBackHref] = useState(fallbackBackHref);
  const [isSettingUp, setIsSettingUp] = useState(true);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);

  const streamClientRef = useRef<StreamVideoClient | null>(null);
  const streamCallRef = useRef<Call | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<CallStatus>("calling");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  async function hydrateCallDetails(residentId: string, siteId: string | null, unitId: string | null) {
    try {
      if (residentId) {
        const { data } = await supabase
          .from("residents")
          .select("full_name, display_name, avatar_url")
          .eq("id", residentId)
          .maybeSingle();
        if (data) {
          setDisplayName(data.display_name || data.full_name);
          setResidentAvatarUrl(data.avatar_url || null);
        }
      }

      let resolvedSiteSlug: string | null = null;
      let resolvedUnitSlug: string | null = null;

      if (siteId) {
        const { data } = await supabase.from("sites").select("slug").eq("id", siteId).maybeSingle();
        if (data?.slug) resolvedSiteSlug = data.slug;
      }

      if (unitId) {
        const { data } = await supabase.from("units").select("slug").eq("id", unitId).maybeSingle();
        if (data?.slug) resolvedUnitSlug = data.slug;
      }

      if (resolvedSiteSlug && resolvedUnitSlug) {
        setBackHref(`/${resolvedSiteSlug}/u/${resolvedUnitSlug}`);
      }
    } catch (err) {
      console.log("Failed to hydrate call details:", err);
    }
  }

  async function stopEverything() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (streamCallRef.current) {
      await streamCallRef.current.leave();
      streamCallRef.current = null;
    }
    if (streamClientRef.current) {
      await streamClientRef.current.disconnectUser();
      streamClientRef.current = null;
    }
  }

  async function startCall() {
    if (!callId) return;
    setIsSettingUp(true);
    setError("");

    try {
      // Get call details from Supabase
      const { data: callRow } = await supabase
        .from("calls")
        .select("resident_id, site_id, unit_id")
        .eq("id", callId)
        .maybeSingle();

      if (!callRow?.resident_id) {
        setError("Could not find call details.");
        return;
      }

      await hydrateCallDetails(callRow.resident_id, callRow.site_id, callRow.unit_id);

      // Get visitor's camera/mic
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(() => {});
      }

      // Get Stream token for visitor (visitor uses callId as their user ID)
      const tokenRes = await fetch("/api/stream-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: `visitor_${callId}` }),
      });
      const { token } = await tokenRes.json();

      // Create Stream client for visitor
      const client = new StreamVideoClient({
        apiKey: process.env.NEXT_PUBLIC_STREAM_API_KEY!,
        user: { id: `visitor_${callId}`, name: "Visitor" },
        token,
      });

      streamClientRef.current = client;

      // Create or join the Stream call
      const call = client.call("default", callId);
      streamCallRef.current = call;

      await call.join({ create: true });

      // Visitor sends video + audio, but mutes their own speaker (they don't need to hear themselves)
      await call.camera.enable();
      await call.microphone.enable();

      // Update Supabase call row to mark as calling
      const timeoutAt = new Date(Date.now() + 45_000).toISOString();
      await supabase
        .from("calls")
        .update({
          status: "calling",
          visitor_ready: true,
          expires_at: timeoutAt,
          media_mode: "video",
        })
        .eq("id", callId);

      // Send push notification to resident via our edge function
      let siteNameStr = "";
      let unitNameStr = "";

      if (callRow.site_id) {
        const { data } = await supabase.from("sites").select("name").eq("id", callRow.site_id).maybeSingle();
        siteNameStr = data?.name || "";
      }
      if (callRow.unit_id) {
        const { data } = await supabase.from("units").select("name, display_name").eq("id", callRow.unit_id).maybeSingle();
        unitNameStr = data?.display_name || data?.name || "";
      }

      await fetch("https://xrxhqfsscqokkavleemy.supabase.co/functions/v1/notify-resident", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhyeGhxZnNzY3Fva2thdmxlZW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTkwMDgsImV4cCI6MjA5MTA3NTAwOH0.D-xtY_rf53dsdiBEvib6-Q5lU5o6PNyPGBtnvfdvaUg`,
        },
        body: JSON.stringify({
          call_id: callId,
          resident_id: callRow.resident_id,
          site_name: siteNameStr,
          unit_name: unitNameStr,
          stream_call_id: callId,
        }),
      });

      // Set up 45 second timeout
      setTimeout(() => {
        if (statusRef.current === "calling") {
          supabase.from("calls").update({ status: "cancelled" }).eq("id", callId).eq("status", "calling");
          stopEverything();
          setStatus("cancelled");
        }
      }, 45_000);

      setIsSettingUp(false);

      // Listen for call state changes on Stream side
      call.on("call.ended", async () => {
        setStatus("cancelled");
        await stopEverything();
      });

    } catch (err: any) {
      console.log("Call setup error:", err);
      stopEverything();
      setIsSettingUp(false);
      setShowPermissionHelp(true);

      if (err?.name === "NotAllowedError") {
        setError("Camera and microphone were blocked. Allow access in your browser settings, then try again.");
      } else if (err?.name === "NotFoundError") {
        setError("Camera or microphone was not found.");
      } else {
        setError("Could not start the video call.");
      }
    }
  }

  async function startAudioOnlyCall() {
    if (!callId) return;
    setIsSettingUp(true);
    setError("");
    setShowPermissionHelp(false);

    try {
      const { data: callRow } = await supabase
        .from("calls")
        .select("resident_id, site_id, unit_id")
        .eq("id", callId)
        .maybeSingle();

      if (!callRow?.resident_id) {
        setError("Could not find call details.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      localStreamRef.current = stream;

      const tokenRes = await fetch("/api/stream-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: `visitor_${callId}` }),
      });
      const { token } = await tokenRes.json();

      const client = new StreamVideoClient({
        apiKey: process.env.NEXT_PUBLIC_STREAM_API_KEY!,
        user: { id: `visitor_${callId}`, name: "Visitor" },
        token,
      });

      streamClientRef.current = client;

      const call = client.call("default", callId);
      streamCallRef.current = call;

      await call.join({ create: true });
      await call.microphone.enable();
      await call.camera.disable();

      await supabase
        .from("calls")
        .update({ status: "calling", visitor_ready: true, expires_at: new Date(Date.now() + 45_000).toISOString(), media_mode: "audio_only" })
        .eq("id", callId);

      setIsSettingUp(false);
    } catch (err: any) {
      setIsSettingUp(false);
      setError("Could not start voice call.");
    }
  }

  async function cancelCall() {
    if (!callId) return;
    await supabase.from("calls").update({ status: "cancelled", visitor_ready: false }).eq("id", callId);
    await stopEverything();
    setStatus("cancelled");
  }

  useEffect(() => {
    if (!callId) return;
    startCall();
    return () => { stopEverything(); };
  }, [callId]);

  // Listen to Supabase for status changes
  useEffect(() => {
    if (!callId) return;

    const channel = supabase
      .channel(`call-visitor-${callId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `id=eq.${callId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setStatus(updated.status);

        if (updated.status === "answered") {
          // Resident answered — unmute their audio on our side
          if (streamCallRef.current) {
            streamCallRef.current.speaker.setVolume(1.0);
          }
        }

        if (updated.status === "declined" || updated.status === "cancelled") {
          stopEverything();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [callId]);

  if (status === "declined") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
          <h1 className="text-2xl font-bold">Call Declined</h1>
          <p className="mt-3 text-gray-500">{displayName} declined the call.</p>
          <Link href={backHref} className="mt-6 block w-full rounded-xl bg-black py-4 font-semibold text-white">
            Back to Residents
          </Link>
        </div>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
          <h1 className="text-2xl font-bold">Call Cancelled</h1>
          <p className="mt-3 text-gray-500">The call was cancelled.</p>
          <Link href={backHref} className="mt-6 block w-full rounded-xl bg-black py-4 font-semibold text-white">
            Back to Residents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0B1F3A] text-white">
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        className="h-screen w-screen object-cover opacity-0 transition-opacity duration-500"
        onLoadedData={(e) => { (e.target as HTMLVideoElement).style.opacity = "1"; }}
      />

      <div className="absolute inset-0 bg-black/35" />

      <div className="absolute left-0 right-0 top-0 p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white/15 text-2xl">
          {residentAvatarUrl ? (
            <img src={residentAvatarUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : "👤"}
        </div>

        <h1 className="text-2xl font-bold">
          {status === "answered" ? "Call in progress" : `Calling ${displayName}`}
        </h1>

        <p className="mt-2 text-sm text-white/80">
          {isSettingUp ? "Preparing your camera and microphone..."
            : status === "answered" ? `You are connected to ${displayName}`
            : "Waiting for resident to answer"}
        </p>

        {error ? (
          <p className="mx-auto mt-4 max-w-sm rounded-xl bg-red-600/90 px-4 py-3 text-sm">{error}</p>
        ) : null}
      </div>

      {showPermissionHelp ? (
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="mx-auto max-w-sm rounded-3xl bg-white p-5 text-black shadow-2xl">
            <h2 className="text-center text-lg font-bold">Camera or mic access needed</h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Allow camera and microphone in your browser settings, then try again.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button type="button" onClick={startCall}
                className="w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white active:scale-95 transition">
                Try Video Again
              </button>
              <button type="button" onClick={startAudioOnlyCall}
                className="w-full rounded-full bg-[#F59E0B] py-4 font-semibold text-white active:scale-95 transition">
                Continue with Voice Only
              </button>
              <button type="button" onClick={() => setShowPermissionHelp(false)}
                className="w-full rounded-full border border-gray-300 bg-white py-4 font-semibold text-black active:scale-95 transition">
                Hide Help
              </button>
              <button type="button" onClick={cancelCall}
                className="w-full rounded-full bg-red-600 py-4 font-semibold text-white active:scale-95 transition">
                Cancel Call
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-5">
            <div className="rounded-full bg-[#F59E0B] px-6 py-3 text-sm font-semibold shadow-lg">
              {isSettingUp ? "Starting..." : status === "answered" ? "In Call" : "Ringing..."}
            </div>
            <button type="button" onClick={cancelCall} className="flex flex-col items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-xl shadow-lg active:scale-95 transition">✖</div>
              <span className="mt-2 text-xs">{status === "answered" ? "End Call" : "Cancel Call"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}