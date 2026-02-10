# StudyRoom — プロジェクト再構築プロンプト

以下のプロンプトを Claude に渡すことで、このプロジェクトを一から再現できます。

---

## プロンプト本文

```
あなたは Next.js と Supabase のエキスパートです。以下の仕様に基づいて「StudyRoom」というオンライン自習室アプリを一から構築してください。デザインは自分で考えてください。

---

## 概要

友達と一緒にオンラインで勉強するためのリアルタイム自習室アプリ。ユーザーはルームを作成し、招待コード+パスワードで友達を招待できる。勉強中はPage Visibility APIでタブ可視状態を検知し、10分連続勉強で1ポイント獲得。YouTube BGM機能あり。

---

## 技術スタック

- **フレームワーク**: Next.js 16（App Router, Turbopack）
- **言語**: TypeScript（strict mode）
- **スタイリング**: Tailwind CSS 4 + CSS カスタムプロパティ（ライト/ダークモード対応）
- **認証**: Supabase Auth
- **データベース**: Supabase PostgreSQL（RLS有効）
- **リアルタイム**: Supabase Realtime Presence
- **BGM**: YouTube IFrame API
- **パスワード**: bcryptjs
- **ルームコード生成**: nanoid
- **デプロイ**: Vercel

### package.json の dependencies

```json
{
  "dependencies": {
    "@supabase/ssr": "^0.8.0",
    "@supabase/supabase-js": "^2.95.3",
    "bcryptjs": "^3.0.3",
    "nanoid": "^5.1.6",
    "next": "16.1.6",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.6",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

---

## 環境変数

```
NEXT_PUBLIC_SUPABASE_URL=<Supabase URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase Anon Key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase Service Role Key>
```

---

## データベーススキーマ（Supabase Migration）

`supabase/migrations/001_initial.sql` として以下を作成:

```sql
-- Users table (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'ユーザー',
  total_points INTEGER NOT NULL DEFAULT 0,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create user row on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'ユーザー'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_members INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_code ON rooms(code) WHERE is_active = true;

-- Study sessions table
CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  room_id UUID NOT NULL REFERENCES rooms(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  points_earned INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_study_sessions_user ON study_sessions(user_id);

-- Daily stats table
CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

-- RLS Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "rooms_select_active" ON rooms FOR SELECT USING (is_active = true);
CREATE POLICY "rooms_insert_auth" ON rooms FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "rooms_update_owner" ON rooms FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "sessions_select_own" ON study_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_insert_own" ON study_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_update_own" ON study_sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "daily_stats_select_own" ON daily_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "daily_stats_insert_own" ON daily_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "daily_stats_upsert_own" ON daily_stats FOR UPDATE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
```

---

## ファイル構造

```
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx           # ルートレイアウト（lang="ja"）
│   ├── page.tsx             # ランディングページ
│   ├── login/page.tsx       # ログインページ
│   ├── signup/page.tsx      # 新規登録ページ
│   ├── dashboard/page.tsx   # ダッシュボード
│   ├── join/[code]/page.tsx # ルーム参加ページ
│   ├── room/[id]/page.tsx   # 自習室メインページ
│   └── api/
│       ├── rooms/route.ts   # ルーム作成API
│       └── join/route.ts    # ルーム参加API
├── hooks/
│   ├── use-auth.ts          # 認証フック
│   ├── use-study-timer.ts   # 勉強タイマーフック
│   ├── use-room.ts          # Realtime Presenceフック
│   └── use-bgm.ts           # YouTube BGMフック
├── lib/
│   ├── constants.ts         # 定数定義
│   └── supabase/
│       ├── client.ts        # ブラウザ用Supabaseクライアント
│       ├── server.ts        # サーバー用Supabaseクライアント
│       └── middleware.ts     # 認証ミドルウェアロジック
├── types/
│   └── index.ts             # TypeScript型定義
└── middleware.ts             # Next.jsミドルウェア
```

---

## 定数（src/lib/constants.ts）

```typescript
export const POINTS_PER_INTERVAL = 1;
export const POINTS_INTERVAL_MINUTES = 10;
export const MAX_ROOM_MEMBERS = 4;
export const ROOM_CODE_LENGTH = 6;
export const PRESENCE_SYNC_INTERVAL_MS = 30_000;
export const AWAY_TIMEOUT_MS = 60_000;
export const TIMER_TICK_MS = 1_000;
```

---

## 型定義（src/types/index.ts）

```typescript
export interface User {
  id: string;
  display_name: string;
  total_points: number;
  total_minutes: number;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  is_active: boolean;
  max_members: number;
  created_at: string;
}

export interface RoomMember {
  user_id: string;
  display_name: string;
  status: 'studying' | 'away';
  studying_minutes: number;
  joined_at: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  room_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  points_earned: number;
}
```

---

## Supabase クライアント

### ブラウザ用（src/lib/supabase/client.ts）
- `@supabase/ssr` の `createBrowserClient` を使用
- シングルトンパターンでクライアントをキャッシュ

### サーバー用（src/lib/supabase/server.ts）
- `@supabase/ssr` の `createServerClient` を使用
- Next.js の `cookies()` でクッキー管理
- `setAll` は try/catch でサーバーコンポーネントのエラーを無視

### ミドルウェア（src/lib/supabase/middleware.ts）
- 保護パス: `/dashboard`, `/room`
- 認証パス: `/login`, `/signup`
- 未認証→保護パス: `/login` にリダイレクト
- 認証済み→認証パス: `/dashboard` にリダイレクト
- `@supabase/ssr` の `createServerClient` でリクエスト/レスポンスのクッキーを管理

### ルートミドルウェア（src/middleware.ts）
- `updateSession` を呼ぶだけ
- matcher: `/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`

---

## フック詳細

### use-auth.ts
- `useAuth()` → `{ user, loading, signUp, signIn, signOut }`
- `signUp` は `user_metadata.display_name` を保存
- `onAuthStateChange` でリアルタイムにauth状態を追跡

### use-study-timer.ts
- `useStudyTimer()` → `{ studyingSeconds, secondsSinceLastPoint, isStudying, pointsEarned, formattedTime, formatTime }`
- 1秒ごとにインターバルで `studyingSeconds` と `secondsSinceLastPoint` をインクリメント
- `secondsSinceLastPoint` が `POINTS_INTERVAL_MINUTES * 60` に達したら `pointsEarned` +1、カウンターリセット
- Page Visibility API: タブ非表示で `isStudying=false`、`secondsSinceLastPoint` リセット、タイマー停止。タブ表示でタイマー再開
- `formatTime`: 1時間以上→`X時間Y分`、1時間未満→`X分YY秒`

### use-room.ts
- `useRoom({ roomId, userId, displayName, isStudying, studyingSeconds })` → `{ members }`
- Supabase Realtime の Presence チャンネル `room:{roomId}` を使用
- Presence の key は `userId`
- 30秒ごとに `channel.track()` で状態同期
- `isStudying` 変更時に即座に `track()` を呼ぶ
- `sync` イベントで `presenceState()` から `RoomMember[]` を構築

### use-bgm.ts
- `useBGM()` → `{ isPlaying, volume, videoUrl, videoTitle, play, pause, loadVideo, changeVolume }`
- YouTube IFrame API をスクリプトタグで動的ロード
- `extractVideoId`: youtube.com/watch?v=, youtu.be/, youtube.com/embed/, 11文字IDに対応
- プレイヤーは `#bgm-player` 要素に 0x0 で作成（音声のみ）
- loop=1, playlist=videoId でリピート
- URLは `localStorage('studyroom_bgm_url')` に保存
- API未ロード時は200msリトライ

---

## API ルート

### POST /api/rooms（ルーム作成）
- `@supabase/ssr` の `createServerClient` でリクエストcookieから認証ユーザー取得
- 未認証→401
- パスワード4文字未満→400
- `nanoid(6).toUpperCase()` でルームコード生成
- `bcrypt.hash(password, 10)` でパスワードハッシュ
- Service Roleクライアントで `users` テーブルに upsert（RLSバイパス）
- 認証済みクライアントで `rooms` テーブルに INSERT（RLS: `auth.uid() = owner_id`）
- レスポンス: `{ room: { id, name, code } }`

### POST /api/join（ルーム参加）
- Service Roleクライアントで `rooms` テーブルから code で検索
- `bcrypt.compare` でパスワード検証
- レスポンス: `{ room: { id, name, code } }`

---

## ページ機能仕様

### ランディング（/）
- ログインボタン、アカウント作成ボタン

### ログイン（/login）
- メール・パスワード入力
- エラー表示
- 新規登録リンク → /signup

### 新規登録（/signup）
- 表示名・メール・パスワード（6文字以上）入力
- エラー表示
- ログインリンク → /login

### ダッシュボード（/dashboard）
- ヘッダー: 表示名 + ログアウトボタン
- 統計: 累計勉強時間、累計ポイント
- 「自習室を作る」ボタン → モーダル表示
- ルームコード入力 + 参加ボタン（大文字変換、maxLength=6）
- 自分が作成した自習室一覧（owner_idでフィルタ、最大5件、作成日降順）
- ルーム作成モーダル: 自習室名（オプション）、パスワード（4文字以上必須）

### ルーム参加（/join/[code]）
- ルームコード表示
- パスワード入力（autoFocus）
- エラー表示
- 「参加する」ボタン

### 自習室（/room/[id]）— メインページ
- フルスクリーン表示

**トップバー**:
- 退出ボタン（→ /dashboard）
- ステータス表示（「集中モード」/「離席中」、緑ドットのパルスアニメーション付き）
- 獲得ポイント表示

**メインエリア**:
- 勉強タイマー（大きくモノスペースで表示）
- メンバーシート（MAX_ROOM_MEMBERS=4スロット）:
  - 空席表示
  - 在席メンバー: 表示名、ステータス（「自習中」/「離席中」）、継続勉強時間（Xh YYm / Xm）
  - 自分のメンバーシートは他と区別して表示
  - 自習中のメンバーの勉強時間は強調して表示

**フッター**:
- BGMコントロール:
  - BGMなし: 「♪ BGM」ボタンで YouTube URL入力表示
  - URL入力モード: テキスト入力 + OKボタン + ×ボタン
  - BGMあり: 再生/停止ボタン + 音量スライダー
- 次のポイントまでのプログレスリング（SVG円形、中央にmm:ss表示）

---

## 重要な実装メモ

1. **認証cookieの読み取り**: API Routeでは必ず `@supabase/ssr` の `createServerClient` を使う。手動で `cookies().getAll().find(c => c.name.includes('auth-token'))` のようにパースしてはいけない（Supabase SSRはcookieをチャンクする場合がある）
2. **Service Roleクライアント**: `users` テーブルへの upsert など、RLSをバイパスする必要がある操作にのみ使用
3. **ルーム作成のRLS**: `rooms` への INSERT は `auth.uid() = owner_id` が必要なので、認証済みクライアントで実行する
4. **Presenceのkey**: ユーザーIDを使い、同じユーザーの重複を防ぐ
5. **ポイントシステム**: タブ非表示で `secondsSinceLastPoint` がリセットされる。連続10分のみカウント
6. **BGMプレイヤー**: `#bgm-player` という hidden div にYouTube IFrame APIで0x0のプレイヤーを作成
7. **Supabase Auth確認メール不要設定**: Supabase管理画面で Email Confirmations を無効にする（開発時）
```
