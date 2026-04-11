"use client";

import { use, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type IceCandidateJSON = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

type Resident = {
  id: string;
  slug: string;
  full_name: string;
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
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const addedVisitorCandidatesRef = useRef<Set<string>>(new Set());

  const displayName =
    resident?.full_name || name.charAt(0).toUpperCase() + name.slice(1);

  function stopPeer() {
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    audioSenderRef.current = null;
    addedVisitorCandidatesRef.current = new Set();

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
          .select("name")
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
          .select("name")
          .eq("id", call.unit_id)
          .maybeSingle();

        if (!unitError && unitData?.name) {
          setUnitName(unitData.name);
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

  async function fetchFullCall(callId: string) {
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .maybeSingle();

  if (error) {
    console.log("Failed to fetch full call:", error);
    return null;
  }

  return (data as Call) || null;
}

  useEffect(() => {
    let active = true;

    async function loadResident() {
      const { data, error } = await supabase
        .from("residents")
        .select("id, slug, full_name")
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
        const fullCall = call?.id ? await fetchFullCall(call.id) : call;

        setIncomingCall(fullCall);

        if (fullCall) {
  await hydrateLocation(fullCall);
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

const fullCall = row.id ? await fetchFullCall(row.id) : row;

setIncomingCall(fullCall);

if (fullCall) {
  await hydrateLocation(fullCall);
}
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
    async function prepareIncomingVideo() {
  if (!incomingCall?.offer) return;

  if (peerRef.current) {
    console.log("Resetting peer for new offer");
    stopPeer();
  }

  await new Promise((resolve) =>setTimeout(resolve, 200));

      try {
        console.log("Resident preparing incoming video");

        const peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        peerRef.current = peer;

        audioSenderRef.current = peer
          .addTransceiver("audio", { direction: "sendrecv" })
          .sender;

        peer.ontrack = async (event) => {
          console.log("Resident received ontrack event", event);

          const [remoteStream] = event.streams;

          if (!remoteStream) {
            console.log("Resident ontrack fired, but no stream found");
            return;
          }

          console.log("Resident attaching remote stream", remoteStream);

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.muted = true;

            try {
              await remoteVideoRef.current.play();
              console.log("Resident video playback started");
            } catch (playError) {
              console.log("Resident video play() failed:", playError);
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

        if (!peerRef.current) return;
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
      } catch (err) {
        console.log("Failed to prepare resident peer:", err);
      }
    }

    prepareIncomingVideo();
  }, [incomingCall?.offer]);

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

  async function answerCall() {
    if (!incomingCall || !audioSenderRef.current) return;

    setAudioError("");

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      micStreamRef.current = micStream;

      const audioTrack = micStream.getAudioTracks()[0] || null;

      if (!audioTrack) {
        setAudioError("No microphone was found on this device.");
        return;
      }

      await audioSenderRef.current.replaceTrack(audioTrack);

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

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <h1 className="mb-4 text-center text-2xl font-bold capitalize">
          {displayName}&apos;s Phone
        </h1>

        <div className="overflow-hidden rounded-2xl bg-black shadow-lg">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-[420px] w-full object-cover"
          />
          <audio ref={remoteAudioRef} autoPlay playsInline />
        </div>

        {!incomingCall ? (
          <div className="mt-4 rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-gray-500">No incoming calls</p>
          </div>
        ) : incomingCall.status === "calling" ? (
          <div className="mt-4 rounded-2xl bg-white p-6 shadow">
            <p className="text-center text-lg font-semibold">Incoming Call</p>
            <p className="mt-2 text-center text-gray-500">
              Visitor is waiting at {locationLine}
            </p>

            {audioError ? (
              <p className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-center text-sm text-red-700">
                {audioError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-3">
              <div className="w-full rounded-xl bg-yellow-500 py-4 text-center text-white font-semibold">
                Ringing...
              </div>

              <button
                onClick={answerCall}
                className="w-full rounded-xl bg-green-600 py-4 text-white font-semibold"
              >
                Answer Call
              </button>

              <button
                onClick={declineCall}
                className="w-full rounded-xl bg-red-600 py-4 text-white font-semibold"
              >
                Decline Call
              </button>
            </div>
          </div>
        ) : incomingCall.status === "answered" ? (
          <div className="mt-4 rounded-2xl bg-white p-6 shadow">
            <p className="text-center text-lg font-semibold text-green-600">
              Call in progress
            </p>
            <p className="mt-2 text-center text-gray-500">
              You are connected to the visitor at {locationLine}
            </p>

            {audioError ? (
              <p className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-center text-sm text-red-700">
                {audioError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-3">
              <div className="w-full rounded-xl bg-green-600 py-4 text-center text-white font-semibold">
                In Call
              </div>

              <button
                onClick={endCall}
                className="w-full rounded-xl bg-red-600 py-4 text-white font-semibold"
              >
                End Call
              </button>
            </div>
          </div>
        ) : incomingCall.status === "declined" ? (
          <div className="mt-4 rounded-2xl bg-white p-6 shadow">
            <p className="text-center text-lg font-semibold text-red-600">
              Call Declined
            </p>
            <p className="mt-2 text-center text-gray-500">
              You declined the incoming call.
            </p>

            <div className="mt-6">
              <button
                onClick={clearCall}
                className="w-full rounded-xl bg-gray-300 py-4 text-black font-semibold"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-white p-6 shadow">
            <p className="text-center text-lg font-semibold text-gray-700">
              Call Ended
            </p>
            <p className="mt-2 text-center text-gray-500">
              The call has been cancelled or ended.
            </p>

            <div className="mt-6">
              <button
                onClick={clearCall}
                className="w-full rounded-xl bg-gray-300 py-4 text-black font-semibold"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}