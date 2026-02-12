'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import type { MatchResult } from '@/types';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}時間${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export default function ResultPage() {
  const params = useParams();
  const matchId = params.id as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const { isMuted, toggleMute } = useVoiceChat({
    roomId: `result:${matchId}`,
    userId: user?.id || '',
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!user) return;

    // Load result from sessionStorage first
    const stored = sessionStorage.getItem(`match_result_${matchId}`);
    if (stored) {
      try {
        setResult(JSON.parse(stored));
        return;
      } catch {}
    }

    // Fallback: fetch result from API (e.g., tab_hidden loss where sendBeacon had no response)
    const fetchResult = async () => {
      try {
        // First try: the match may already be ended (by sendBeacon or opponent)
        // Send with caller's own id as loser_id — if match is already ended,
        // the API uses caller_id for perspective regardless of loser_id
        const res = await fetch('/api/matches/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            match_id: matchId,
            loser_id: user.id,
            caller_id: user.id,
            reason: 'tab_hidden',
          }),
        });
        const data = await res.json();
        if (data.result) {
          setResult(data.result);
          sessionStorage.setItem(`match_result_${matchId}`, JSON.stringify(data.result));
        } else {
          setLoadFailed(true);
        }
      } catch {
        setLoadFailed(true);
      }
    };
    fetchResult();
  }, [matchId, user, authLoading, router]);

  if (authLoading || (!result && !loadFailed)) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-text-muted text-sm">対戦結果を取得できませんでした</p>
        <button onClick={() => router.push('/lobby')} className="btn-primary">
          ロビーに戻る
        </button>
      </div>
    );
  }

  const eloSign = result.eloChange >= 0 ? '+' : '';

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6">
      {/* Background */}
      <div
        className="pointer-events-none fixed top-[-15%] left-[50%] translate-x-[-50%] w-[700px] h-[700px] rounded-full opacity-[0.06]"
        style={{
          background: result.isWinner
            ? 'radial-gradient(circle, var(--color-sage) 0%, transparent 70%)'
            : 'radial-gradient(circle, var(--color-rose-muted) 0%, transparent 70%)',
        }}
      />

      <div className="relative text-center max-w-sm w-full animate-fade-in">
        {/* Win/Loss */}
        <p
          className="text-6xl font-extrabold mb-2 tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            color: result.isWinner ? 'var(--color-sage)' : 'var(--color-rose-muted)',
          }}
        >
          {result.isWinner ? 'WIN' : 'LOSE'}
        </p>
        <p className="text-text-muted text-sm mb-10">
          vs {result.opponentName}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-10">
          <div className="glass-card p-5">
            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">対戦時間</p>
            <p className="text-2xl font-bold text-text-primary" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatDuration(result.durationSeconds)}
            </p>
          </div>
          <div className="glass-card p-5">
            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">レート変動</p>
            <p
              className="text-2xl font-bold"
              style={{
                fontFamily: 'var(--font-mono)',
                color: result.eloChange >= 0 ? 'var(--color-sage)' : 'var(--color-rose-muted)',
              }}
            >
              {eloSign}{result.eloChange}
            </p>
            <p className="text-text-muted text-xs mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
              {result.eloBefore} → {result.eloAfter}
            </p>
          </div>
        </div>

        {/* Voice chat for post-game */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <button
            onClick={toggleMute}
            className="inline-flex items-center gap-2 text-sm transition-colors px-4 py-2 rounded-lg"
            style={{
              background: 'rgba(51, 51, 51, 0.3)',
              border: '1px solid rgba(51, 51, 51, 0.5)',
              color: isMuted ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
            }}
          >
            {isMuted ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
            感想戦
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/lobby')}
            className="btn-primary w-full"
          >
            ロビーに戻る
          </button>
          <button
            onClick={() => router.push('/stats')}
            className="btn-ghost w-full"
          >
            戦績を見る
          </button>
        </div>
      </div>
    </div>
  );
}
