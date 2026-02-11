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
        element: HTMLElement | string,
        config: Record<string, unknown>
      ) => YTPlayer;
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

const STORAGE_KEY = 'studyroom_bgm_url';
const CONTAINER_ID = 'bgm-player';

function extractVideoId(url: string): string | null {
  const watchMatch = url.match(
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/
  );
  if (watchMatch) return watchMatch[1];

  const shortMatch = url.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  const embedMatch = url.match(
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  if (embedMatch) return embedMatch[1];

  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

  return null;
}

/**
 * YT.Player は target 要素を iframe に置き換えるため、
 * 再生成前にコンテナ div を作り直す必要がある。
 */
function ensureContainer(): HTMLElement {
  let container = document.getElementById(CONTAINER_ID);
  if (container) {
    // 既にiframeに置き換わっている場合、新しいdivを作り直す
    if (container.tagName === 'IFRAME') {
      const parent = container.parentElement;
      container.remove();
      const div = document.createElement('div');
      div.id = CONTAINER_ID;
      div.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden';
      parent?.appendChild(div);
      return div;
    }
    return container;
  }
  // 存在しない場合は新規作成
  const div = document.createElement('div');
  div.id = CONTAINER_ID;
  div.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden';
  document.body.appendChild(div);
  return div;
}

// API ロード状態をモジュールレベルで管理（複数hook呼び出しに対応）
let ytApiReady = false;
const ytApiCallbacks: (() => void)[] = [];

function loadYTApi(callback: () => void) {
  if (ytApiReady && window.YT?.Player) {
    callback();
    return;
  }

  ytApiCallbacks.push(callback);

  if (document.getElementById('youtube-iframe-api')) {
    // スクリプトは既にロード中 — YT が利用可能になったら実行
    const check = () => {
      if (window.YT?.Player) {
        ytApiReady = true;
        while (ytApiCallbacks.length) ytApiCallbacks.shift()!();
      } else {
        setTimeout(check, 150);
      }
    };
    check();
    return;
  }

  const tag = document.createElement('script');
  tag.id = 'youtube-iframe-api';
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = () => {
    ytApiReady = true;
    while (ytApiCallbacks.length) ytApiCallbacks.shift()!();
  };
}

export function useBGM() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const playerRef = useRef<YTPlayer | null>(null);
  const volumeRef = useRef(volume);

  // volume を ref で追跡（createPlayer のクロージャを安定させるため）
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // localStorage から前回のURLを復元
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setVideoUrl(saved);
  }, []);

  const createPlayer = useCallback((videoId: string) => {
    loadYTApi(() => {
      // 既存プレイヤーを破棄
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // 破棄失敗は無視
        }
        playerRef.current = null;
      }

      // コンテナ要素を確保（iframe置換対策）
      const container = ensureContainer();

      playerRef.current = new window.YT.Player(container, {
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
            event.target.setVolume(volumeRef.current);
            event.target.playVideo();
            setIsPlaying(true);
            try {
              const data = event.target.getVideoData();
              if (data?.title) setVideoTitle(data.title);
            } catch {
              // タイトル取得失敗は無視
            }
          },
          onStateChange: (event: { data: number; target: { playVideo: () => void } }) => {
            // 0 = ENDED, 1 = PLAYING, 2 = PAUSED
            if (event.data === 0) {
              // Loop: restart when ended
              event.target.playVideo();
            } else if (event.data === 1) {
              setIsPlaying(true);
            } else if (event.data === 2) {
              setIsPlaying(false);
            }
          },
        },
      } as Record<string, unknown>);
    });
  }, []);

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
    volumeRef.current = v;
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
