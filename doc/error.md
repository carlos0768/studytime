# Error Log

## 2026-02-12

### [解決済み] 戦績の対戦相手名がすべて「不明」になる
- 報告: 名前のある相手と対戦したのに、戦績欄では全件 `不明` と表示される。
- 原因:
  `GET /api/matches/history` で対戦相手の名前を `users` テーブルから通常の認証クライアントで取得していた。
  `users` のRLSにより他ユーザー行の `display_name` が取得できず、`opponentName` が常にフォールバックの `不明` になっていた。
- 解決法:
  認証チェックは従来通り行ったうえで、相手名解決だけをサービスロールクライアントに切り替えた。
  これにより履歴表示時に他ユーザー名を正しく解決できるようにした。
- 修正ファイル:
  `/Users/haradakarurosukei/Desktop/Working/studytime1/src/app/api/matches/history/route.ts`

### [解決済み] 進行中ルーム取得時に `fetch failed` / Cloudflare 500 が散発してログに出る
- 報告:
  `/api/matches/active` 取得時に `Failed to fetch active matches` として
  Cloudflare の `500 Internal Server Error` HTMLが返ることがある。
  さらに `auth.getUser()` 側でも `Error: fetch failed` が発生することがある。
- 原因:
  Supabase/Auth へのネットワークが一時的に不安定なとき、`auth.getUser()` や
  `matches/users` クエリで例外・上流500が発生し、そのまま失敗扱いになっていた。
  特に middleware は全リクエストで `auth.getUser()` を呼ぶため、散発的に例外ログが出やすかった。
- 解決法:
  一時障害向けにリトライ（短いバックオフ）を追加し、最終的に復旧しない場合でも
  非クリティカルな処理は劣化フォールバックするよう変更した。
  具体的には、`/api/matches/active` は空ルーム返却、middleware は当該リクエストのみ
  リダイレクト判定をスキップしてクラッシュを防ぐ。
- 修正ファイル:
  `/Users/haradakarurosukei/Desktop/Working/studytime1/src/app/api/matches/active/route.ts`
  `/Users/haradakarurosukei/Desktop/Working/studytime1/src/lib/supabase/middleware.ts`
