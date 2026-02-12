import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ELO_DEFAULT_RATING } from '@/lib/constants';

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      return NextResponse.json({
        profile: {
          id: user.id,
          display_name: user.user_metadata?.display_name || 'ユーザー',
          elo_rating: ELO_DEFAULT_RATING,
          total_wins: 0,
          total_losses: 0,
          total_matches: 0,
          total_study_seconds: 0,
        },
      });
    }

    return NextResponse.json({ profile });
  } catch (err) {
    console.error('stats error:', err);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
