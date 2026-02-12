import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const authClient = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError) {
      console.error('study time auth error:', authError);
      return NextResponse.json({ error: '認証の確認に失敗しました' }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const rawSeconds = body?.seconds;
    const seconds = Number.isFinite(rawSeconds) ? Math.floor(rawSeconds) : NaN;

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return NextResponse.json({ error: 'seconds は 1 以上の整数で指定してください' }, { status: 400 });
    }

    // Defensive cap for one request.
    const increment = Math.min(seconds, 7200);

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: profile, error: profileError } = await adminClient
      .from('users')
      .select('total_study_seconds')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('study time profile fetch error:', profileError);
      return NextResponse.json({ error: 'プロフィール取得に失敗しました' }, { status: 500 });
    }

    const nextTotalStudySeconds = Math.max((profile.total_study_seconds || 0) + increment, 0);

    const { error: updateError } = await adminClient
      .from('users')
      .update({ total_study_seconds: nextTotalStudySeconds })
      .eq('id', user.id);

    if (updateError) {
      console.error('study time update error:', updateError);
      return NextResponse.json({ error: '学習時間の保存に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      total_study_seconds: nextTotalStudySeconds,
      added_seconds: increment,
    });
  } catch (err) {
    console.error('study time route error:', err);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
