'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  POINTS_INTERVAL_MINUTES,
  POINTS_PER_INTERVAL,
  TIMER_TICK_MS,
} from '@/lib/constants';

// 短いタブ切り替え（ナビゲーション等）で離席扱いにしない猶予（ms）
const AWAY_DEBOUNCE_MS = 2000;

export function useStudyTimer() {
  const [studyingSeconds, setStudyingSeconds] = useState(0);
  const [secondsSinceLastPoint, setSecondsSinceLastPoint] = useState(0);
  const [isStudying, setIsStudying] = useState(true);
  const [pointsEarned, setPointsEarned] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const awayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimer = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setStudyingSeconds((prev) => prev + 1);
      setSecondsSinceLastPoint((prev) => {
        const next = prev + 1;
        if (next >= POINTS_INTERVAL_MINUTES * 60) {
          setPointsEarned((p) => p + POINTS_PER_INTERVAL);
          return 0;
        }
        return next;
      });
    }, TIMER_TICK_MS);
  }, []);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Page Visibility API（デバウンス付き）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // すぐに離席にせず、少し待つ（ナビゲーション中の一瞬の非表示を無視）
        awayTimeoutRef.current = setTimeout(() => {
          setIsStudying(false);
          setSecondsSinceLastPoint(0);
          stopTimer();
        }, AWAY_DEBOUNCE_MS);
      } else {
        // タブが戻ってきたらデバウンスをキャンセル
        if (awayTimeoutRef.current) {
          clearTimeout(awayTimeoutRef.current);
          awayTimeoutRef.current = null;
        }
        setIsStudying(true);
        startTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 初回起動（現在のvisibility状態を確認）
    if (!document.hidden) {
      setIsStudying(true);
      startTimer();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (awayTimeoutRef.current) {
        clearTimeout(awayTimeoutRef.current);
      }
      stopTimer();
    };
  }, [startTimer, stopTimer]);

  const formatTime = useCallback((totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    return `${minutes}分${String(seconds).padStart(2, '0')}秒`;
  }, []);

  const formattedTime = formatTime(studyingSeconds);

  return {
    studyingSeconds,
    secondsSinceLastPoint,
    isStudying,
    pointsEarned,
    formattedTime,
    formatTime,
  };
}
