'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { PRESENCE_SYNC_INTERVAL_MS } from '@/lib/constants';
import type { RoomMember } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRoomProps {
  roomId: string;
  userId: string;
  displayName: string;
  isStudying: boolean;
  studyingSeconds: number;
}

export function useRoom({
  roomId,
  userId,
  displayName,
  isStudying,
  studyingSeconds,
}: UseRoomProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = getSupabaseBrowserClient();

  // 最新値をrefで保持（クロージャの stale value 問題を回避）
  const isStudyingRef = useRef(isStudying);
  const studyingSecondsRef = useRef(studyingSeconds);
  const displayNameRef = useRef(displayName);

  useEffect(() => {
    isStudyingRef.current = isStudying;
  }, [isStudying]);

  useEffect(() => {
    studyingSecondsRef.current = studyingSeconds;
  }, [studyingSeconds]);

  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  // track用のヘルパー（常に最新値を使う）
  const getTrackData = () => ({
    display_name: displayNameRef.current,
    status: isStudyingRef.current ? 'studying' : 'away',
    studying_minutes: Math.floor(studyingSecondsRef.current / 60),
    joined_at: new Date().toISOString(),
  });

  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: userId } },
    });

    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const memberList: RoomMember[] = [];

      Object.entries(state).forEach(([key, presences]) => {
        // ダッシュボードのobserverは除外
        if (key.startsWith('_obs_')) return;
        const arr = presences as unknown as Record<string, unknown>[];
        if (arr && arr.length > 0) {
          const p = arr[0];
          memberList.push({
            user_id: key,
            display_name: (p.display_name as string) || 'ユーザー',
            status: (p.status as 'studying' | 'away') || 'away',
            studying_minutes: (p.studying_minutes as number) || 0,
            joined_at: (p.joined_at as string) || new Date().toISOString(),
          });
        }
      });

      setMembers(memberList);
    });

    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(getTrackData());
      }
    });

    // 定期同期（refから最新値を取得するので常に正しい）
    const syncInterval = setInterval(() => {
      channel.track(getTrackData());
    }, PRESENCE_SYNC_INTERVAL_MS);

    // pagehide: ブラウザを閉じる・OSホームに戻る時に即座に離席をtrack
    const handlePageHide = () => {
      channel.track({
        display_name: displayNameRef.current,
        status: 'away',
        studying_minutes: Math.floor(studyingSecondsRef.current / 60),
        joined_at: new Date().toISOString(),
      });
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('pagehide', handlePageHide);
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, supabase]);

  // isStudying 変更時に即座にtrack
  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.track(getTrackData());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudying]);

  return { members };
}
