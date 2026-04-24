"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type CallStatus = "calling" | "answered" | "declined" | "cancelled";
type MediaMode = "video" | "audio_only";

type IceCandidateJSON = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

type CallRowUpdate = {
  status: CallStatus;
  answer?: RTCSessionDescriptionInit | null;
  resident_candidates?: IceCandidateJSON[] | null;
  expires_at?: string | null;
  media_mode?: MediaMode | null;
};

type CallRow = {
  id: string;
  status: CallStatus;
  answer?: RTCSessionDescriptionInit | null;
  resident_candidates?: IceCandidateJSON[] | null;
  site_id?: string | null;
  unit_id?: string | null;
  resident_id?: string | null;
  expires_at?: string | null;
  media_mode?: MediaMode | null;
};

type SetupMode = "video" | "audio_only";

export default function UnitCallPage({
  params,
}: {
  params: Promise<{ siteSlug: string; unitSlug: string; name: string }>;
}) {
  const { siteSlug, unitSlug, name } = use(params);
  const searchParams = useSearchParams();
  const callId = searchParams.get("callId");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const answerAppliedRef = useRef(false);
  const addedResidentCandidatesRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fallbackDisplayName = name.charAt(0).toUpperCase() + name.slice(1);
  const fallbackBackHref = `/${siteSlug}/u/${unitSlug}`;

  const [status, setStatus] = useState<CallStatus>("calling");
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState(fallbackDisplayName);
  const [backHref, setBackHref] = useState(fallbackBackHref);
  const [mediaMode, setMediaMode] = useState<MediaMode>("video");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);

  function clearCallTimeout() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  async function forceCancelCallingCall() {
    if (!callId) return;

    await supabase
      .from("calls")
      .update({ status: "cancelled" })
      .eq("id", callId)
      .eq("status", "calling");
  }

  function stopEverything() {
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    answerAppliedRef.current = false;
    addedResidentCandidatesRef.current = new Set();
    clearCallTimeout();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.muted = true;
    }
  }

  async function addResidentCandidates(
    candidates: IceCandidateJSON[] | null | undefined
  ) {
    if (!peerRef.current || !candidates?.length) return;

    for (const candidate of candidates) {
      const key = JSON.stringify(candidate);

      if (addedResidentCandidatesRef.current.has(key)) continue;

      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        addedResidentCandidatesRef.current.add(key);
      } catch (err) {
        console.log("Visitor failed to add resident ICE candidate:", err);
      }
    }
  }

  async function hydrateCallDetails(callRow: {
    site_id?: string | null;
    unit_id?: string | null;
    resident_id?: string | null;
  }) {
    try {
      if (callRow.resident_id) {
        const { data: residentData, error: residentError } = await supabase
          .from("residents")
          .select("full_name, display_name")
          .eq("id", callRow.resident_id)
          .maybeSingle();

        if (!residentError && residentData) {
  setDisplayName(residentData.display_name || residentData.full_name);
}
      }

      let resolvedSiteSlug: string | null = null;
      let resolvedUnitSlug: string | null = null;

      if (callRow.site_id) {
        const { data: siteData, error: siteError } = await supabase
          .from("sites")
          .select("slug")
          .eq("id", callRow.site_id)
          .maybeSingle();

        if (!siteError && siteData?.slug) {
          resolvedSiteSlug = siteData.slug;
        }
      }

      if (callRow.unit_id) {
        const { data: unitData, error: unitError } = await supabase
          .from("units")
          .select("slug")
          .eq("id", callRow.unit_id)
          .maybeSingle();

        if (!unitError && unitData?.slug) {
          resolvedUnitSlug = unitData.slug;
        }
      }

      if (resolvedSiteSlug && resolvedUnitSlug) {
        setBackHref(`/${resolvedSiteSlug}/u/${resolvedUnitSlug}`);
      }
    } catch (err) {
      console.log("Failed to hydrate call details:", err);
    }
  }

  async function startCallSetup(mode: SetupMode) {
    if (!callId || isSettingUp) return;

    stopEverything();
    setError("");
    setShowPermissionHelp(false);
    setIsSettingUp(true);
    setMediaMode(mode);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mode === "video"
          ? {
              video: { facingMode: "user" },
              audio: true,
            }
          : {
              video: false,
              audio: true,
            }
      );

      streamRef.current = stream;

      if (videoRef.current) {
        const hasVideo = stream.getVideoTracks().length > 0;
        videoRef.current.srcObject = hasVideo ? stream : null;
      }

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peerRef.current = peer;

      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
      });

      peer.ontrack = async (event) => {
        const [remoteStream] = event.streams;

        if (!remoteStream) {
          console.log("Visitor ontrack fired, but no stream found");
          return;
        }

        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.muted = status !== "answered";

          try {
            await remoteAudioRef.current.play();
            console.log("Visitor audio playback started");
          } catch (err) {
            console.log("Visitor audio play failed:", err);
          }
        }
      };

      peer.onicecandidate = async (event) => {
        if (!event.candidate || !callId) return;

        const candidateData: IceCandidateJSON = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        };

        const { data, error } = await supabase
          .from("calls")
          .select("visitor_candidates")
          .eq("id", callId)
          .maybeSingle();

        if (error) {
          console.log("Failed to load visitor candidates:", error);
          return;
        }

        const existing =
          (data?.visitor_candidates as IceCandidateJSON[] | null) || [];
        const alreadyExists = existing.some(
          (item) => JSON.stringify(item) === JSON.stringify(candidateData)
        );

        if (alreadyExists) return;

        const { error: updateError } = await supabase
          .from("calls")
          .update({
            visitor_candidates: [...existing, candidateData],
          })
          .eq("id", callId);

        if (updateError) {
          console.log("Failed to save visitor ICE candidate:", updateError);
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const timeoutAt = new Date(Date.now() + 45_000).toISOString();

      const { error: callUpdateError } = await supabase
        .from("calls")
        .update({
          offer,
          media_mode: mode,
          expires_at: timeoutAt,
          status: "calling",
        })
        .eq("id", callId);

      if (callUpdateError) {
        console.log("Failed to save call setup:", callUpdateError);
        setError("Could not start the call.");
        setShowPermissionHelp(true);
        setIsSettingUp(false);
        return;
      }

      setExpiresAt(timeoutAt);

      clearCallTimeout();
      timeoutRef.current = setTimeout(() => {
        forceCancelCallingCall();
      }, 45_000);
    } catch (err: any) {
      console.log(err);
      stopEverything();
      setShowPermissionHelp(true);

      if (mode === "video") {
        if (err?.name === "NotAllowedError") {
          setError(
            "Camera and microphone were blocked or not fully available. Allow access in your browser settings, then try again."
          );
        } else if (err?.name === "NotFoundError") {
          setError(
            "Camera or microphone was not found. You can continue with a voice-only call if your microphone works."
          );
        } else {
          setError(
            "Could not start the video call. You can retry or continue with voice only."
          );
        }
      } else {
        if (err?.name === "NotAllowedError") {
          setError(
            "Microphone permission is needed for a voice-only call. Allow microphone access in your browser settings, then try again."
          );
        } else if (err?.name === "NotFoundError") {
          setError("No microphone was found on this device.");
        } else {
          setError("Could not start the voice-only call.");
        }
      }
    } finally {
      setIsSettingUp(false);
    }
  }

  useEffect(() => {
    if (!callId) return;
    startCallSetup("video");

    return () => {
      stopEverything();
    };
  }, [callId]);

  useEffect(() => {
    if (!callId) return;

    let active = true;

    async function loadCallOnce() {
      const { data, error } = await supabase
        .from("calls")
        .select(
          "id, status, answer, resident_candidates, site_id, unit_id, resident_id, expires_at, media_mode"
        )
        .eq("id", callId)
        .maybeSingle();

      if (error) {
        console.log(error);
        return;
      }

      if (!active || !data) return;

      const callRow = data as CallRow;

      await hydrateCallDetails(callRow);

      setStatus(callRow.status);
      setExpiresAt(callRow.expires_at || null);
      setMediaMode((callRow.media_mode as MediaMode) || "video");

      if (callRow.status === "declined" || callRow.status === "cancelled") {
        stopEverything();
      }

      if (
        callRow.answer &&
        peerRef.current &&
        !answerAppliedRef.current &&
        !peerRef.current.currentRemoteDescription
      ) {
        try {
          await peerRef.current.setRemoteDescription(
            new RTCSessionDescription(callRow.answer)
          );
          answerAppliedRef.current = true;
        } catch (err) {
          console.log("Failed to apply initial answer:", err);
        }
      }

      await addResidentCandidates(callRow.resident_candidates || []);
    }

    loadCallOnce();

    const channel = supabase
      .channel(`call-${callId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
          filter: `id=eq.${callId}`,
        },
        async (payload) => {
          const updated = payload.new as CallRowUpdate;

          setStatus(updated.status);
          setExpiresAt(updated.expires_at || null);
          setMediaMode((updated.media_mode as MediaMode) || "video");

          if (updated.status === "declined" || updated.status === "cancelled") {
            stopEverything();
            return;
          }

          if (
            updated.answer &&
            peerRef.current &&
            !answerAppliedRef.current &&
            !peerRef.current.currentRemoteDescription
          ) {
            try {
              await peerRef.current.setRemoteDescription(
                new RTCSessionDescription(updated.answer)
              );
              answerAppliedRef.current = true;
            } catch (err) {
              console.log("Failed to apply realtime answer:", err);
            }
          }

          await addResidentCandidates(updated.resident_candidates || []);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "calls",
          filter: `id=eq.${callId}`,
        },
        () => {
          setStatus("cancelled");
          stopEverything();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [callId]);

  useEffect(() => {
    if (!expiresAt || !callId) return;
    if (status !== "calling") return;

    const msRemaining = new Date(expiresAt).getTime() - Date.now();

    if (msRemaining <= 0) {
      forceCancelCallingCall();
      return;
    }

    clearCallTimeout();
    timeoutRef.current = setTimeout(() => {
      forceCancelCallingCall();
    }, msRemaining);

    return () => clearCallTimeout();
  }, [expiresAt, callId, status]);

  useEffect(() => {
    async function syncRemoteAudio() {
      if (!remoteAudioRef.current) return;

      if (status === "answered") {
        remoteAudioRef.current.muted = false;

        try {
          await remoteAudioRef.current.play();
          console.log("Visitor audio unmuted after answer");
        } catch (err) {
          console.log("Visitor audio playback after answer failed:", err);
        }
      } else {
        remoteAudioRef.current.muted = true;
      }
    }

    syncRemoteAudio();
  }, [status]);

  async function cancelCall() {
    if (!callId) return;

    await supabase
      .from("calls")
      .update({ status: "cancelled" })
      .eq("id", callId);

    stopEverything();
  }

  const isVoiceOnly = mediaMode === "audio_only";
  const showFallbackOptions =
    status === "calling" && (!!error || showPermissionHelp) && !isSettingUp;

  if (status === "declined") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg text-center">
          <h1 className="text-2xl font-bold">Call Declined</h1>
          <p className="mt-3 text-gray-500">{displayName} declined the call.</p>

          <Link
            href={backHref}
            className="mt-6 block w-full rounded-xl bg-black py-4 text-white font-semibold"
          >
            Back to Residents
          </Link>
        </div>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg text-center">
          <h1 className="text-2xl font-bold">Call Cancelled</h1>
          <p className="mt-3 text-gray-500">The call was cancelled.</p>

          <Link
            href={backHref}
            className="mt-6 block w-full rounded-xl bg-black py-4 text-white font-semibold"
          >
            Back to Residents
          </Link>
        </div>
      </div>
    );
  }

  return (
  <div className="relative min-h-screen bg-[#0B1F3A] text-white overflow-hidden">
    {/* MAIN MEDIA AREA */}
    {isVoiceOnly ? (
      <div className="flex h-screen w-screen items-center justify-center px-6 text-center">
        <div>
          <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-4xl">
            🎙️
          </div>
          <h1 className="text-3xl font-bold">Voice Call</h1>
          <p className="mt-3 text-white/75">
            Waiting for {displayName} to answer.
          </p>
        </div>
      </div>
    ) : (
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="h-screen w-screen object-cover opacity-0 transition-opacity duration-500"
        onLoadedData={(e) => {
          (e.target as HTMLVideoElement).style.opacity = "1";
        }}
      />
    )}

    <audio ref={remoteAudioRef} autoPlay playsInline />

    {/* DARK OVERLAY */}
    <div className="absolute inset-0 bg-black/35" />

    {/* TOP STATUS */}
    <div className="absolute top-0 left-0 right-0 p-6 text-center">
      <h1 className="text-2xl font-bold">
        {status === "answered"
          ? "Call in progress"
          : isVoiceOnly
          ? `Voice calling ${displayName}`
          : `Calling ${displayName}`}
      </h1>

      <p className="mt-2 text-sm text-white/80">
        {isSettingUp
          ? "Starting call..."
          : status === "answered"
          ? `You are connected to ${displayName}`
          : isVoiceOnly
          ? "Voice-only call active"
          : "Waiting for resident to answer"}
      </p>

      {error ? (
        <p className="mx-auto mt-4 max-w-sm rounded-xl bg-red-600/90 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
    </div>

    {/* FALLBACK PERMISSION CARD */}
    {showFallbackOptions ? (
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <div className="mx-auto max-w-sm rounded-3xl bg-white p-5 text-black shadow-2xl">
          <h2 className="text-center text-lg font-bold">
            Camera or mic access needed
          </h2>

          <p className="mt-2 text-center text-sm text-gray-600">
            If you denied access by mistake, allow camera and microphone in your
            browser settings, then try again.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => startCallSetup("video")}
              className="w-full rounded-full bg-[#0B1F3A] py-4 text-white font-semibold active:scale-95 transition"
            >
              I Allowed Permission — Try Video Again
            </button>

            <button
              type="button"
              onClick={() => startCallSetup("audio_only")}
              className="w-full rounded-full bg-[#F59E0B] py-4 text-white font-semibold active:scale-95 transition"
            >
              Continue with Voice Only
            </button>

            <button
              type="button"
              onClick={() => setShowPermissionHelp((value) => !value)}
              className="w-full rounded-full border border-gray-300 bg-white py-4 text-black font-semibold active:scale-95 transition"
            >
              {showPermissionHelp ? "Hide Help" : "How to Allow Camera/Mic"}
            </button>

            {showPermissionHelp ? (
              <div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">How to fix access</p>
                <p className="mt-2">
                  1. Tap the lock, info, or site settings icon near your browser
                  address bar.
                </p>
                <p>2. Allow camera and microphone for this site.</p>
                <p>3. Come back here and tap “Try Video Again”.</p>
                <p className="mt-2">
                  If video still fails, use “Continue with Voice Only”.
                </p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={cancelCall}
              className="w-full rounded-full bg-red-600 py-4 text-white font-semibold active:scale-95 transition"
            >
              Cancel Call
            </button>
          </div>
        </div>
      </div>
    ) : (
      /* CALL CONTROLS */
      <div className="absolute bottom-0 left-0 right-0 p-6">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-5">
          <div className="rounded-full bg-[#F59E0B] px-6 py-3 text-sm font-semibold shadow-lg">
            {isSettingUp
              ? "Starting..."
              : status === "answered"
              ? "In Call"
              : isVoiceOnly
              ? "Voice Calling..."
              : "Ringing..."}
          </div>

          <div className="flex gap-8">
  <button
    type="button"
    onClick={cancelCall}
    className="flex flex-col items-center"
  >
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-xl shadow-lg active:scale-95 transition">
      ✖
    </div>
    <span className="mt-2 text-xs">
      {status === "answered" ? "End Call" : "Cancel Call"}
    </span>
  </button>
</div>
        </div>
      </div>
    )}
  </div>
);
}