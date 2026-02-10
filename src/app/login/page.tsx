'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'ログインに失敗しました'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      {/* Background ambient */}
      <div
        className="pointer-events-none absolute top-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.05]"
        style={{
          background:
            'radial-gradient(circle, var(--color-sage) 0%, transparent 70%)',
        }}
      />

      <div className="w-full max-w-sm animate-fade-in">
        {/* Back to landing */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-text-muted text-sm mb-8 hover:text-text-secondary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          戻る
        </Link>

        <h1
          className="text-3xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          おかえりなさい
        </h1>
        <p className="text-text-muted text-sm mb-8">
          メールアドレスとパスワードでログイン
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-soft border border-rose-muted/30 text-rose-muted text-sm animate-fade-in-scale">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-text-secondary text-sm font-medium mb-2">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-text-secondary text-sm font-medium mb-2">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••"
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
              'ログイン'
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-text-muted text-sm">
          アカウントをお持ちでない方は{' '}
          <Link
            href="/signup"
            className="text-amber hover:text-amber-soft transition-colors font-medium"
          >
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
