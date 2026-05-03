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
import { mkdir } from 'node:fs/promises';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:5173/time-stack/').replace(/\/?$/, '/');
const OUT_DIR = process.env.OUT_DIR ?? './screenshots';
const EXPECTED_SHA = process.env.EXPECTED_SHA ?? null;
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS ?? 300_000);

// シーン定義。固定セット。差し替えは PR で。
// query: BASE_URL に追記するクエリ ('?' は付けない)
// wait:  goto 後の追加待機 ms (アニメや経過時間反映のため)
// viewport: { width, height } (省略時は 1280x800)
const SCENARIOS = [
  { name: '01-day-idle', query: 'scale=day', wait: 1500 },
  { name: '02-hour-idle', query: 'scale=hour', wait: 1500 },
  { name: '03-minute-idle', query: 'scale=minute', wait: 1500 },
  { name: '04-hour-mid', query: 'scale=hour&speed=900', wait: 5000 },
  // ?reset を加えて 0 起点 + 加速で 60 秒 + 0.3 秒 = collapse アニメ中盤を狙う
  { name: '05-collapse', query: 'scale=hour&speed=86400&reset', wait: 60_300 },
  { name: '06-mobile-day', query: 'scale=day', wait: 1500, viewport: { width: 375, height: 812 } },
];

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
      const url = buildUrl(s.query);
      console.log(`→ ${s.name} (${viewport.width}×${viewport.height}) ${url}`);
      await page.goto(url, { waitUntil: 'networkidle' });
      if (s.wait > 0) await page.waitForTimeout(s.wait);
      await page.screenshot({ path: `${OUT_DIR}/${s.name}.png`, fullPage: false });
      await ctx.close();
      console.log(`  saved ${OUT_DIR}/${s.name}.png`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. ${SCENARIOS.length} screenshots saved to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('capture failed:', e);
  process.exit(1);
});
