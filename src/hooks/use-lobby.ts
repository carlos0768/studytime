'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { LOBBY_SYNC_INTERVAL_MS } from '@/lib/constants';
import type { LobbyMember } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseLobbyProps {
  userId: string;
  displayName: string;
  eloRating: number;
}

export function useLobby({ userId, displayName, eloRating }: UseLobbyProps) {
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = getSupabaseBrowserClient();

  const userIdRef = useRef(userId);
  const displayNameRef = useRef(displayName);
  const eloRatingRef = useRef(eloRating);

  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { eloRatingRef.current = eloRating; }, [eloRating]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('lobby', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{
          user_id: string;
          display_name: string;
          elo_rating: number;
          joined_at: string;
        }>();
        const list: LobbyMember[] = [];
        for (const presences of Object.values(state)) {
          if (presences[0]) {
            list.push({
              user_id: presences[0].user_id,
              display_name: presences[0].display_name,
              elo_rating: presences[0].elo_rating,
              joined_at: presences[0].joined_at,
            });
          }
        }
        setMembers(list);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        channelRef.current = channel;
        await channel.track({
          user_id: userIdRef.current,
          display_name: displayNameRef.current,
          elo_rating: eloRatingRef.current,
          joined_at: new Date().toISOString(),
        });
      });

    // Periodic re-track to keep presence alive
    const interval = setInterval(async () => {
      if (channelRef.current) {
        await channelRef.current.track({
          user_id: userIdRef.current,
          display_name: displayNameRef.current,
          elo_rating: eloRatingRef.current,
          joined_at: new Date().toISOString(),
        });
      }
    }, LOBBY_SYNC_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      channel.untrack();
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [userId, supabase]);

  const leave = useCallback(async () => {
    if (channelRef.current) {
      await channelRef.current.untrack();
    }
  }, []);

  return { members, leave };
}
