import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const authClient = await getSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedLimit = parseInt(searchParams.get('limit') || '6', 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 6, 1), 8);
    const excludeUserId = searchParams.get('exclude_user_id') || user.id;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch extra rows first because one side may include excludeUserId
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, player1_id, player2_id, started_at')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(limit + 8);

    if (matchesError) {
      console.error('Failed to fetch active matches:', matchesError);
      return NextResponse.json({ error: '進行中対戦の取得に失敗しました' }, { status: 500 });
    }

    const filtered = (matches || [])
      .filter((m) => m.player1_id !== excludeUserId && m.player2_id !== excludeUserId)
      .slice(0, limit);

    if (filtered.length === 0) {
      return NextResponse.json({ rooms: [] });
    }

    const userIds = Array.from(
      new Set(filtered.flatMap((m) => [m.player1_id, m.player2_id]))
    );

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', userIds);

    if (usersError) {
      console.error('Failed to fetch active match users:', usersError);
      return NextResponse.json({ error: 'プレイヤー情報の取得に失敗しました' }, { status: 500 });
    }

    const nameMap = new Map<string, string>(
      (users || []).map((u) => [u.id, u.display_name || '不明'])
    );

    const rooms = filtered.map((m) => ({
      match_id: m.id,
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      player1_name: nameMap.get(m.player1_id) || '不明',
      player2_name: nameMap.get(m.player2_id) || '不明',
      started_at: m.started_at,
    }));

    return NextResponse.json({ rooms });
  } catch (err) {
    console.error('active matches error:', err);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
