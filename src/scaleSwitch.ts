import { SCALE_ORDER, SCALES, nextUnlockedScale, type ScaleId } from './scales';
import { t } from './i18n';

// スケール切替 UI: 上部中央に 3 ボタン。クリック / キーボード (m/h/d) / 矢印切替に対応。

export class ScaleSwitch {
  private root: HTMLDivElement;
  private buttons = new Map<ScaleId, HTMLButtonElement>();
  private current: ScaleId;
  private onChange: (id: ScaleId) => void;
  private unlockedSet = new Set<ScaleId>();

  constructor(parent: HTMLElement, initial: ScaleId, onChange: (id: ScaleId) => void) {
    this.current = initial;
    this.onChange = onChange;

    this.root = document.createElement('div');
    this.root.className = 'scale-switch';
    this.root.setAttribute('role', 'tablist');
    this.root.setAttribute('aria-label', t('scaleSwitch.aria'));
    parent.appendChild(this.root);

    for (const id of SCALE_ORDER) {
      const btn = document.createElement('button');
      btn.className = 'scale-btn';
      btn.type = 'button';
      btn.dataset.scale = id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', `${SCALES[id].label} に切替`);
      btn.setAttribute('aria-selected', initial === id ? 'true' : 'false');
      btn.innerHTML = `<span class="scale-dot" style="background:${SCALES[id].fillColor}" aria-hidden="true"></span><span class="scale-label">${SCALES[id].shortLabel}</span>`;
      btn.addEventListener('click', () => this.set(id));
      this.root.appendChild(btn);
      this.buttons.set(id, btn);
    }
    this.refresh();

    requestAnimationFrame(() => this.root.classList.add('hud-on'));

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyM') this.set('minute');
      else if (e.code === 'KeyH') this.set('hour');
      else if (e.code === 'KeyD') this.set('day');
      else if (e.code === 'BracketLeft') this.cycle(-1);
      else if (e.code === 'BracketRight') this.cycle(1);
    });
  }

  /**
   * 直接指定でスケールに遷移する。ロック中のスケールへの遷移は no-op。
   * クリック / キーボード (M/H/D) / 内部 cycle すべての終着点。
   */
  set(id: ScaleId): void {
    if (this.current === id) return;
    if (!this.unlockedSet.has(id)) return;
    this.current = id;
    this.refresh();
    this.onChange(id);
  }

  /**
   * 現スケールから dir 方向 (+1=次 / -1=前) へ巡回。ロック中のスケールは飛ばす。
   * キーボード `[` / `]` とタッチ swipe の共通エントリポイント。
   * 巡回ロジックは scales.ts の nextUnlockedScale に純関数として抽出済み。
   */
  cycle(dir: 1 | -1): void {
    const next = nextUnlockedScale(this.current, this.unlockedSet, dir);
    if (next) this.set(next);
  }

  /** バッジ中心の画面座標 (CSS px)。promotion 飛行のターゲットに使う */
  getButtonCenter(id: ScaleId): { x: number; y: number } | null {
    const btn = this.buttons.get(id);
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /** バッジを「受け取った」表現で短く脈動させる (CSS keyframe) */
  pulse(id: ScaleId): void {
    const btn = this.buttons.get(id);
    if (!btn) return;
    btn.classList.remove('pulse');
    void btn.offsetWidth; // reflow を強制してアニメをリスタート
    btn.classList.add('pulse');
  }

  /** 下位スケールの 1 マス完了時に上位バッジを微かに脈動 (連鎖感) */
  microPulse(id: ScaleId): void {
    const btn = this.buttons.get(id);
    if (!btn) return;
    btn.classList.remove('micropulse');
    void btn.offsetWidth;
    btn.classList.add('micropulse');
  }

  /** スケールをアンロック / ロック。locked は非表示 (opacity 0 で layout 保持)。
   *  unlocked への遷移時は just-unlocked クラスで「フッ」と現れるアニメ。 */
  setUnlocked(id: ScaleId, unlocked: boolean): void {
    const btn = this.buttons.get(id);
    if (!btn) return;
    if (unlocked) {
      if (this.unlockedSet.has(id)) return;
      this.unlockedSet.add(id);
      btn.classList.remove('locked');
      btn.classList.add('just-unlocked');
      setTimeout(() => btn.classList.remove('just-unlocked'), 1100);
    } else {
      this.unlockedSet.delete(id);
      btn.classList.remove('just-unlocked');
      btn.classList.add('locked');
    }
  }

  isUnlocked(id: ScaleId): boolean {
    return this.unlockedSet.has(id);
  }

  /** 各バッジに「自スケール内の進捗」(0..1) を CSS 変数で渡す。バッジ下端の細いバーが伸びる */
  updateProgress(progress: Partial<Record<ScaleId, number>>): void {
    for (const [id, p] of Object.entries(progress)) {
      const btn = this.buttons.get(id as ScaleId);
      if (btn && p !== undefined) {
        btn.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
      }
    }
  }

  private refresh(): void {
    for (const [id, btn] of this.buttons) {
      const isActive = id === this.current;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  }
}
