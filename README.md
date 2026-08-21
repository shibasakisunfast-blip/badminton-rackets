# バドミントンラケット図鑑（社内ツール）

バドミントンラケットのスペックとレビューをまとめて閲覧し、「ヘッドバランス × 硬さ」のマトリクスで
一覧比較できる社内用の静的Webアプリです。サーバー費用ゼロで運用できるように、GitHub Pages
（無料の静的ホスティング）での公開を想定しています。

## 構成

```
badminton-rackets/
├─ index.html      アプリ本体（ページ構造）
├─ style.css        見た目
├─ app.js           一覧・フィルタ・マトリクス図・詳細モーダルのロジック
├─ data/
│   └─ rackets.json  ラケットデータ本体（＝この仕組みにおける「スプレッドシート」）
├─ serve.ps1         ローカル動作確認用の簡易HTTPサーバー(PowerShell, 追加インストール不要)
└─ README.md
```

`data/rackets.json` が唯一のデータソースです。ここに1台分の情報を1オブジェクトとして
追加するだけで、一覧・マトリクス図の両方に自動的に反映されます（コード変更は不要）。

## ラケットの新規登録フロー

このアプリ自体は静的サイト（サーバー処理なし）なので、アプリが自動でネットの情報を
収集し続けることはできません。そのため登録は次の流れで行います。

1. Claude（このチャット、または今後の会話）に「〇〇（ラケット名）を登録して」と依頼する
2. Claude が公式メーカーサイトやレビューサイトをリサーチし、`data/rackets.json` に
   1エントリを追加する（不明な項目は正直に `null`／「不明」にする方針で運用しています）
3. 変更を GitHub にプッシュする（下記コマンド）と、数十秒〜数分でページに反映される

この方式なら追加の月額費用・APIキーは一切不要です。

### データ項目（`rackets.json` の1エントリ）

| フィールド | 内容 |
|---|---|
| `id` | 一意なスラッグ（例: `yonex-astrox-100zz`） |
| `brand` / `model` | ブランド名・モデル名 |
| `release_year` | 発売年（不明なら `null`） |
| `weight_class` / `weight_g` | 重量クラスと概算グラム数 |
| `balance_point_mm` | バランスポイント(mm)。公表されていない製品も多い |
| `head_balance` | `Head Heavy` / `Even Balance` / `Head Light` のいずれか（マトリクス図のY軸） |
| `flex` | `Flexible` / `Medium` / `Stiff` / `Extra Stiff` のいずれか（マトリクス図のX軸） |
| `shaft_material` / `frame_material` | 素材情報 |
| `string_tension_lbs` | 推奨ストリングテンション |
| `price_jpy_approx` | 参考価格(円) |
| `review_summary_ja` | レビューサイトの内容を要約した日本語文（出典に基づくもののみ） |
| `sources` | 参照した情報源のURL一覧（詳細モーダルにリンク表示） |

`head_balance` と `flex` はこの4種類・3種類の固定カテゴリで管理しています（マトリクス図の
軸として使うため）。新しいラケットを追加する際は、メーカー公式スペックまたは複数レビューの
コンセンサスに基づいてこの分類に当てはめます。

## ローカルで確認する

ブラウザは `file://` からの `fetch()` を許可しないため、簡易サーバーを立てて確認します
（Python/Node不要、PowerShell標準機能のみ使用）。

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

起動後、ブラウザで `http://localhost:8791/` を開いてください。

## 無料で社内公開する（GitHub Pages）

社内の誰かのPCを常時起動しておく必要はありません。GitHub Pages は GitHub が無料でホスティング
してくれる静的サイトサービスで、公開後は24時間いつでもPC・スマホからURLでアクセスできます。

1. GitHub でリポジトリを新規作成する（例: `badminton-rackets`）
   - 会社アカウントのプライバシー方針に従い、Public / Private（社内限定にしたいなら Private。
     ただし無料プランでは Private リポジトリの Pages 公開には GitHub Team/Enterprise が必要になる
     場合があるので、社外秘情報を含まないなら Public 推奨）
2. このフォルダの中身をそのリポジトリにプッシュする

   ```bash
   cd "badminton-rackets"
   git init
   git add .
   git commit -m "Initial commit: badminton racket catalog app"
   git branch -M main
   git remote add origin https://github.com/<あなたのアカウント>/badminton-rackets.git
   git push -u origin main
   ```

3. GitHub リポジトリの Settings → Pages で、Source を「Deploy from a branch」、
   Branch を `main` / `/(root)` に設定して Save
4. 数分後に `https://<あなたのアカウント>.github.io/badminton-rackets/` で公開される

以降、新しいラケットを追加したら `git add . && git commit -m "..." && git push` するだけで
数十秒〜数分後にページへ反映されます。

## マトリクス図について

X軸「硬さ」は Flexible → Medium → Stiff → Extra Stiff、Y軸「ヘッドバランス」は
Head Light → Even Balance → Head Heavy の4×3グリッドです。同じマスに複数のラケットが
入る場合は自動的に少しずらして表示されます。点をクリックすると詳細（一覧のカードと同じ
モーダル）が開きます。
