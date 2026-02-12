'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useMatch } from '@/hooks/use-match';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { SaunaClock } from '@/components/sauna-clock';

export default function MatchPage() {
  const params = useParams();
  const matchId = params.id as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [confirmGiveup, setConfirmGiveup] = useState(false);

  const { status, result, elapsedSeconds, giveUp } = useMatch({
    matchId,
    userId: user?.id || '',
  });
  const { isMuted, micAvailable, toggleMute } = useVoiceChat({
    roomId: `match-${matchId}`,
    userId: user?.id || '',
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
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

  if (authLoading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col items-center justify-center bg-black select-none relative">
      <div
        className="absolute right-4 top-4 sm:right-5 sm:top-5 z-20 flex flex-col items-end gap-1"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          onClick={toggleMute}
          className="inline-flex items-center gap-2 text-xs transition-colors px-3 py-2 rounded-lg hover:bg-slate-mid/30"
          style={{ color: isMuted ? 'var(--color-text-muted)' : 'var(--color-sage)' }}
        >
          {isMuted ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          )}
          {isMuted ? 'マイクOFF' : 'マイクON'}
        </button>
        {!micAvailable && (
          <p className="text-[10px] text-text-muted">
            クリックでマイク許可
          </p>
        )}
      </div>

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
