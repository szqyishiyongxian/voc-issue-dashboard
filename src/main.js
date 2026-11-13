/* 入口：装配 i18n、主题、取数、渲染、宿主事件。
 *
 * 官方开发指南的硬性要求，逐条对应：
 *  1. Create / Config 态只能 getPreviewData，View 态必须 getData（见 data/bridge.js）
 *  2. 监听 onDataChange / onConfigChange 实时刷新
 *  3. 渲染完成后调 setRendered()，否则宿主一直等加载态
 *  4. 兼容容器拖拽缩放、全屏态、深/浅色主题
 *  5. 配置通过 dataConditions 读写，保证创建副本时能正确取到
 */

import './styles/app.css';
import html from './ui/app.html?raw';
import { setLang, setLangFromNavigator, t } from './i18n/index.js';
import { applyI18n } from './ui/i18n-dom.js';
import { esc } from './ui/theme.js';
import { $, onResize } from './ui/util.js';
import { S, paint, bindUi, applyTheme, syncLvlSeg } from './ui/render.js';
import * as bridge from './data/bridge.js';

let langResolved = false;

/* ---------------- 主题 ---------------- */
async function initTheme() {
  const theme = await bridge.getTheme();
  if (theme) { applyTheme(theme); return; }
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', (e) => applyTheme(e.matches ? 'dark' : 'light'));
  } catch (e) {
    applyTheme('light');
  }
}

/* ---------------- 语言 ---------------- */
async function initLang() {
  if (langResolved) return;
  const locale = await bridge.getLocale();
  if (locale) setLang(locale);
  else setLangFromNavigator();
  langResolved = true;
  document.title = t('app.title');
  applyI18n(document);
}

/* ---------------- 取数 + 渲染 ---------------- */
let loading = false;
let reloadTimer = 0;

async function refresh(reason) {
  if (loading) return;
  loading = true;
  S.err = null;
  S.loaded = false;
  S.loadingMsg = t('empty.loading');
  paint();

  try {
    bridge.setProgressHandler((n, total) => {
      S.loadingMsg = n + ' / ' + (total || '?');
      paint();
    });

    const res = await bridge.load();
    S.state = bridge.readState();
    S.rows = res.rows;
    S.emptyReason = res.emptyReason;
    S.err = res.error;
    S.missing = res.missing || [];
    S.suggestTable = (bridge.state.curTable && bridge.state.curTable.name) || '—';
    S.curTableId = (bridge.state.curTable && bridge.state.curTable.id) || '';
    S.loaded = true;
    S.loadingMsg = '';

    // 自动把匹配到的字段写回配置，保证创建副本时能读到
    if (!S.err && res.map && Object.keys(res.map).length >= 6) {
      await bridge.persistConfig(res.map);
    }
  } catch (e) {
    S.err = (e && e.message) ? e.message : String(e);
    S.loaded = true;
  }

  paint();
  await bridge.markRendered();
  loading = false;
  if (reason) console.debug('[VOC] refreshed:', reason);
}

function scheduleRefresh(reason, delay) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => refresh(reason), delay || 120);
}

/* ---------------- 宿主事件 ---------------- */
function bindHostEvents() {
  bridge.onChange({
    data: () => scheduleRefresh('data', 80),
    config: () => scheduleRefresh('config', 120),
    theme: async () => {
      const th = await bridge.getTheme();
      if (th) applyTheme(th);
    }
  });

  // 状态切换在宿主里表现为 iframe URL 参数变化，没有专门回调：
  // hashchange / popstate + 低频轮询兜底，避免停留在预览数据
  let last = S.state;
  const check = () => {
    const now = bridge.readState();
    if (now !== last) {
      last = now;
      S.state = now;
      scheduleRefresh('state:' + now, 60);
    }
  };
  window.addEventListener('hashchange', check);
  window.addEventListener('popstate', check);
  setInterval(check, 1500);

  // 容器拖拽缩放：布局用 flex，宽度变化后重绘一次即可适配
  onResize(() => { if (S.loaded) paint(); });
}

/* ---------------- 工具按钮 ---------------- */
function bindTools() {
  const themeBtn = $('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', () => applyTheme(S.theme === 'dark' ? 'light' : 'dark'));
  const reloadBtn = $('reloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', () => refresh('manual'));
}

/* ---------------- 启动 ---------------- */
async function boot() {
  document.getElementById('root').innerHTML = html;
  bindUi();
  bindTools();
  syncLvlSeg();

  // 先用浏览器语言把外壳渲染出来，避免 SDK 慢/挂时白屏
  setLangFromNavigator();
  document.title = t('app.title');
  applyI18n(document);
  applyTheme('light');

  S.state = bridge.readState();
  S.loaded = false;
  S.loadingMsg = t('empty.loading');
  paint();

  // SDK 就绪后再按宿主主题与语言重刷一次（宿主的 locale 才是准的）
  await bridge.initSdk();
  await initLang();
  await initTheme();
  paint();

  bindHostEvents();
  await refresh('boot');
}

boot().catch((e) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div class="banner" style="margin:16px"><b>'
      + esc(t('err.title')) + '</b>' + esc(e && e.message ? e.message : String(e)) + '</div>';
  }
});
