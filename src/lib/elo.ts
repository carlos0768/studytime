import {
  ELO_K_FACTOR,
  DURATION_MULTIPLIER_THRESHOLDS,
} from './constants';

/**
 * Duration multiplier: short matches barely change elo, long matches get full change.
 * Linear ramp from 0.05 at MIN_SECONDS to 1.0 at FULL_SECONDS.
 */
function getDurationMultiplier(durationSeconds: number): number {
  const { MIN_SECONDS, FULL_SECONDS } = DURATION_MULTIPLIER_THRESHOLDS;
  if (durationSeconds <= MIN_SECONDS) return 0.05;
  if (durationSeconds >= FULL_SECONDS) return 1.0;
  return 0.05 + 0.95 * ((durationSeconds - MIN_SECONDS) / (FULL_SECONDS - MIN_SECONDS));
}

/**
 * Calculate new Elo ratings after a match.
 */
export function calculateElo(
  winnerRating: number,
  loserRating: number,
  durationSeconds: number
): { winnerNew: number; loserNew: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const multiplier = getDurationMultiplier(durationSeconds);
  const k = ELO_K_FACTOR * multiplier;

  const winnerNew = Math.round(winnerRating + k * (1 - expectedWinner));
  const loserNew = Math.round(loserRating + k * (0 - expectedLoser));

  return { winnerNew, loserNew };
}
