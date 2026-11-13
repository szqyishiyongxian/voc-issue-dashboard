import { t, getLang } from '../i18n/index.js';

/* 产品线短名 + 主题色。
 * 短名走 i18n（英文/日文下发时替换为可读写法），色值是数据可视化用色，不随语言变化。 */
const FAM_COLOR = {
  '智能影像线（云台相机）': '#1f6feb',
  '全景线（全景相机）': '#00b4d8',
  'GO线': '#7b61ff',
  'Ace线': '#e76f51',
  '配件线': '#f2a63b',
  'Care相关': '#2ea121',
  '影翎无人机': '#eb4d8a',
  'Flow线': '#0aa5a5',
  '会议线': '#8b6f47'
};
const FAM_SHORT = {
  '智能影像线（云台相机）': { zh: '云台相机', en: 'Gimbal', jp: 'ジンバル' },
  '全景线（全景相机）': { zh: '全景相机', en: '360', jp: '360°' },
  'GO线': { zh: 'GO 系列', en: 'GO', jp: 'GO' },
  'Ace线': { zh: 'Ace 系列', en: 'Ace', jp: 'Ace' },
  '配件线': { zh: '配件线', en: 'Accessory', jp: 'アクセサリ' },
  'Care相关': { zh: 'Care 服务', en: 'Care', jp: 'Care' },
  '影翎无人机': { zh: '影翎无人机', en: 'Drone', jp: 'ドローン' },
  'Flow线': { zh: 'Flow 系列', en: 'Flow', jp: 'Flow' },
  '会议线': { zh: '会议线', en: 'Meeting', jp: '会議' }
};
const FALLBACK_COLORS = ['#5b6ee1', '#d4576b', '#3aa0a0', '#b06ab3', '#c98b3a', '#4a8bd6'];

export function famStyle(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 997;
  const color = FAM_COLOR[name] || FALLBACK_COLORS[h % FALLBACK_COLORS.length];
  const shortMap = FAM_SHORT[name] || {};
  const short = shortMap[getLang()] || shortMap.zh || name;
  return { short, color };
}

export const COLORS = {
  brand: '#1f6feb',
  cyan: '#00b4d8',
  purple: '#7b61ff',
  orange: '#e76f51',
  green: '#2ea121',
  amber: '#f2a63b'
};

export function colorAlpha(hex, a) {
  const h = String(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 数值本地化：中文环境不插千分位，英日环境加千分位 */
export function num(n) {
  const v = Number(n) || 0;
  const lang = getLang();
  return lang === 'zh' ? String(v) : v.toLocaleString('en-US');
}

export { t };
