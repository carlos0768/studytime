import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const { code, password } = await request.json();

    // Service Role クライアントでルーム検索
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

    const { data: room, error } = await serviceClient
      .from('rooms')
      .select('id, name, code, password_hash')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !room) {
      return NextResponse.json(
        { error: 'ルームが見つかりません' },
        { status: 404 }
      );
    }

    const isValid = await bcrypt.compare(password, room.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'パスワードが正しくありません' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      room: { id: room.id, name: room.name, code: room.code },
    });
  } catch (err) {
    console.error('Join API error:', err);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
