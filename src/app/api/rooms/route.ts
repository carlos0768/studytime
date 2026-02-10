import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { ROOM_CODE_LENGTH } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const { name, password } = await request.json();

    // 認証チェック
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name: n, value, options }) =>
                cookieStore.set(n, value, options)
              );
            } catch {
              // ignore
            }
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!password || password.length < 4) {
      return NextResponse.json(
        { error: 'パスワードは4文字以上必要です' },
        { status: 400 }
      );
    }

    const code = nanoid(ROOM_CODE_LENGTH).toUpperCase();
    const passwordHash = await bcrypt.hash(password, 10);

    // Service Role クライアントで users テーブルに upsert（RLSバイパス）
    const serviceClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    await serviceClient.from('users').upsert({
      id: user.id,
      display_name:
        user.user_metadata?.display_name || 'ユーザー',
    });

    // 認証済みクライアントでルーム作成（RLS: auth.uid() = owner_id）
    const roomName = name || `${user.user_metadata?.display_name || 'ユーザー'}の自習室`;
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({
        name: roomName,
        code,
        password_hash: passwordHash,
        owner_id: user.id,
      })
      .select('id, name, code')
      .single();

    if (error) {
      console.error('Room creation error:', error);
      return NextResponse.json(
        { error: 'ルームの作成に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ room });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
