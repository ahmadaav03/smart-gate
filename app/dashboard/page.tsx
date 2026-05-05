"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type IceCandidateJSON = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

type MediaMode = "video" | "audio_only";

type Profile = {
  id: string;
  role: "property_admin" | "resident";
  full_name: string | null;
};

type Resident = {
  id: string;
  slug: string;
  full_name: string;
  display_name: string | null;
  availability_status: "available" | "dnd";
  ringtone: string;
  avatar_url: string | null;
};

type Site = {
  id: string;
  name: string;
  slug: string;
  subscription_status: string;
  trial_ends_at: string;
};

type Unit = {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
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
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today at ${timeStr}`;
  if (isYesterday) return `Yesterday at ${timeStr}`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" }) + " at " + timeStr;
}

function getStatusLabel(status: string) {
  if (status === "answered") return { label: "Answered", color: "text-green-600" };
  if (status === "declined") return { label: "Declined", color: "text-red-500" };
  return { label: "Missed", color: "text-gray-400" };
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resident, setResident] = useState<Resident | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
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

  const displayName = resident?.display_name || resident?.full_name || profile?.full_name || "User";

  function stopPeer() {
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
    localAudioTrackRef.current = null;
    addedVisitorCandidatesRef.current = new Set();
    peerSetupCallIdRef.current = null;
    if (remoteVideoRef.current) { remoteVideoRef.current.pause(); remoteVideoRef.current.srcObject = null; remoteVideoRef.current.muted = true; }
    setRemoteVideoReady(false);
    if (remoteAudioRef.current) { remoteAudioRef.current.pause(); remoteAudioRef.current.srcObject = null; remoteAudioRef.current.muted = true; }
  }

  async function addVisitorCandidates(candidates: IceCandidateJSON[] | null | undefined) {
    if (!peerRef.current || !candidates?.length) return;
    if (!peerRef.current.remoteDescription) return;
    for (const candidate of candidates) {
      const key = JSON.stringify(candidate);
      if (addedVisitorCandidatesRef.current.has(key)) continue;
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        addedVisitorCandidatesRef.current.add(key);
      } catch (err) { console.log(err); }
    }
  }

  async function hydrateLocation(call: Call) {
    if (call.site_id) {
      const { data } = await supabase.from("sites").select("name").eq("id", call.site_id).maybeSingle();
      setSiteName(data?.name || "");
    }
    if (call.unit_id) {
      const { data } = await supabase.from("units").select("name, display_name").eq("id", call.unit_id).maybeSingle();
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

    const enriched = await Promise.all(
      data.map(async (call) => {
        let site_name = null;
        let unit_name = null;
        if (call.site_id) {
          const { data: s } = await supabase.from("sites").select("name").eq("id", call.site_id).maybeSingle();
          site_name = s?.name || null;
        }
        if (call.unit_id) {
          const { data: u } = await supabase.from("units").select("name, display_name").eq("id", call.unit_id).maybeSingle();
          unit_name = u?.display_name || u?.name || null;
        }
        return { ...call, site_name, unit_name } as CallHistoryItem;
      })
    );

    setCallHistory(enriched);
  }

  useEffect(() => {
    async function loadDashboard() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/resident/login"; return; }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, role, full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileData) { window.location.href = "/onboarding"; return; }

      setProfile(profileData as Profile);

      // Load resident profile if exists
      const { data: residentData } = await supabase
        .from("residents")
        .select("id, slug, full_name, display_name, availability_status, ringtone, avatar_url")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (residentData) {
        setResident(residentData as Resident);
        setDisplayNameDraft(residentData.display_name || residentData.full_name);
        await loadCallHistory(residentData.id);
      }

      // Load property if admin
      if (profileData.role === "property_admin") {
        const { data: siteData } = await supabase
          .from("sites")
          .select("id, name, slug, subscription_status, trial_ends_at")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (siteData) {
          setSite(siteData as Site);

          const { data: unitsData } = await supabase
            .from("units")
            .select("id, name, display_name, slug")
            .eq("site_id", siteData.id)
            .order("created_at", { ascending: true });

          setUnits((unitsData as Unit[]) || []);
        }
      }

      setLoading(false);
    }

    loadDashboard();
  }, []);

  useEffect(() => {
    if (!resident?.id) return;
    const residentId = resident.id;
    let active = true;

    async function loadLatestCall() {
      const { data } = await supabase
        .from("calls").select("*").eq("resident_id", residentId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!active) return;
      const call = (data as Call) || null;
      if (!call || !call.visitor_ready) { setIncomingCall(null); return; }
      setIncomingCall(call);
      hydrateLocation(call);
    }

    loadLatestCall();

    const channel = supabase
      .channel(`dashboard-${residentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `resident_id=eq.${residentId}` },
        async (payload) => {
          if (payload.eventType === "DELETE") { setIncomingCall(null); setAudioError(""); setSiteName(""); setUnitName(""); stopPeer(); return; }
          const row = payload.new as Call;
          if (row.status === "answered" || row.status === "declined" || row.status === "cancelled") { loadCallHistory(residentId); }
          if (!row.visitor_ready) { setIncomingCall(null); return; }
          const { data: fullRow } = await supabase.from("calls").select("*").eq("id", row.id).maybeSingle();
          if (!fullRow) return;
          setIncomingCall((prev) => { if (!prev || prev.id !== fullRow.id) hydrateLocation(fullRow); return fullRow as Call; });
        }
      ).subscribe();

    return () => { active = false; supabase.removeChannel(channel); stopPeer(); };
  }, [resident?.id]);

  useEffect(() => {
    if (!incomingCall?.id || !incomingCall?.offer || !incomingCall?.visitor_ready) return;
    if (incomingCall.status === "declined" || incomingCall.status === "cancelled") return;
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
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 },
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
            if (hasVideo) remoteVideoRef.current.play().then(() => setRemoteVideoReady(true)).catch(console.log);
          }
          if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.muted = true;
            remoteAudioRef.current.play().catch(console.log);
          }
        };

        peer.onicecandidate = async (event) => {
          if (!event.candidate) return;
          const candidateData: IceCandidateJSON = { candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex };
          const { data } = await supabase.from("calls").select("resident_candidates").eq("id", callId).maybeSingle();
          const existing = (data?.resident_candidates as IceCandidateJSON[] | null) || [];
          if (existing.some(item => JSON.stringify(item) === JSON.stringify(candidateData))) return;
          await supabase.from("calls").update({ resident_candidates: [...existing, candidateData] }).eq("id", callId);
        };

        await peer.setRemoteDescription(new RTCSessionDescription(offer!));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await supabase.from("calls").update({ answer }).eq("id", callId);
        await addVisitorCandidates(visitorCandidates || []);

      } catch (err: any) {
        console.log("setupPeer failed:", err?.name, err?.message);
        peerSetupCallIdRef.current = null;
        if (err?.name === "NotAllowedError") setAudioError("Please allow microphone access to answer calls.");
        else setAudioError("Could not prepare the incoming call.");
      }
    }

    setupPeer();
  }, [incomingCall?.id, incomingCall?.visitor_ready]);

  useEffect(() => {
    async function syncCandidates() {
      if (!incomingCall?.id || !peerRef.current) return;
      await addVisitorCandidates(incomingCall.visitor_candidates || []);
    }
    syncCandidates();
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
    const { error } = await supabase.from("residents").update({ availability_status: nextStatus }).eq("id", resident.id);
    if (!error) setResident({ ...resident, availability_status: nextStatus });
    setSaving(false);
  }

  async function updateRingtone(nextRingtone: string) {
    if (!resident) return;
    setSaving(true);
    const { error } = await supabase.from("residents").update({ ringtone: nextRingtone }).eq("id", resident.id);
    if (!error) setResident({ ...resident, ringtone: nextRingtone });
    setSaving(false);
  }

  async function saveDisplayName() {
    if (!resident) return;
    const cleaned = displayNameDraft.trim();
    if (!cleaned) { setProfileMessage("Display name cannot be empty."); return; }
    setSaving(true);
    setProfileMessage("");
    const { error } = await supabase.from("residents").update({ display_name: cleaned }).eq("id", resident.id);
    if (!error) { setResident({ ...resident, display_name: cleaned }); setProfileMessage("Profile updated."); }
    else setProfileMessage("Could not update profile.");
    setSaving(false);
  }

  async function uploadAvatar(file: File) {
    if (!resident) return;
    setSaving(true);
    setProfileMessage("");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${resident.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) { setProfileMessage("Could not upload profile picture."); setSaving(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: updateError } = await supabase.from("residents").update({ avatar_url: data.publicUrl }).eq("id", resident.id);
    if (!updateError) { setResident({ ...resident, avatar_url: data.publicUrl }); setProfileMessage("Profile picture updated."); }
    else setProfileMessage("Could not save profile picture.");
    setSaving(false);
  }

  async function answerCall() {
    if (!incomingCall) return;
    setAudioError("");
    if (!localAudioTrackRef.current) { setAudioError("Microphone is not ready on this device."); return; }
    localAudioTrackRef.current.enabled = true;
    await supabase.from("calls").update({ status: "answered" }).eq("id", incomingCall.id);
    if (remoteAudioRef.current) { remoteAudioRef.current.muted = false; await remoteAudioRef.current.play().catch(console.log); }
  }

  async function declineCall() {
    if (!incomingCall) return;
    await supabase.from("calls").update({ status: "declined" }).eq("id", incomingCall.id);
  }

  async function endCall() {
    if (!incomingCall) return;
    await supabase.from("calls").update({ status: "cancelled" }).eq("id", incomingCall.id);
    stopPeer();
  }

  async function clearCall() {
    if (!incomingCall || !resident) return;
    stopPeer();
    setIncomingCall(null);
    setSiteName("");
    setUnitName("");
    setAudioError("");
    await loadCallHistory(resident.id);
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
          <p className="text-white/70">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const isAvailable = resident?.availability_status === "available";
  const isVoiceOnly = incomingCall?.media_mode === "audio_only";
  const locationLine = unitName && siteName ? `${unitName} • ${siteName}` : unitName || siteName;
  const isAdmin = profile?.role === "property_admin";

  const trialEnds = site ? new Date(site.trial_ends_at) : null;
  const daysLeft = trialEnds ? Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="relative min-h-screen bg-[#0B1F3A] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/60">
              {isAdmin && site ? site.name : "Dashboard"}
            </p>
            <h1 className="mt-2 text-3xl font-bold">{displayName}</h1>
            {resident ? (
              <p className="mt-2 text-sm text-white/70">
                {isAvailable ? "You are available for visitor calls." : "Do not disturb is on."}
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/70">Welcome back.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => resident ? setProfileOpen(true) : signOut()}
            className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xl"
          >
            {resident?.avatar_url ? (
              <img src={resident.avatar_url} alt="Profile" className="h-full w-full object-cover" />
            ) : "👤"}
          </button>
        </div>

        {/* Resident sections — only if they have a resident profile */}
        {resident ? (
          <>
            <div className="mt-8 rounded-3xl bg-white p-5 text-black shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold">Call availability</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {isAvailable ? "Visitors can call you." : "Visitors will see that you are unavailable."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => updateAvailability(isAvailable ? "dnd" : "available")}
                  className={`relative h-8 w-16 rounded-full transition ${isAvailable ? "bg-green-600" : "bg-red-600"}`}
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${isAvailable ? "left-9" : "left-1"}`} />
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
              <p className="font-bold">Ringtone</p>
              <p className="mt-1 text-sm text-gray-500">Choose the sound for incoming calls.</p>
              <select
                value={resident.ringtone}
                disabled={saving}
                onChange={(e) => updateRingtone(e.target.value)}
                className="mt-4 w-full rounded-2xl border border-gray-200 px-4 py-4 outline-none focus:border-[#0B1F3A]"
              >
                {ringtones.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* Call history */}
            <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
              <p className="font-bold">Recent calls</p>
              <p className="mt-1 text-sm text-gray-500">Your last 20 visitor calls.</p>
              <div className="mt-4 flex flex-col gap-3">
                {callHistory.length === 0 ? (
                  <p className="text-sm text-gray-500">No call history yet.</p>
                ) : (
                  callHistory.map((call) => {
                    const { label, color } = getStatusLabel(call.status);
                    const locationStr = call.unit_name && call.site_name
                      ? `${call.unit_name} • ${call.site_name}`
                      : call.unit_name || call.site_name || "Visitor call";
                    return (
                      <div key={call.id} className="flex items-center gap-3 rounded-2xl bg-gray-50 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-lg">
                          {call.status === "answered" ? "📞" : call.status === "declined" ? "✖" : "📵"}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{locationStr}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {formatCallTime(call.created_at)} · {call.media_mode === "audio_only" ? "Voice" : "Video"}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold ${color}`}>{label}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        ) : null}

        {/* Admin sections */}
        {isAdmin && site ? (
          <>
            <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">Subscription</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {site.subscription_status === "trialing"
                      ? daysLeft > 0 ? `Free trial — ${daysLeft} days remaining` : "Trial ended"
                      : site.subscription_status === "active" ? "Active subscription" : "Subscription expired"}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  site.subscription_status === "active" ? "bg-green-100 text-green-700"
                  : site.subscription_status === "trialing" ? "bg-blue-100 text-blue-700"
                  : "bg-red-100 text-red-700"
                }`}>
                  {site.subscription_status === "trialing" ? "Trial" : site.subscription_status}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
              <p className="font-bold">Units & Residents</p>
              <p className="mt-1 text-sm text-gray-500">Manage who can receive calls at your property.</p>
              <div className="mt-4 flex flex-col gap-3">
                {units.length === 0 ? (
                  <p className="text-sm text-gray-500">No units yet.</p>
                ) : (
                  units.map((unit) => (
                    <div key={unit.id} className="flex items-center justify-between rounded-2xl bg-gray-100 p-4">
                      <div>
                        <p className="font-semibold">{unit.display_name || unit.name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => window.location.href = `/dashboard/unit/${unit.id}`}
                        className="rounded-full bg-[#0B1F3A] px-4 py-2 text-xs font-semibold text-white"
                      >
                        Manage
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => window.location.href = `/dashboard/unit/new?site=${site.id}`}
                className="mt-4 w-full rounded-full border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition active:scale-95"
              >
                + Add unit
              </button>
            </div>

            <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
              <p className="font-bold">QR Code</p>
              <p className="mt-1 text-sm text-gray-500">
                Place this at your gate for visitors to scan.
              </p>
              <div className="mt-4 rounded-2xl bg-gray-100 p-4 text-center">
                <p className="text-sm font-semibold text-gray-700">{window.location.origin}/{site.slug}</p>
                <p className="mt-2 text-xs text-gray-500">QR code generator coming soon</p>
              </div>
            </div>
          </>
        ) : null}

        {/* Sign out */}
        <button
          type="button"
          onClick={signOut}
          className="mt-8 w-full rounded-full bg-white/10 py-4 text-sm font-semibold text-white transition active:scale-95"
        >
          Sign out
        </button>

      </div>

      {/* Profile modal */}
      {profileOpen && resident ? (
        <div className="fixed inset-0 z-40 bg-black/60 px-5 py-8">
          <div className="mx-auto max-w-md rounded-3xl bg-white p-5 text-black shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Profile</h2>
              <button type="button" onClick={() => setProfileOpen(false)} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold">Close</button>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-3xl">
                {resident.avatar_url ? <img src={resident.avatar_url} alt="Profile" className="h-full w-full object-cover" /> : "👤"}
              </div>
              <label className="rounded-full bg-[#0B1F3A] px-5 py-3 text-sm font-semibold text-white">
                Change photo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
              </label>
            </div>
            <div className="mt-5">
              <label className="text-sm font-semibold text-gray-700">Display name visitors see</label>
              <input value={displayNameDraft} onChange={(e) => setDisplayNameDraft(e.target.value)} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-4 outline-none focus:border-[#0B1F3A]" />
              <button type="button" disabled={saving} onClick={saveDisplayName} className="mt-4 w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white">Save profile</button>
              {profileMessage ? <p className="mt-3 text-center text-sm text-gray-600">{profileMessage}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Incoming call overlay */}
      {incomingCall && (incomingCall.status === "calling" || incomingCall.status === "answered") ? (
        <div className="fixed inset-0 z-50 bg-[#0B1F3A] text-white">
          <div className="flex h-full flex-col">
            <div className="px-5 pt-6 text-center">
              <p className="text-sm text-white/70">{incomingCall.status === "calling" ? "Incoming call" : "Call in progress"}</p>
              <h2 className="mt-2 text-2xl font-bold">{locationLine || "Visitor call"}</h2>
            </div>
            <div className="relative flex flex-1 items-center justify-center px-4">
              {isVoiceOnly ? (
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-4xl">🎙️</div>
                  <p className="text-xl font-bold">Voice call</p>
                </div>
              ) : (
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full max-w-md rounded-3xl object-cover" />
              )}
              {!isVoiceOnly && incomingCall.status === "calling" && !remoteVideoReady ? (
                <div className="absolute rounded-xl bg-black/50 px-5 py-3 text-sm">Connecting to visitor camera...</div>
              ) : null}
              <audio ref={remoteAudioRef} autoPlay playsInline />
            </div>
            {audioError ? <p className="px-6 text-center text-sm text-red-300">{audioError}</p> : null}
            <div className="pb-8 pt-4">
              {incomingCall.status === "calling" ? (
                <div className="flex justify-center gap-8">
                  <button type="button" onClick={answerCall} className="flex flex-col items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-xl shadow-lg">📞</div>
                    <span className="mt-2 text-xs">Answer</span>
                  </button>
                  <button type="button" onClick={declineCall} className="flex flex-col items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-xl shadow-lg">✖</div>
                    <span className="mt-2 text-xs">Decline</span>
                  </button>
                </div>
              ) : (
                <div className="flex justify-center">
                  <button type="button" onClick={endCall} className="flex flex-col items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-xl shadow-lg">🔴</div>
                    <span className="mt-2 text-xs">End Call</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {incomingCall && (incomingCall.status === "declined" || incomingCall.status === "cancelled") ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F3A] px-6 text-white">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center text-black shadow-2xl">
            <h2 className="text-2xl font-bold">{incomingCall.status === "declined" ? "Call declined" : "Call ended"}</h2>
            <p className="mt-3 text-sm text-gray-500">The call is no longer active.</p>
            <button type="button" onClick={clearCall} className="mt-6 w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white">Clear</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}