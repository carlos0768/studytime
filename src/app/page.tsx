import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden px-6">
      {/* Background ambient light */}
      <div
        className="pointer-events-none absolute top-[-20%] left-[50%] translate-x-[-50%] w-[800px] h-[800px] rounded-full opacity-[0.07]"
        style={{
          background:
            'radial-gradient(circle, var(--color-sage) 0%, transparent 70%)',
        }}
      />

      {/* Decorative floating shapes */}
      <div className="pointer-events-none absolute top-[15%] left-[10%] w-2 h-2 rounded-full bg-amber opacity-30 animate-float" />
      <div className="pointer-events-none absolute top-[25%] right-[15%] w-1.5 h-1.5 rounded-full bg-sage opacity-25 animate-float stagger-2" />
      <div className="pointer-events-none absolute bottom-[20%] left-[20%] w-1 h-1 rounded-full bg-amber-soft opacity-20 animate-float stagger-4" />

      {/* Main content */}
      <div className="relative text-center max-w-lg animate-fade-in">
        {/* Logo mark */}
        <div className="mb-8 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber/20 to-amber-soft/10 border border-amber/20">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>

        <h1
          className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Study
          <span className="text-amber">Room</span>
        </h1>

        <p className="text-text-secondary text-lg leading-relaxed mb-3">
          友達と一緒に集中できるオンライン自習室
        </p>
        <p className="text-text-muted text-sm mb-12">
          ルームを作って招待コードを共有。10分集中で1ポイント獲得。
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/signup" className="btn-primary w-full sm:w-auto text-center">
            アカウントを作成
          </Link>
          <Link href="/login" className="btn-ghost w-full sm:w-auto text-center">
            ログイン
          </Link>
        </div>
      </div>

      {/* Footer hint */}
      <div className="absolute bottom-8 text-text-muted text-xs tracking-wide opacity-0 animate-fade-in stagger-5">
        集中を、みんなで。
      </div>
    </div>
  );
}
