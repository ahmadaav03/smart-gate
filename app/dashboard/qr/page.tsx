"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import QRCode from "qrcode";

export default function QRPage() {
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [siteName, setSiteName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/resident/login"; return; }

      const { data: site } = await supabase
        .from("sites").select("name, slug")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();

      if (!site) { window.location.href = "/dashboard"; return; }

      const url = `${window.location.origin}/${site.slug}`;
      setSiteUrl(url);
      setSiteName(site.name);
      setLoading(false);
    }

    load();
  }, []);

  useEffect(() => {
    if (!siteUrl || !canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, siteUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: "#0B1F3A",
        light: "#FFFFFF",
      },
    });
  }, [siteUrl]);

  function downloadQR() {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${siteName}-qr-code.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-white/10" />
          <p className="text-white/70">Loading QR code...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">

        <button
          type="button"
          onClick={() => window.location.href = "/dashboard"}
          className="mb-6 flex items-center gap-2 text-sm text-white/60 transition active:scale-95"
        >
          ← Back to dashboard
        </button>

        <p className="text-sm text-white/60">Gate QR Plate</p>
        <h1 className="mt-1 text-3xl font-bold">{siteName}</h1>

        <div className="mt-8 rounded-3xl bg-white p-6 text-black shadow-2xl">
          <p className="text-center font-bold">Your property QR code</p>
          <p className="mt-1 text-center text-sm text-gray-500">
            This is linked to your physical QR plate. Visitors scan this to call your residents.
          </p>

          <div className="mt-6 flex justify-center">
            <canvas ref={canvasRef} className="rounded-2xl" />
          </div>

          <p className="mt-4 text-center text-xs text-gray-400 font-mono break-all">
            {siteUrl}
          </p>

          <button
            type="button"
            onClick={downloadQR}
            className="mt-6 w-full rounded-full bg-[#0B1F3A] py-4 font-semibold text-white transition active:scale-95 active:bg-[#162d52]"
          >
            Download QR code
          </button>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 text-black shadow-2xl">
          <p className="font-bold">How it works</p>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-sm font-bold text-white">1</div>
              <p className="text-sm text-gray-600 pt-1">Your QR plate is placed at your gate or entrance.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-sm font-bold text-white">2</div>
              <p className="text-sm text-gray-600 pt-1">A visitor scans the QR code with their phone camera.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-sm font-bold text-white">3</div>
              <p className="text-sm text-gray-600 pt-1">They select who they want to call and start a video or voice call instantly.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-sm font-bold text-white">4</div>
              <p className="text-sm text-gray-600 pt-1">You answer from anywhere on your phone.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}