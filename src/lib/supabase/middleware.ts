import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/lobby', '/match', '/result', '/stats'];
const AUTH_PATHS = ['/login', '/signup'];
const AUTH_RETRY_ATTEMPTS = 3;

type ErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function isValidUrl(str: string | undefined): str is string {
  if (!str) return false;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function toErrorLike(err: unknown): ErrorLike {
  if (err && typeof err === 'object') {
    const maybe = err as Record<string, unknown>;
    return {
      message: typeof maybe.message === 'string' ? maybe.message : null,
      details: typeof maybe.details === 'string' ? maybe.details : null,
      hint: typeof maybe.hint === 'string' ? maybe.hint : null,
    };
  }
  if (typeof err === 'string') {
    return { message: err, details: null, hint: null };
  }
  return { message: null, details: null, hint: null };
}

function isTransientAuthError(err: unknown): boolean {
  const e = toErrorLike(err);
  const text = `${e.message || ''} ${e.details || ''} ${e.hint || ''}`.toLowerCase();
  return (
    text.includes('fetch failed') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('cloudflare') ||
    text.includes('internal server error') ||
    text.includes('gateway') ||
    text.includes('connection') ||
    text.includes('network')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 環境変数が未設定の場合はそのまま通す
  if (!isValidUrl(url) || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user: { id: string } | null = null;

  for (let i = 0; i < AUTH_RETRY_ATTEMPTS; i += 1) {
    try {
      const {
        data: { user: fetchedUser },
        error,
      } = await supabase.auth.getUser();

      if (!error) {
        user = fetchedUser;
        break;
      }

      const retryable = isTransientAuthError(error);
      if (retryable && i < AUTH_RETRY_ATTEMPTS - 1) {
        await delay(80 * (i + 1));
        continue;
      }
      if (retryable) {
        console.warn('Transient auth failure in middleware, skip redirect logic for this request:', error);
        return supabaseResponse;
      }

      // Non-transient auth errors are treated as unauthenticated.
      user = null;
      break;
    } catch (err) {
      const retryable = isTransientAuthError(err);
      if (retryable && i < AUTH_RETRY_ATTEMPTS - 1) {
        await delay(80 * (i + 1));
        continue;
      }
      if (retryable) {
        console.warn('Transient auth exception in middleware, skip redirect logic for this request:', err);
        return supabaseResponse;
      }

      console.error('Auth check failed in middleware:', err);
      user = null;
      break;
    }
  }

  const { pathname } = request.nextUrl;

  // 未認証 → 保護パスにアクセス → /login にリダイレクト
  if (!user && PROTECTED_PATHS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 認証済み → 認証パスにアクセス → /lobby にリダイレクト
  if (user && AUTH_PATHS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/lobby';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
