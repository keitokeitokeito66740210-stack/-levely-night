# LEVELY NIGHT — Live MVP

BAR LEVELY向けの複数端末リアルタイムWebゲームMVPです。

## 今回実装したもの

- ホストがROOMを作成
- QR / ROOM CODEで各スマホから参加
- プレイヤー一覧のリアルタイム同期
- 各端末へ個別の秘密ミッションを配布
- STAFF専用画面
- STAFFから4種類のリアルイベントを1タップ送信
- STAFFが関与したように見せるFAKEイベント
- 全端末へのFINAL RESULT同期
- インストール不要のブラウザ参加

## 1. Supabaseを準備

1. https://supabase.com でプロジェクトを作成。
2. SQL Editorで `supabase-schema.sql` を実行。
3. Project Settings → API から Project URL と anon/public key を取得。
4. `config.js` を開き、以下を置き換える。

```js
window.LEVELY_CONFIG = {
  SUPABASE_URL: "https://xxxxx.supabase.co",
  SUPABASE_ANON_KEY: "xxxxx"
};
```

## 2. 公開

このフォルダは静的Webアプリなので、Vercel / Netlify / Cloudflare Pages等へそのまま公開できます。

Vercelの場合はGitHubへこのフォルダを置き、New ProjectでImportするだけです。Build Commandは不要です。

## 3. 遊び方

1. 公開URLを開き「新しいゲームを作る」。
2. 画面のQRを他のプレイヤーが読む。
3. 各自ニックネームを入れて参加。
4. ホストが「ゲーム開始」。
5. 各端末に異なる秘密ミッションが表示される。
6. スタッフ端末で `https://公開URL/?staff=ROOMCODE` を開く。
7. KARAOKE / STAFF ATTACK / BLACK ORDER / CHAOSを押すと全員へリアルタイム配信。
8. FINAL RESULTで全端末が終了画面へ移行。

## MVPで意図的にまだ入れていないもの

- スタッフログイン認証
- 不正なROOM操作を防ぐroom token
- 投票集計による本当のランキング
- BLACK ORDERの注文確認フロー
- 店舗POSとの連携
- 常連LEVEL / 来店履歴
- 管理画面からミッション文章を編集
- 店舗分析ダッシュボード

これらは店舗テスト後に追加する方が、使われない機能へ開発時間を使わずに済みます。

## セキュリティ上の注意

`supabase-schema.sql` のRLSポリシーは、短期間の店舗テストを優先したMVP設定です。公開サービス化する前にスタッフ認証とROOM単位の権限制御へ変更してください。
