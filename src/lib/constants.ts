// Elo rating
export const ELO_DEFAULT_RATING = 1500;
export const ELO_K_FACTOR = 32;

// Duration multiplier for Elo changes
// Short matches = minimal rating change, long matches = full change
export const DURATION_MULTIPLIER_THRESHOLDS = {
  MIN_SECONDS: 300,      // 5 min — below this, almost no elo change
  FULL_SECONDS: 3600,    // 60 min — above this, full elo change
} as const;

// Heartbeat for disconnect detection
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_TIMEOUT_MS = 15_000;

// Lobby presence
export const LOBBY_SYNC_INTERVAL_MS = 10_000;

// Match challenge expiry
export const CHALLENGE_EXPIRE_MS = 30_000;

// Max members in lobby (for isometric room display)
export const MAX_LOBBY_MEMBERS = 4;
