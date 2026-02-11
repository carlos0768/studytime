import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'メールアドレスが必要です' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const resendApiKey = process.env.RESEND_API_KEY!;
    const fromEmail = 'noreply@merken.jp';

    // Supabase Admin クライアントで OTP 付きマジックリンクを生成
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        data: {},
      },
    });

    if (error) {
      console.error('generateLink error:', error);
      return NextResponse.json(
        { error: 'コードの生成に失敗しました' },
        { status: 500 }
      );
    }

    const otp = data.properties?.email_otp;
    if (!otp) {
      return NextResponse.json(
        { error: 'OTPの取得に失敗しました' },
        { status: 500 }
      );
    }

    // Resend API でメール送信
    const resend = new Resend(resendApiKey);

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'StudyRoom — 認証コード',
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 32px 0;">
          <h2 style="color: #333; margin-bottom: 8px;">StudyRoom ログイン</h2>
          <p style="color: #666; font-size: 14px; margin-bottom: 24px;">
            以下の認証コードを入力してください:
          </p>
          <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">
              ${otp}
            </span>
          </div>
          <p style="color: #999; font-size: 12px;">
            このコードは10分間有効です。心当たりがない場合は無視してください。
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return NextResponse.json(
        { error: 'メールの送信に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, otpLength: otp.length });
  } catch (err) {
    console.error('send-otp error:', err);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
