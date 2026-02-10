'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * 複数ルームのオンライン人数をリアルタイムで監視するフック
 * ダッシュボード用（自身のtrackは行わない・読み取り専用）
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

    const newChannels: RealtimeChannel[] = [];

    for (const roomId of roomIds) {
      // ダッシュボード用の読み取り専用チャンネル（キーを分けて衝突回避）
      const channel = supabase.channel(`dashboard:${roomId}`, {
        config: { presence: { key: `observer_${Math.random().toString(36).slice(2)}` } },
      });

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        // observerキーは除外してカウント
        const count = Object.keys(state).filter(
          (k) => !k.startsWith('observer_')
        ).length;
        setCounts((prev) => {
          if (prev[roomId] === count) return prev;
          return { ...prev, [roomId]: count };
        });
      });

      channel.subscribe();
      newChannels.push(channel);
    }

    channelsRef.current = newChannels;

    return () => {
      newChannels.forEach((ch) => ch.unsubscribe());
      channelsRef.current = [];
    };
    // roomIds配列の内容が変わったときだけ再実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIds.join(','), supabase]);

  return counts;
}
