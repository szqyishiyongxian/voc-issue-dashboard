import { t } from '../i18n/index.js';

/**
 * 把 data-i18n / data-i18n-ph / data-i18n-title 标记的节点替换成当前语言文案。
 * 每次语言确定或切换后调用一次即可，后续渲染由各 render 函数自行取 t()。
 */
export function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  scope.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });
  scope.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
}

/** 静态 SVG/图标元素避免被 i18n 覆盖，这里单独设置标题 */
export function setTitle(sel, key) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (el) el.setAttribute('title', t(key));
}
