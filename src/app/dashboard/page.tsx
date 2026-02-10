'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useRoomPresenceCounts } from '@/hooks/use-room-presence';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Room, User } from '@/types';

export default function DashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalName, setModalName] = useState('');
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const supabase = getSupabaseBrowserClient();

  // プロフィール取得
  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data);
  }, [user, supabase]);

  // 自分が関わったルーム一覧取得（所有 + 参加履歴）— 最近入室した順
  const fetchRooms = useCallback(async () => {
    if (!user) return;

    // 1) 所有ルーム
    const { data: ownedRooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('owner_id', user.id)
      .eq('is_active', true);

    // 2) 参加履歴から room_id + 最終入室日時を取得
    const { data: sessions } = await supabase
      .from('study_sessions')
      .select('room_id, started_at')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false });

    // 各ルームの最新入室日時を記録
    const lastVisitMap = new Map<string, string>();
    for (const s of sessions || []) {
      if (!lastVisitMap.has(s.room_id)) {
        lastVisitMap.set(s.room_id, s.started_at);
      }
    }

    const visitedRoomIds = [...lastVisitMap.keys()];

    // 所有ルームIDを除外して、参加のみのIDを抽出
    const ownedIds = new Set((ownedRooms || []).map((r) => r.id));
    const extraIds = visitedRoomIds.filter((id) => !ownedIds.has(id));

    let visitedRooms: Room[] = [];
    if (extraIds.length > 0) {
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .in('id', extraIds)
        .eq('is_active', true);
      if (data) visitedRooms = data;
    }

    // マージして最近入室した順にソート（セッションがないものはcreated_atをフォールバック）
    const all = [...(ownedRooms || []), ...visitedRooms];
    // 重複排除
    const seen = new Set<string>();
    const unique = all.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    unique.sort((a, b) => {
      const aTime = lastVisitMap.get(a.id) || a.created_at;
      const bTime = lastVisitMap.get(b.id) || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    setRooms(unique);
  }, [user, supabase]);

  // ルームIDリスト（メモ化して不要な再subscribe防止）
  const roomIds = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const presenceCounts = useRoomPresenceCounts(roomIds);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    fetchProfile();
    fetchRooms();
  }, [user, authLoading, router, fetchProfile, fetchRooms]);

  // ルーム作成
  const handleCreateRoom = async () => {
    setModalError('');
    if (modalPassword.length < 4) {
      setModalError('パスワードは4文字以上必要です');
      return;
    }
    setModalLoading(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modalName || undefined,
          password: modalPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || 'エラーが発生しました');
        return;
      }
      router.push(`/room/${data.room.id}`);
    } catch {
      setModalError('ルームの作成に失敗しました');
    } finally {
      setModalLoading(false);
    }
  };

  // ルーム参加
  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoinLoading(true);
    router.push(`/join/${joinCode.toUpperCase()}`);
  };

  // ログアウト
  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  const displayName =
    profile?.display_name ||
    user?.user_metadata?.display_name ||
    'ユーザー';

  return (
    <div className="min-h-dvh flex flex-col items-center px-6 sm:px-10 py-12 sm:py-16">
      {/* Background ambient */}
      <div
        className="pointer-events-none fixed top-[-15%] left-[50%] translate-x-[-50%] w-[700px] h-[700px] rounded-full opacity-[0.06]"
        style={{
          background:
            'radial-gradient(circle, var(--color-sage) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-xl flex flex-col" style={{ gap: '3rem' }}>
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber/20 to-amber-soft/10 border border-amber/20 flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-amber"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <div>
              <p className="text-text-primary font-medium text-sm">{displayName}</p>
              <p className="text-text-muted text-xs">ダッシュボード</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="btn-ghost text-sm"
            style={{ padding: '8px 18px', fontSize: '0.8rem' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            ログアウト
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-5 animate-fade-in stagger-1">
          <div className="glass-card p-6">
            <p className="text-text-muted text-xs uppercase tracking-wider mb-3">
              累計勉強時間
            </p>
            <p
              className="text-3xl font-bold text-text-primary"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {profile?.total_minutes
                ? `${Math.floor(profile.total_minutes / 60)}h ${profile.total_minutes % 60}m`
                : '0h 0m'}
            </p>
          </div>
          <div className="glass-card p-6">
            <p className="text-text-muted text-xs uppercase tracking-wider mb-3">
              累計ポイント
            </p>
            <p
              className="text-3xl font-bold text-amber"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {profile?.total_points || 0}
              <span className="text-base font-normal text-text-muted ml-1">pt</span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="animate-fade-in stagger-2" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary w-full py-3.5 text-base"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            自習室を作る
          </button>

          <div className="flex gap-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="input-field flex-1 uppercase tracking-widest text-center py-3.5"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem' }}
              placeholder="ルームコード"
              maxLength={6}
            />
            <button
              onClick={handleJoin}
              className="btn-ghost px-8 py-3.5"
              disabled={joinLoading || !joinCode.trim()}
            >
              {joinLoading ? (
                <span className="inline-block w-4 h-4 border-2 border-text-muted/30 border-t-text-primary rounded-full animate-spin" />
              ) : (
                '参加'
              )}
            </button>
          </div>
        </div>

        {/* My Rooms */}
        <div className="animate-fade-in stagger-3">
          <h2 className="text-text-secondary text-sm font-medium mb-5 uppercase tracking-wider">
            あなたの自習室
          </h2>
          {rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12" style={{ opacity: 0.4 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted mb-4">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <p className="text-text-muted text-sm">
                まだ自習室を作っていません
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: '14px' }}>
                {rooms.map((room, i) => {
                  const accents = [
                    { bg: 'rgba(158, 196, 176, 0.06)', glow: 'rgba(158, 196, 176, 0.10)', dot: 'rgba(158, 196, 176, 0.5)' },
                    { bg: 'rgba(150, 178, 204, 0.06)', glow: 'rgba(150, 178, 204, 0.10)', dot: 'rgba(150, 178, 204, 0.5)' },
                    { bg: 'rgba(170, 160, 196, 0.06)', glow: 'rgba(170, 160, 196, 0.10)', dot: 'rgba(170, 160, 196, 0.5)' },
                    { bg: 'rgba(200, 178, 158, 0.06)', glow: 'rgba(200, 178, 158, 0.10)', dot: 'rgba(200, 178, 158, 0.5)' },
                    { bg: 'rgba(192, 160, 172, 0.06)', glow: 'rgba(192, 160, 172, 0.10)', dot: 'rgba(192, 160, 172, 0.5)' },
                  ];
                  const accent = accents[i % accents.length];
                  return (
                    <button
                      key={room.id}
                      onClick={() => router.push(`/room/${room.id}`)}
                      className="group cursor-pointer text-left"
                      style={{
                        background: accent.bg,
                        borderRadius: '18px',
                        padding: '20px 18px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '140px',
                        position: 'relative',
                        overflow: 'hidden',
                        border: 'none',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        boxShadow: `0 0 0 1px ${accent.glow}, 0 2px 12px rgba(0,0,0,0.15)`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
                        e.currentTarget.style.boxShadow = `0 0 0 1px ${accent.dot}, 0 8px 24px rgba(0,0,0,0.25)`;
                        const hint = e.currentTarget.querySelector('[data-hint]') as HTMLElement | null;
                        if (hint) hint.style.opacity = '0.7';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow = `0 0 0 1px ${accent.glow}, 0 2px 12px rgba(0,0,0,0.15)`;
                        const hint = e.currentTarget.querySelector('[data-hint]') as HTMLElement | null;
                        if (hint) hint.style.opacity = '0.35';
                      }}
                    >
                      {/* Corner glow */}
                      <div style={{
                        position: 'absolute',
                        top: '-20px',
                        right: '-20px',
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: accent.dot,
                        opacity: 0.06,
                        filter: 'blur(20px)',
                        pointerEvents: 'none',
                      }} />

                      {/* Top row: online count + code */}
                      <div className="flex items-center justify-between" style={{ marginBottom: '14px' }}>
                        {(() => {
                          const online = presenceCounts[room.id] || 0;
                          return (
                            <div className="flex items-center gap-1.5">
                              <div style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: online > 0 ? accent.dot : 'rgba(255,255,255,0.15)',
                                boxShadow: online > 0 ? `0 0 5px ${accent.dot}` : 'none',
                                flexShrink: 0,
                              }} />
                              <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.6rem',
                                color: online > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)',
                                letterSpacing: '0.02em',
                              }}>
                                {online > 0 ? `${online}人` : '---'}
                              </span>
                            </div>
                          );
                        })()}
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.58rem',
                          letterSpacing: '0.18em',
                          color: 'rgba(255,255,255,0.3)',
                          background: 'rgba(255,255,255,0.04)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                        }}>
                          {room.code}
                        </span>
                      </div>

                      {/* Room name */}
                      <p className="font-medium" style={{
                        fontSize: '0.85rem',
                        color: 'rgba(255,255,255,0.88)',
                        lineHeight: '1.35',
                        letterSpacing: '-0.01em',
                      }}>
                        {room.name}
                      </p>

                      {/* Bottom: enter hint */}
                      <div className="flex items-center justify-end" style={{ marginTop: '12px' }}>
                        <div
                          data-hint
                          className="flex items-center gap-1.5"
                          style={{ opacity: 0.35, transition: 'opacity 0.15s' }}
                        >
                          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)' }}>入室</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
      </div>

      {/* Create Room Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(15, 15, 26, 0.8)', backdropFilter: 'blur(4px)' }}
        >
          <div className="glass-card p-6 w-full max-w-sm animate-fade-in-scale">
            <h3
              className="text-xl font-bold mb-6"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              自習室を作る
            </h3>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-soft border border-rose-muted/30 text-rose-muted text-sm">
                {modalError}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-text-secondary text-sm font-medium mb-2">
                  自習室名（オプション）
                </label>
                <input
                  type="text"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className="input-field"
                  placeholder={`${displayName}の自習室`}
                />
              </div>
              <div>
                <label className="block text-text-secondary text-sm font-medium mb-2">
                  パスワード（4文字以上）
                </label>
                <input
                  type="password"
                  value={modalPassword}
                  onChange={(e) => setModalPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••"
                  minLength={4}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setModalError('');
                  setModalName('');
                  setModalPassword('');
                }}
                className="btn-ghost flex-1"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateRoom}
                className="btn-primary flex-1"
                disabled={modalLoading}
              >
                {modalLoading ? (
                  <span className="inline-block w-4 h-4 border-2 border-midnight/30 border-t-midnight rounded-full animate-spin" />
                ) : (
                  '作成'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
