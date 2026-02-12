import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ELO_DEFAULT_RATING } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const { player1_id, player2_id } = await request.json();

    if (!player1_id || !player2_id) {
      return NextResponse.json({ error: 'Both player IDs are required' }, { status: 400 });
    }

    if (player1_id === player2_id) {
      return NextResponse.json({ error: 'Cannot match with yourself' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get both players' elo ratings
    const { data: players, error: playersError } = await supabase
      .from('users')
      .select('id, elo_rating')
      .in('id', [player1_id, player2_id]);

    if (playersError || !players || players.length !== 2) {
      return NextResponse.json({ error: 'プレイヤーが見つかりません' }, { status: 404 });
    }

    const p1 = players.find(p => p.id === player1_id);
    const p2 = players.find(p => p.id === player2_id);
    const p1Elo = p1?.elo_rating ?? ELO_DEFAULT_RATING;
    const p2Elo = p2?.elo_rating ?? ELO_DEFAULT_RATING;

    // Create match record
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .insert({
        player1_id,
        player2_id,
        player1_elo_before: p1Elo,
        player2_elo_before: p2Elo,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (matchError) {
      console.error('Failed to create match:', matchError);
      return NextResponse.json({ error: '試合の作成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ match });
  } catch (err) {
    console.error('match start error:', err);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
