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
          width={140}
          height={45}
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
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
        <div className="w-full max-w-sm">

          {/* Hero text */}
          <div className="text-center mt-4">
            <h1 className="text-4xl font-bold leading-tight">
              Answer your gate<br />from anywhere.
            </h1>
            <p className="mt-4 text-base text-white/70 leading-relaxed">
              SmartGate turns your smartphone into a smart intercom. No wiring. No hardware. Just a QR code at your gate.
            </p>
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

          <p className="mt-4 text-center text-xs text-white/40">
            40 days free  · No installation · Cancel anytime
          </p>

          {/* How it works */}
          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 text-center mb-5">
              How it works
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4 rounded-2xl bg-white/5 px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-xl">
                  📲
                </div>
                <div>
                  <p className="text-sm font-semibold">Visitor scans QR at your gate</p>
                  <p className="text-xs text-white/40 mt-0.5">A branded QR plate is placed at your entrance</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl bg-white/5 px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-xl">
                  📞
                </div>
                <div>
                  <p className="text-sm font-semibold">You get a call on your phone</p>
                  <p className="text-xs text-white/40 mt-0.5">Video or voice — see and speak to your visitor</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl bg-white/5 px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-xl">
                  ✅
                </div>
                <div>
                  <p className="text-sm font-semibold">You decide who enters</p>
                  <p className="text-xs text-white/40 mt-0.5">Answer, speak, and decide — from anywhere</p>
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 text-center mb-5">
              Features
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-4">
                <span className="text-2xl">🌍</span>
                <p className="mt-2 text-sm font-semibold">Answer from anywhere</p>
                <p className="mt-1 text-xs text-white/40">At work, on holiday — your gate never goes unanswered</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <span className="text-2xl">👁️</span>
                <p className="mt-2 text-sm font-semibold">See before you open</p>
                <p className="mt-1 text-xs text-white/40">Video call before buzzing anyone in. Stay safe.</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <span className="text-2xl">📦</span>
                <p className="mt-2 text-sm font-semibold">No missed deliveries</p>
                <p className="mt-1 text-xs text-white/40">Courier at the gate? Answer and sort it remotely</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <span className="text-2xl">🔧</span>
                <p className="mt-2 text-sm font-semibold">Zero installation</p>
                <p className="mt-1 text-xs text-white/40">Stick a QR plate at your gate. Ready in minutes.</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <span className="text-2xl">👨‍👩‍👧</span>
                <p className="mt-2 text-sm font-semibold">Family access</p>
                <p className="mt-1 text-xs text-white/40">Each family member gets their own profile and calls</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <span className="text-2xl">📵</span>
                <p className="mt-2 text-sm font-semibold">Do Not Disturb</p>
                <p className="mt-1 text-xs text-white/40">Set yourself as unavailable when you need a break</p>
              </div>
              <div className="col-span-2 rounded-2xl bg-white/5 p-4">
                <span className="text-2xl">📱</span>
                <p className="mt-2 text-sm font-semibold">Works on any phone — no app needed for visitors</p>
                <p className="mt-1 text-xs text-white/40">Visitors just scan and call. No downloads, no accounts, no friction.</p>
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-12 text-center">
            <p className="text-white/60 text-sm mb-4">
              Ready to upgrade your gate?
            </p>
            <Link
              href="/resident/login?mode=signup"
              className="inline-block rounded-full bg-blue-600 px-8 py-4 font-semibold text-white transition hover:bg-blue-700 active:scale-95"
            >
              Get started free
            </Link>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-xs text-white/30">
        © {new Date().getFullYear()} SmartGate · Secure Access Solutions
      </footer>

    </div>
  );
}