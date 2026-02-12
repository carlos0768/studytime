'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface SignalPayload {
  type: 'offer' | 'answer' | 'ice-candidate' | 'voice-join' | 'voice-leave';
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface UseVoiceChatProps {
  roomId: string;
  userId: string;
}

/**
 * 入室と同時に通話チャンネルに自動接続する。
 * マイクはデフォルトで OFF（ミュート）。
 * toggleMute で ON/OFF を切り替える。
 */
export function useVoiceChat({ roomId, userId }: UseVoiceChatProps) {
  const [isMuted, setIsMuted] = useState(true); // デフォルトミュート
  const [micAvailable, setMicAvailable] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isConnectedRef = useRef(false);
  const userIdRef = useRef(userId);

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // --- ヘルパー ---

  const sendSignal = useCallback((payload: SignalPayload) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload,
    });
  }, []);

  const removePeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
    const audio = audioElementsRef.current.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      audioElementsRef.current.delete(peerId);
    }
  }, []);

  const playRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    let audio = audioElementsRef.current.get(peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      document.body.appendChild(audio);
      audioElementsRef.current.set(peerId, audio);
    }
    audio.srcObject = stream;
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {
        const resume = () => {
          audio!.play().catch(() => {});
          document.removeEventListener('touchstart', resume);
          document.removeEventListener('click', resume);
        };
        document.addEventListener('touchstart', resume, { once: true });
        document.addEventListener('click', resume, { once: true });
      });
    }
  }, []);

  const createPeer = useCallback(
    (peerId: string, isInitiator: boolean) => {
      const existing = peersRef.current.get(peerId);
      if (existing) {
        return existing;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peersRef.current.set(peerId, pc);

      const stream = localStreamRef.current;
      const localAudioTrack = stream?.getAudioTracks()[0];
      if (stream && localAudioTrack) {
        pc.addTrack(localAudioTrack, stream);
      } else {
        // マイクが使えない/ミュートでも受信専用で相手音声を受け取れるようにする
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            type: 'ice-candidate',
            from: userIdRef.current,
            to: peerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          playRemoteStream(peerId, remoteStream);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          removePeer(peerId);
        }
      };

      if (isInitiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (pc.localDescription) {
              sendSignal({
                type: 'offer',
                from: userIdRef.current,
                to: peerId,
                sdp: pc.localDescription.toJSON(),
              });
            }
          })
          .catch(console.error);
      }

      return pc;
    },
    [removePeer, sendSignal, playRemoteStream]
  );

  // --- シグナリングハンドラ（ref経由で最新版を参照） ---
  const handleSignalRef = useRef<(payload: SignalPayload) => Promise<void>>(null);

  handleSignalRef.current = async (payload: SignalPayload) => {
    if (payload.from === userIdRef.current) return;
    if (payload.to && payload.to !== userIdRef.current) return;

    switch (payload.type) {
      case 'voice-join': {
        if (!isConnectedRef.current) return;
        if (peersRef.current.has(payload.from)) return;
        // Prevent glare: only one side starts the initial offer.
        const shouldInitiate = userIdRef.current.localeCompare(payload.from) > 0;
        createPeer(payload.from, shouldInitiate);
        break;
      }

      case 'voice-leave': {
        removePeer(payload.from);
        break;
      }

      case 'offer': {
        if (!isConnectedRef.current) return;
        const pc = createPeer(payload.from, false);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp!));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (pc.localDescription) {
            sendSignal({
              type: 'answer',
              from: userIdRef.current,
              to: payload.from,
              sdp: pc.localDescription.toJSON(),
            });
          }
        } catch (err) {
          console.error('Offer handling failed:', err);
        }
        break;
      }

      case 'answer': {
        const pc = peersRef.current.get(payload.from);
        if (pc && pc.signalingState !== 'stable') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp!));
          } catch (err) {
            console.error('Answer handling failed:', err);
          }
        }
        break;
      }

      case 'ice-candidate': {
        const pc = peersRef.current.get(payload.from);
        if (pc && payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {
            // ICE candidate エラーは無視
          }
        }
        break;
      }
    }
  };

  // --- クリーンアップ ---
  const cleanup = useCallback(() => {
    sendSignal({ type: 'voice-leave', from: userIdRef.current });

    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    audioElementsRef.current.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    isConnectedRef.current = false;
  }, [sendSignal]);

  // --- 入室時に自動接続 ---
  useEffect(() => {
    if (!roomId || !userId) return;

    const channel = supabase.channel(`voice:${roomId}`);

    channel.on('broadcast', { event: 'voice-signal' }, ({ payload }) => {
      handleSignalRef.current?.(payload as SignalPayload);
    });

    channel.subscribe(async (status: string) => {
      if (status !== 'SUBSCRIBED') return;
      channelRef.current = channel;

      // マイクを取得（デフォルトミュート状態で接続）
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          // HTTPSでない場合はマイクなしで接続（相手の声は聞ける）
          isConnectedRef.current = true;
          setMicAvailable(false);
          sendSignal({ type: 'voice-join', from: userIdRef.current });
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        // デフォルトミュート
        stream.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
        setIsMuted(true);
        setMicAvailable(true);
        isConnectedRef.current = true;

        // 参加を通知
        sendSignal({ type: 'voice-join', from: userIdRef.current });
      } catch {
        // マイク拒否 — マイクなしで接続（相手の声は聞ける）
        isConnectedRef.current = true;
        setMicAvailable(false);
        sendSignal({ type: 'voice-join', from: userIdRef.current });
      }
    });

    return () => {
      cleanup();
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, supabase]);

  // ミュート切り替え
  const toggleMute = useCallback(async () => {
    // マイクがまだ取得できていない場合（非HTTPS→HTTPS遷移後等）再試行
    if (!localStreamRef.current) {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          alert('マイクへのアクセスにはHTTPS接続が必要です。');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        setMicAvailable(true);
        // ミュート解除状態で開始
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = true;
        }

        // 受信専用で張られていた既存Peerへ送信トラックを追加し、再ネゴシエーションする
        for (const [peerId, pc] of peersRef.current.entries()) {
          try {
            const hasAudioSender = pc
              .getSenders()
              .some((sender) => sender.track?.kind === 'audio');
            if (!hasAudioSender && audioTrack) {
              pc.addTrack(audioTrack, stream);
            }

            pc.getTransceivers().forEach((transceiver) => {
              if (
                transceiver.receiver.track?.kind === 'audio' &&
                transceiver.direction === 'recvonly'
              ) {
                transceiver.direction = 'sendrecv';
              }
            });

            if (pc.signalingState !== 'stable') continue;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (pc.localDescription) {
              sendSignal({
                type: 'offer',
                from: userIdRef.current,
                to: peerId,
                sdp: pc.localDescription.toJSON(),
              });
            }
          } catch (err) {
            console.error('Peer renegotiation failed:', err);
          }
        }

        setIsMuted(false);
        return;
      } catch {
        alert('マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。');
        return;
      }
    }

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, [sendSignal]);

  // ページ離脱時にクリーンアップ
  useEffect(() => {
    const handlePageHide = () => {
      if (isConnectedRef.current) {
        cleanup();
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [cleanup]);

  return {
    isMuted,
    micAvailable,
    toggleMute,
  };
}
