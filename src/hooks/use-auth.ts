'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { User as AuthUser } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: { user: AuthUser | null } | null) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 初期セッション取得
    supabase.auth.getSession().then(({ data }: { data: { session: { user: AuthUser | null } | null } }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // メールOTP送信
  const sendOtp = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
    },
    [supabase]
  );

  // OTP検証（セッション作成）
  const verifyOtp = useCallback(
    async (email: string, token: string) => {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) throw error;
      return data;
    },
    [supabase]
  );

  // 表示名の更新（auth metadata + usersテーブル）
  const updateDisplayName = useCallback(
    async (displayName: string) => {
      // 1. auth metadata を更新
      const { data, error } = await supabase.auth.updateUser({
        data: { display_name: displayName },
      });
      if (error) throw error;

      // 2. users テーブルも更新
      if (data.user) {
        await supabase
          .from('users')
          .update({ display_name: displayName })
          .eq('id', data.user.id);
      }

      // ローカルのuser stateを更新
      setUser(data.user);
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [supabase]);

  return { user, loading, sendOtp, verifyOtp, updateDisplayName, signOut };
}
