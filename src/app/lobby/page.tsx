'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useLobby } from '@/hooks/use-lobby';
import { useMatchmaking } from '@/hooks/use-matchmaking';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ELO_DEFAULT_RATING, MAX_LOBBY_MEMBERS } from '@/lib/constants';
import { IsometricRoom } from '@/components/isometric-room';
import type { User } from '@/types';

export default function LobbyPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const supabase = getSupabaseBrowserClient();

  const displayName = profile?.display_name || user?.user_metadata?.display_name || 'ユーザー';
  const eloRating = profile?.elo_rating ?? ELO_DEFAULT_RATING;

  const { members, leave: leaveLobby } = useLobby({
    userId: user?.id || '',
    displayName,
    eloRating,
  });

  const {
    incomingChallenge,
    outgoingChallengeTo,
    matchStarted,
    sendChallenge,
    acceptChallenge,
    declineChallenge,
    cancelChallenge,
    clearMatchStarted,
  } = useMatchmaking({
    userId: user?.id || '',
    displayName,
  });

  const { isMuted, toggleMute } = useVoiceChat({
    roomId: 'lobby',
    userId: user?.id || '',
  });

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (data) setProfile(data as User);
  }, [user, supabase]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      fetchProfile();
      setReady(true);
    }
  }, [user, authLoading, router, fetchProfile]);

  // Navigate to match when it starts
  useEffect(() => {
    if (matchStarted) {
      clearMatchStarted();
      leaveLobby();
      router.push(`/match/${matchStarted}`);
    }
  }, [matchStarted, clearMatchStarted, leaveLobby, router]);

  const handleSignOut = async () => {
    await leaveLobby();
    await signOut();
    router.push('/');
  };

  if (!ready || authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  // Others in lobby (excluding self)
  const otherMembers = members.filter(m => m.user_id !== user?.id);

  // Member slots for isometric room
  const memberSlots = Array.from({ length: MAX_LOBBY_MEMBERS }, (_, i) => {
    const m = members[i];
    return m ? { user_id: m.user_id, display_name: m.display_name, elo_rating: m.elo_rating } : null;
  });

  return (
    <div className="h-dvh flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-2 sm:px-5 sm:py-3 border-b border-slate-deep/60"
        style={{ paddingTop: 'calc(4px + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber/20 to-amber-soft/10 border border-amber/20 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <div>
            <p className="text-text-primary font-medium text-sm">{displayName}</p>
            <p className="text-text-muted text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
              Rate {eloRating}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/stats')}
            className="btn-ghost text-xs"
            style={{ padding: '6px 14px', fontSize: '0.75rem' }}
          >
            戦績
          </button>
          <button
            onClick={handleSignOut}
            className="btn-ghost text-xs"
            style={{ padding: '6px 14px', fontSize: '0.75rem' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            ログアウト
          </button>
        </div>
      </header>

      {/* Main: Isometric Room */}
      <main className="flex-1 min-h-0 relative overflow-hidden">
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-full h-full -translate-y-[6%]">
            <IsometricRoom
              members={memberSlots}
              currentUserId={user?.id || ''}
              maxSlots={MAX_LOBBY_MEMBERS}
            />
          </div>
        </div>

        {/* Incoming Challenge Modal */}
        {incomingChallenge && (
          <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div className="glass-card p-6 max-w-sm w-full mx-4 animate-fade-in-scale text-center">
              <p className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                対戦申し込み
              </p>
              <p className="text-text-secondary mb-6">
                <span className="text-amber font-medium">{incomingChallenge.fromName}</span> が勝負を挑んでいます
              </p>
              <div className="flex gap-3">
                <button onClick={declineChallenge} className="btn-ghost flex-1">
                  断る
                </button>
                <button onClick={acceptChallenge} className="btn-primary flex-1">
                  受ける
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Outgoing Challenge Overlay */}
        {outgoingChallengeTo && (
          <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div className="glass-card p-6 max-w-sm w-full mx-4 animate-fade-in-scale text-center">
              <div className="w-8 h-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin mx-auto mb-4" />
              <p className="text-text-secondary mb-4">対戦相手の応答を待っています...</p>
              <button onClick={cancelChallenge} className="btn-ghost">
                キャンセル
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer: Player List + Controls */}
      <footer
        className="border-t border-slate-deep/60 px-4 py-3 sm:px-5 sm:py-4"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-lg mx-auto">
          {/* Online Members */}
          {otherMembers.length > 0 ? (
            <div className="mb-3">
              <p className="text-text-muted text-xs mb-2">ロビーにいるプレイヤー</p>
              <div className="flex flex-wrap gap-2">
                {otherMembers.map(m => (
                  <button
                    key={m.user_id}
                    onClick={() => sendChallenge(m.user_id)}
                    disabled={!!outgoingChallengeTo || !!incomingChallenge}
                    className="group inline-flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                    style={{
                      background: 'rgba(158, 196, 176, 0.06)',
                      border: '1px solid rgba(158, 196, 176, 0.15)',
                    }}
                  >
                    <span className="text-text-primary text-sm font-medium">{m.display_name}</span>
                    <span className="text-text-muted text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                      {m.elo_rating}
                    </span>
                    <span className="text-amber text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      対戦
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-text-muted text-xs mb-3 text-center">
              対戦相手を待っています...
            </p>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={toggleMute}
              className="inline-flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-lg hover:bg-slate-mid/30"
              style={{ color: isMuted ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}
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
              マイク
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
