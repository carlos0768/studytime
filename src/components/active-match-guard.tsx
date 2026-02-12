'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Checks for recent unviewed match results on page load.
 * If the user lost by tab_hidden/page close, they never saw the result.
 * This guard catches them on their next visit and redirects to the result page.
 */
export function ActiveMatchGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    // Skip if already on match or result page
    if (pathname.startsWith('/match/') || pathname.startsWith('/result/')) return;
    // Skip on auth/landing pages
    if (pathname === '/' || pathname === '/login' || pathname === '/signup') return;

    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find the most recent ended match for this user
      const { data: matches } = await supabase
        .from('matches')
        .select('id, ended_at')
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
        .not('ended_at', 'is', null)
        .order('ended_at', { ascending: false })
        .limit(1);

      if (matches && matches.length > 0) {
        const latest = matches[0];
        const endedAt = new Date(latest.ended_at).getTime();
        const now = Date.now();
        const alreadySeen = sessionStorage.getItem(`match_result_${latest.id}`);
        // Redirect if match ended within last 2 minutes and not yet viewed
        if (now - endedAt < 120_000 && !alreadySeen) {
          router.replace(`/result/${latest.id}`);
        }
      }
    };

    check();
  }, [pathname, router, supabase]);

  return null;
}
