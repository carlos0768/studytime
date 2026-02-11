'use client';

import { useState, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

const OTP_LENGTH = 6;

type Step = 'email' | 'otp';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { sendOtp, verifyOtp } = useAuth();
  const router = useRouter();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendOtp(email);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'コードの送信に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (code: string) => {
    if (code.length !== OTP_LENGTH) return;
    setError('');
    setLoading(true);
    try {
      await verifyOtp(email, code);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    const token = otp.join('');
    if (token.length !== OTP_LENGTH) {
      setError(`${OTP_LENGTH}桁のコードを入力してください`);
      return;
    }
    await submitOtp(token);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
    if (newOtp.every((d) => d !== '')) {
      setTimeout(() => submitOtp(newOtp.join('')), 100);
    }
  };

  const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (pasted.length > 0) {
      const newOtp = Array(OTP_LENGTH).fill('');
      for (let i = 0; i < OTP_LENGTH; i++) {
        newOtp[i] = pasted[i] || '';
      }
      setOtp(newOtp);
      if (pasted.length === OTP_LENGTH) {
        setTimeout(() => submitOtp(newOtp.join('')), 100);
      } else {
        otpRefs.current[pasted.length]?.focus();
      }
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div
        className="pointer-events-none absolute top-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.05]"
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

        {step === 'email' && (
          <>
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              おかえりなさい
            </h1>
            <p className="text-text-muted text-sm mb-8">
              メールアドレスに認証コードを送信します
            </p>

            {error && (
              <div className="mb-6 p-3 rounded-lg bg-rose-soft border border-rose-muted/30 text-rose-muted text-sm animate-fade-in-scale">
                {error}
              </div>
            )}

            <form onSubmit={handleSendOtp} className="space-y-5">
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
                  autoFocus
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
              アカウントをお持ちでない方は{' '}
              <Link href="/signup" className="text-amber hover:text-amber-soft transition-colors font-medium">
                新規登録
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
              <span className="text-text-secondary">{email}</span> に送信されたコードを入力
            </p>
            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(Array(OTP_LENGTH).fill('')); setError(''); }}
              className="text-amber text-xs hover:text-amber-soft transition-colors mb-8 inline-block"
            >
              メールアドレスを変更
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
                  '認証する'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-text-muted text-xs">
              コードが届かない場合は{' '}
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  try { await sendOtp(email); setError(''); } catch { setError('再送信に失敗しました'); } finally { setLoading(false); }
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
