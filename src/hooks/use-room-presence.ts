'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { PRESENCE_STALE_THRESHOLD_MS } from '@/lib/constants';
import type { RealtimeChannel } from '@supabase/supabase-js';

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

function hasFreshPresence(
  presences: Record<string, unknown>[],
  now: number
): boolean {
  return presences.some((presence) => {
    const updatedAt = getPresenceUpdatedAt(presence);
    if (updatedAt === null) return true;
    return now - updatedAt <= PRESENCE_STALE_THRESHOLD_MS;
  });
}

/**
 * 複数ルームのオンライン人数をリアルタイムで監視するフック
 * ダッシュボード用 — ルームと同じチャンネル名 `room:${id}` に接続し、
 * observer用のキーでtrackして他のメンバーのプレゼンスを読み取る
 */
export function useRoomPresenceCounts(roomIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    // 前回のチャンネルをクリーンアップ
    channelsRef.current.forEach((ch) => ch.unsubscribe());
    channelsRef.current = [];
    setCounts({});

    if (roomIds.length === 0) return;

    const observerId = `_obs_${Math.random().toString(36).slice(2)}`;
    const newChannels: RealtimeChannel[] = [];
    const refreshers: Array<() => void> = [];

    for (const roomId of roomIds) {
      // ルームと同じチャンネル名に接続（プレゼンス情報を共有）
      const channel = supabase.channel(`room:${roomId}`, {
        config: { presence: { key: observerId } },
      });

      const refreshCount = () => {
        const now = Date.now();
        const state = channel.presenceState();
        const count = Object.entries(state).filter(([key, presences]) => {
          if (!key || key.startsWith('_obs_')) return false;
          const arr = presences as unknown as Record<string, unknown>[];
          if (!arr || arr.length === 0) return false;
          return hasFreshPresence(arr, now);
        }).length;
        setCounts((prev) => {
          if (prev[roomId] === count) return prev;
          return { ...prev, [roomId]: count };
        });
      };

      channel.on('presence', { event: 'sync' }, refreshCount);

      channel.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          // observerとしてtrackしてプレゼンス同期を有効化
          await channel.track({ role: 'observer' });
          refreshCount();
        }
      });

      newChannels.push(channel);
      refreshers.push(refreshCount);
    }

    channelsRef.current = newChannels;
    const recheckInterval = setInterval(() => {
      refreshers.forEach((refresh) => refresh());
    }, PRESENCE_RECHECK_INTERVAL_MS);

    return () => {
      clearInterval(recheckInterval);
      newChannels.forEach((ch) => ch.unsubscribe());
      channelsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIds.join(','), supabase]);

  return counts;
}
