"use client";

import { use, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type IceCandidateJSON = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

type MediaMode = "video" | "audio_only";

type Resident = {
  id: string;
  slug: string;
  full_name: string;
  display_name: string | null;
  ringtone: string;
};

type Call = {
  id: string;
  status: "calling" | "answered" | "declined" | "cancelled";
  created_at: string;
  offer?: RTCSessionDescriptionInit | null;
  answer?: RTCSessionDescriptionInit | null;
  visitor_candidates?: IceCandidateJSON[] | null;
  resident_candidates?: IceCandidateJSON[] | null;
  resident_id?: string | null;
  site_id?: string | null;
  unit_id?: string | null;
  expires_at?: string | null;
  media_mode?: MediaMode | null;
};

export default function ResidentPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const residentSlug = name.toLowerCase();

  const [resident, setResident] = useState<Resident | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [siteName, setSiteName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [audioError, setAudioError] = useState("");

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const addedVisitorCandidatesRef = useRef<Set<string>>(new Set());
  const previewRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const displayName =
  resident?.display_name ||
  resident?.full_name ||
  name.charAt(0).toUpperCase() + name.slice(1);

  function stopPeer() {
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    localAudioTrackRef.current = null;
    audioSenderRef.current = null;
    addedVisitorCandidatesRef.current = new Set();

    if (previewRetryTimeoutRef.current) {
      clearTimeout(previewRetryTimeoutRef.current);
      previewRetryTimeoutRef.current = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.pause();
      remoteVideoRef.current.srcObject = null;
      remoteVideoRef.current.muted = true;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.muted = true;
    }
  }

  async function addVisitorCandidates(
    candidates: IceCandidateJSON[] | null | undefined
  ) {
    if (!peerRef.current || !candidates?.length) return;

    if (!peerRef.current.remoteDescription) {
      console.log("Skipping ICE - remote description not set yet");
      return;
    }

    for (const candidate of candidates) {
      const key = JSON.stringify(candidate);

      if (addedVisitorCandidatesRef.current.has(key)) continue;

      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        addedVisitorCandidatesRef.current.add(key);
        console.log("Resident added visitor ICE candidate:", candidate);
      } catch (err) {
        console.log("Resident failed to add visitor ICE candidate:", err);
      }
    }
  }

  async function hydrateLocation(call: {
    site_id?: string | null;
    unit_id?: string | null;
  }) {
    try {
      if (call.site_id) {
        const { data: siteData, error: siteError } = await supabase
          .from("sites")
          .select("name, display_name")
          .eq("id", call.site_id)
          .maybeSingle();

        if (!siteError && siteData?.name) {
          setSiteName(siteData.name);
        } else {
          setSiteName("");
        }
      } else {
        setSiteName("");
      }

      if (call.unit_id) {
        const { data: unitData, error: unitError } = await supabase
          .from("units")
          .select("name, display_name")
          .eq("id", call.unit_id)
          .maybeSingle();

        if (!unitError && unitData?.name) {
  setUnitName(unitData.display_name || unitData.name);
        } else {
          setUnitName("");
        }
      } else {
        setUnitName("");
      }
    } catch (err) {
      console.log("Failed to hydrate location:", err);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadResident() {
      const { data, error } = await supabase
        .from("residents")
        .select("id, slug, full_name, display_name, ringtone")
        .eq("slug", residentSlug)
        .maybeSingle();

      if (error) {
        console.log(error);
        return;
      }

      if (active) {
        setResident((data as Resident) || null);
      }
    }

    loadResident();

    return () => {
      active = false;
    };
  }, [residentSlug]);

  useEffect(() => {
    if (!resident?.id) return;

    const residentId = resident.id;
    let active = true;

    async function loadLatestCallOnce() {
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("resident_id", residentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.log(error);
        return;
      }

      if (active) {
        const call = (data as Call) || null;
        setIncomingCall(call);

        if (call) {
          await hydrateLocation(call);
        } else {
          setSiteName("");
          setUnitName("");
        }
      }
    }

    loadLatestCallOnce();

    const channel = supabase
      .channel(`resident-${residentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
          filter: `resident_id=eq.${residentId}`,
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            setIncomingCall(null);
            setSiteName("");
            setUnitName("");
            setAudioError("");
            stopPeer();
            return;
          }

          const row = payload.new as Call;
          setIncomingCall(row);
          await hydrateLocation(row);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
      stopPeer();
    };
  }, [resident?.id]);

  useEffect(() => {
    async function prepareIncomingVideo(isRetry = false) {
      if (!incomingCall?.offer) return;
      if (
        incomingCall.status === "declined" ||
        incomingCall.status === "cancelled"
      ) {
        return;
      }

      if (peerRef.current) {
        if (isRetry) {
          stopPeer();
        } else {
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      try {
        console.log("Resident preparing incoming video", { isRetry });

        const peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        peerRef.current = peer;

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        micStreamRef.current = micStream;

        const localAudioTrack = micStream.getAudioTracks()[0] || null;

        if (localAudioTrack) {
          localAudioTrack.enabled = false;
          localAudioTrackRef.current = localAudioTrack;
          audioSenderRef.current = peer.addTrack(localAudioTrack, micStream);
        } else {
          localAudioTrackRef.current = null;
          audioSenderRef.current = null;
        }

        peer.ontrack = async (event) => {
          console.log("Resident received ontrack event", event);

          const [remoteStream] = event.streams;

          if (!remoteStream) {
            console.log("Resident ontrack fired, but no stream found");
            return;
          }

          console.log("Resident attaching remote stream", remoteStream);

          if (remoteVideoRef.current) {
            const hasVideo = remoteStream.getVideoTracks().length > 0;
            remoteVideoRef.current.srcObject = hasVideo ? remoteStream : null;
            remoteVideoRef.current.muted = true;

            if (hasVideo) {
              try {
                await remoteVideoRef.current.play();
                console.log("Resident video playback started");
              } catch (playError) {
                console.log("Resident video play() failed:", playError);
              }
            }
          }

          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.muted = incomingCall.status !== "answered";

            try {
              await remoteAudioRef.current.play();
              console.log("Resident audio playback started");
            } catch (audioPlayError) {
              console.log("Resident audio play() failed:", audioPlayError);
            }
          }
        };

        peer.onicecandidate = async (event) => {
          if (!event.candidate || !incomingCall?.id) return;

          console.log("Resident ICE candidate:", event.candidate);

          const candidateData: IceCandidateJSON = {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          };

          const { data, error } = await supabase
            .from("calls")
            .select("resident_candidates")
            .eq("id", incomingCall.id)
            .maybeSingle();

          if (error) {
            console.log("Failed to load resident candidates:", error);
            return;
          }

          const existing =
            (data?.resident_candidates as IceCandidateJSON[] | null) || [];
          const alreadyExists = existing.some(
            (item) => JSON.stringify(item) === JSON.stringify(candidateData)
          );

          if (alreadyExists) return;

          const { error: updateError } = await supabase
            .from("calls")
            .update({
              resident_candidates: [...existing, candidateData],
            })
            .eq("id", incomingCall.id);

          if (updateError) {
            console.log("Failed to save resident ICE candidate:", updateError);
          }
        };

        peer.onconnectionstatechange = () => {
          console.log("Resident connection state:", peer.connectionState);
        };

        peer.oniceconnectionstatechange = () => {
          console.log("Resident ICE connection state:", peer.iceConnectionState);
        };

        await peer.setRemoteDescription(
          new RTCSessionDescription(incomingCall.offer)
        );

        console.log("Resident applied remote offer");

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        console.log("Resident created answer:", answer);

        const { error } = await supabase
          .from("calls")
          .update({
            answer,
          })
          .eq("id", incomingCall.id);

        if (error) {
          console.log("Failed to save answer:", error);
        } else {
          console.log("Resident saved answer successfully");
        }

        await addVisitorCandidates(incomingCall.visitor_candidates || []);

        if (
          incomingCall.status === "calling" &&
          incomingCall.media_mode !== "audio_only" &&
          previewRetryTimeoutRef.current === null
        ) {
          previewRetryTimeoutRef.current = setTimeout(() => {
            previewRetryTimeoutRef.current = null;

            const hasVideo =
              !!remoteVideoRef.current?.srcObject &&
              (remoteVideoRef.current.srcObject as MediaStream).getVideoTracks()
                .length > 0;

            if (!hasVideo) {
              console.log("Resident preview missing, retrying once");
              prepareIncomingVideo(true);
            }
          }, 1200);
        }
      } catch (err: any) {
        console.log("Failed to prepare resident peer:", err);

        if (err?.name === "NotAllowedError") {
          setAudioError(
            "Please allow microphone access on the resident device."
          );
        } else if (err?.name === "NotFoundError") {
          setAudioError("No microphone was found on the resident device.");
        }
      }
    }

    prepareIncomingVideo(false);

    return () => {
      if (previewRetryTimeoutRef.current) {
        clearTimeout(previewRetryTimeoutRef.current);
        previewRetryTimeoutRef.current = null;
      }
    };
  }, [incomingCall?.id, incomingCall?.offer, incomingCall?.status, incomingCall?.media_mode]);

  useEffect(() => {
    async function syncVisitorCandidates() {
      if (!incomingCall?.id || !peerRef.current) return;
      await addVisitorCandidates(incomingCall.visitor_candidates || []);
    }

    syncVisitorCandidates();
  }, [incomingCall?.visitor_candidates, incomingCall?.id]);

  useEffect(() => {
    async function syncAnsweredAudio() {
      if (!remoteAudioRef.current) return;

      if (incomingCall?.status === "answered") {
        remoteAudioRef.current.muted = false;

        try {
          await remoteAudioRef.current.play();
          console.log("Resident audio unmuted after answer");
        } catch (err) {
          console.log("Resident audio playback after answer failed:", err);
        }
      } else {
        remoteAudioRef.current.muted = true;
      }
    }

    syncAnsweredAudio();
  }, [incomingCall?.status]);

  useEffect(() => {
    if (!incomingCall?.expires_at || !incomingCall?.id) return;
    if (incomingCall.status !== "calling") return;

    const msRemaining =
      new Date(incomingCall.expires_at).getTime() - Date.now();

    if (msRemaining <= 0) {
      supabase
        .from("calls")
        .update({ status: "cancelled" })
        .eq("id", incomingCall.id)
        .eq("status", "calling");
      return;
    }

    const timer = setTimeout(() => {
      supabase
        .from("calls")
        .update({ status: "cancelled" })
        .eq("id", incomingCall.id)
        .eq("status", "calling");
    }, msRemaining);

    return () => clearTimeout(timer);
  }, [incomingCall?.id, incomingCall?.expires_at, incomingCall?.status]);

useEffect(() => {
  async function handleRingtone() {
    if (!ringtoneRef.current) return;

    if (incomingCall?.status === "calling") {
      ringtoneRef.current.currentTime = 0;

      try {
        await ringtoneRef.current.play();
        console.log("Ringtone started");
      } catch (err) {
        console.log("Ringtone play blocked by browser:", err);
      }
    } else {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }

  handleRingtone();
}, [incomingCall?.status]);

  async function answerCall() {
    if (!incomingCall) return;

    setAudioError("");

    try {
      if (!localAudioTrackRef.current) {
        setAudioError("Microphone is not ready on this device.");
        return;
      }

      localAudioTrackRef.current.enabled = true;

      const { error } = await supabase
        .from("calls")
        .update({ status: "answered" })
        .eq("id", incomingCall.id);

      if (error) {
        console.log(error);
        setAudioError("Could not answer the call.");
        return;
      }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = false;

        try {
          await remoteAudioRef.current.play();
          console.log("Resident audio started after answer");
        } catch (err) {
          console.log("Resident audio start failed:", err);
        }
      }
    } catch (err: any) {
      console.log(err);

      if (err?.name === "NotAllowedError") {
        setAudioError("Please allow microphone access to answer the call.");
      } else if (err?.name === "NotFoundError") {
        setAudioError("No microphone was found on this device.");
      } else {
        setAudioError("Could not start the microphone.");
      }
    }
  }

  async function declineCall() {
    if (!incomingCall) return;

    const { error } = await supabase
      .from("calls")
      .update({ status: "declined" })
      .eq("id", incomingCall.id);

    if (error) console.log(error);
  }

  async function endCall() {
    if (!incomingCall) return;

    const { error } = await supabase
      .from("calls")
      .update({ status: "cancelled" })
      .eq("id", incomingCall.id);

    if (error) {
      console.log(error);
      return;
    }

    stopPeer();
    setIncomingCall({
      ...incomingCall,
      status: "cancelled",
    });
  }

  async function clearCall() {
    if (!incomingCall) return;

    const { error } = await supabase
      .from("calls")
      .delete()
      .eq("id", incomingCall.id);

    if (error) {
      console.log(error);
      return;
    }

    stopPeer();
    setIncomingCall(null);
    setSiteName("");
    setUnitName("");
    setAudioError("");
  }

  const locationLine =
    unitName && siteName
      ? `${unitName} • ${siteName}`
      : unitName || siteName || "Visitor call";

  const isVoiceOnly = incomingCall?.media_mode === "audio_only";

  return (
  <div className="min-h-screen bg-[#0B1F3A] text-white flex flex-col">

    {/* HEADER */}
    <div className="pt-6 pb-2 text-center">
      <h1 className="text-xl font-semibold">{displayName}</h1>

      <p className="text-sm text-white/70 mt-1">
        {!incomingCall
          ? "Waiting for calls"
          : incomingCall.status === "calling"
          ? "Incoming call..."
          : incomingCall.status === "answered"
          ? "Call in progress"
          : "Call ended"}
      </p>
    </div>

    {/* VIDEO AREA */}
    <div className="flex-1 relative flex items-center justify-center px-4">

      {/* VIDEO */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full max-w-md rounded-2xl object-cover opacity-0 transition-opacity duration-500"
        onLoadedData={(e) => {
          (e.target as HTMLVideoElement).style.opacity = "1";
        }}
      />

      {/* AUDIO */}
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <audio
  ref={ringtoneRef}
  src={`/ringtones/${resident?.ringtone || "classic"}.mp3`}
  loop
/>

      {/* CONNECTING OVERLAY */}
      {incomingCall?.status === "calling" &&
        !remoteVideoRef.current?.srcObject && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/50 px-5 py-3 rounded-xl text-sm">
              Connecting to visitor...
            </div>
          </div>
        )}
    </div>

    {/* CONTROLS */}
    <div className="pb-8 pt-4 flex flex-col items-center gap-4">

      {!incomingCall && (
        <div className="text-white/50 text-sm">No incoming calls</div>
      )}

      {incomingCall?.status === "calling" && (
        <div className="flex gap-6">

          {/* ANSWER */}
          <button
            onClick={answerCall}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center text-xl shadow-lg active:scale-95 transition">
              📞
            </div>
            <span className="text-xs mt-2">Answer</span>
          </button>

          {/* DECLINE */}
          <button
            onClick={declineCall}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center text-xl shadow-lg active:scale-95 transition">
              ✖
            </div>
            <span className="text-xs mt-2">Decline</span>
          </button>
        </div>
      )}

      {incomingCall?.status === "answered" && (
        <button
          onClick={endCall}
          className="flex flex-col items-center"
        >
          <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center text-xl shadow-lg active:scale-95 transition">
            🔴
          </div>
          <span className="text-xs mt-2">End Call</span>
        </button>
      )}

      {(incomingCall?.status === "declined" ||
        incomingCall?.status === "cancelled") && (
        <button
          onClick={clearCall}
          className="bg-white text-black px-6 py-3 rounded-full text-sm font-semibold"
        >
          Clear
        </button>
      )}

      {/* ERROR */}
      {audioError && (
        <p className="text-red-400 text-sm text-center px-6">
          {audioError}
        </p>
      )}
    </div>
  </div>
);
}