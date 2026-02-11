'use client';

import { useState, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

type Step = 'email' | 'otp' | 'displayName';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { sendOtp, verifyOtp, updateDisplayName } = useAuth();
  const router = useRouter();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 1: メール送信
  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendOtp(email);
      setStep('otp');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'コードの送信に失敗しました'
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: OTP検証
  const handleVerifyOtp = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    const token = otp.join('');
    if (token.length !== 6) {
      setError('6桁のコードを入力してください');
      return;
    }
    setLoading(true);
    try {
      const data = await verifyOtp(email, token);
      const user = data?.user;
      // display_name が未設定なら Step 3 へ
      if (!user?.user_metadata?.display_name) {
        setStep('displayName');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '認証に失敗しました'
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 3: 表示名設定
  const handleSetDisplayName = async (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('表示名を入力してください');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await updateDisplayName(displayName.trim());
      router.push('/dashboard');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '表示名の設定に失敗しました'
      );
    } finally {
      setLoading(false);
    }
  };

  // OTP入力のハンドリング
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // 数字のみ
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // 1文字だけ
    setOtp(newOtp);
    // 次の入力フィールドへ自動フォーカス
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    // 全桁揃ったら自動送信
    if (newOtp.every((d) => d !== '') && newOtp.join('').length === 6) {
      setTimeout(() => {
        const token = newOtp.join('');
        if (token.length === 6) {
          handleVerifyOtp();
        }
      }, 100);
    }
  };

  const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newOtp = [...otp];
      for (let i = 0; i < 6; i++) {
        newOtp[i] = pasted[i] || '';
      }
      setOtp(newOtp);
      // 全桁揃ったら自動送信
      if (pasted.length === 6) {
        setTimeout(() => handleVerifyOtp(), 100);
      } else {
        otpRefs.current[pasted.length]?.focus();
      }
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

        {/* Step 1: Email */}
        {step === 'email' && (
          <>
            <h1
              className="text-3xl font-bold mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              ログイン
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

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading}
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-midnight/30 border-t-midnight rounded-full animate-spin" />
                ) : (
                  'コードを送信'
                )}
              </button>
            </form>
          </>
        )}

        {/* Step 2: OTP */}
        {step === 'otp' && (
          <>
            <h1
              className="text-3xl font-bold mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              認証コード
            </h1>
            <p className="text-text-muted text-sm mb-2">
              <span className="text-text-secondary">{email}</span> に送信されたコードを入力
            </p>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setOtp(['', '', '', '', '', '']);
                setError('');
              }}
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
              {/* 6桁OTP入力 */}
              <div className="flex justify-center gap-3" onPaste={handleOtpPaste}>
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
                    className="w-12 h-14 text-center text-xl font-bold rounded-lg border outline-none transition-all"
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

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading}
              >
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
                  try {
                    await sendOtp(email);
                    setError('');
                  } catch {
                    setError('再送信に失敗しました');
                  } finally {
                    setLoading(false);
                  }
                }}
                className="text-amber hover:text-amber-soft transition-colors"
                disabled={loading}
              >
                再送信
              </button>
            </p>
          </>
        )}

        {/* Step 3: Display Name */}
        {step === 'displayName' && (
          <>
            <h1
              className="text-3xl font-bold mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              はじめよう
            </h1>
            <p className="text-text-muted text-sm mb-8">
              自習室で表示される名前を設定してください
            </p>

            {error && (
              <div className="mb-6 p-3 rounded-lg bg-rose-soft border border-rose-muted/30 text-rose-muted text-sm animate-fade-in-scale">
                {error}
              </div>
            )}

            <form onSubmit={handleSetDisplayName} className="space-y-5">
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

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading}
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-midnight/30 border-t-midnight rounded-full animate-spin" />
                ) : (
                  'はじめる'
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
