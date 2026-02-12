import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { calculateElo } from '@/lib/elo';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { match_id, loser_id, caller_id, reason } = body;

    if (!match_id || !loser_id || !reason) {
      return NextResponse.json({ error: 'match_id, loser_id, reason are required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get the match
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match_id)
      .single();

    if (matchError || !match) {
      return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });
    }

    // Already ended — return existing result from caller's perspective
    if (match.ended_at) {
      const { data: players } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', [match.player1_id, match.player2_id]);

      // Use caller_id to determine perspective; fall back to loser_id
      const perspectiveId = caller_id || loser_id;
      const callerIsPlayer1 = perspectiveId === match.player1_id;
      const callerIsWinner = perspectiveId === match.winner_id;

      const opponentId = callerIsPlayer1 ? match.player2_id : match.player1_id;
      const opponentName = players?.find(p => p.id === opponentId)?.display_name || '不明';

      const eloBefore = callerIsPlayer1 ? match.player1_elo_before : match.player2_elo_before;
      const eloAfter = callerIsPlayer1
        ? (match.player1_elo_after ?? match.player1_elo_before)
        : (match.player2_elo_after ?? match.player2_elo_before);

      return NextResponse.json({
        result: {
          match,
          isWinner: callerIsWinner,
          eloBefore,
          eloAfter,
          eloChange: eloAfter - eloBefore,
          durationSeconds: match.duration_seconds || 0,
          opponentName,
        },
      });
    }

    // Resolve actual loser_id for disconnect case
    // '__opponent_disconnect__' means: "my opponent disconnected, so THEY are the loser"
    // The caller (who detected disconnect) is the winner
    let resolvedLoserId = loser_id;
    if (loser_id === '__opponent_disconnect__') {
      // The caller doesn't know opponent's ID, but we can figure it out
      // For disconnect, we need to know who called this. We'll use a heuristic:
      // The caller is still alive, so the OTHER player disconnected
      // We don't have caller ID in body, so we can't resolve this reliably
      // Return error — the opponent's client should report their own loss
      return NextResponse.json({ error: '相手の切断を検出しましたが、処理できません' }, { status: 400 });
    }

    const winnerId = match.player1_id === resolvedLoserId ? match.player2_id : match.player1_id;
    const now = new Date();
    const startedAt = new Date(match.started_at);
    const durationSeconds = Math.max(Math.floor((now.getTime() - startedAt.getTime()) / 1000), 0);

    // Calculate elo
    const winnerEloBefore = match.player1_id === winnerId ? match.player1_elo_before : match.player2_elo_before;
    const loserEloBefore = match.player1_id === resolvedLoserId ? match.player1_elo_before : match.player2_elo_before;
    const { winnerNew, loserNew } = calculateElo(winnerEloBefore, loserEloBefore, durationSeconds);

    const p1IsWinner = match.player1_id === winnerId;

    // Update match
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        winner_id: winnerId,
        loser_id: resolvedLoserId,
        end_reason: reason,
        ended_at: now.toISOString(),
        duration_seconds: durationSeconds,
        player1_elo_after: p1IsWinner ? winnerNew : loserNew,
        player2_elo_after: p1IsWinner ? loserNew : winnerNew,
      })
      .eq('id', match_id)
      .is('ended_at', null);

    if (updateError) {
      console.error('Failed to update match:', updateError);
      return NextResponse.json({ error: '試合の更新に失敗しました' }, { status: 500 });
    }

    // Update winner stats
    const { data: winnerProfile } = await supabase
      .from('users')
      .select('total_wins, total_matches, total_study_seconds')
      .eq('id', winnerId)
      .single();

    if (winnerProfile) {
      await supabase
        .from('users')
        .update({
          elo_rating: winnerNew,
          total_wins: (winnerProfile.total_wins || 0) + 1,
          total_matches: (winnerProfile.total_matches || 0) + 1,
          total_study_seconds: (winnerProfile.total_study_seconds || 0) + durationSeconds,
        })
        .eq('id', winnerId);
    }

    // Update loser stats
    const { data: loserProfile } = await supabase
      .from('users')
      .select('total_losses, total_matches, total_study_seconds')
      .eq('id', resolvedLoserId)
      .single();

    if (loserProfile) {
      await supabase
        .from('users')
        .update({
          elo_rating: loserNew,
          total_losses: (loserProfile.total_losses || 0) + 1,
          total_matches: (loserProfile.total_matches || 0) + 1,
          total_study_seconds: (loserProfile.total_study_seconds || 0) + durationSeconds,
        })
        .eq('id', resolvedLoserId);
    }

    // Get display names
    const { data: players } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', [winnerId, resolvedLoserId]);

    const winnerName = players?.find(p => p.id === winnerId)?.display_name || '';
    const loserName = players?.find(p => p.id === resolvedLoserId)?.display_name || '';

    // Determine caller perspective
    const callerIsWinner = caller_id === winnerId;
    const callerEloBefore = callerIsWinner ? winnerEloBefore : loserEloBefore;
    const callerEloAfter = callerIsWinner ? winnerNew : loserNew;
    const callerOpponentName = callerIsWinner ? loserName : winnerName;

    const updatedMatch = {
      ...match,
      winner_id: winnerId,
      loser_id: resolvedLoserId,
      end_reason: reason,
      ended_at: now.toISOString(),
      duration_seconds: durationSeconds,
      player1_elo_after: p1IsWinner ? winnerNew : loserNew,
      player2_elo_after: p1IsWinner ? loserNew : winnerNew,
    };

    const resultForCaller = {
      match: updatedMatch,
      isWinner: callerIsWinner,
      eloBefore: callerEloBefore,
      eloAfter: callerEloAfter,
      eloChange: callerEloAfter - callerEloBefore,
      durationSeconds,
      opponentName: callerOpponentName,
    };

    return NextResponse.json({
      result: resultForCaller,
      winnerId,
      loserId: resolvedLoserId,
    });
  } catch (err) {
    console.error('match end error:', err);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
