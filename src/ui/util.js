import { t } from '../i18n/index.js';

/* 与业务无关的 UI 小工具 */

export const $ = (id) => document.getElementById(id);

/** 事件委托：绑定在容器上，避免每次重绘重复挂监听 */
export function delegate(root, selector, type, handler) {
  if (!root) return;
  root.addEventListener(type, (e) => {
    const el = e.target.closest ? e.target.closest(selector) : null;
    if (el && root.contains(el)) handler(e, el);
  });
}

/** 尺寸变化监听（拖拽容器尺寸时自适应，官方 check list 要求） */
export function onResize(cb) {
  let raf = 0;
  const fire = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(cb);
  };
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(fire);
    ro.observe(document.body);
  }
  window.addEventListener('resize', fire);
  return () => {
    if (ro) ro.disconnect();
    window.removeEventListener('resize', fire);
    cancelAnimationFrame(raf);
  };
}

/** 空态块 */
export function emptyBlock(icon, title, desc, tip) {
  return '<div class="empty" style="padding:56px 20px">'
    + '<span class="ic" style="font-size:30px">' + icon + '</span>'
    + '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-top:4px">' + title + '</div>'
    + (desc ? '<div style="font-size:11.5px;line-height:1.9;max-width:460px;margin-top:6px">' + desc + '</div>' : '')
    + (tip ? '<div style="font-size:11px;color:var(--ink3);margin-top:10px">' + tip + '</div>' : '')
    + '</div>';
}

export function loadingBlock(msg) {
  return '<div class="loading"><span class="spin"></span><span>'
    + String(msg || t('empty.loading')) + '</span></div>';
}
