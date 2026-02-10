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

export function useVoiceChat({ roomId, userId }: UseVoiceChatProps) {
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState<Set<string>>(new Set());

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isInVoiceRef = useRef(false);
  const userIdRef = useRef(userId);

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // --- ref ベースのヘルパー（staleクロージャを回避） ---

  const sendSignal = useCallback((payload: SignalPayload) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload,
    });
  }, []);

  const playRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    let audio = audioElementsRef.current.get(peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      // iOS Safari 対策: body に追加
      document.body.appendChild(audio);
      audioElementsRef.current.set(peerId, audio);
    }
    audio.srcObject = stream;
    // autoplay 制限の回避（ユーザー操作後なので通常は通る）
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {
        // フォールバック: 次のユーザー操作で再試行
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
        existing.close();
        peersRef.current.delete(peerId);
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peersRef.current.set(peerId, pc);

      // ローカルストリームのトラックを追加
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

      // ICE candidate
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

      // リモート音声の受信
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          playRemoteStream(peerId, remoteStream);
        }
      };

      // 接続状態の監視
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          pc.close();
          peersRef.current.delete(peerId);
          const audio = audioElementsRef.current.get(peerId);
          if (audio) {
            audio.srcObject = null;
            audio.remove();
            audioElementsRef.current.delete(peerId);
          }
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
    [sendSignal, playRemoteStream]
  );

  // --- シグナリングハンドラを ref 経由で最新版を常に参照 ---
  const handleSignalRef = useRef<(payload: SignalPayload) => Promise<void>>();

  handleSignalRef.current = async (payload: SignalPayload) => {
    if (payload.from === userIdRef.current) return;
    if (payload.to && payload.to !== userIdRef.current) return;

    switch (payload.type) {
      case 'voice-join': {
        if (!isInVoiceRef.current) return;
        setVoiceMembers((prev) => new Set([...prev, payload.from]));
        createPeer(payload.from, true);
        break;
      }

      case 'voice-leave': {
        setVoiceMembers((prev) => {
          const next = new Set(prev);
          next.delete(payload.from);
          return next;
        });
        const pc = peersRef.current.get(payload.from);
        if (pc) {
          pc.close();
          peersRef.current.delete(payload.from);
        }
        const audio = audioElementsRef.current.get(payload.from);
        if (audio) {
          audio.srcObject = null;
          audio.remove();
          audioElementsRef.current.delete(payload.from);
        }
        break;
      }

      case 'offer': {
        if (!isInVoiceRef.current) return;
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
            // ICE candidate エラーは無視（接続が既に確立済みの場合等）
          }
        }
        break;
      }
    }
  };

  // Supabase Broadcast チャンネル — ref 経由で常に最新ハンドラを呼ぶ
  useEffect(() => {
    const channel = supabase.channel(`voice:${roomId}`);

    channel.on('broadcast', { event: 'voice-signal' }, ({ payload }) => {
      // ref経由で最新のhandleSignalを呼ぶ（staleクロージャ回避）
      handleSignalRef.current?.(payload as SignalPayload);
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, supabase]);

  // 通話参加
  const joinVoice = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('マイクへのアクセスにはHTTPS接続が必要です。デプロイ環境でお試しください。');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      isInVoiceRef.current = true;
      setIsInVoice(true);
      setIsMuted(false);

      // 参加を通知（他の通話参加者がofferを送ってくる）
      sendSignal({ type: 'voice-join', from: userIdRef.current });
    } catch (err) {
      console.error('マイクへのアクセスに失敗しました', err);
      alert('マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。');
    }
  }, [sendSignal]);

  // 通話退出
  const leaveVoice = useCallback(() => {
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

    isInVoiceRef.current = false;
    setIsInVoice(false);
    setIsMuted(false);
    setVoiceMembers(new Set());
  }, [sendSignal]);

  // ミュート切り替え
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  // ページ離脱時にクリーンアップ
  useEffect(() => {
    const handlePageHide = () => {
      if (isInVoiceRef.current) {
        leaveVoice();
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (isInVoiceRef.current) {
        leaveVoice();
      }
    };
  }, [leaveVoice]);

  return {
    isInVoice,
    isMuted,
    voiceMembers,
    joinVoice,
    leaveVoice,
    toggleMute,
  };
}
