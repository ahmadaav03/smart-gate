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
  availability_status: "available" | "dnd";
  ringtone: string;
  avatar_url: string | null;
};

type Call = {
  id: string;
  status: "calling" | "answered" | "declined" | "cancelled";
  visitor_ready?: boolean | null;
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

type CallHistoryItem = {
  id: string;
  status: "answered" | "declined" | "cancelled";
  created_at: string;
  media_mode?: MediaMode | null;
  site_name?: string | null;
  unit_name?: string | null;
};

type UnitLink = {
  units: {
    id: string;
    name: string;
    display_name: string | null;
    sites: {
      id: string;
      name: string;
      slug: string;
    } | null;
  } | null;
};

const ringtones = [
  { value: "classic", label: "Classic Ring" },
  { value: "soft", label: "Soft Chime" },
  { value: "urgent", label: "Urgent Alert" },
  { value: "beep", label: "Short Beep" },
];

function formatCallTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${timeStr}`;
  if (isYesterday) return `Yesterday at ${timeStr}`;
  return (
    date.toLocaleDateString([], {
      day: "numeric",
      month: "short",
    }) +
    " at " +
    timeStr
  );
}

function getStatusLabel(status: string) {
  if (status === "answered") return { label: "Answered", color: "text-green-600" };
  if (status === "declined") return { label: "Declined", color: "text-red-500" };
  return { label: "Missed", color: "text-gray-400" };
}

export default function ResidentDashboardPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const residentSlug = name.toLowerCase();

  const [resident, setResident] = useState<Resident | null>(null);
  const [unitLinks, setUnitLinks] = useState<UnitLink[]>([]);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [profileMessage, setProfileMessage] = useState("");

  const [siteName, setSiteName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [audioError, setAudioError] = useState("");
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const addedVisitorCandidatesRef = useRef<Set<string>>(new Set());
  const peerSetupCallIdRef = useRef<string | null>(null);

  const displayName =
    resident?.display_name || resident?.full_name || "Resident";

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
    addedVisitorCandidatesRef.current = new Set();
    peerSetupCallIdRef.current = null;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.pause();
      remoteVideoRef.current.srcObject = null;
      remoteVideoRef.current.muted = true;
    }

    setRemoteVideoReady(false);

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
    if (!peerRef.current.remoteDescription) return;

    for (const candidate of candidates) {
      const key = JSON.stringify(candidate);
      if (addedVisitorCandidatesRef.current.has(key)) continue;

      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        addedVisitorCandidatesRef.current.add(key);
      } catch (err) {
        console.log("Resident failed to add visitor ICE candidate:", err);
      }
    }
  }

  async function hydrateLocation(call: Call) {
    if (call.site_id) {
      const { data } = await supabase
        .from("sites")
        .select("name")
        .eq("id", call.site_id)
        .maybeSingle();
      setSiteName(data?.name || "");
    }

    if (call.unit_id) {
      const { data } = await supabase
        .from("units")
        .select("name, display_name")
        .eq("id", call.unit_id)
        .maybeSingle();
      setUnitName(data?.display_name || data?.name || "");
    }
  }

  async function loadCallHistory(residentId: string) {
    const { data } = await supabase
      .from("calls")
      .select("id, status, created_at, media_mode, site_id, unit_id")
      .eq("resident_id", residentId)
      .in("status", ["answered", "declined", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data) return;

    // Fetch site and unit names for each call
    const enriched = await Promise.all(
      data.map(async (call) => {
        let site_name = null;
        let unit_name = null;

        if (call.site_id) {
          const { data: siteData } = await supabase
            .from("sites")
            .select("name")
            .eq("id", call.site_id)
            .maybeSingle();
          site_name = siteData?.name || null;
        }

        if (call.unit_id) {
          const { data: unitData } = await supabase
            .from("units")
            .select("name, display_name")
            .eq("id", call.unit_id)
            .maybeSingle();
          unit_name = unitData?.display_name || unitData?.name || null;
        }

        return { ...call, site_name, unit_name } as CallHistoryItem;
      })
    );

    setCallHistory(enriched);
  }

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      const { data: residentData, error: residentError } = await supabase
        .from("residents")
        .select(
          "id, slug, full_name, display_name, availability_status, ringtone, avatar_url"
        )
        .eq("slug", residentSlug)
        .maybeSingle();

      if (residentError || !residentData) {
        console.log(residentError);
        setResident(null);
        setLoading(false);
        return;
      }

      const loadedResident = residentData as Resident;
      setResident(loadedResident);
      setDisplayNameDraft(
        loadedResident.display_name || loadedResident.full_name
      );

      const { data: linksData } = await supabase
        .from("unit_residents")
        .select(`
          units (
            id,
            name,
            display_name,
            sites (
              id,
              name,
              slug
            )
          )
        `)
        .eq("resident_id", loadedResident.id);

      const cleanedLinks: UnitLink[] =
        linksData?.map((item: any) => ({
          units: Array.isArray(item.units) ? item.units[0] || null : item.units,
        })) || [];

      setUnitLinks(cleanedLinks);
      await loadCallHistory(loadedResident.id);
      setLoading(false);
    }

    loadDashboard();
  }, [residentSlug]);

  useEffect(() => {
    if (!resident?.id) return;

    const residentId = resident.id;
    let active = true;

    async function loadLatestCallOnce() {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .eq("resident_id", residentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;

      const call = (data as Call) || null;

      if (!call || !call.visitor_ready) {
        setIncomingCall(null);
        return;
      }

      setIncomingCall(call);
      hydrateLocation(call);
    }

    loadLatestCallOnce();

    const channel = supabase
      .channel(`dashboard-resident-${residentId}`)
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
            setAudioError("");
            setSiteName("");
            setUnitName("");
            stopPeer();
            return;
          }

          const row = payload.new as Call;

          // Refresh call history when a call completes
          if (
            row.status === "answered" ||
            row.status === "declined" ||
            row.status === "cancelled"
          ) {
            loadCallHistory(residentId);
          }

          if (!row.visitor_ready) {
            setIncomingCall(null);
            return;
          }

          const { data: fullRow } = await supabase
            .from("calls")
            .select("*")
            .eq("id", row.id)
            .maybeSingle();

          if (!fullRow) return;

          setIncomingCall((prev) => {
            if (!prev || prev.id !== fullRow.id) {
              hydrateLocation(fullRow);
            }
            return fullRow as Call;
          });
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
    if (!incomingCall?.id || !incomingCall?.offer || !incomingCall?.visitor_ready) return;

    if (
      incomingCall.status === "declined" ||
      incomingCall.status === "cancelled"
    ) {
      return;
    }

    // Set ref SYNCHRONOUSLY before any async work to prevent double-fire
    if (peerSetupCallIdRef.current === incomingCall.id) return;
    peerSetupCallIdRef.current = incomingCall.id;

    const callId = incomingCall.id;
    const offer = incomingCall.offer;
    const visitorCandidates = incomingCall.visitor_candidates;

    async function setupPeer() {
      const iceRes = await fetch("/api/ice-servers");
      const { iceServers } = await iceRes.json();

      try {
        const peer = new RTCPeerConnection({ iceServers });
        peerRef.current = peer;

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
          },
          video: false,
        });

        micStreamRef.current = micStream;

        const localAudioTrack = micStream.getAudioTracks()[0] || null;

        if (localAudioTrack) {
          localAudioTrack.enabled = false;
          localAudioTrackRef.current = localAudioTrack;
          peer.addTrack(localAudioTrack, micStream);
        }

        peer.ontrack = (event) => {
          const [remoteStream] = event.streams;
          if (!remoteStream) return;

          if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
            const hasVideo = remoteStream.getVideoTracks().length > 0;
            remoteVideoRef.current.srcObject = hasVideo ? remoteStream : null;
            remoteVideoRef.current.muted = true;

            if (hasVideo) {
              remoteVideoRef.current.play().then(() => {
                setRemoteVideoReady(true);
              }).catch(console.log);
            }
          }

          if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.muted = true;
            remoteAudioRef.current.play().catch(console.log);
          }
        };

        peer.onicecandidate = async (event) => {
          if (!event.candidate) return;

          const candidateData: IceCandidateJSON = {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          };

          const { data } = await supabase
            .from("calls")
            .select("resident_candidates")
            .eq("id", callId)
            .maybeSingle();

          const existing =
            (data?.resident_candidates as IceCandidateJSON[] | null) || [];

          const alreadyExists = existing.some(
            (item) => JSON.stringify(item) === JSON.stringify(candidateData)
          );

          if (alreadyExists) return;

          await supabase
            .from("calls")
            .update({ resident_candidates: [...existing, candidateData] })
            .eq("id", callId);
        };

        await peer.setRemoteDescription(new RTCSessionDescription(offer!));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        await supabase
          .from("calls")
          .update({ answer })
          .eq("id", callId);

        await addVisitorCandidates(visitorCandidates || []);

      } catch (err: any) {
        console.log("setupPeer failed:", err?.name, err?.message);
        peerSetupCallIdRef.current = null;

        if (err?.name === "NotAllowedError") {
          setAudioError("Please allow microphone access to answer calls.");
        } else {
          setAudioError("Could not prepare the incoming call.");
        }
      }
    }

    setupPeer();
  }, [incomingCall?.id, incomingCall?.visitor_ready]);

  useEffect(() => {
    async function syncVisitorCandidates() {
      if (!incomingCall?.id || !peerRef.current) return;
      await addVisitorCandidates(incomingCall.visitor_candidates || []);
    }
    syncVisitorCandidates();
  }, [incomingCall?.visitor_candidates]);

  useEffect(() => {
    if (incomingCall?.status === "answered" && remoteAudioRef.current) {
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.play().catch(console.log);
    }
  }, [incomingCall?.status]);

  async function updateAvailability(nextStatus: "available" | "dnd") {
    if (!resident) return;
    setSaving(true);
    const { error } = await supabase
      .from("residents")
      .update({ availability_status: nextStatus })
      .eq("id", resident.id);
    if (!error) {
      setResident({ ...resident, availability_status: nextStatus });
    }
    setSaving(false);
  }

  async function updateRingtone(nextRingtone: string) {
    if (!resident) return;
    setSaving(true);
    const { error } = await supabase
      .from("residents")
      .update({ ringtone: nextRingtone })
      .eq("id", resident.id);
    if (!error) {
      setResident({ ...resident, ringtone: nextRingtone });
    }
    setSaving(false);
  }

  async function saveDisplayName() {
    if (!resident) return;
    const cleaned = displayNameDraft.trim();
    if (!cleaned) {
      setProfileMessage("Display name cannot be empty.");
      return;
    }
    setSaving(true);
    setProfileMessage("");
    const { error } = await supabase
      .from("residents")
      .update({ display_name: cleaned })
      .eq("id", resident.id);
    if (!error) {
      setResident({ ...resident, display_name: cleaned });
      setProfileMessage("Profile updated.");
    } else {
      setProfileMessage("Could not update profile.");
    }
    setSaving(false);
  }

  async function uploadAvatar(file: File) {
    if (!resident) return;
    setSaving(true);
    setProfileMessage("");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${resident.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (uploadError) {
      console.log(uploadError);
      setProfileMessage("Could not upload profile picture.");
      setSaving(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = data.publicUrl;
    const { error: updateError } = await supabase
      .from("residents")
      .update({ avatar_url: publicUrl })
      .eq("id", resident.id);
    if (!updateError) {
      setResident({ ...resident, avatar_url: publicUrl });
      setProfileMessage("Profile picture updated.");
    } else {
      setProfileMessage("Could not save profile picture.");
    }
    setSaving(false);
  }

  async function answerCall() {
    if (!incomingCall) return;
    setAudioError("");
    if (!localAudioTrackRef.current) {
      setAudioError("Microphone is not ready on this device.");
      return;
    }
    localAudioTrackRef.current.enabled = true;
    await supabase
      .from("calls")
      .update({ status: "answered" })
      .eq("id", incomingCall.id);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false;
      await remoteAudioRef.current.play().catch(console.log);
    }
  }

  async function declineCall() {
    if (!incomingCall) return;
    await supabase
      .from("calls")
      .update({ status: "declined" })
      .eq("id", incomingCall.id);
  }

  async function endCall() {
    if (!incomingCall) return;
    await supabase
      .from("calls")
      .update({ status: "cancelled" })
      .eq("id", incomingCall.id);
    stopPeer();
  }

  async function clearCall() {
    if (!incomingCall) return;
    await supabase.from("calls").delete().eq("id", incomingCall.id);
    stopPeer();
    setIncomingCall(null);
    setSiteName("");
    setUnitName("");
    setAudioError("");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6 text-center text-white">
        <div>
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-white/10" />
          <h1 className="text-2xl font-bold">Loading dashboard</h1>
          <p className="mt-2 text-white/70">Preparing resident profile...</p>
        </div>
      </div>
    );
  }

  if (!resident) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-bold">Resident not found</h1>
          <p className="mt-3 text-white/70">
            This resident profile could not be found.
          </p>
        </div>
      </div>
    );
  }

  const isAvailable = resident.availability_status === "available";
  const isVoiceOnly = incomingCall?.media_mode === "audio_only";
  const locationLine =
    unitName && siteName ? `${unitName} • ${siteName}` : unitName || siteName;

  return (
    <div className="relative min-h-screen bg-[#0B1F3A] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/60">Resident Dashboard</p>
            <h1 className="mt-2 text-3xl font-bold">{displayName}</h1>
            <p className="mt-2 text-sm text-white/70">
              {isAvailable
                ? "You are available for visitor calls."
                : "Do not disturb is on."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xl"
          >
            {resident.avatar_url ? (
              <img
                src={resident.avatar_url}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              "👤"
            )}
          </button>
        </div>

        <div className="mt-8 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-bold">Call availability</p>
              <p className="mt-1 text-sm text-gray-500">
                {isAvailable
                  ? "Visitors can call you."
                  : "Visitors will see that you are unavailable."}
              </p>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                updateAvailability(isAvailable ? "dnd" : "available")
              }
              className={`relative h-8 w-16 rounded-full transition ${
                isAvailable ? "bg-green-600" : "bg-red-600"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                  isAvailable ? "left-9" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <p className="font-bold">Ringtone</p>
          <p className="mt-1 text-sm text-gray-500">
            Choose the sound for incoming calls.
          </p>

          <select
            value={resident.ringtone}
            disabled={saving}
            onChange={(e) => updateRingtone(e.target.value)}
            className="mt-4 w-full rounded-2xl border border-gray-200 px-4 py-4 outline-none focus:border-[#0B1F3A]"
          >
            {ringtones.map((ringtone) => (
              <option key={ringtone.value} value={ringtone.value}>
                {ringtone.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <p className="font-bold">Linked property</p>
          <p className="mt-1 text-sm text-gray-500">
            This information is managed by the property admin.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {unitLinks.length === 0 ? (
              <p className="text-sm text-gray-500">
                No unit is linked to this resident yet.
              </p>
            ) : (
              unitLinks.map((link, index) => {
                const unit = link.units;
                const site = unit?.sites;

                return (
                  <div
                    key={`${unit?.id || "unit"}-${index}`}
                    className="rounded-2xl bg-gray-100 p-4"
                  >
                    <p className="font-semibold">
                      {unit?.display_name || unit?.name || "Unknown unit"}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {site?.name || "Unknown property"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Call History */}
        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <p className="font-bold">Recent calls</p>
          <p className="mt-1 text-sm text-gray-500">
            Your last 20 visitor calls.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {callHistory.length === 0 ? (
              <p className="text-sm text-gray-500">No call history yet.</p>
            ) : (
              callHistory.map((call) => {
                const { label, color } = getStatusLabel(call.status);
                const locationStr =
                  call.unit_name && call.site_name
                    ? `${call.unit_name} • ${call.site_name}`
                    : call.unit_name || call.site_name || "Visitor call";

                return (
                  <div
                    key={call.id}
                    className="flex items-center gap-3 rounded-2xl bg-gray-50 p-4"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-lg">
                      {call.status === "answered"
                        ? "📞"
                        : call.status === "declined"
                        ? "✖"
                        : "📵"}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{locationStr}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatCallTime(call.created_at)} ·{" "}
                        {call.media_mode === "audio_only" ? "Voice" : "Video"}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold ${color}`}>
                      {label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {profileOpen ? (
        <div className="fixed inset-0 z-40 bg-black/60 px-5 py-8">
          <div className="mx-auto max-w-md rounded-3xl bg-white p-5 text-black shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Profile</h2>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-3xl">
                {resident.avatar_url ? (
                  <img
                    src={resident.avatar_url}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "👤"
                )}
              </div>

              <label className="rounded-full bg-[#0B1F3A] px-5 py-3 text-sm font-semibold text-white">
                Change photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAvatar(file);
                  }}
                />
              </label>
            </div>

            <div className="mt-5">
              <label className="text-sm font-semibold text-gray-700">
                Display name visitors see
              </label>
              <input
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-4 outline-none focus:border-[#0B1F3A]"
              />

              <button
                type="button"
                disabled={saving}
                onClick={saveDisplayName}
                className="mt-4 w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white"
              >
                Save profile
              </button>

              {profileMessage ? (
                <p className="mt-3 text-center text-sm text-gray-600">
                  {profileMessage}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {incomingCall &&
      (incomingCall.status === "calling" ||
        incomingCall.status === "answered") ? (
        <div className="fixed inset-0 z-50 bg-[#0B1F3A] text-white">
          <div className="flex h-full flex-col">
            <div className="px-5 pt-6 text-center">
              <p className="text-sm text-white/70">
                {incomingCall.status === "calling"
                  ? "Incoming call"
                  : "Call in progress"}
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {locationLine || "Visitor call"}
              </h2>
            </div>

            <div className="relative flex flex-1 items-center justify-center px-4">
              {isVoiceOnly ? (
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-4xl">
                    🎙️
                  </div>
                  <p className="text-xl font-bold">Voice call</p>
                </div>
              ) : (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full max-w-md rounded-3xl object-cover"
                />
              )}

              {!isVoiceOnly &&
              incomingCall.status === "calling" &&
              !remoteVideoReady ? (
                <div className="absolute rounded-xl bg-black/50 px-5 py-3 text-sm">
                  Connecting to visitor camera...
                </div>
              ) : null}

              <audio ref={remoteAudioRef} autoPlay playsInline />
            </div>

            {audioError ? (
              <p className="px-6 text-center text-sm text-red-300">
                {audioError}
              </p>
            ) : null}

            <div className="pb-8 pt-4">
              {incomingCall.status === "calling" ? (
                <div className="flex justify-center gap-8">
                  <button
                    type="button"
                    onClick={answerCall}
                    className="flex flex-col items-center"
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-xl shadow-lg">
                      📞
                    </div>
                    <span className="mt-2 text-xs">Answer</span>
                  </button>

                  <button
                    type="button"
                    onClick={declineCall}
                    className="flex flex-col items-center"
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-xl shadow-lg">
                      ✖
                    </div>
                    <span className="mt-2 text-xs">Decline</span>
                  </button>
                </div>
              ) : (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={endCall}
                    className="flex flex-col items-center"
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-xl shadow-lg">
                      🔴
                    </div>
                    <span className="mt-2 text-xs">End Call</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {incomingCall &&
      (incomingCall.status === "declined" ||
        incomingCall.status === "cancelled") ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F3A] px-6 text-white">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center text-black shadow-2xl">
            <h2 className="text-2xl font-bold">
              {incomingCall.status === "declined"
                ? "Call declined"
                : "Call ended"}
            </h2>
            <p className="mt-3 text-sm text-gray-500">
              The call is no longer active.
            </p>
            <button
              type="button"
              onClick={clearCall}
              className="mt-6 w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}