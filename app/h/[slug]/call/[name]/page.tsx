"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type CallStatus = "calling" | "answered" | "declined" | "cancelled";

export default function CallPage({
  params,
}: {
  params: Promise<{ slug: string; name: string }>;
}) {
  const { slug, name } = use(params);
  const searchParams = useSearchParams();
  const callId = searchParams.get("callId");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<CallStatus>("calling");
  const [error, setError] = useState("");

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        console.log(err);

        if (err?.name === "NotAllowedError") {
          setError("Camera and microphone permission was denied.");
        } else if (err?.name === "NotFoundError") {
          setError("No camera or microphone was found on this device.");
        } else {
          setError("Could not start the camera or microphone.");
        }
      }
    }

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!callId) return;

    let active = true;

    async function loadCallOnce() {
      const { data, error } = await supabase
        .from("calls")
        .select("status")
        .eq("id", callId)
        .maybeSingle();

      if (error) {
        console.log(error);
        return;
      }

      if (!active || !data) return;

      const currentStatus = data.status as CallStatus;
      setStatus(currentStatus);

      if (currentStatus === "declined" || currentStatus === "cancelled") {
        stopCamera();
      }
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
        (payload) => {
          const updated = payload.new as { status: CallStatus };
          setStatus(updated.status);

          if (updated.status === "declined" || updated.status === "cancelled") {
            stopCamera();
          }
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
          stopCamera();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [callId]);

  async function cancelCall() {
    if (!callId) return;

    await supabase
      .from("calls")
      .update({ status: "cancelled" })
      .eq("id", callId);

    stopCamera();
  }

  if (status === "declined") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg text-center">
          <h1 className="text-2xl font-bold">Call Declined</h1>
          <p className="mt-3 text-gray-500">
            {name.charAt(0).toUpperCase() + name.slice(1)} declined the call.
          </p>

          <Link
            href={`/h/${slug}`}
            className="mt-6 block w-full rounded-lg bg-black py-3 text-white font-medium"
          >
            Back to House
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
            href={`/h/${slug}`}
            className="mt-6 block w-full rounded-lg bg-black py-3 text-white font-medium"
          >
            Back to House
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="h-screen w-screen object-cover"
      />

      <div className="absolute inset-0 bg-black/20" />

      <div className="absolute top-0 left-0 right-0 p-5 text-white">
        <h1 className="text-2xl font-bold capitalize">Calling {name}...</h1>
        <p className="mt-1 text-sm text-white/90">
          {status === "answered"
            ? "Connecting..."
            : "Waiting for resident to answer"}
        </p>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-600/90 px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5">
        <div className="mx-auto flex max-w-sm flex-col gap-3">
          <button
            type="button"
            className="w-full rounded-full bg-yellow-500 py-4 text-white font-semibold"
          >
            {status === "answered" ? "Connecting..." : "Waiting..."}
          </button>

          <Link
            href={`/h/${slug}`}
            onClick={cancelCall}
            className="w-full rounded-full bg-white py-4 text-center text-black font-semibold"
          >
            Go Back
          </Link>
        </div>
      </div>
    </div>
  );
}