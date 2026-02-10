'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function JoinRoomPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '参加に失敗しました');
        return;
      }
      router.push(`/room/${data.room.id}`);
    } catch {
      setError('サーバーエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      {/* Background ambient */}
      <div
        className="pointer-events-none absolute top-[30%] left-[50%] translate-x-[-50%] w-[500px] h-[500px] rounded-full opacity-[0.05]"
        style={{
          background:
            'radial-gradient(circle, var(--color-sage) 0%, transparent 70%)',
        }}
      />

      <div className="w-full max-w-sm animate-fade-in">
        <button
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-2 text-text-muted text-sm mb-8 hover:text-text-secondary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          ダッシュボードに戻る
        </button>

        <h1
          className="text-3xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          自習室に参加
        </h1>
        <p className="text-text-muted text-sm mb-2">ルームコード</p>
        <p
          className="text-amber text-2xl font-bold tracking-[0.3em] mb-8"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {code}
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-soft border border-rose-muted/30 text-rose-muted text-sm animate-fade-in-scale">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-text-secondary text-sm font-medium mb-2">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="パスワードを入力"
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? (
              <span className="inline-block w-5 h-5 border-2 border-midnight/30 border-t-midnight rounded-full animate-spin" />
            ) : (
              '参加する'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
