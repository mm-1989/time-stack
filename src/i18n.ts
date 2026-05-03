// 簡易 i18n。?lang=en or navigator.language で日英切替。
// 主要な UI 文言のみ翻訳、メッセージキー方式。

type Lang = 'ja' | 'en';

const messages: Record<Lang, Record<string, string>> = {
  ja: {
    'hint.shortcuts':
      '<kbd>M</kbd> / <kbd>H</kbd> / <kbd>D</kbd> スケール切替 ・ <kbd>Space</kbd> 一時停止 ・ <kbd>S</kbd> サウンド ・ <kbd>Shift+Click</kbd> でジャンプ',
    'hint.shortcuts.coarse':
      '<kbd>Space</kbd> 一時停止 ・ <kbd>?speed=N</kbd> で時間倍率',
    'init.title': '&gt;&nbsp;SELECT ORIGIN',
    'init.now.label': 'NOW',
    'init.now.sub': 'いまこの瞬間から計測 (スケールが順次アンロック)',
    'init.custom.label': 'CUSTOM',
    'init.custom.sub': '起点日時を指定 (誕生日 / 記念日 etc.)',
    'init.countdown.label': 'COUNTDOWN',
    'init.countdown.sub': '目標日時までの残時間を計測',
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
  },
  en: {
    'hint.shortcuts':
      '<kbd>M</kbd> / <kbd>H</kbd> / <kbd>D</kbd> scale · <kbd>Space</kbd> pause · <kbd>S</kbd> sound · <kbd>Shift+Click</kbd> jump',
    'hint.shortcuts.coarse':
      '<kbd>Space</kbd> pause · <kbd>?speed=N</kbd> time multiplier',
    'init.title': '&gt;&nbsp;SELECT ORIGIN',
    'init.now.label': 'NOW',
    'init.now.sub': 'Start from this moment (scales unlock progressively)',
    'init.custom.label': 'CUSTOM',
    'init.custom.sub': 'Specify origin date/time (birthday, anniversary, etc.)',
    'init.countdown.label': 'COUNTDOWN',
    'init.countdown.sub': 'Time remaining until target date',
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
