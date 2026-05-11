// 簡易 i18n。?lang=en or navigator.language で日英切替。
// 主要な UI 文言のみ翻訳、メッセージキー方式。

type Lang = 'ja' | 'en';

const messages: Record<Lang, Record<string, string>> = {
  ja: {
    'hint.shortcuts':
      '<kbd>M</kbd>=sec / <kbd>H</kbd>=min / <kbd>D</kbd>=hour / <kbd>O</kbd>=day / <kbd>Y</kbd>=month ・ <kbd>Space</kbd> 一時停止 ・ <kbd>S</kbd> サウンド',
    'hint.shortcuts.coarse':
      '<kbd>← →</kbd> スワイプでスケール切替',
    'hint.shortcuts.dev':
      '<kbd>M</kbd>=sec / <kbd>H</kbd>=min / <kbd>D</kbd>=hour / <kbd>O</kbd>=day / <kbd>Y</kbd>=month ・ <kbd>Space</kbd> 一時停止 ・ <kbd>S</kbd> サウンド ・ <kbd>Shift+Click</kbd> でジャンプ ・ <kbd>?debug=</kbd> / <kbd>?speed=</kbd>',
    'hint.shortcuts.coarse.dev':
      '<kbd>← →</kbd> スワイプでスケール切替 ・ <kbd>?speed=N</kbd> 時間倍率 ・ <kbd>?debug=</kbd>',
    'init.title': '&gt;&nbsp;SELECT ORIGIN',
    'init.now.label': 'NOW',
    'init.now.sub': 'いまこの瞬間から計測 (スケールが順次アンロック)',
    'init.custom.label': 'CUSTOM',
    'init.custom.sub': '起点日時を指定 (誕生日 / 記念日 etc.)',
    'init.begin': '&gt;&nbsp;BEGIN',
    'init.aria': '起点を選択',
    'hud.realtime': '実時間',
    'hud.countdown.suffix': '残',
    'hud.countdown.reached': '到達',
    'unlock.prefix': '> NEW SCALE: ',
    'scaleSwitch.aria': 'スケール切替',
    'sound.aria': 'サウンド ON/OFF 切替',
    'sound.tooltip': 'S キーでオンオフ',
    'canvas.aria': '時間グリッドのビジュアライザ',
    'update.available': '新しいバージョンがあります',
    'update.reload': '更新',
    'update.dismiss': '閉じる',
    'summary.open': 'サマリーを開く',
    'summary.close': '閉じる',
    'summary.title': 'タイムサマリー',
  },
  en: {
    'hint.shortcuts':
      '<kbd>M</kbd>=sec / <kbd>H</kbd>=min / <kbd>D</kbd>=hour / <kbd>O</kbd>=day / <kbd>Y</kbd>=month · <kbd>Space</kbd> pause · <kbd>S</kbd> sound',
    'hint.shortcuts.coarse':
      '<kbd>← →</kbd> swipe to switch scale',
    'hint.shortcuts.dev':
      '<kbd>M</kbd>=sec / <kbd>H</kbd>=min / <kbd>D</kbd>=hour / <kbd>O</kbd>=day / <kbd>Y</kbd>=month · <kbd>Space</kbd> pause · <kbd>S</kbd> sound · <kbd>Shift+Click</kbd> jump · <kbd>?debug=</kbd> / <kbd>?speed=</kbd>',
    'hint.shortcuts.coarse.dev':
      '<kbd>← →</kbd> swipe scale · <kbd>?speed=N</kbd> multiplier · <kbd>?debug=</kbd>',
    'init.title': '&gt;&nbsp;SELECT ORIGIN',
    'init.now.label': 'NOW',
    'init.now.sub': 'Start from this moment (scales unlock progressively)',
    'init.custom.label': 'CUSTOM',
    'init.custom.sub': 'Specify origin date/time (birthday, anniversary, etc.)',
    'init.begin': '&gt;&nbsp;BEGIN',
    'init.aria': 'Select origin',
    'hud.realtime': 'real-time',
    'hud.countdown.suffix': 'left',
    'hud.countdown.reached': 'REACHED',
    'unlock.prefix': '> NEW SCALE: ',
    'scaleSwitch.aria': 'Scale switcher',
    'sound.aria': 'Toggle sound',
    'sound.tooltip': 'Press S to toggle',
    'canvas.aria': 'Time grid visualizer',
    'update.available': 'New version available',
    'update.reload': 'Update',
    'update.dismiss': 'Dismiss',
    'summary.open': 'Open summary',
    'summary.close': 'Close',
    'summary.title': 'Time summary',
  },
};

let currentLang: Lang = 'ja';

function detect(): Lang {
  if (typeof window === 'undefined') return 'ja';
  const q = new URL(location.href).searchParams.get('lang');
  if (q === 'en' || q === 'ja') return q;
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en')) {
    return 'en';
  }
  return 'ja';
}

export function initLang(): void {
  currentLang = detect();
  if (typeof document !== 'undefined') document.documentElement.lang = currentLang;
}

export function t(key: string): string {
  return messages[currentLang][key] ?? messages.ja[key] ?? key;
}

export function getLang(): Lang {
  return currentLang;
}
