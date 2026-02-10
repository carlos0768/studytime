'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useStudyTimer } from '@/hooks/use-study-timer';
import { useRoom } from '@/hooks/use-room';
import { useBGM } from '@/hooks/use-bgm';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { MAX_ROOM_MEMBERS, POINTS_INTERVAL_MINUTES } from '@/lib/constants';

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
  const radius = 120;
  const strokeWidth = 6;
  const size = (radius + strokeWidth) * 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  // 次のポイントまでの残り時間
  const remaining = totalSeconds - secondsSinceLastPoint;
  const remainMin = Math.floor(remaining / 60);
  const remainSec = remaining % 60;

  return (
    <div className="relative inline-flex items-center justify-center">
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
          className="text-4xl md:text-5xl font-bold text-text-primary tracking-tight"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {formattedTime}
        </p>
      </div>
    </div>
  );
}

function ProgressRingSmall({
  secondsSinceLastPoint,
}: {
  secondsSinceLastPoint: number;
}) {
  const totalSeconds = POINTS_INTERVAL_MINUTES * 60;
  const progress = secondsSinceLastPoint / totalSeconds;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const minutes = Math.floor(
    (totalSeconds - secondsSinceLastPoint) / 60
  );
  const seconds = (totalSeconds - secondsSinceLastPoint) % 60;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="54" height="54" viewBox="0 0 54 54">
        <circle
          cx="27"
          cy="27"
          r={radius}
          fill="none"
          stroke="var(--color-slate-mid)"
          strokeWidth="3"
        />
        <circle
          cx="27"
          cy="27"
          r={radius}
          fill="none"
          stroke="var(--color-amber)"
          strokeWidth="3"
          strokeLinecap="round"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
      </svg>
    </div>
  );
}

const MEMBER_ACCENTS = [
  { border: 'rgba(158, 196, 176, 0.25)', bg: 'rgba(158, 196, 176, 0.06)', dot: 'rgba(158, 196, 176, 0.7)', text: 'rgb(158, 196, 176)' },
  { border: 'rgba(150, 178, 204, 0.25)', bg: 'rgba(150, 178, 204, 0.06)', dot: 'rgba(150, 178, 204, 0.7)', text: 'rgb(150, 178, 204)' },
  { border: 'rgba(192, 168, 140, 0.25)', bg: 'rgba(192, 168, 140, 0.06)', dot: 'rgba(192, 168, 140, 0.7)', text: 'rgb(192, 168, 140)' },
  { border: 'rgba(180, 160, 196, 0.25)', bg: 'rgba(180, 160, 196, 0.06)', dot: 'rgba(180, 160, 196, 0.7)', text: 'rgb(180, 160, 196)' },
];

function MemberSlot({
  member,
  isCurrentUser,
  formatTime,
  index,
}: {
  member?: { display_name: string; status: string; studying_minutes: number };
  isCurrentUser?: boolean;
  formatTime: (s: number) => string;
  index: number;
}) {
  if (!member) {
    return (
      <div className="glass-card p-4 flex items-center justify-center h-[76px] opacity-40">
        <p className="text-text-muted text-sm">空席</p>
      </div>
    );
  }

  const isStudying = member.status === 'studying';
  const accent = MEMBER_ACCENTS[index % MEMBER_ACCENTS.length];

  return (
    <div
      className="glass-card flex items-center gap-2.5 h-[76px] overflow-hidden"
      style={{
        padding: '12px 16px',
        borderColor: accent.border,
        background: `linear-gradient(135deg, ${accent.bg} 0%, transparent 70%)`,
      }}
    >
      {/* Status indicator */}
      <div className="flex-shrink-0">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{
            background: isStudying ? accent.dot : 'rgba(201, 123, 123, 0.5)',
            opacity: isStudying ? 1 : 0.6,
          }}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">
          {member.display_name}
          {isCurrentUser && (
            <span className="text-text-muted text-[10px] ml-1.5">（あなた）</span>
          )}
        </p>
        <p
          className="text-[10px] mt-0.5"
          style={{ color: isStudying ? accent.text : 'rgb(201, 123, 123)' }}
        >
          {isStudying ? '自習中' : '離席中'}
        </p>
      </div>

      {/* Study time */}
      <div className="flex-shrink-0 text-right">
        <p
          className={`text-xs font-medium ${
            isStudying ? 'text-text-primary' : 'text-text-muted'
          }`}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {member.studying_minutes >= 60
            ? `${Math.floor(member.studying_minutes / 60)}h${member.studying_minutes % 60}m`
            : `${member.studying_minutes}m`}
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
    formatTime,
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

  const [ready, setReady] = useState(false);
  const supabase = getSupabaseBrowserClient();

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
    <div className="min-h-dvh flex flex-col">
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-5 py-3 border-b border-slate-deep/60"
        style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
      >
        <button
          onClick={handleLeave}
          className="inline-flex items-center gap-2 text-text-muted text-sm hover:text-text-secondary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          退出
        </button>

        {/* Status */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isStudying
                ? 'bg-sage'
                : 'bg-rose-muted'
            }`}
          />
          <span
            className={`text-sm font-medium ${
              isStudying ? 'text-sage' : 'text-rose-muted'
            }`}
          >
            {isStudying ? '集中モード' : '離席中'}
          </span>
        </div>

        {/* Points */}
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span
            className="text-amber text-sm font-bold"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {pointsEarned}
          </span>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-10">
        {/* Timer Ring */}
        <div>
          <StudyTimerRing
            studyingSeconds={studyingSeconds}
            secondsSinceLastPoint={secondsSinceLastPoint}
            formattedTime={formattedTime}
          />
        </div>

        {/* Members grid */}
        <div className="w-full max-w-md grid grid-cols-2 gap-3">
          {memberSlots.map((member, i) => (
            <MemberSlot
              key={member?.user_id || `empty-${i}`}
              index={i}
              member={
                member
                  ? {
                      display_name: member.display_name,
                      status: member.status,
                      studying_minutes: member.studying_minutes,
                    }
                  : undefined
              }
              isCurrentUser={member?.user_id === user?.id}
              formatTime={formatTime}
            />
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        className="border-t border-slate-deep/60 px-5 py-4"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-md mx-auto flex items-center justify-center">
          <BGMControls />
        </div>
      </footer>
    </div>
  );
}
