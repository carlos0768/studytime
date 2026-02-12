'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useLobby } from '@/hooks/use-lobby';
import { ELO_DEFAULT_RATING } from '@/lib/constants';
import type { User } from '@/types';

interface MatchHistoryEntry {
  id: string;
  isWinner: boolean;
  opponentName: string;
  eloChange: number;
  duration_seconds: number;
  end_reason: string;
  ended_at: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function formatStudyTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function StatsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [eloForLobby, setEloForLobby] = useState(ELO_DEFAULT_RATING);
  const [nameForLobby, setNameForLobby] = useState('');

  // Keep lobby presence alive while viewing stats
  useLobby({
    userId: user?.id || '',
    displayName: nameForLobby || user?.user_metadata?.display_name || '',
    eloRating: eloForLobby,
  });

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/matches/history?limit=30'),
      ]);
      const statsData = await statsRes.json();
      const historyData = await historyRes.json();
      if (statsData.profile) {
        setProfile(statsData.profile);
        setEloForLobby(statsData.profile.elo_rating);
        setNameForLobby(statsData.profile.display_name);
      }
      if (historyData.matches) setMatches(historyData.matches);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) fetchData();
  }, [user, authLoading, router, fetchData]);

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  const winRate = profile && profile.total_matches > 0
    ? Math.round((profile.total_wins / profile.total_matches) * 100)
    : 0;

  return (
    <div className="min-h-dvh flex flex-col items-center px-6 sm:px-10 py-12 sm:py-16">
      {/* Background */}
      <div
        className="pointer-events-none fixed top-[-15%] left-[50%] translate-x-[-50%] w-[700px] h-[700px] rounded-full opacity-[0.06]"
        style={{ background: 'radial-gradient(circle, var(--color-sage) 0%, transparent 70%)' }}
      />

      <div className="relative w-full max-w-xl flex flex-col" style={{ gap: '2rem' }}>
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <button
            onClick={() => router.push('/lobby')}
            className="inline-flex items-center gap-2 text-text-muted text-sm hover:text-text-secondary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            ロビーに戻る
          </button>
        </div>

        {/* Profile card */}
        <div className="glass-card p-6 animate-fade-in stagger-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-text-primary font-medium text-lg">{profile?.display_name || 'ユーザー'}</p>
              <p className="text-text-muted text-xs">戦績</p>
            </div>
            <div className="text-right">
              <p
                className="text-3xl font-bold text-amber"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {profile?.elo_rating || 1500}
              </p>
              <p className="text-text-muted text-xs">Rate</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-xl font-bold text-text-primary" style={{ fontFamily: 'var(--font-mono)' }}>
                {profile?.total_matches || 0}
              </p>
              <p className="text-text-muted text-xs">試合数</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-sage" style={{ fontFamily: 'var(--font-mono)' }}>
                {profile?.total_wins || 0}
              </p>
              <p className="text-text-muted text-xs">勝利</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-rose-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                {profile?.total_losses || 0}
              </p>
              <p className="text-text-muted text-xs">敗北</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-text-primary" style={{ fontFamily: 'var(--font-mono)' }}>
                {winRate}%
              </p>
              <p className="text-text-muted text-xs">勝率</p>
            </div>
          </div>
        </div>

        {/* Total study time */}
        <div className="glass-card p-5 animate-fade-in stagger-2">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-2">総勉強時間</p>
          <p className="text-2xl font-bold text-text-primary" style={{ fontFamily: 'var(--font-mono)' }}>
            {formatStudyTime(profile?.total_study_seconds || 0)}
          </p>
        </div>

        {/* Match History */}
        <div className="animate-fade-in stagger-3">
          <h2 className="text-text-secondary text-sm font-medium mb-4 uppercase tracking-wider">
            対戦履歴
          </h2>
          {matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12" style={{ opacity: 0.4 }}>
              <p className="text-text-muted text-sm">まだ対戦がありません</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {matches.map(m => {
                const eloSign = m.eloChange >= 0 ? '+' : '';
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-4 py-3 rounded-lg"
                    style={{
                      background: m.isWinner
                        ? 'rgba(158, 196, 176, 0.04)'
                        : 'rgba(201, 123, 123, 0.04)',
                      border: `1px solid ${m.isWinner ? 'rgba(158, 196, 176, 0.1)' : 'rgba(201, 123, 123, 0.1)'}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{
                          background: m.isWinner ? 'rgba(158, 196, 176, 0.15)' : 'rgba(201, 123, 123, 0.15)',
                          color: m.isWinner ? 'var(--color-sage)' : 'var(--color-rose-muted)',
                        }}
                      >
                        {m.isWinner ? 'WIN' : 'LOSE'}
                      </span>
                      <div>
                        <p className="text-text-primary text-sm font-medium">
                          vs {m.opponentName}
                        </p>
                        <p className="text-text-muted text-xs">
                          {formatDuration(m.duration_seconds || 0)}
                          {m.end_reason === 'giveup' && ' · ギブアップ'}
                          {m.end_reason === 'tab_hidden' && ' · 離席'}
                          {m.end_reason === 'disconnect' && ' · 切断'}
                        </p>
                      </div>
                    </div>
                    <span
                      className="text-sm font-bold"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: m.eloChange >= 0 ? 'var(--color-sage)' : 'var(--color-rose-muted)',
                      }}
                    >
                      {eloSign}{m.eloChange}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
