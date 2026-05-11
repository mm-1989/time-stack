# time-stack 開発ガイド

README.md にユーザ向けの仕様 (UI / 起点モード / URL クエリ) は揃っているので、ここでは **コード上の責務分離** と **作業の進め方 (チェックフロー / 罠)** に絞る。

## ファイル責務マップ

`src/` 配下の役割:

| ファイル | 責務 |
|---|---|
| `main.ts` | bootstrap / tick ループ / origin・scale 状態の保持。新規ロジックはここに足さず、対応モジュールへ寄せる |
| `scales.ts` | **コア**。スケール定義 (`SCALES` / `SCALE_ORDER`)、`snapshotScale`、countdown natural scale 算出。新しい時間ロジックはここで完結させる |
| `origin.ts` | NOW / custom (`?since=`) / countdown (`?until=`) の起点解決と remaining 計算 |
| `time.ts` | 暦ベースの純関数 (`calendarBreakdown`、anniversary 計算、月末クランプ) |
| `grid.ts` | Canvas 2D 描画専。データ計算は持ち込まない (`GridOptions` 経由で受け取る) |
| `hud.ts` | DOM テキスト更新。`formatCountdownRemain` のような表示用純関数を export してテスト対象にする |
| `summary.ts` | Σ モーダル (HEADER / PROGRESS / AGGREGATE / LIFETIME) |
| `scaleSwitch.ts` | バッジ列 UI。lock / unlock 状態の単一情報源 |
| `gestures.ts` | スワイプ判定。マウス操作とは `pointerType` で分岐 (干渉禁止) |
| `i18n.ts` | ja/en の文字列辞書 |
| `audio.ts` | WebAudio。`?debug=audio` で state を HUD に出せる |
| `initScreen.ts` / `promotion.ts` / `widgets.ts` / `easterEgg.ts` / `updateToast.ts` / `debug.ts` | 補助 UI |

テスト: `*.test.ts` は同階層に置く (`scales.test.ts` / `hud.test.ts` / `origin.test.ts` / `time.test.ts`)。

## セルフチェック (必須)

新規ロジック追加・修正時は必ず以下を実行する。スキップ不可。

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run (純関数の単体テスト)
npm run build       # 本番ビルド
```

加えて **新しい純粋関数には単体テストを必ず追加** する。表示関数も対象 (例: `formatCountdownRemain`)。pure に切り出してテストする方針。

UI 変更を伴う場合は **GitHub Actions のスクリーンショットキャプチャ** で目視確認する。`scripts/capture.mjs` の SCENARIOS にシーンを足し、main push 後に `screenshots` ブランチを `git fetch + reset --hard` で取り込む。ローカル目視は `npm run capture:local` でも可。音声 (WAV) はユーザ指定時のみ (commit メッセージに `[audio]` タグ or workflow_dispatch)。

## 設計上の制約 (コードから読みづらいもの)

- **`?until=` / `?since=` は init 時にのみ設定可**。session 中の切替なし、リロードでリセット。countdown を session 中に開始する API は意図的に持たない
- **countdown natural scale**: `findCountdownNaturalScale(totalMs)` で「period ≥ total かつ count ≥ MIN_CELLS(=5)」の最小スケールを選ぶ。それより大きいスケールは `lockedCountdownScales` で UI lock。砂時計の cell 単位を直感に合わせるための仕組み
- **countdown の grid 反転**: `snapshotScale` で `filled = count - filled` を行い、追加で行方向に flip (`r = rows-1-rowIdx`)。grid.ts は `countdownMode` フラグで分岐するだけ
- **drained cell は countdown 時完全非表示**。`drawCellRaw` で `!isFilled && !isCurrent` なら早期 return。「既に消えた」ことの視覚的ノイズを排除
- **dev 環境では Service Worker を登録しない**。localhost SW の origin 干渉 (別プロジェクトを stale で塗りつぶす問題) を構造的に回避するため

## 罠と対処

- **WSL2 では Vite の再起動に注意**。pkill 経由で再起動すると localhost forwarding が壊れて `wsl --shutdown` が必要になる。dev server は基本起動しっぱなしで運用する
- **Vite 8 ではなく Vite 6 固定**。Vite 8 + rolldown のネイティブバイナリで WSL の `npm install` がハング
- **`grid.ts` の `drawCellRaw` は `renderGrid` のローカル変数を見れない**。`opts.countdownMode` のように options から読む

## Git 運用

`git push origin main` は自由に実行してよい。クライアント完結の Canvas 2D Web アプリで、機密情報が構造的に入る余地がないため。

ただし以下は事前に方針合意の上で行う:
- `--force` / `-f` (force push)
- `--no-verify` (フックスキップ)
- main の削除・履歴改変
- 将来 API キーが必要な機能 (KV / 認証など) を入れる場合は方針再評価

commit は noreply email を使う。
