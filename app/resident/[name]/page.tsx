"use client";

import { use, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type IceCandidateJSON = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

type Call = {
  id: string;
  house_slug: string;
  resident_slug: string;
  status: "calling" | "answered" | "declined" | "cancelled";
  created_at: string;
  offer?: RTCSessionDescriptionInit | null;
  answer?: RTCSessionDescriptionInit | null;
  visitor_candidates?: IceCandidateJSON[] | null;
  resident_candidates?: IceCandidateJSON[] | null;
};

export default function ResidentPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const residentSlug = name.toLowerCase();
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const addedVisitorCandidatesRef = useRef<Set<string>>(new Set());

  function stopPeer() {
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }

  async function addVisitorCandidates(
    candidates: IceCandidateJSON[] | null | undefined
  ) {
    if (!peerRef.current || !candidates?.length) return;

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
            stopPeer();
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
      stopPeer();
    };
  }, [residentSlug]);

  useEffect(() => {
    async function prepareIncomingVideo() {
      if (!incomingCall?.offer) return;
      if (peerRef.current) return;

      try {
        console.log("Resident preparing incoming video");

        const peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        peerRef.current = peer;

        peer.ontrack = async (event) => {
          console.log("Resident received ontrack event", event);

          const [remoteStream] = event.streams;

          if (remoteVideoRef.current && remoteStream) {
            console.log("Resident attaching remote stream", remoteStream);

            remoteVideoRef.current.srcObject = remoteStream;

            try {
              await remoteVideoRef.current.play();
              console.log("Resident video playback started");
            } catch (playError) {
              console.log("Resident video play() failed:", playError);
            }
          } else {
            console.log("Resident ontrack fired, but no stream found");
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
            answer: answer,
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
  }, [incomingCall]);

  useEffect(() => {
    async function syncVisitorCandidates() {
      if (!incomingCall?.id || !peerRef.current) return;

      await addVisitorCandidates(incomingCall.visitor_candidates || []);
    }

    syncVisitorCandidates();
  }, [incomingCall?.visitor_candidates, incomingCall?.id]);

  async function updateCallStatus(newStatus: "answered" | "declined") {
    if (!incomingCall) return;

    const { error } = await supabase
      .from("calls")
      .update({ status: newStatus })
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
  }

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
            muted
            playsInline
            className="h-[420px] w-full object-cover"
          />
        </div>

        {!incomingCall ? (
          <div className="mt-4 rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-gray-500">No incoming calls</p>
          </div>
        ) : incomingCall.status === "calling" ? (
          <div className="mt-4 rounded-2xl bg-white p-6 shadow">
            <p className="text-center text-lg font-semibold">Incoming Call</p>
            <p className="mt-2 text-center text-gray-500">
              Visitor from House {incomingCall.house_slug} is waiting
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <div className="w-full rounded-xl bg-yellow-500 py-4 text-center text-white font-semibold">
                Ringing...
              </div>

              <button
                onClick={() => updateCallStatus("answered")}
                className="w-full rounded-xl bg-green-600 py-4 text-white font-semibold"
              >
                Answer Call
              </button>

              <button
                onClick={() => updateCallStatus("declined")}
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
              You are connected to the visitor from House {incomingCall.house_slug}
            </p>

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