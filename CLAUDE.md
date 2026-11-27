# 9th-city-site

旭川市非公式Vtuber「九日なここ」の非公式ファンサイト（GitHub Pages のプロジェクトサイト）。
静的 HTML のみで、ページのビルドツールは使わない（CSS は各ページの中に書く）。

## 構成

| パス | 内容 |
| --- | --- |
| `index.html` | メインページ（プロフィール・活動歴など） |
| `request.html` | GitHub Discussions での要望の出し方ガイド |
| `marshmallow.html` | マシュマロ対応表 |
| `sitemap.xml` | ページを変更したら `lastmod` を更新する（下記「ページの日付」） |
| `quiz/` | 旭川クイズ（公開されるページ）。他ページからはリンクしない独立ページ |
| `quiz-src/` | 旭川クイズの元データと生成スクリプト |
| `.github/workflows/build-quiz.yml` | クイズのデータを自動で再生成する CI |

`main` ブランチの内容がそのまま GitHub Pages で公開される。
`main` には GitHub 上での直接編集や CI の自動コミットも入るので、作業前と push 前に `git pull` すること。

## ページの日付

`index.html` / `request.html` / `marshmallow.html` は、検索結果に正しい日付が出るよう、同じ日付を次の 3 か所に書いている。内容を更新したら、すべて揃えて更新する（日付は日本時間）。

1. タイトル下の `<p class="page-dates">` … 「最終更新日」（`<time datetime>` と表示の両方）
2. `<head>` の構造化データ（`application/ld+json` の `Article`）の `dateModified`
3. `sitemap.xml` の `lastmod`

「公開日」と `datePublished` はページを最初に公開した日なので変えない。見た目だけの修正や誤字の修正では日付を進めない（中身が変わっていないのに日付だけ新しくすると、Google に不自然な更新とみなされうる）。

## 旭川クイズ

### ファイルの役割

- `quiz-src/questions.mjs` … **元データ**。問題文・選択肢・正答・解説・出典を平文で書く。問題を直すときはここだけを編集する。
- `quiz-src/build.mjs` … 元データから `quiz/data.js` を生成するスクリプト。
- `quiz/data.js` … **自動生成ファイル。直接編集しない。**
  - 問題文と選択肢は平文。
  - 正答は SHA-256 のハッシュ（`ソルト:問題ID:回答` をハッシュ化）。問題ページの採点はハッシュ同士の比較で行う。
  - 正答・解説・出典は AES-GCM で暗号化。解説ページ（`quiz/answer.html`）だけが復号する。
- `quiz/index.html` … 問題ページ。採点時は点数と所要時間のみ表示し、回答を URL の `#r=...` に入れて解説ページへ渡す。
  - 制限時間は 4 分（`LIMIT`）。残り時間を表示し、0 になったら確認なしでその時点の回答を採点する。`quiz/answer.html` の `LIMIT`（「時間切れ」表示の判定）と揃えること。
  - 問題は 1 問ずつ表示する（「前の問題」「次の問題」と問題一覧で移動。最後の問題で「採点する」）。
  - 並び替えはドラッグ（タッチは左のつまみ）か ▲▼ ボタンで操作する。初期の並びもそのまま回答として扱う（回答済みの表示は、その問題を一度表示した時点から）。
- `quiz/answer.html` … 解説ページ。各問の正誤・正解・解説・出典を表示する。

ソルトと鍵（パスフレーズ）は `build.mjs` と `quiz/*.html` にべた書きしている。
目的は「Web ページのソースを見ても、ぱっと見で答えが分からない」ことだけで、元データもリポジトリで公開している。
ソルトや鍵を変えるときは、`build.mjs`（`SALT` / `PASSPHRASE`）と `quiz/answer.html`（`PASSPHRASE`）を揃えること。

### 元データの書式

```js
{
  level: "易" | "中" | "難",          // 難易度（出題順を決めるためのもの。画面には表示しない）
  type: "single" | "multi" | "order",   // 4択 / 一問多答 / 並び替え
  q: "問題文",
  choices: ["選択肢", ...],              // 並び替えでは表示時の初期順（正解と同じ順は build がエラーにする）
  answer: 1 | [0, 2] | [3, 1, 0, 2],     // 0 始まりの選択肢番号（single は数値、multi は正解の集合、order は正しい順）
  explain: "解説（である調）",
  refs: [{ t: "表示名", u: "URL" }],     // Wikipedia は W("記事名") で書ける
}
```

出題順は配列の順番で、**難易度（易 → 中 → 難）、同じ難易度の中では形式（4択 → 一問多答 → 並び替え）** の順に並べる。この順になっていないと build がエラーにする。

問題 ID（`q1`, `q2`, …）は配列の順番から振られる。並べ替えや追加・削除をすると ID がずれるため、変更前に作られた解説ページの URL では正しく表示されなくなる。

### 元データを変更したら

1. `quiz/data.js` を作り直す。

   ```sh
   node quiz-src/build.mjs
   ```

   - 必要なのは **Node.js 18 以上**のみ（暗号化には Node 標準の `node:crypto` の Web Crypto API を使う）。`npm install` するパッケージはない。
   - 同じ元データからは毎回同じ `data.js` ができる（IV を平文のハッシュから決めているため）。
2. `quiz-src/` と `quiz/data.js` を一緒に commit して push する。

push し忘れても CI（`build-quiz.yml`）が補う。

- `main` への push で `quiz-src/` か `quiz/data.js` が変わると、`data.js` を再生成し、差分があれば `github-actions[bot]` が `main` に commit する（GitHub 上で元データを直接編集した場合も同じ）。
- 同じリポジトリ内のブランチからの PR では、PR のブランチに同じように commit する。
- フォークからの PR には push できないので、`data.js` が元データと一致しなければ CI を失敗させる。

CI が commit すると、ローカルの `main` は 1 コミット遅れる。次の作業の前に `git pull` すること。

### 動作確認

`crypto.subtle` は https か localhost でしか使えないので、ローカルでは HTTP サーバー経由で開く。

```sh
python -m http.server 8000 --bind 127.0.0.1
# http://localhost:8000/quiz/
```
