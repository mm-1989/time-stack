import { defineConfig } from 'vite';

// GitHub Pages のサブパス配信 (https://<user>.github.io/time-stack/) に合わせ base を固定。
// リポジトリ名を変更した場合はここも合わせて更新する。
export default defineConfig({
  base: '/time-stack/',
  build: {
    sourcemap: false,
  },
});
