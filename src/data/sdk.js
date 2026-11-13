/* SDK 加载器。
 *
 * 为什么走 CDN 而不是打包 npm 包：
 *   SDK 是「宿主-插件」双向握手的 RPC 客户端，打包进产物后会在 iframe 里阻塞等待握手；
 *   独立部署（预览、调试）时握手拿不到，整页会卡在 SDK 初始化上。
 *   用动态 import + 超时兜底，SDK 拿不到也能先把 UI 渲染出来并给出可读提示。
 *
 * 版本固定，不使用 latest：审核要求依赖可追溯。
 */
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@lark-base-open/js-sdk@1.0.2/dist/index.mjs';

let sdkPromise = null;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('SDK load timeout')), ms))
  ]);
}

/** 加载并缓存 SDK 模块 */
export function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = withTimeout(import(/* @vite-ignore */ SDK_URL), 12000);
  }
  return sdkPromise;
}

/** SDK 是否已就绪（未就绪时宿主相关调用全部走兜底分支） */
export async function tryLoadSdk() {
  try {
    return await loadSdk();
  } catch (e) {
    return null;
  }
}
