import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type SupabaseErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

type ActiveMatchRow = {
  id: string;
  player1_id: string;
  player2_id: string;
  started_at: string;
};

type UserNameRow = {
  id: string;
  display_name: string | null;
};

function toErrorLike(err: unknown): SupabaseErrorLike {
  if (err && typeof err === 'object') {
    const maybe = err as Record<string, unknown>;
    return {
      message: typeof maybe.message === 'string' ? maybe.message : null,
      details: typeof maybe.details === 'string' ? maybe.details : null,
      hint: typeof maybe.hint === 'string' ? maybe.hint : null,
      code: typeof maybe.code === 'string' ? maybe.code : null,
    };
  }
  if (typeof err === 'string') {
    return { message: err, details: null, hint: null, code: null };
  }
  return { message: null, details: null, hint: null, code: null };
}

function isRetryableUpstreamError(error: SupabaseErrorLike | null | undefined): boolean {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    text.includes('internal server error') ||
    text.includes('cloudflare') ||
    text.includes('fetch failed') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('gateway') ||
    text.includes('connection')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getUserIdWithRetry(
  authClient: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  attempts = 3
): Promise<{ userId: string | null; transientAuthFailure: boolean }> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const {
        data: { user },
        error,
      } = await authClient.auth.getUser();

      if (!error) {
        return { userId: user?.id ?? null, transientAuthFailure: false };
      }

      if (isRetryableUpstreamError(error)) {
        if (i < attempts - 1) {
          await delay(80 * (i + 1));
          continue;
        }
        return { userId: null, transientAuthFailure: true };
      }

      return { userId: null, transientAuthFailure: false };
    } catch (err) {
      const normalized = toErrorLike(err);
      if (isRetryableUpstreamError(normalized)) {
        if (i < attempts - 1) {
          await delay(80 * (i + 1));
          continue;
        }
        return { userId: null, transientAuthFailure: true };
      }
      throw err;
    }
  }

  return { userId: null, transientAuthFailure: true };
}

async function runWithRetry<T>(
  query: () => PromiseLike<{ data: T | null; error: SupabaseErrorLike | null }>,
  attempts = 3
): Promise<{ data: T | null; error: SupabaseErrorLike | null }> {
  let lastError: SupabaseErrorLike | null = null;

  for (let i = 0; i < attempts; i += 1) {
    const { data, error } = await query();
    if (!error) return { data, error: null };

    lastError = error;
    const canRetry = isRetryableUpstreamError(error);
    if (!canRetry || i === attempts - 1) {
      return { data: null, error };
    }

    await delay(120 * (i + 1));
  }

  return { data: null, error: lastError };
}

export async function GET(request: Request) {
  try {
    const authClient = await getSupabaseServerClient();
    const { userId, transientAuthFailure } = await getUserIdWithRetry(authClient);

    if (transientAuthFailure) {
      console.warn('Active matches auth check temporarily unavailable. Falling back to empty rooms.');
      return NextResponse.json({ rooms: [] });
    }

    if (!userId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedLimit = parseInt(searchParams.get('limit') || '6', 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 6, 1), 8);
    const excludeUserId = searchParams.get('exclude_user_id') || userId;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch extra rows first because one side may include excludeUserId
    const { data: matches, error: matchesError } = await runWithRetry<ActiveMatchRow[]>(() =>
      supabase
        .from('matches')
        .select('id, player1_id, player2_id, started_at')
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(limit + 8)
    );

    if (matchesError) {
      // Spectator rooms are non-critical. On transient upstream errors, degrade gracefully.
      if (isRetryableUpstreamError(matchesError)) {
        console.warn('Active matches temporarily unavailable. Falling back to empty rooms:', matchesError);
        return NextResponse.json({ rooms: [] });
      }
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

    const { data: users, error: usersError } = await runWithRetry<UserNameRow[]>(() =>
      supabase
        .from('users')
        .select('id, display_name')
        .in('id', userIds)
    );

    if (usersError) {
      if (isRetryableUpstreamError(usersError)) {
        console.warn('Active match user names temporarily unavailable. Returning fallback names:', usersError);
        const rooms = filtered.map((m) => ({
          match_id: m.id,
          player1_id: m.player1_id,
          player2_id: m.player2_id,
          player1_name: '不明',
          player2_name: '不明',
          started_at: m.started_at,
        }));
        return NextResponse.json({ rooms });
      }
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
