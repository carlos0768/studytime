'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  PRESENCE_STALE_THRESHOLD_MS,
  PRESENCE_SYNC_INTERVAL_MS,
} from '@/lib/constants';
import type { RoomMember } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRoomProps {
  roomId: string;
  userId: string;
  displayName: string;
  isStudying: boolean;
  studyingSeconds: number;
}

const PRESENCE_RECHECK_INTERVAL_MS = 5_000;

function parsePresenceTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function getPresenceUpdatedAt(meta: Record<string, unknown>): number | null {
  return (
    parsePresenceTimestamp(meta.last_seen_at) ??
    parsePresenceTimestamp(meta.joined_at)
  );
}

function isPresenceFresh(meta: Record<string, unknown>, now: number): boolean {
  const updatedAt = getPresenceUpdatedAt(meta);
  if (updatedAt === null) return true;
  return now - updatedAt <= PRESENCE_STALE_THRESHOLD_MS;
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
    last_seen_at: new Date().toISOString(),
  });

  useEffect(() => {
    if (!roomId || !userId) {
      return;
    }

    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: userId } },
    });

    channelRef.current = channel;

    const syncMembers = () => {
      const state = channel.presenceState();
      const memberList: RoomMember[] = [];
      const now = Date.now();

      Object.entries(state).forEach(([key, presences]) => {
        // ダッシュボードのobserverは除外
        if (!key || key.startsWith('_obs_')) return;
        const arr = presences as unknown as Record<string, unknown>[];
        if (!arr || arr.length === 0) return;

        const fresh = arr.filter((p) => isPresenceFresh(p, now));
        if (fresh.length === 0) return;

        const latest = fresh.reduce((best, current) => {
          const bestAt = getPresenceUpdatedAt(best) ?? 0;
          const currentAt = getPresenceUpdatedAt(current) ?? 0;
          return currentAt >= bestAt ? current : best;
        });

        memberList.push({
          user_id: key,
          display_name: (latest.display_name as string) || 'ユーザー',
          status: (latest.status as 'studying' | 'away') || 'away',
          studying_minutes: (latest.studying_minutes as number) || 0,
          joined_at:
            (latest.joined_at as string) ||
            (latest.last_seen_at as string) ||
            new Date().toISOString(),
        });
      });

      setMembers(memberList);
    };

    channel.on('presence', { event: 'sync' }, syncMembers);

    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(getTrackData());
        syncMembers();
      }
    });

    // 定期同期（refから最新値を取得するので常に正しい）
    const syncInterval = setInterval(() => {
      channel.track(getTrackData());
    }, PRESENCE_SYNC_INTERVAL_MS);
    const recheckInterval = setInterval(
      syncMembers,
      PRESENCE_RECHECK_INTERVAL_MS
    );

    // pagehide/beforeunload: ブラウザを閉じる・ページ離脱時にプレゼンスを即削除
    const handleLeave = () => {
      channel.untrack();
    };
    window.addEventListener('pagehide', handleLeave);
    window.addEventListener('beforeunload', handleLeave);

    return () => {
      clearInterval(syncInterval);
      clearInterval(recheckInterval);
      window.removeEventListener('pagehide', handleLeave);
      window.removeEventListener('beforeunload', handleLeave);
      channel.untrack();
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId, userId, supabase]);

  // isStudying 変更時に即座にtrack
  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.track(getTrackData());
    }
  }, [isStudying]);

  const leave = async () => {
    if (channelRef.current) {
      await channelRef.current.untrack();
      await channelRef.current.unsubscribe();
      channelRef.current = null;
    }
  };

  return { members, leave };
}
