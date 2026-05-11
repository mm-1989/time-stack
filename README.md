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

各マスが「今ここ」で塗られ、進行中マス内では下位粒度のサブ粒子(四角の格子)が動き続ける。最新粒子(= 進行中の 1 つ)は白く塗られ、1.6 秒周期で十字レイの **kira フラッシュ** で目を惹く。

1 周期完了で **集約アニメ → 上位スケールへ昇格フライト**(光が画面上部のスケールバッジへ弧軌道で飛んでいく)。

month / year は壁時計暦にアンカーされ、月跨ぎでマス数が動的に変わる(うるう年判定込み)。

## 起点モードと anchor 切替

origin (起点) のモードによって、month / year スケールの「サイクル境界」が自動で切り替わります。ユーザは何も設定せず `?since=` を付けるだけで HUD と grid の数値が一致します。

| モード | 起動方法 | grid 方向 | HUD | 概念 |
|---|---|---|---|---|
| **NOW** | デフォルト or 起動画面 NOW 選択 | 累積 (0 → count) | 経過 (`HH:MM:SS`) | 「いま何時何分か」 |
| **CUSTOM** | `?since=YYYY-MM-DD` | 累積 (anniversary 起点) | 経過累積 (`Ny Mmo Wd HH:MM:SS`) | 「何年生きたか」 |
| **COUNTDOWN** | `?until=YYYY-MM-DD` | **drain (count → 0、砂時計)** | 2 行構成: 上に `→ target (曜日)` 小、下に残時間大 | **「残何日か」** |

countdown は **砂時計パラダイム**: page load 時刻 = T0、target = 0 cells。時間経過と共にすべてのスケールで cells が削れていく。HUD の経過時間表示は隠れ、残時間が主役に。SUMMARY も `REMAINING` ラベル + `TOTAL REMAINING` セクションで残時間ベースに切り替わる。

さらに **natural scale 算出**: 残時間に対し「1 周期 ≥ 全期間 かつ 5 マス以上」を満たす最小スケールを自動選定し、それより大きい (= 全期間が 1 マス未満になってしまう) スケールはバッジを **ロック**。砂時計の cell 単位が直感に合うように制御する。残量が削れていくと、ロック解除しても粒度が荒すぎないスケールだけが選べる状態を維持する。drain で空になったマスは完全に消える ("既に消えた" ノイズ排除)。

### 例: `?since=1990-04-15` の場合

- HUD: `36y 0mo 20d HH:MM:SS` (起点累積、calendar 差分)
- 月スケール grid: 直近月命日 (4/15) からの経過日 = 20 日 fill (HUD と一致)
- 年スケール grid: 直近年命日 (1990 → 2026 → 4/15) からの経過月 (HUD と一致)
- 月命日が無い月 (Jan 31 起点 → 2 月の 31 日) は **月末日にクランプ** (Feb 28 / 29 / Apr 30 等)
- うるう年 2/29 起点 → 平年は 2/28 にクランプ

### 例: NOW モード

- HUD: `HH:MM:SS` (日数省略、< 1 day のため)
- 月スケール grid: 今日 = 当月の N 日目 (壁時計)
- 年スケール grid: 今月 = 当年の M 月 (壁時計)

### HUD 経過時間の表示形式 (階段化)

| 経過 | 表示例 |
|---|---|
| < 1 day | `14:32:18` |
| 1〜29 day | `5d 14:32:18` |
| 1〜11 mo | `2mo (8w) 14d 14:32:18` |
| 1〜1.99 y | `1y 6mo (78w) 14d 14:32:18` |
| ≥ 2 y | `2y 6mo 14d 14:32:18` (週数表示は消える) |

経過 2 年未満 + month 単位が出る粒度では、**累計週数** を `(Nw)` で併記 (`時間が「何週」相当か` を直感把握)。

## 主要な操作

| キー / 操作 | 動作 |
|---|---|
| `M` / `H` / `D` / `O` / `Y` | スケール切替 (M=sec, H=min, D=hour, **O**=day, **Y**=month) |
| `[` / `]` | 前後スケールへ循環 (ロック中は飛ばす) |
| 横スワイプ (タッチ) | 左 = 次スケール / 右 = 前スケール (カルーセル慣習) |
| マウス移動 | カメラ視差 (canvas が pointer に追従) |
| マスホバー | そのマスが代表する時刻範囲をツールチップ表示 (全 scale wall-clock) |
| `Space` | 一時停止 / 再開 |
| `S` | サウンド ON / OFF |
| **Σ** ボタン (右上) | SUMMARY ビューを開く (全スケール一覧 + 累積数値 + LIFETIME) |
| `↑↑↓↓←→←→BA` | ✨ Easter egg |

## SUMMARY ビュー

画面右上の **Σ** ボタンをタップ / クリックで、これまで積み重なった時を一望するモーダルが開きます。

- **HEADER**: 経過時間 (HUD と同じ階段表示) + 壁時計 + 曜日
- **PROGRESS** (常時): 5 スケールの進捗バー + `X / Y (P%)` 表記 (具体値と % を併記)
- **AGGREGATE** (Hour アンロック後): SEC / MIN / HOUR / DAY / YEAR の累積絶対値 (3 桁区切り)
- **LIFETIME** (Hour アンロック + `?since=` の起点指定時のみ):
  平均寿命 80 年との対比を `36.0 / 80 years (45%)`, `13,170 / 29,220 days (45%)` のように分母分子と % を両方明示
- **ORIGIN**: 起点情報 (NOW / custom date / countdown target)

ESC / 背景タップ / × で閉じます。

## URL クエリ

### 起動モード

| クエリ | 例 | 効果 |
|---|---|---|
| `?scale=` | `?scale=hour` | 起動スケール指定 (`minute` / `hour` / `day` / `month` / `year`) |
| `?since=` | `?since=1990-04-15` | **任意起点** (誕生日 / 記念日 からの経過を可視化、anchor が anniversary に自動切替) |
| `?until=` | `?until=2030-01-01` | **カウントダウン** (目標日までの残時間) |
| `?lang=` | `?lang=en` | 言語切替 (`ja` / `en`、未指定時は `navigator.language`) |

### デバッグ / 演出制御

| クエリ | 効果 |
|---|---|
| `?speed=N` | 時間倍率 (`?speed=900` で 15 分/秒) |
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
- **Canvas 2D** (Three.js 不使用、bundle ~50KB / gzip ~17KB)
- **PWA**: manifest + Service Worker (Stale-While-Revalidate + precache + ナビゲーションフォールバック + 更新トースト)
- **vitest** で純粋ロジック (スケール計算、暦境界、巡回、anniversary 算出、countdown 残時間表示) の単体テスト 124 ケース
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
- 進行中マス内のサブ粒子は **四角の格子** で表示。先頭 (最新) 粒子は白い四角 + pulse + 1.6 秒周期の **kira flash** (200ms フラッシュ + 十字 rays)
- 背景に 32px 間隔のアンビエントグリッド + radial 消失点フェード
- 4 隅 L 字コーナーマーク + CRT スキャンライン (静止 + 動く 2 層)
- マウス追随視差 (canvas が ±6px シフト、`pointer:coarse` では無効)

### 時間連鎖
- マス完了で `tick` 音 + 上位バッジが micropulse
- 1 周期完了で全マス中央集約 + afterglow → 上位スケールバッジへ promotion フライト (弧軌道 + trail)
- スケール切替バッジ下部に細い進捗バー内蔵 (5 スケール独立、月境界で 1.0 → 0.0 にスムーズ遷移)
- progressive unlock: NOW モードでは時間経過で順にスケールが解放 (1分→Hour, 1時間→Day, 1日→Month, 30日→Year)

### HUD
- 経過時間 (calendar diff for `?since=` users): `Ny Mmo (Ww) Dd HH:MM:SS` の階段表示。経過 2 年未満で累計週数を併記
- 速度倍率 (`実時間` or `×N`)
- 壁時計 (曜日 + JST 時刻、常時表示)
- countdown モードでは目標日 (曜日付き) と残時間を 2 行構成で表示 (残時間プロミネント)
- 操作ヒント (6 秒で自動フェード、再操作で復帰)

### 入力
- 5 段階キーボードショートカット (M/H/D/O/Y) + `[` / `]` 巡回
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
- `S` キーまたは右上インジケータ (Σ ボタン直下) で toggle

### PWA
- manifest.webmanifest (id, display_override, lifestyle/utilities/productivity カテゴリ)
- Service Worker は precache でシェルを取得 + ナビゲーションフォールバックでオフライン継続
- 新版 SW 検出時に画面下部に **更新トースト** (ワンタップで `SKIP_WAITING` + 自動リロード)
- dev 環境では SW を一切登録しない (localhost SW hijack 構造的回避)

### モバイル UX
- 画面右上に Σ ボタン + サウンドインジケータを縦スタック
- canvas 下部の冗長な進捗バー (ELAPSED テキスト / % of CYCLE) を撤廃 → SUMMARY とバッジ進捗 dot で同情報取得
- safe-area-inset 対応で iOS のノッチ / ホームインジケータ領域を回避
- padBot 動的調整で進行中マスのラベルとスケールバッジ列が干渉しない

### アクセシビリティ
- 各 UI 要素に aria-label / role
- `prefers-reduced-motion` でアニメ短縮
- 全シーン要素はキーボードと screen reader で到達可能

## 位置づけ

個人プロジェクト。業務外の自主制作で、Canvas 2D / PWA / 純関数テスト駆動などの実装パターンを実験する場として運用しています。社内共有はあくまで参考用で、業務システムではありません。

## ライセンス

MIT
