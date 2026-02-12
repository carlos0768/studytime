'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from '@/lib/constants';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { MatchResult } from '@/types';

interface UseMatchProps {
  matchId: string;
  userId: string;
}

type MatchStatus = 'active' | 'ended';

interface HeartbeatPayload {
  type: 'heartbeat' | 'giveup' | 'tab_hidden';
  from: string;
  matchId: string;
}

export function useMatch({ matchId, userId }: UseMatchProps) {
  const [status, setStatus] = useState<MatchStatus>('active');
  const [result, setResult] = useState<MatchResult | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opponentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);
  const supabase = getSupabaseBrowserClient();
  const userIdRef = useRef(userId);

  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // Elapsed time counter — ticks every second while match is active
  useEffect(() => {
    if (status !== 'active') return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  const endMatch = useCallback(async (loserId: string, reason: 'giveup' | 'tab_hidden' | 'disconnect') => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus('ended');

    try {
      const res = await fetch('/api/matches/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id: matchId,
          loser_id: loserId,
          caller_id: userIdRef.current,
          reason,
        }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setResult(data.result);
      }
    } catch (err) {
      console.error('Failed to end match:', err);
    }
  }, [matchId]);

  // sendBeacon fallback for page close
  const endMatchBeacon = useCallback((reason: 'tab_hidden' | 'giveup') => {
    if (endedRef.current) return;
    endedRef.current = true;
    const body = JSON.stringify({
      match_id: matchId,
      loser_id: userIdRef.current,
      caller_id: userIdRef.current,
      reason,
    });
    navigator.sendBeacon('/api/matches/end', new Blob([body], { type: 'application/json' }));
  }, [matchId]);

  const giveUp = useCallback(async () => {
    // Broadcast giveup to opponent
    channelRef.current?.send({
      type: 'broadcast',
      event: 'match-signal',
      payload: {
        type: 'giveup',
        from: userIdRef.current,
        matchId,
      } satisfies HeartbeatPayload,
    });
    await endMatch(userIdRef.current, 'giveup');
  }, [matchId, endMatch]);

  // Tab visibility detection — instant loss
  useEffect(() => {
    if (!matchId || !userId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !endedRef.current) {
        // Broadcast tab_hidden to opponent
        channelRef.current?.send({
          type: 'broadcast',
          event: 'match-signal',
          payload: {
            type: 'tab_hidden',
            from: userIdRef.current,
            matchId,
          } satisfies HeartbeatPayload,
        });
        // 1. sendBeacon first — guaranteed to reach server even if page unloads
        const body = JSON.stringify({
          match_id: matchId,
          loser_id: userIdRef.current,
          caller_id: userIdRef.current,
          reason: 'tab_hidden',
        });
        navigator.sendBeacon('/api/matches/end', new Blob([body], { type: 'application/json' }));
        // 2. Also do async fetch to get result (if tab is just hidden, not unloading)
        //    endMatch will set endedRef=true and populate result for the match page
        void endMatch(userIdRef.current, 'tab_hidden');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [matchId, userId, endMatch]);

  // Page close — sendBeacon
  useEffect(() => {
    if (!matchId || !userId) return;

    const handlePageHide = () => {
      if (!endedRef.current) {
        endMatchBeacon('tab_hidden');
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [matchId, userId, endMatchBeacon]);

  // Heartbeat + opponent disconnect detection via Supabase Broadcast
  useEffect(() => {
    if (!matchId || !userId) return;

    const channel = supabase.channel(`match:${matchId}`);

    // Track whether we ever received a heartbeat from the opponent
    let opponentSeen = false;

    const resetOpponentTimeout = () => {
      if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current);
      opponentTimeoutRef.current = setTimeout(() => {
        // Only trigger disconnect if we've actually seen the opponent before
        if (!endedRef.current && opponentSeen) {
          // Pass empty loserId — API will determine the opponent from match record
          void endMatch('__opponent_disconnect__', 'disconnect');
        }
      }, HEARTBEAT_TIMEOUT_MS);
    };

    channel
      .on('broadcast', { event: 'match-signal' }, ({ payload }) => {
        const p = payload as HeartbeatPayload;
        if (p.from === userIdRef.current) return;
        if (p.matchId !== matchId) return;

        switch (p.type) {
          case 'heartbeat':
            opponentSeen = true;
            resetOpponentTimeout();
            break;
          case 'giveup':
          case 'tab_hidden':
            // Opponent lost — we win
            if (!endedRef.current) {
              void endMatch(p.from, p.type);
            }
            break;
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;

          // Start sending heartbeats
          heartbeatTimerRef.current = setInterval(() => {
            channel.send({
              type: 'broadcast',
              event: 'match-signal',
              payload: {
                type: 'heartbeat',
                from: userIdRef.current,
                matchId,
              } satisfies HeartbeatPayload,
            });
          }, HEARTBEAT_INTERVAL_MS);

          // Start watching for opponent timeout
          resetOpponentTimeout();
        }
      });

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [matchId, userId, supabase, endMatch]);

  return {
    status,
    result,
    elapsedSeconds,
    giveUp,
  };
}
