# time-stack

時間の経過を **平面グリッド** で可視化する Web アプリ。TRON 風ワイヤーフレーム UI で「いま何時何分何秒なのか」を直感的に体感できる。

🌐 **Live demo**: https://mm-1989.github.io/time-stack/

## コンセプト

「時間の絶対量」を **3 つのスケール** に切り替えて可視化:

| スケール | グリッド | 1 マスの意味 |
|---|---|---|
| **1 minute** | 60 マス | 1 秒 |
| **1 hour** | 60 マス | 1 分 (内部に 60 秒粒子) |
| **1 day** | 24 マス | 1 時間 (内部に 60 分粒子) |

各マスが「今ここ」で塗られ、進行中マス内では下位粒度(粒子)が動き続ける。1 周期完了で **集約アニメ → 上位スケールへ昇格フライト**(光が画面上部のスケールバッジに飛んでいく)。

時間の階層(秒 → 分 → 時 → 日)が、ビジュアルとして連鎖する設計。

## 主要な操作

| キー / 操作 | 動作 |
|---|---|
| `M` / `H` / `D` | スケール切替(1 分 / 1 時間 / 1 日) |
| マウス移動 | カメラ視差(canvas が pointer に追従) |
| マスホバー | そのマスが代表する時刻範囲をツールチップ表示 |
| `Space` | 一時停止 / 再開 |
| `S` | サウンド ON / OFF |
| `Shift + Click` | デバッグ: 該当マスへ時刻ジャンプ |
| `↑↑↓↓←→←→BA` | ✨ Easter egg |

## URL クエリ

| クエリ | 例 | 効果 |
|---|---|---|
| `?scale=` | `?scale=hour` | 起動スケール指定 (`minute` / `hour` / `day`) |
| `?since=` | `?since=2000-01-01` | **任意起点**(誕生日 / 記念日 からの経過を可視化) |
| `?speed=` | `?speed=900` | 時間倍率(デバッグ用) |
| `?animSlow=` | `?animSlow=4` | アニメ全体を N 倍スローに |
| `?reset` | `?reset` | virtualMs を 0 から開始 |
| `?debug=promotion` | | 起動時に promotion フライトを強制発火 |

例: `?since=1990-01-01` で「1990 年元旦からの経過時間」を秒/分/時/日のスケールで切替視聴できる。

## 技術スタック

- **Vite 6** + TypeScript 5.6
- **Canvas 2D**(Three.js は不使用、bundle 30KB / gzip 10KB)
- **GitHub Pages** 配信
- **GitHub Actions** で deploy + Playwright 自動キャプチャ → `screenshots` ブランチ

## 開発

```bash
npm install
npm run dev               # http://localhost:5173/time-stack/
npm run typecheck         # tsc --noEmit
npm run build             # dist/ にビルド
npm run preview           # production build をローカルで配信
npm run capture:local     # Playwright で localhost をキャプチャ
```

## 機能ダイジェスト

### ビジュアル(TRON コンセプト)
- ワイヤーフレームマス + ネオン発光(cyan / orange)
- 進行中マス boost(1.22 倍)+ entry アニメ + 画面端まで貫通する crosshair
- 進行中マス内で下位粒子が脈動、最新粒子は白で「先頭」を強調
- 背景に 32px 間隔のアンビエントグリッド + radial 消失点フェード
- 4 隅 L 字コーナーマーク + CRT スキャンライン(静止 + 動く 2 層)
- マウス追随視差(canvas が ±6px シフト)

### 時間連鎖
- マス完了で `tick` 音 + 上位バッジが micropulse
- 1 周期完了で全マス中央集約 + afterglow → 上位スケールバッジへ promotion フライト(弧軌道 + trail)
- スケール切替バッジ自体に進捗バー内蔵(全スケール独立)
- ミニ上位ビュー(右上に「現在 +1 階層」のグリッド常時表示)

### 起動
- 「> SELECT ORIGIN」モーダルで NOW か 任意日時を選択
- 「> INITIALIZING TIME GRID」 1.4s フェード
- グリッドが中央から stagger で展開する シネマ intro

### サウンド + 触感
- WebAudio で tick / chime / promote 音(sine wave 合成、合計 3KB 程度)
- mobile では `navigator.vibrate(15)` で軽い触感
- `S` キーまたは右下インジケータで toggle

## ライセンス

MIT (個人ポートフォリオ作品)
