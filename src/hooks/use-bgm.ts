'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
  getVideoData: () => { title: string };
  destroy: () => void;
}

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: Record<string, unknown>
      ) => YTPlayer;
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

const STORAGE_KEY = 'studyroom_bgm_url';

function extractVideoId(url: string): string | null {
  // youtube.com/watch?v=
  const watchMatch = url.match(
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/
  );
  if (watchMatch) return watchMatch[1];

  // youtu.be/
  const shortMatch = url.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/embed/
  const embedMatch = url.match(
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  if (embedMatch) return embedMatch[1];

  // 直接11文字ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

  return null;
}

export function useBGM() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const playerRef = useRef<YTPlayer | null>(null);
  const apiLoadedRef = useRef(false);

  // YouTube IFrame API をロード
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (document.getElementById('youtube-iframe-api')) {
      apiLoadedRef.current = true;
      return;
    }

    const tag = document.createElement('script');
    tag.id = 'youtube-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      apiLoadedRef.current = true;
    };
  }, []);

  // localStorage から前回のURLを復元
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setVideoUrl(saved);
  }, []);

  const createPlayer = useCallback(
    (videoId: string) => {
      const waitForAPI = () => {
        if (!apiLoadedRef.current || !window.YT?.Player) {
          setTimeout(waitForAPI, 200);
          return;
        }

        if (playerRef.current) {
          playerRef.current.destroy();
        }

        playerRef.current = new window.YT.Player('bgm-player', {
          height: '0',
          width: '0',
          videoId,
          playerVars: {
            autoplay: 1,
            loop: 1,
            playlist: videoId,
          },
          events: {
            onReady: (event: { target: YTPlayer }) => {
              event.target.setVolume(volume);
              setIsPlaying(true);
              try {
                const data = event.target.getVideoData();
                if (data?.title) setVideoTitle(data.title);
              } catch {
                // タイトル取得失敗は無視
              }
            },
          },
        } as Record<string, unknown>);
      };

      waitForAPI();
    },
    [volume]
  );

  const loadVideo = useCallback(
    (url: string) => {
      const videoId = extractVideoId(url);
      if (!videoId) return;

      setVideoUrl(url);
      localStorage.setItem(STORAGE_KEY, url);
      createPlayer(videoId);
    },
    [createPlayer]
  );

  const play = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  }, []);

  const pause = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    }
  }, []);

  const changeVolume = useCallback((v: number) => {
    setVolume(v);
    if (playerRef.current) {
      playerRef.current.setVolume(v);
    }
  }, []);

  return {
    isPlaying,
    volume,
    videoUrl,
    videoTitle,
    play,
    pause,
    loadVideo,
    changeVolume,
  };
}
