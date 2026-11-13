import { defineConfig } from 'vite';

/* 飞书 JS SDK 走 CDN（与官方模板一致）。
 * 若把 npm 包直接打包进产物，SDK 会在 iframe 里等待宿主握手，本地/预览环境握手失败会阻塞首次渲染；
 * 走 CDN + 动态 import 时，接不到宿主会在超时后回落，不影响页面先渲染壳层。
 * 注意：这是唯一的运行时外部依赖，官方文档明确要求「插件可调用 JS SDK」。
 */
const LARK_SDK_URL = 'https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.30.8.js';

export default defineConfig({
  base: './', // 请勿删除此语句，否则将导致部署失败
  build: {
    outDir: 'dist',
    target: 'es2015',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true
      }
    }
  },
  server: {
    host: '0.0.0.0'
  },
  define: {
    __LARK_SDK_URL__: JSON.stringify(LARK_SDK_URL)
  }
});
