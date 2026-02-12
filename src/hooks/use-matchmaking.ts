'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { CHALLENGE_EXPIRE_MS } from '@/lib/constants';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface ChallengePayload {
  type: 'challenge' | 'accept' | 'decline' | 'cancel' | 'match_start';
  from: string;
  fromName: string;
  to: string;
  matchId?: string;
}

interface UseMatchmakingProps {
  userId: string;
  displayName: string;
}

interface PendingChallenge {
  fromId: string;
  fromName: string;
  receivedAt: number;
}

export function useMatchmaking({ userId, displayName }: UseMatchmakingProps) {
  const [incomingChallenge, setIncomingChallenge] = useState<PendingChallenge | null>(null);
  const [outgoingChallengeTo, setOutgoingChallengeTo] = useState<string | null>(null);
  const [matchStarted, setMatchStarted] = useState<string | null>(null); // matchId
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = getSupabaseBrowserClient();
  const userIdRef = useRef(userId);
  const displayNameRef = useRef(displayName);

  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  // Auto-expire incoming challenges
  useEffect(() => {
    if (!incomingChallenge) return;
    const remaining = CHALLENGE_EXPIRE_MS - (Date.now() - incomingChallenge.receivedAt);
    if (remaining <= 0) {
      setIncomingChallenge(null);
      return;
    }
    const timer = setTimeout(() => setIncomingChallenge(null), remaining);
    return () => clearTimeout(timer);
  }, [incomingChallenge]);

  // Auto-expire outgoing challenge
  useEffect(() => {
    if (!outgoingChallengeTo) return;
    const timer = setTimeout(() => setOutgoingChallengeTo(null), CHALLENGE_EXPIRE_MS);
    return () => clearTimeout(timer);
  }, [outgoingChallengeTo]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('matchmaking');

    channel
      .on('broadcast', { event: 'matchmaking' }, ({ payload }) => {
        const p = payload as ChallengePayload;
        if (p.from === userIdRef.current) return;

        switch (p.type) {
          case 'challenge':
            if (p.to === userIdRef.current) {
              setIncomingChallenge({
                fromId: p.from,
                fromName: p.fromName,
                receivedAt: Date.now(),
              });
            }
            break;
          case 'accept':
            if (p.to === userIdRef.current) {
              // The challenged player accepted -> now we create the match
              // The challenger (us) should call the API to start the match
              setOutgoingChallengeTo(null);
            }
            break;
          case 'decline':
            if (p.to === userIdRef.current) {
              setOutgoingChallengeTo(null);
            }
            break;
          case 'cancel':
            if (p.to === userIdRef.current) {
              setIncomingChallenge(null);
            }
            break;
          case 'match_start':
            if (p.to === userIdRef.current && p.matchId) {
              setMatchStarted(p.matchId);
              setIncomingChallenge(null);
            }
            break;
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;
        }
      });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [userId, supabase]);

  const sendChallenge = useCallback((targetUserId: string) => {
    if (!channelRef.current) return;
    setOutgoingChallengeTo(targetUserId);
    channelRef.current.send({
      type: 'broadcast',
      event: 'matchmaking',
      payload: {
        type: 'challenge',
        from: userIdRef.current,
        fromName: displayNameRef.current,
        to: targetUserId,
      } satisfies ChallengePayload,
    });
  }, []);

  const acceptChallenge = useCallback(async () => {
    if (!channelRef.current || !incomingChallenge) return;
    const challengerId = incomingChallenge.fromId;

    // Notify challenger that we accepted
    channelRef.current.send({
      type: 'broadcast',
      event: 'matchmaking',
      payload: {
        type: 'accept',
        from: userIdRef.current,
        fromName: displayNameRef.current,
        to: challengerId,
      } satisfies ChallengePayload,
    });

    // Create match via API
    try {
      const res = await fetch('/api/matches/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player1_id: challengerId,
          player2_id: userIdRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const matchId = data.match.id;

      // Notify challenger of match start
      channelRef.current.send({
        type: 'broadcast',
        event: 'matchmaking',
        payload: {
          type: 'match_start',
          from: userIdRef.current,
          fromName: displayNameRef.current,
          to: challengerId,
          matchId,
        } satisfies ChallengePayload,
      });

      setIncomingChallenge(null);
      setMatchStarted(matchId);
    } catch (err) {
      console.error('Failed to start match:', err);
    }
  }, [incomingChallenge]);

  const declineChallenge = useCallback(() => {
    if (!channelRef.current || !incomingChallenge) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'matchmaking',
      payload: {
        type: 'decline',
        from: userIdRef.current,
        fromName: displayNameRef.current,
        to: incomingChallenge.fromId,
      } satisfies ChallengePayload,
    });
    setIncomingChallenge(null);
  }, [incomingChallenge]);

  const cancelChallenge = useCallback(() => {
    if (!channelRef.current || !outgoingChallengeTo) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'matchmaking',
      payload: {
        type: 'cancel',
        from: userIdRef.current,
        fromName: displayNameRef.current,
        to: outgoingChallengeTo,
      } satisfies ChallengePayload,
    });
    setOutgoingChallengeTo(null);
  }, [outgoingChallengeTo]);

  const clearMatchStarted = useCallback(() => {
    setMatchStarted(null);
  }, []);

  return {
    incomingChallenge,
    outgoingChallengeTo,
    matchStarted,
    sendChallenge,
    acceptChallenge,
    declineChallenge,
    cancelChallenge,
    clearMatchStarted,
  };
}
