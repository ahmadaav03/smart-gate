import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0B1F3A] text-white flex flex-col">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5">
        <Image
          src="/logo.png"
          alt="SmartGate"
          width={120}
          height={40}
          className="object-contain"
        />
        <Link
          href="/resident/login"
          className="rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm">

          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white/10">
            <Image
              src="/logo.png"
              alt="SmartGate"
              width={64}
              height={64}
              className="object-contain"
            />
          </div>

          <h1 className="text-4xl font-bold leading-tight">
            Your gate.<br />Your phone.
          </h1>

          <p className="mt-4 text-base text-white/70 leading-relaxed">
            SmartGate replaces your physical intercom with a QR code. Visitors scan, you answer — from anywhere.
          </p>

          {/* How it works */}
          <div className="mt-8 flex flex-col gap-3 text-left">
            <div className="flex items-start gap-3 rounded-2xl bg-white/5 px-4 py-3">
              <span className="text-xl">📲</span>
              <div>
                <p className="text-sm font-semibold">Visitor scans QR</p>
                <p className="text-xs text-white/50 mt-0.5">A QR plate is placed at your gate or entrance</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-white/5 px-4 py-3">
              <span className="text-xl">📞</span>
              <div>
                <p className="text-sm font-semibold">Call comes through</p>
                <p className="text-xs text-white/50 mt-0.5">You get a video or voice call on your phone</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-white/5 px-4 py-3">
              <span className="text-xl">🌍</span>
              <div>
                <p className="text-sm font-semibold">Answer from anywhere</p>
                <p className="text-xs text-white/50 mt-0.5">No hardware. No installation. Works worldwide.</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/resident/login?mode=signup"
              className="w-full rounded-full bg-blue-600 py-4 text-center font-semibold text-white transition hover:bg-blue-700 active:scale-95"
            >
              Get started free
            </Link>
            <Link
              href="/resident/login"
              className="w-full rounded-full border border-white/20 py-4 text-center text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
            >
              Sign in to your account
            </Link>
          </div>

          <p className="mt-6 text-xs text-white/40">
            4 months free · No hardware installation · Cancel anytime
          </p>

        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-5 text-center text-xs text-white/30">
        © {new Date().getFullYear()} SmartGate · Secure Access Solutions
      </footer>

    </div>
  );
}