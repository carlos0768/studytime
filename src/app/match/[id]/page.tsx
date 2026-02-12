'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useMatch } from '@/hooks/use-match';
import { SaunaClock } from '@/components/sauna-clock';

export default function MatchPage() {
  const params = useParams();
  const matchId = params.id as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);
  const [confirmGiveup, setConfirmGiveup] = useState(false);

  const { status, result, elapsedSeconds, giveUp } = useMatch({
    matchId,
    userId: user?.id || '',
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) setReady(true);
  }, [user, authLoading, router]);

  // Navigate to result when match ends
  useEffect(() => {
    if (status === 'ended') {
      if (result) {
        sessionStorage.setItem(`match_result_${matchId}`, JSON.stringify(result));
        router.push(`/result/${matchId}`);
      } else {
        // API failed but match is over — wait a moment then go to lobby
        const timer = setTimeout(() => router.push('/lobby'), 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [status, result, matchId, router]);

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

  if (!ready || authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  const handleGiveUp = async () => {
    if (!confirmGiveup) {
      setConfirmGiveup(true);
      return;
    }
    await giveUp();
  };

  return (
    <div className="h-dvh flex flex-col items-center justify-center bg-black select-none">
      <p
        className="text-text-muted text-lg tracking-widest mb-8 opacity-40"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        対戦中
      </p>

      {/* Sauna clock */}
      <div className="mb-10">
        <SaunaClock elapsedSeconds={elapsedSeconds} />
      </div>

      {/* Giveup button */}
      <div className="flex flex-col items-center gap-3">
        {!confirmGiveup ? (
          <button
            onClick={() => setConfirmGiveup(true)}
            className="px-8 py-3 rounded-lg text-sm transition-all"
            style={{
              background: 'rgba(51, 51, 51, 0.3)',
              border: '1px solid rgba(51, 51, 51, 0.5)',
              color: 'var(--color-text-muted)',
            }}
          >
            ギブアップ
          </button>
        ) : (
          <>
            <p className="text-rose-muted text-sm mb-1">本当にギブアップしますか？</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmGiveup(false)}
                className="px-6 py-2.5 rounded-lg text-sm transition-all"
                style={{
                  background: 'rgba(51, 51, 51, 0.3)',
                  border: '1px solid rgba(51, 51, 51, 0.5)',
                  color: 'var(--color-text-muted)',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={giveUp}
                className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: 'rgba(201, 123, 123, 0.15)',
                  border: '1px solid rgba(201, 123, 123, 0.4)',
                  color: 'var(--color-rose-muted)',
                }}
              >
                ギブアップする
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
