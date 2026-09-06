# AREA OHYABA FC 公式サイト V2

さいたま市南区・大谷場地区を拠点に活動する社会人サッカークラブ **AREA OHYABA FC** の公式サイト（新バージョン）。

- **確認用プレビュー:** https://taishi16.github.io/area-ohyaba-fc-v2/
- **現行サイト（変更していません）:** https://area-ohyaba.sub.jp/

> 現在はクラブオーナー確認用のプレビュー段階です。
> 現行サイトへの反映は、承認後に別途行います。

---

## このサイトの考え方

| 方針 | 実現方法 |
|---|---|
| **更新にコードを触らない** | Googleスプレッドシート1枚を直すだけ |
| **手で並べ替えない** | 日付とstatusを見てサイトが自動で振り分ける |
| **月額0円** | 静的ファイル＋無料ホスティング＋Googleスプレッドシート＋Apps Script |
| **壊れにくい** | 有料API・トークン更新・CMS・データベースを使わない |
| **止まらない** | スプレッドシートが読めなくても同梱データで表示し続ける |

---

## ディレクトリ

```
area-ohyaba-fc-v2/
├── site/                     公開されるファイル一式（これがそのままサイト）
│   ├── index.html            TOP
│   ├── club.html             クラブ（理念・ミッション・エンブレム・地域・基本情報）
│   ├── players.html          選手・スタッフ
│   ├── matches.html          試合（NEXT / LAST / 年度別 SCHEDULE・RESULTS）
│   ├── news.html             ニュース一覧
│   ├── news-detail.html      ニュース本文（?id=N001 の形で1ページを使い回す）
│   ├── 404.html
│   ├── robots.txt            ※プレビュー中は検索エンジン非公開の設定
│   ├── favicon.png
│   ├── assets/css/style.css  スタイル（1本）
│   ├── assets/js/config.js   接続先の設定（ここだけ触ればシート連携に切り替わる）
│   ├── assets/js/app.js      データ取得・自動振り分け・描画
│   ├── assets/img/           最適化済み画像（WebP）
│   └── data/site-data.json   同梱データ（スプレッドシートが読めないときの控え）
├── sheets/                   Googleスプレッドシートにそのまま取り込めるCSV
├── gas/Code.gs               Googleスプレッドシート → JSON 配信スクリプト
├── data/                     現行サイトから抽出した元データ（CSV）
├── docs/PHASE0_REPORT.md     現行サイト調査レポート
├── tools/                    画像最適化・データ生成・公開スクリプト
├── BACKUP/                   現行サイトの完全バックアップ（Gitには含めない・ローカル保持）
├── CONTENT_UPDATE_GUIDE.md   ★ 更新マニュアル（クラブ運営者向け）
└── MIGRATION.md              本番切替の手順
```

---

## 技術構成

- HTML + CSS + Vanilla JavaScript のみ。**フレームワーク・ビルド・Node.js 不要**
- 外部から読み込むもの: Google Fonts（Barlow Condensed）と Instagram公式埋め込みスクリプトのみ
- jQuery は使用していません（現行サイトの2013年版jQueryは撤去）
- 対応確認幅: **375 / 390 / 768 / 1024 / 1280 / 1440 px**

### データの流れ

```
Googleスプレッドシート（7シート）
      ↓ Google Apps Script（公開する列だけを選んでJSONにする）
      ↓ fetch（5分間だけブラウザに記憶）
   ホームページ（日付・状態を見て自動で振り分けて描画）
      ↓ 読めなかったとき
   site/data/site-data.json（同梱データ）
```

`site/assets/js/config.js` の `AO_API_URL` が空の間は、同梱データだけで動きます。

---

## 開発・保守コマンド

```bash
# 画像を最適化する（BACKUP/ の元画像 → site/assets/img/）
tools/optimize_images.sh

# sheets/*.csv から同梱データを作り直す
python3 tools/build_data.py

# 手元で表示を確認する
cd site && python3 -m http.server 8899

# プレビューを公開しなおす（gh-pages ブランチへ）
tools/deploy_preview.sh
```

---

## 自動で振り分けられるもの

| 表示場所 | 条件 |
|---|---|
| NEXT MATCH | 今日以降 かつ `status = scheduled` のうち、いちばん近い1試合 |
| LAST MATCH | `status = finished` のうち、いちばん新しい1試合 |
| RESULTS | `status = finished` を新しい順 |
| SCHEDULE | 今日以降の未実施試合を近い順 |
| 年度切替 | 登録された試合の日付から自動生成（年度が増えてもページは増えません） |
| NEWS | `published = TRUE` を日付の新しい順 |
| PLAYERS / STAFF / SPONSORS | `active = TRUE` のみ、`display_order` 順 |
| 勝敗表示 | 得点から WIN / DRAW / LOSE を自動判定 |

---

## 費用

初期費用・月額費用ともに **0円**。有料CMS・有料API・有料プラグイン・データベースは使用していません。
（現行URL `area-ohyaba.sub.jp` の維持については `MIGRATION.md` を参照）
