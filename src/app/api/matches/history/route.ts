import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    const authClient = await getSupabaseServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { data: matches, error } = await authClient
      .from('matches')
      .select('*')
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch match history:', error);
      return NextResponse.json({ error: '対戦履歴の取得に失敗しました' }, { status: 500 });
    }

    // Get all unique opponent IDs
    const opponentIds = new Set<string>();
    for (const m of matches || []) {
      const opponentId = m.player1_id === user.id ? m.player2_id : m.player1_id;
      opponentIds.add(opponentId);
    }

    // Get opponent names
    let opponentNames: Record<string, string> = {};
    if (opponentIds.size > 0) {
      // users テーブルはRLSで他人行の参照が制限されるため、認証済みユーザー確認後に
      // サービスロールで表示名を解決する。
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { data: opponents, error: opponentsError } = await adminClient
        .from('users')
        .select('id, display_name')
        .in('id', [...opponentIds]);

      if (opponentsError) {
        console.error('Failed to fetch opponent names:', opponentsError);
        return NextResponse.json({ error: '対戦相手名の取得に失敗しました' }, { status: 500 });
      }

      if (opponents) {
        opponentNames = Object.fromEntries(
          opponents.map((o) => [o.id, o.display_name || '不明'])
        );
      }
    }

    // Enrich matches with opponent names and win/loss
    const enriched = (matches || []).map(m => {
      const isPlayer1 = m.player1_id === user.id;
      const opponentId = isPlayer1 ? m.player2_id : m.player1_id;
      return {
        ...m,
        isWinner: m.winner_id === user.id,
        opponentName: opponentNames[opponentId] || '不明',
        eloChange: isPlayer1
          ? (m.player1_elo_after ?? m.player1_elo_before) - m.player1_elo_before
          : (m.player2_elo_after ?? m.player2_elo_before) - m.player2_elo_before,
      };
    });

    return NextResponse.json({ matches: enriched });
  } catch (err) {
    console.error('match history error:', err);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
