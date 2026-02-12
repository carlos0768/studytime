export function formatStudyTimeWithSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getLocalDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveTodayBaseline(userId: string, dateKey: string, recordedTotalSeconds: number): number {
  const normalized = Math.max(0, Math.floor(recordedTotalSeconds));
  const storageKey = `study_baseline:${userId}:${dateKey}`;
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? Number(raw) : NaN;
    const validParsed = Number.isFinite(parsed) ? Math.floor(parsed) : NaN;

    if (!Number.isFinite(validParsed) || validParsed > normalized) {
      localStorage.setItem(storageKey, String(normalized));
      return normalized;
    }

    return validParsed;
  } catch {
    return normalized;
  }
}
