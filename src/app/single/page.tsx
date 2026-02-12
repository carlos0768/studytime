'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { SaunaClock } from '@/components/sauna-clock';

export default function SinglePlayPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [user]);

  // Prevent scroll
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('room-scroll-lock');
    body.classList.add('room-scroll-lock');
    return () => {
      html.classList.remove('room-scroll-lock');
      body.classList.remove('room-scroll-lock');
    };
  }, []);

  // Wake lock
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const request = async () => {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    };
    request();
    const onVisChange = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      wakeLock?.release();
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, []);

  if (authLoading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col items-center justify-center bg-black select-none">
      <p
        className="text-text-muted text-lg tracking-widest mb-8 opacity-40"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        シングルプレイ中
      </p>

      <div className="mb-10">
        <SaunaClock elapsedSeconds={elapsedSeconds} />
      </div>

      <div className="flex flex-col items-center gap-3">
        {!confirmFinish ? (
          <button
            onClick={() => setConfirmFinish(true)}
            className="px-8 py-3 rounded-lg text-sm transition-all"
            style={{
              background: 'rgba(51, 51, 51, 0.3)',
              border: '1px solid rgba(51, 51, 51, 0.5)',
              color: 'var(--color-text-muted)',
            }}
          >
            終了する
          </button>
        ) : (
          <>
            <p className="text-text-muted text-sm mb-1">ロビーに戻りますか？</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmFinish(false)}
                className="px-6 py-2.5 rounded-lg text-sm transition-all"
                style={{
                  background: 'rgba(51, 51, 51, 0.3)',
                  border: '1px solid rgba(51, 51, 51, 0.5)',
                  color: 'var(--color-text-muted)',
                }}
              >
                続ける
              </button>
              <button
                onClick={() => router.push('/lobby')}
                className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: 'rgba(158, 196, 176, 0.15)',
                  border: '1px solid rgba(158, 196, 176, 0.4)',
                  color: 'var(--color-sage)',
                }}
              >
                ロビーへ戻る
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
