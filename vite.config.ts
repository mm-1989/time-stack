import { defineConfig } from 'vite';

// GitHub Pages のサブパス配信 (https://<user>.github.io/time-stack/) に合わせ base を固定。
// リポジトリ名を変更した場合はここも合わせて更新する。
export default defineConfig({
  base: '/time-stack/',
  build: {
    sourcemap: false,
  },
  plugins: [
    {
      // ビルド時に <head> へ build-id meta を注入する。
      // CI からは GITHUB_SHA、ローカルでは local-<timestamp> がセットされる。
      // capture スクリプトはこの値を polling し、Pages CDN の伝播完了を意味的に確認する。
      name: 'inject-build-id',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const sha = process.env.GITHUB_SHA ?? `local-${Date.now()}`;
          return html.replace(
            '</head>',
            `  <meta name="build-id" content="${sha}">\n  </head>`,
          );
        },
      },
    },
  ],
});
