'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useStudyTimer } from '@/hooks/use-study-timer';
import { useRoom } from '@/hooks/use-room';
import { useBGM } from '@/hooks/use-bgm';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { MAX_ROOM_MEMBERS, POINTS_INTERVAL_MINUTES } from '@/lib/constants';
import { IsometricRoom } from '@/components/isometric-room';

function StudyTimerRing({
  studyingSeconds,
  secondsSinceLastPoint,
  formattedTime,
}: {
  studyingSeconds: number;
  secondsSinceLastPoint: number;
  formattedTime: string;
}) {
  const totalSeconds = POINTS_INTERVAL_MINUTES * 60;
  const progress = secondsSinceLastPoint / totalSeconds;
  const radius = 44;
  const strokeWidth = 3;
  const size = (radius + strokeWidth) * 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="relative inline-flex items-center justify-center scale-[0.55] sm:scale-100 origin-top-right sm:origin-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-slate-mid)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle (next point) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-amber)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <p
          className="text-lg font-bold text-text-primary tracking-tight"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {formattedTime}
        </p>
      </div>
    </div>
  );
}

function BGMControls() {
  const {
    isPlaying,
    volume,
    videoUrl,
    play,
    pause,
    loadVideo,
    changeVolume,
  } = useBGM();
  const [showInput, setShowInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const hasVideo = !!videoUrl;

  const handleLoad = () => {
    if (urlInput.trim()) {
      loadVideo(urlInput.trim());
      setShowInput(false);
      setUrlInput('');
    }
  };

  if (!hasVideo && !showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="inline-flex items-center gap-2 text-text-muted text-sm hover:text-text-secondary transition-colors px-3 py-2 rounded-lg hover:bg-slate-mid/30"
      >
        <span>♪</span>
        BGM
      </button>
    );
  }

  if (showInput) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          className="input-field text-sm py-2 px-3 w-52"
          placeholder="YouTube URL"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
        />
        <button
          onClick={handleLoad}
          className="text-amber text-sm font-medium hover:text-amber-soft transition-colors px-2 py-1"
        >
          OK
        </button>
        <button
          onClick={() => {
            setShowInput(false);
            setUrlInput('');
          }}
          className="text-text-muted text-sm hover:text-text-secondary transition-colors px-2 py-1"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={isPlaying ? pause : play}
        className="text-text-secondary hover:text-text-primary transition-colors p-1.5"
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>
      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        onChange={(e) => changeVolume(Number(e.target.value))}
        className="w-20 h-1 appearance-none bg-slate-mid rounded-full outline-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <button
        onClick={() => setShowInput(true)}
        className="text-text-muted text-xs hover:text-text-secondary transition-colors"
      >
        変更
      </button>
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const roomId = params.id as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    studyingSeconds,
    secondsSinceLastPoint,
    isStudying,
    pointsEarned,
    formattedTime,
  } = useStudyTimer();

  const displayName =
    user?.user_metadata?.display_name || 'ユーザー';

  const { members } = useRoom({
    roomId,
    userId: user?.id || '',
    displayName,
    isStudying,
    studyingSeconds,
  });

  const {
    isMuted,
    micAvailable,
    toggleMute,
  } = useVoiceChat({ roomId, userId: user?.id || '' });

  const [ready, setReady] = useState(false);
  const supabase = getSupabaseBrowserClient();

  // スリープ防止（Wake Lock API）
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {}
    };
    request();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      wakeLock?.release();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // 入室時に study_session レコードを作成
  useEffect(() => {
    if (!user || !roomId) return;
    supabase
      .from('study_sessions')
      .insert({ user_id: user.id, room_id: roomId })
      .then(() => {});
  }, [user, roomId, supabase]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) setReady(true);
  }, [user, authLoading, router]);

  const handleLeave = () => {
    router.push('/dashboard');
  };

  if (!ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  // メンバースロット（MAX_ROOM_MEMBERS=4）
  const memberSlots = Array.from({ length: MAX_ROOM_MEMBERS }, (_, i) => {
    return members[i] || null;
  });

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Top bar — compact on mobile, original on sm+ */}
      <header
        className="flex items-center justify-between px-4 py-1.5 sm:px-5 sm:py-3 border-b border-slate-deep/60"
        style={{ paddingTop: 'calc(4px + env(safe-area-inset-top, 0px))' }}
      >
        <button
          onClick={handleLeave}
          className="inline-flex items-center gap-1.5 sm:gap-2 text-text-muted text-xs sm:text-sm hover:text-text-secondary transition-colors"
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          退出
        </button>

        {/* Status */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
              isStudying
                ? 'bg-sage'
                : 'bg-rose-muted'
            }`}
          />
          <span
            className={`text-xs sm:text-sm font-medium ${
              isStudying ? 'text-sage' : 'text-rose-muted'
            }`}
          >
            {isStudying ? '' : '離席中'}
          </span>
        </div>

        {/* Points */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span
            className="text-amber text-xs sm:text-sm font-bold"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {pointsEarned}
          </span>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 min-h-0 relative overflow-hidden">
        {/* Timer Ring — mobile: floating top-right overlay, sm+: centered above room */}
        <div className="absolute top-1 right-1 z-10 sm:relative sm:top-auto sm:right-auto sm:z-auto sm:flex sm:justify-center sm:py-2">
          <StudyTimerRing
            studyingSeconds={studyingSeconds}
            secondsSinceLastPoint={secondsSinceLastPoint}
            formattedTime={formattedTime}
          />
        </div>

        {/* Isometric Room View */}
        <div className="w-full h-full sm:flex-1 sm:min-h-0 flex items-center justify-center">
          <IsometricRoom
            members={memberSlots}
            currentUserId={user?.id || ''}
            maxSlots={MAX_ROOM_MEMBERS}
          />
        </div>
      </main>

      {/* Footer — compact on mobile, original on sm+ */}
      <footer
        className="border-t border-slate-deep/60 px-4 py-1.5 sm:px-5 sm:py-4"
        style={{ paddingBottom: 'calc(4px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-md mx-auto flex items-center justify-center gap-1">
          <BGMControls />

          {/* Divider */}
          <span className="text-slate-mid mx-1 select-none">·</span>

          {/* Mic Toggle */}
          <button
            onClick={toggleMute}
            className="inline-flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-lg hover:bg-slate-mid/30"
            style={{
              color: isMuted ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
            }}
            title={isMuted ? 'マイクをON' : 'マイクをOFF'}
          >
            {isMuted ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
            マイク
          </button>
        </div>
      </footer>
    </div>
  );
}
