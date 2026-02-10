'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

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

    if (roomIds.length === 0) return;

    const observerId = `_obs_${Math.random().toString(36).slice(2)}`;
    const newChannels: RealtimeChannel[] = [];

    for (const roomId of roomIds) {
      // ルームと同じチャンネル名に接続（プレゼンス情報を共有）
      const channel = supabase.channel(`room:${roomId}`, {
        config: { presence: { key: observerId } },
      });

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        // observer キー（_obs_ で始まる）は除外してカウント
        const count = Object.keys(state).filter(
          (k) => !k.startsWith('_obs_')
        ).length;
        setCounts((prev) => {
          if (prev[roomId] === count) return prev;
          return { ...prev, [roomId]: count };
        });
      });

      channel.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          // observerとしてtrackしてプレゼンス同期を有効化
          await channel.track({ role: 'observer' });
        }
      });

      newChannels.push(channel);
    }

    channelsRef.current = newChannels;

    return () => {
      newChannels.forEach((ch) => ch.unsubscribe());
      channelsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIds.join(','), supabase]);

  return counts;
}
