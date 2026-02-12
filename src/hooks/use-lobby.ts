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

type LobbyPresenceMeta = {
  user_id: string;
  display_name: string;
  elo_rating: number;
  joined_at: string;
};

const LOBBY_RECONNECT_BASE_DELAY_MS = 700;
const LOBBY_RECONNECT_MAX_DELAY_MS = 6_000;

export function useLobby({ userId, displayName, eloRating }: UseLobbyProps) {
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = getSupabaseBrowserClient();

  const userIdRef = useRef(userId);
  const displayNameRef = useRef(displayName);
  const eloRatingRef = useRef(eloRating);
  const sessionJoinedAtRef = useRef(new Date().toISOString());

  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { eloRatingRef.current = eloRating; }, [eloRating]);
  useEffect(() => {
    sessionJoinedAtRef.current = new Date().toISOString();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let disposed = false;
    let currentChannel: RealtimeChannel | null = null;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    const clearKeepAlive = () => {
      if (!keepAliveTimer) return;
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    };

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const trackPresence = async (channel: RealtimeChannel) => {
      try {
        await channel.track({
          user_id: userIdRef.current,
          display_name: displayNameRef.current,
          elo_rating: eloRatingRef.current,
          joined_at: sessionJoinedAtRef.current,
        });
      } catch (err) {
        console.warn('Lobby presence track failed:', err);
      }
    };

    const buildMembers = (state: Record<string, LobbyPresenceMeta[]>) => {
      const list: LobbyMember[] = [];
      for (const presences of Object.values(state)) {
        if (!Array.isArray(presences) || presences.length === 0) continue;
        const latest = presences.reduce((prev, current) => {
          const prevTs = Date.parse(prev.joined_at || '');
          const currentTs = Date.parse(current.joined_at || '');
          if (Number.isNaN(prevTs)) return current;
          if (Number.isNaN(currentTs)) return prev;
          return currentTs >= prevTs ? current : prev;
        });
        if (!latest?.user_id) continue;
        list.push({
          user_id: latest.user_id,
          display_name: latest.display_name || 'ユーザー',
          elo_rating: typeof latest.elo_rating === 'number' ? latest.elo_rating : 1500,
          joined_at: latest.joined_at || new Date().toISOString(),
        });
      }
      list.sort((a, b) => {
        const aTs = Date.parse(a.joined_at);
        const bTs = Date.parse(b.joined_at);
        const safeATs = Number.isNaN(aTs) ? 0 : aTs;
        const safeBTs = Number.isNaN(bTs) ? 0 : bTs;
        if (safeATs !== safeBTs) return safeATs - safeBTs;
        return a.user_id.localeCompare(b.user_id);
      });
      setMembers(list);
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      const delay = Math.min(
        LOBBY_RECONNECT_BASE_DELAY_MS * (2 ** reconnectAttempts),
        LOBBY_RECONNECT_MAX_DELAY_MS
      );
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      clearKeepAlive();
      clearReconnectTimer();

      if (currentChannel) {
        void currentChannel.untrack();
        currentChannel.unsubscribe();
      }

      const channel = supabase.channel('lobby', {
        config: { presence: { key: userIdRef.current } },
      });
      currentChannel = channel;
      channelRef.current = channel;

      channel
        .on('presence', { event: 'sync' }, () => {
          if (disposed || currentChannel !== channel) return;
          buildMembers(channel.presenceState<LobbyPresenceMeta>());
        })
        .subscribe((status) => {
          if (disposed || currentChannel !== channel) return;

          if (status === 'SUBSCRIBED') {
            reconnectAttempts = 0;
            void trackPresence(channel);
            clearKeepAlive();
            keepAliveTimer = setInterval(() => {
              if (disposed || currentChannel !== channel) return;
              void trackPresence(channel);
            }, LOBBY_SYNC_INTERVAL_MS);
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            channelRef.current = null;
            clearKeepAlive();
            scheduleReconnect();
          }
        });
    };

    connect();

    return () => {
      disposed = true;
      clearKeepAlive();
      clearReconnectTimer();
      if (currentChannel) {
        void currentChannel.untrack();
        currentChannel.unsubscribe();
      }
      channelRef.current = null;
      setMembers([]);
    };
  }, [userId, supabase]);

  const leave = useCallback(async () => {
    if (channelRef.current) {
      await channelRef.current.untrack();
    }
  }, []);

  return { members, leave };
}
