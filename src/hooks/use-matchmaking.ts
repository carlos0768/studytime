'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { CHALLENGE_EXPIRE_MS } from '@/lib/constants';
import type { RealtimeChannel } from '@supabase/supabase-js';

const CHALLENGE_RETRY_INTERVAL_MS = 1_200;
const CHALLENGE_RETRY_LIMIT = Math.max(1, Math.floor(CHALLENGE_EXPIRE_MS / CHALLENGE_RETRY_INTERVAL_MS));

interface ChallengePayload {
  type: 'challenge' | 'challenge_received' | 'accept' | 'decline' | 'cancel' | 'match_start';
  from: string;
  fromName: string;
  to: string;
  challengeId?: string;
  matchId?: string;
}

interface UseMatchmakingProps {
  userId: string;
  displayName: string;
}

interface PendingChallenge {
  challengeId: string;
  fromId: string;
  fromName: string;
  receivedAt: number;
}

interface OutgoingChallenge {
  challengeId: string;
  to: string;
  acknowledged: boolean;
}

export function useMatchmaking({ userId, displayName }: UseMatchmakingProps) {
  const [incomingChallenge, setIncomingChallenge] = useState<PendingChallenge | null>(null);
  const [outgoingChallenge, setOutgoingChallenge] = useState<OutgoingChallenge | null>(null);
  const [matchStarted, setMatchStarted] = useState<string | null>(null); // matchId
  const [isAccepting, setIsAccepting] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const incomingChallengeRef = useRef<PendingChallenge | null>(null);
  const outgoingChallengeRef = useRef<OutgoingChallenge | null>(null);
  const supabase = getSupabaseBrowserClient();
  const userIdRef = useRef(userId);
  const displayNameRef = useRef(displayName);

  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { incomingChallengeRef.current = incomingChallenge; }, [incomingChallenge]);
  useEffect(() => { outgoingChallengeRef.current = outgoingChallenge; }, [outgoingChallenge]);

  const clearRetryTimer = useCallback(() => {
    if (!retryTimerRef.current) return;
    clearInterval(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const sendEvent = useCallback(async (payload: ChallengePayload) => {
    const channel = channelRef.current;
    if (!channel) return false;

    const status = await channel.send({
      type: 'broadcast',
      event: 'matchmaking',
      payload,
    });

    if (status !== 'ok') {
      console.warn('Matchmaking send failed:', status, payload.type);
      return false;
    }

    return true;
  }, []);

  const scheduleRetry = useCallback((payload: ChallengePayload) => {
    clearRetryTimer();
    let attempts = 0;

    retryTimerRef.current = setInterval(() => {
      const current = outgoingChallengeRef.current;
      if (!current || current.challengeId !== payload.challengeId) {
        clearRetryTimer();
        return;
      }

      if (current.acknowledged || attempts >= CHALLENGE_RETRY_LIMIT) {
        clearRetryTimer();
        return;
      }

      attempts += 1;
      void sendEvent(payload);
    }, CHALLENGE_RETRY_INTERVAL_MS);
  }, [clearRetryTimer, sendEvent]);

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
    if (!outgoingChallenge) return;
    const timer = setTimeout(() => {
      clearRetryTimer();
      setOutgoingChallenge(null);
    }, CHALLENGE_EXPIRE_MS);
    return () => clearTimeout(timer);
  }, [outgoingChallenge, clearRetryTimer]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('matchmaking');

    channel
      .on('broadcast', { event: 'matchmaking' }, ({ payload }) => {
        const p = payload as ChallengePayload;
        if (p.from === userIdRef.current) return;

        switch (p.type) {
          case 'challenge':
            if (p.to !== userIdRef.current || !p.challengeId) break;
            {
              const challengeId = p.challengeId;

              setIncomingChallenge((prev) => {
                const now = Date.now();
                if (prev?.challengeId === challengeId) {
                  return { ...prev, fromName: p.fromName, receivedAt: now };
                }
                return {
                  challengeId,
                  fromId: p.from,
                  fromName: p.fromName,
                  receivedAt: now,
                };
              });

              void sendEvent({
                type: 'challenge_received',
                from: userIdRef.current,
                fromName: displayNameRef.current,
                to: p.from,
                challengeId,
              });
            }
            break;
          case 'challenge_received':
            if (p.to === userIdRef.current && p.challengeId) {
              setOutgoingChallenge((prev) => {
                if (!prev || prev.challengeId !== p.challengeId) return prev;
                return { ...prev, acknowledged: true };
              });
              clearRetryTimer();
            }
            break;
          case 'accept':
            if (
              p.to === userIdRef.current &&
              p.challengeId &&
              outgoingChallengeRef.current?.challengeId === p.challengeId
            ) {
              clearRetryTimer();
              setOutgoingChallenge(null);
            }
            break;
          case 'decline':
            if (
              p.to === userIdRef.current &&
              p.challengeId &&
              outgoingChallengeRef.current?.challengeId === p.challengeId
            ) {
              clearRetryTimer();
              setOutgoingChallenge(null);
            }
            break;
          case 'cancel':
            if (
              p.to === userIdRef.current &&
              p.challengeId &&
              incomingChallengeRef.current?.challengeId === p.challengeId
            ) {
              setIncomingChallenge(null);
              setIsAccepting(false);
            }
            break;
          case 'match_start':
            if (p.to === userIdRef.current && p.matchId) {
              clearRetryTimer();
              setOutgoingChallenge(null);
              setMatchStarted(p.matchId);
              setIncomingChallenge(null);
            }
            break;
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelRef.current = null;
        }
      });

    return () => {
      clearRetryTimer();
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [userId, supabase, clearRetryTimer, sendEvent]);

  const sendChallenge = useCallback((targetUserId: string) => {
    if (!channelRef.current) return;
    const challengeId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const payload = {
      type: 'challenge',
      from: userIdRef.current,
      fromName: displayNameRef.current,
      to: targetUserId,
      challengeId,
    } satisfies ChallengePayload;

    setOutgoingChallenge({
      challengeId,
      to: targetUserId,
      acknowledged: false,
    });

    void sendEvent(payload);
    scheduleRetry(payload);
  }, [scheduleRetry, sendEvent]);

  const acceptChallenge = useCallback(async () => {
    const challenge = incomingChallengeRef.current;
    if (!channelRef.current || !challenge || isAccepting) return;
    const challengerId = challenge.fromId;
    const challengeId = challenge.challengeId;
    setIsAccepting(true);

    // Notify challenger that we accepted
    await sendEvent({
      type: 'accept',
      from: userIdRef.current,
      fromName: displayNameRef.current,
      to: challengerId,
      challengeId,
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
      await sendEvent({
        type: 'match_start',
        from: userIdRef.current,
        fromName: displayNameRef.current,
        to: challengerId,
        challengeId,
        matchId,
      });

      setIncomingChallenge(null);
      setMatchStarted(matchId);
    } catch (err) {
      console.error('Failed to start match:', err);
    } finally {
      setIsAccepting(false);
    }
  }, [isAccepting, sendEvent]);

  const declineChallenge = useCallback(() => {
    const challenge = incomingChallengeRef.current;
    if (!channelRef.current || !challenge) return;
    void sendEvent({
      type: 'decline',
      from: userIdRef.current,
      fromName: displayNameRef.current,
      to: challenge.fromId,
      challengeId: challenge.challengeId,
    });
    setIncomingChallenge(null);
    setIsAccepting(false);
  }, [sendEvent]);

  const cancelChallenge = useCallback(() => {
    const current = outgoingChallengeRef.current;
    if (!channelRef.current || !current) return;

    clearRetryTimer();
    void sendEvent({
      type: 'cancel',
      from: userIdRef.current,
      fromName: displayNameRef.current,
      to: current.to,
      challengeId: current.challengeId,
    });
    setOutgoingChallenge(null);
  }, [clearRetryTimer, sendEvent]);

  const clearMatchStarted = useCallback(() => {
    setMatchStarted(null);
  }, []);

  useEffect(() => {
    return () => {
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  return {
    incomingChallenge,
    outgoingChallengeTo: outgoingChallenge?.to ?? null,
    matchStarted,
    isAccepting,
    sendChallenge,
    acceptChallenge,
    declineChallenge,
    cancelChallenge,
    clearMatchStarted,
  };
}
