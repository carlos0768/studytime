'use client';

import { useState, useRef, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

type Step = 'info' | 'otp';

export default function SignupPage() {
  const [step, setStep] = useState<Step>('info');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [otpLength, setOtpLength] = useState(6);
  const [otp, setOtp] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { sendOtp, verifyOtp, updateDisplayName } = useAuth();
  const router = useRouter();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 1: 表示名 + メール → OTP送信
  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('表示名を入力してください');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const length = await sendOtp(email);
      setOtpLength(length);
      setOtp(Array(length).fill(''));
      otpRefs.current = Array(length).fill(null);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'コードの送信に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: OTP検証 → 表示名設定 → ダッシュボード
  const submitOtp = useCallback(async (code: string) => {
    setError('');
    setLoading(true);
    try {
      await verifyOtp(email, code);
      await updateDisplayName(displayName.trim());
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [email, displayName, verifyOtp, updateDisplayName, router]);

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    const token = otp.join('');
    if (token.length !== otpLength) {
      setError(`${otpLength}桁のコードを入力してください`);
      return;
    }
    await submitOtp(token);
  };

  const handleOtpChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    setOtp((prev) => {
      const next = [...prev];
      next[index] = value.slice(-1);
      if (next.every((d) => d !== '')) {
        setTimeout(() => submitOtp(next.join('')), 100);
      }
      return next;
    });
    if (value && index < otpLength - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }, [otpLength, submitOtp]);

  const handleOtpKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      setOtp((prev) => {
        if (!prev[index] && index > 0) {
          otpRefs.current[index - 1]?.focus();
          const next = [...prev];
          next[index - 1] = '';
          return next;
        }
        return prev;
      });
    }
  }, []);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, otpLength);
    if (pasted.length > 0) {
      const newOtp = Array(otpLength).fill('');
      for (let i = 0; i < pasted.length; i++) {
        newOtp[i] = pasted[i];
      }
      setOtp(newOtp);
      if (pasted.length === otpLength) {
        setTimeout(() => submitOtp(newOtp.join('')), 100);
      } else {
        otpRefs.current[pasted.length]?.focus();
      }
    }
  }, [otpLength, submitOtp]);

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div
        className="pointer-events-none absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.05]"
        style={{
          background: 'radial-gradient(circle, var(--color-sage) 0%, transparent 70%)',
        }}
      />

      <div className="w-full max-w-sm animate-fade-in">
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

        {step === 'info' && (
          <>
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              はじめよう
            </h1>
            <p className="text-text-muted text-sm mb-8">
              アカウントを作成して自習室に参加
            </p>

            {error && (
              <div className="mb-6 p-3 rounded-lg bg-rose-soft border border-rose-muted/30 text-rose-muted text-sm animate-fade-in-scale">
                {error}
              </div>
            )}

            <form onSubmit={handleSendOtp} className="space-y-5">
              <div>
                <label className="block text-text-secondary text-sm font-medium mb-2">
                  表示名
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input-field"
                  placeholder="あなたの名前"
                  required
                  autoFocus
                />
              </div>

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

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-midnight/30 border-t-midnight rounded-full animate-spin" />
                ) : (
                  'コードを送信'
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-text-muted text-sm">
              既にアカウントをお持ちの方は{' '}
              <Link href="/login" className="text-amber hover:text-amber-soft transition-colors font-medium">
                ログイン
              </Link>
            </p>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              認証コード
            </h1>
            <p className="text-text-muted text-sm mb-2">
              <span className="text-text-secondary">{email}</span> に送信された{otpLength}桁のコードを入力
            </p>
            <button
              type="button"
              onClick={() => { setStep('info'); setOtp([]); setError(''); }}
              className="text-amber text-xs hover:text-amber-soft transition-colors mb-8 inline-block"
            >
              戻って修正
            </button>

            {error && (
              <div className="mb-6 p-3 rounded-lg bg-rose-soft border border-rose-muted/30 text-rose-muted text-sm animate-fade-in-scale">
                {error}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-10 h-12 text-center text-lg font-bold rounded-lg border outline-none transition-all"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(10, 10, 10, 0.6)',
                      borderColor: digit ? 'var(--color-amber)' : 'var(--color-slate-light)',
                      color: 'var(--color-text-primary)',
                      boxShadow: digit ? '0 0 0 3px var(--color-amber-glow)' : 'none',
                    }}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-midnight/30 border-t-midnight rounded-full animate-spin" />
                ) : (
                  'アカウントを作成'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-text-muted text-xs">
              コードが届かない場合は{' '}
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const length = await sendOtp(email);
                    setOtpLength(length);
                    setOtp(Array(length).fill(''));
                    otpRefs.current = Array(length).fill(null);
                    setError('');
                  } catch { setError('再送信に失敗しました'); }
                  finally { setLoading(false); }
                }}
                className="text-amber hover:text-amber-soft transition-colors"
                disabled={loading}
              >
                再送信
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
