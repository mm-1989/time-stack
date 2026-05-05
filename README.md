# time-stack

時間の経過を **平面グリッド** で可視化する Web アプリ。TRON 風ワイヤーフレーム UI で「いま何時何分何秒なのか」を直感的に体感できる。

🌐 **Live demo**: https://mm-1989.github.io/time-stack/

## コンセプト

「時間の絶対量」を **5 つのスケール** に切り替えて可視化:

| バッジ | スケール (周期) | グリッド | 1 マスの意味 | サブ粒子 |
|---|---|---|---|---|
| **sec**   | 1 minute | 60 マス | 1 秒 | — |
| **min**   | 1 hour   | 60 マス | 1 分 | 60 秒粒子 |
| **hour**  | 1 day    | 24 マス | 1 時間 | 60 分粒子 |
| **day**   | 1 month  | 28〜31 マス (実月長) | 1 日 | 24 時粒子 |
| **month** | 1 year   | 12 マス | 1 か月 | 〜30 日粒子 |

各マスが「今ここ」で塗られ、進行中マス内では下位粒度(粒子)が動き続ける。1 周期完了で **集約アニメ → 上位スケールへ昇格フライト**(光が画面上部のスケールバッジに飛んでいく)。

時間の階層(秒 → 分 → 時 → 日 → 月 → 年)が、ビジュアルとして連鎖する設計。

month / year は壁時計暦にアンカーされ、月跨ぎでマス数が動的に変わる(うるう年判定込み)。

## 主要な操作

| キー / 操作 | 動作 |
|---|---|
| `M` / `H` / `D` / `O` / `Y` | スケール切替 (M=sec, H=min, D=hour, **O**=day, **Y**=month) |
| `[` / `]` | 前後スケールへ循環(ロック中は飛ばす) |
| 横スワイプ (タッチ) | 左 = 次スケール / 右 = 前スケール (カルーセル慣習) |
| マウス移動 | カメラ視差(canvas が pointer に追従) |
| マスホバー | そのマスが代表する時刻範囲をツールチップ表示 |
| `Space` | 一時停止 / 再開 |
| `S` | サウンド ON / OFF |
| **Σ** ボタン (右上) | SUMMARY ビューを開く(全スケール一覧 + 累積数値) |
| `↑↑↓↓←→←→BA` | ✨ Easter egg |

## SUMMARY ビュー

画面右上の **Σ** ボタンをタップ / クリックすると、これまで積み重なった時を一望するモーダルが開きます。

- **PROGRESS** (常時): 5 スケールの進捗バー + `X / Y` 表記(色は各スケール固有)
- **AGGREGATE** (Hour アンロック後): SEC / MIN / HOUR / DAY / YEAR の累積絶対値
- **LIFETIME** (Hour アンロック + `?since=` の起点指定時のみ):
  平均寿命 80 年との対比を `36.0 / 80 years`, `13,170 / 29,220 days` のように分母分子を明示

`%` 表記は使わず、すべて `X / Y` で具体感を保つ方針。

ESC / 背景タップ / × で閉じます。

## URL クエリ

### 起動モード

| クエリ | 例 | 効果 |
|---|---|---|
| `?scale=` | `?scale=hour` | 起動スケール指定 (`minute` / `hour` / `day` / `month` / `year`) |
| `?since=` | `?since=1990-04-15` | **任意起点**(誕生日 / 記念日 からの経過を可視化) |
| `?until=` | `?until=2030-01-01` | **カウントダウン**(目標日までの残時間) |
| `?lang=` | `?lang=en` | 言語切替 (`ja` / `en`、未指定時は `navigator.language`) |

### デバッグ / 演出制御

| クエリ | 効果 |
|---|---|
| `?speed=N` | 時間倍率(`?speed=900` で 15 分/秒) |
| `?animSlow=N` | アニメ全体を N 倍スローに |
| `?reset` | virtualMs を 0 から開始 |
| `?unlock=all` | progressive unlock を skip して全スケール解放 |
| `?dev=1` | ヒントにデバッグショートカット (`Shift+Click` 等) を表示 |
| `?debug=promotion` | 起動時に promotion フライトを強制発火 |
| `?debug=audio` | AudioContext.state と play 回数を HUD に表示 |
| `?debug=perf` | fps と 1 フレームあたり render 時間を HUD に表示 |
| `Shift + Click` | (機能のみ残存) 該当マスへ時刻ジャンプ。ヒントには `?dev=1` で表示 |

例: `?since=1990-01-01` で「1990 年元旦からの経過時間」を 5 スケールで切替視聴できる。

## 技術スタック

- **Vite 6** + TypeScript 5.6
- **Canvas 2D**(Three.js 不使用、bundle ~48KB / gzip ~16KB)
- **PWA**: manifest + Service Worker (Stale-While-Revalidate + precache + ナビゲーションフォールバック + 更新トースト)
- **vitest** で純粋ロジック (スケール計算、暦境界、巡回) の単体テスト 48 ケース
- **GitHub Pages** 配信、`base: /time-stack/` 固定
- **GitHub Actions** で deploy + Playwright 自動キャプチャ → `screenshots` ブランチ

## 開発

```bash
npm install
npm run dev               # http://localhost:5173/time-stack/
npm run typecheck         # tsc --noEmit
npm test                  # vitest run
npm run build             # dist/ にビルド
npm run preview           # production build をローカルで配信
npm run capture:local     # Playwright で localhost をキャプチャ
```

## 機能ダイジェスト

### ビジュアル (TRON コンセプト)
- ワイヤーフレームマス + ネオン発光 (cyan / deep cyan / orange / red-magenta / violet の 5 階層配色)
- 進行中マス boost (1.22 倍) + entry アニメ + 画面端まで貫通する crosshair
- 進行中マス内で下位粒子が脈動、最新粒子は白で「先頭」を強調
- 背景に 32px 間隔のアンビエントグリッド + radial 消失点フェード
- 4 隅 L 字コーナーマーク + CRT スキャンライン (静止 + 動く 2 層)
- マウス追随視差 (canvas が ±6px シフト、`pointer:coarse` では無効)

### 時間連鎖
- マス完了で `tick` 音 + 上位バッジが micropulse
- 1 周期完了で全マス中央集約 + afterglow → 上位スケールバッジへ promotion フライト (弧軌道 + trail)
- スケール切替バッジに進捗バー内蔵 (全スケール独立)
- ミニ上位ビュー (右上に「現在 +1 階層」のグリッド常時表示、月跨ぎで動的更新)
- progressive unlock: NOW モードでは時間経過で順にスケールが解放 (1分→Hour, 1時間→Day, 1日→Month, 30日→Year)

### HUD
- 経過時間 + 速度倍率 + 壁時計 (曜日 + JST 時刻)
- 経過 < 1 日のとき "Nd" を省略
- countdown モードでは目標日までの残時間表示
- 操作ヒント (6 秒で自動フェード、再操作で復帰)

### 入力
- 5 段階キーボードショートカット + `[` / `]` 巡回
- タッチデバイス: 横スワイプで前後スケール (距離 60px / 700ms 以内 / 水平比 1.4 のフリック判定)
- マウス操作とタッチ操作は `pointerType` で分岐し干渉しない

### 起動
- 「> SELECT ORIGIN」モーダルで NOW / 任意日時 / カウントダウン を選択
- 「> INITIALIZING TIME GRID」 1.4s フェード
- グリッドが中央から stagger で展開する シネマ intro

### サウンド + 触感
- WebAudio で tick / chime / promote 音 (sine wave 合成、合計 3KB 程度)
- iOS Safari 対応 (`warmupAudio` + 最初の user gesture で AudioContext を resume)
- mobile では `navigator.vibrate(15)` で軽い触感、スワイプ確定時にも 8ms バイブ
- `S` キーまたは右下インジケータで toggle

### PWA
- manifest.webmanifest (id, display_override, lifestyle/utilities/productivity カテゴリ)
- Service Worker は precache でシェルを取得 + ナビゲーションフォールバックでオフライン継続
- 新版 SW 検出時に画面下部に **更新トースト**(ワンタップで `SKIP_WAITING` + 自動リロード)
- dev 環境では SW を一切登録しない (localhost SW hijack 構造的回避)

### アクセシビリティ
- 各 UI 要素に aria-label / role
- `prefers-reduced-motion` でアニメ短縮
- 全シーン要素はキーボードと screen reader で到達可能

## ライセンス

MIT (個人ポートフォリオ作品)
