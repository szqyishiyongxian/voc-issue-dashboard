import zh from './zh.json';
import en from './en.json';
import jp from './jp.json';

const DICT = { zh, en, jp };

/** 界面语言：zh / en / jp，由 bridge.getLocale() 或浏览器语言决定 */
let lang = 'zh';

export function setLang(code) {
  const c = String(code || '').toLowerCase();
  if (c.indexOf('ja') === 0 || c.indexOf('jp') === 0) { lang = 'jp'; return lang; }
  if (c.indexOf('zh') === 0) { lang = 'zh'; return lang; }
  if (c.indexOf('en') === 0) { lang = 'en'; return lang; }
  // 其他语言（韩、法、德…）统一回落英文
  lang = c ? 'en' : 'zh';
  return lang;
}

export function getLang() {
  return lang;
}

/** 从 navigator.language 推断，宿主拿不到 locale 时兜底 */
export function setLangFromNavigator() {
  return setLang((typeof navigator !== 'undefined' && navigator.language) || '');
}

/**
 * 取文案。缺 key 时回落中文再回落 key 本身，
 * 保证任何语言下都不会渲染出空白。
 */
export function t(key, vars) {
  const table = DICT[lang] || zh;
  let s = table[key];
  if (s == null) s = zh[key];
  if (s == null) return key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m);
}
