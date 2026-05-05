// time-stack の最新画面を Playwright で headless キャプチャするスクリプト。
//
// 環境変数:
//   BASE_URL     対象 URL のベース (例: https://mm-1989.github.io/time-stack/ or http://localhost:5173/time-stack/)
//   OUT_DIR      出力先 (デフォルト: ./screenshots)
//   EXPECTED_SHA 指定時は polling で <meta name="build-id"> がこの値になるまで待ってから撮影開始
//                (= Pages CDN の伝播遅延対策)
//   POLL_TIMEOUT_MS  polling の最大待ち時間 (デフォルト: 300_000 = 5 分)
//
// 用途:
//   CI:    EXPECTED_SHA=$GITHUB_SHA BASE_URL=$PAGES_URL OUT_DIR=./out node scripts/capture.mjs
//   ローカル: BASE_URL=http://localhost:5173/time-stack/ node scripts/capture.mjs

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:5173/time-stack/').replace(/\/?$/, '/');
const OUT_DIR = process.env.OUT_DIR ?? './screenshots';
const EXPECTED_SHA = process.env.EXPECTED_SHA ?? null;
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS ?? 300_000);
// 音声 (WAV) 録音は重いため、明示トリガー時のみ。CI 側で audio.ts 変更や [audio]
// タグや workflow_dispatch を検出して CAPTURE_AUDIO=1 を渡す。
const CAPTURE_AUDIO = process.env.CAPTURE_AUDIO === '1';
const CAPTURE_AUDIO_REASON = process.env.CAPTURE_AUDIO_REASON ?? '';

// シーン定義。固定セット。差し替えは PR で。
// query: BASE_URL に追記するクエリ ('?' は付けない)
// wait:  goto 後の追加待機 ms (アニメや経過時間反映のため)
// viewport: { width, height } (省略時は 1280x800)
// 全シーン共通: since=now で init 画面 skip、unlock=all で全スケール強制 unlock
const SCENARIOS = [
  { name: '01-day-idle', query: 'scale=day&since=now&unlock=all', wait: 1500 },
  { name: '02-hour-idle', query: 'scale=hour&since=now&unlock=all', wait: 1500 },
  { name: '03-minute-idle', query: 'scale=minute&since=now&unlock=all', wait: 1500 },
  { name: '04-hour-mid', query: 'scale=hour&speed=900&since=now&unlock=all', wait: 5000 },
  { name: '05-collapse', query: 'scale=hour&speed=86400&reset&since=now&unlock=all', wait: 60_020 },
  { name: '06-mobile-day', query: 'scale=day&since=now&unlock=all', wait: 1500, viewport: { width: 375, height: 812 } },
  { name: '07-promotion', query: 'scale=minute&debug=promotion&animSlow=4&since=now&unlock=all', wait: 1300, waitUntil: 'domcontentloaded' },
  // 音声デバッグ: AudioContext.state + play 回数の HUD 表示と console log を捉える。
  { name: '08-audio-state', query: 'scale=minute&debug=audio&since=now&speed=900&unlock=all', wait: 4000, captureConsole: true, triggerGesture: true },
  // パフォーマンスデバッグ: 重い状態 (animSlow=4) で fps + render 時間を計測。
  // 4 秒間で複数サンプル → console.log の log を解析して fps を確認。
  { name: '09-perf', query: 'scale=hour&debug=perf&since=now&speed=900&unlock=all&animSlow=4', wait: 4000, captureConsole: true },
  // Countdown sand timer の検証用シーン群。?until= で countdown mode へ。
  // hour scale で grid が drain 方向 (count→0) に塗られていることを確認。
  // 10 = 開始直後 (ほぼ満タン)、11 = speed=10800 で 12h drain 後の中盤 (半分埋まる)、12 = mobile。
  { name: '10-countdown-idle', query: 'until=2030-01-01&unlock=all&scale=hour', wait: 1500 },
  { name: '11-countdown-mid', query: 'until=2030-01-01&speed=10800&unlock=all&scale=hour', wait: 4000 },
  { name: '12-countdown-mobile', query: 'until=2030-01-01&unlock=all&scale=hour', wait: 1500, viewport: { width: 375, height: 812 } },
  // B+C 設計の natural scale 検証用。短い countdown では natural scale が確定し、
  // それより大きい scale が selector で lock される。
  // until 日付はキャプチャ日 + N で動的生成 (キャプチャタイミングに依存しない)。
  // 13 = 30 日後 countdown (natural=month、year のみ lock。month scale = 30 cells)
  // 14 = 5 時間後 countdown (natural=day、month/year lock。day scale = 5 cells)
  { name: '13-countdown-30d-month', query: `until=${dateOffsetIsoDate(30)}&unlock=all&scale=month`, wait: 1500 },
  // 8h offset: 5h だと capture 起動ラグで count=4 < MIN_CELLS (=5) で natural=null
  // にフォールバックしてしまうため、余裕を見て 8h (count=8) で natural=day を確実化。
  { name: '14-countdown-8h-day', query: `until=${dateOffsetIsoTime(8 * 3600)}&unlock=all&scale=day`, wait: 1500 },
];

/** N 日後の YYYY-MM-DD を返す (UTC ベース、URL パーサに渡す形) */
function dateOffsetIsoDate(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** N 秒後の YYYY-MM-DDTHH:MM を返す */
function dateOffsetIsoTime(secAhead) {
  const d = new Date(Date.now() + secAhead * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mn}`;
}

function buildUrl(query) {
  // cache buster を必ず付ける (CDN 越しで古いキャッシュを踏まないため)
  const buster = `_v=${EXPECTED_SHA ?? Date.now()}`;
  const sep = query ? '&' : '';
  return `${BASE_URL}?${query}${sep}${buster}`;
}

/**
 * Pages CDN の伝播完了を意味的に検証。
 * <meta name="build-id"> が EXPECTED_SHA と一致するまで 5 秒間隔で polling。
 * 一致しなかったら例外で fail (古い版で撮るより明示エラーが望ましい)。
 */
async function waitForFreshBuild(page) {
  if (!EXPECTED_SHA) {
    console.log('EXPECTED_SHA 未指定: build-id polling をスキップ (ローカル想定)');
    return;
  }
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    const url = `${BASE_URL}?_probe=${Date.now()}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const actual = await page
      .$eval('meta[name="build-id"]', (el) => el.getAttribute('content'))
      .catch(() => null);
    if (actual === EXPECTED_SHA) {
      console.log(`[#${attempt}] ✓ build-id matched: ${actual}`);
      return;
    }
    console.log(`[#${attempt}] waiting... actual=${actual ?? 'none'} expected=${EXPECTED_SHA}`);
    await page.waitForTimeout(5000);
  }
  throw new Error(`build-id never matched ${EXPECTED_SHA} within ${POLL_TIMEOUT_MS}ms`);
}

async function main() {
  console.log(`BASE_URL = ${BASE_URL}`);
  console.log(`OUT_DIR  = ${OUT_DIR}`);
  console.log(`EXPECTED_SHA = ${EXPECTED_SHA ?? '(none)'}`);

  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    // build-id polling 用の page を 1 つ用意 (デスクトップ viewport)
    const probeCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const probePage = await probeCtx.newPage();
    await waitForFreshBuild(probePage);
    await probeCtx.close();

    // シーン撮影
    for (const s of SCENARIOS) {
      const viewport = s.viewport ?? { width: 1280, height: 800 };
      const ctx = await browser.newContext({
        viewport,
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      // captureConsole が指定されていれば、console.log を集めて txt 保存
      const consoleLines = [];
      if (s.captureConsole) {
        page.on('console', (msg) => {
          if (msg.type() === 'log' || msg.type() === 'info') {
            consoleLines.push(msg.text());
          }
        });
      }
      const url = buildUrl(s.query);
      console.log(`→ ${s.name} (${viewport.width}×${viewport.height}) ${url}`);
      await page.goto(url, { waitUntil: s.waitUntil ?? 'networkidle' });
      // triggerGesture: 起動直後に画面中央クリックで user gesture を作り、
      // AudioContext.resume() を許容させる (audio debug シーンで使用)
      if (s.triggerGesture) {
        await page.waitForTimeout(200);
        await page.mouse.click(viewport.width / 2, viewport.height / 2);
      }
      if (s.wait > 0) await page.waitForTimeout(s.wait);
      await page.screenshot({ path: `${OUT_DIR}/${s.name}.png`, fullPage: false });
      if (s.captureConsole && consoleLines.length > 0) {
        await writeFile(`${OUT_DIR}/${s.name}.log`, consoleLines.join('\n') + '\n');
        console.log(`  saved ${OUT_DIR}/${s.name}.png + ${s.name}.log (${consoleLines.length} lines)`);
      } else {
        console.log(`  saved ${OUT_DIR}/${s.name}.png`);
      }
      await ctx.close();
    }

    // 音声 (WAV) は CAPTURE_AUDIO=1 のときだけ実行 (audio 関連の変更時 or 手動)
    if (CAPTURE_AUDIO) {
      console.log(`\n[audio capture triggered: ${CAPTURE_AUDIO_REASON}]`);
      await captureAudioSample(browser);
    } else {
      console.log('\n[audio capture skipped] (CAPTURE_AUDIO=0)');
    }
  } finally {
    await browser.close();
  }

  const sceneCount = SCENARIOS.length;
  const audioMsg = CAPTURE_AUDIO ? ' + 1 audio sample' : '';
  console.log(`\nDone. ${sceneCount} screenshots${audioMsg} saved to ${OUT_DIR}`);
}

async function captureAudioSample(browser) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  const url = buildUrl('audioTest=1');
  console.log(`→ audio-sample.wav  ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // recordAudioSample(3) → blob を window.__audioBlob にセットされる迄待つ
  await page.waitForFunction(
    () => Boolean(window.__audioBlob),
    { timeout: 15_000 },
  );
  // Blob を ArrayBuffer 経由で Node 側へ
  const data = await page.evaluate(async () => {
    const blob = window.__audioBlob;
    const buf = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buf));
  });
  const buffer = Buffer.from(data);
  await writeFile(`${OUT_DIR}/audio-sample.wav`, buffer);
  console.log(`  saved ${OUT_DIR}/audio-sample.wav (${buffer.length} bytes)`);
  await ctx.close();
}

main().catch((e) => {
  console.error('capture failed:', e);
  process.exit(1);
});
