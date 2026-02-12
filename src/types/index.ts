export interface User {
  id: string;
  display_name: string;
  elo_rating: number;
  total_wins: number;
  total_losses: number;
  total_matches: number;
  total_study_seconds: number;
  created_at: string;
}

export interface Match {
  id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  loser_id: string | null;
  end_reason: 'giveup' | 'tab_hidden' | 'disconnect' | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  player1_elo_before: number;
  player2_elo_before: number;
  player1_elo_after: number | null;
  player2_elo_after: number | null;
}

export interface MatchChallenge {
  id: string;
  challenger_id: string;
  challenger_name: string;
  challenged_id: string;
  challenged_name: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
}

export interface LobbyMember {
  user_id: string;
  display_name: string;
  elo_rating: number;
  joined_at: string;
}

export interface MatchResult {
  match: Match;
  isWinner: boolean;
  eloBefore: number;
  eloAfter: number;
  eloChange: number;
  durationSeconds: number;
  opponentName: string;
}

export interface ActiveMatchRoom {
  match_id: string;
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
  started_at: string;
}
