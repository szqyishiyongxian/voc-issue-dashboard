/* 飞书 SDK 桥接层。
 *
 * SDK 通过 src/data/sdk.js 动态加载（CDN、版本固定），不打包进产物：
 * SDK 是「宿主 ↔ 插件」双向握手的 RPC 客户端，独立部署时握手拿不到，
 * 打包进产物会挡住首次渲染。动态加载 + 超时兜底则可以先渲染壳层。
 *
 * 状态判定：isCreate=1 → Create / isConfig=1 → Config / isFullScreen=1 → FullScreen / 否则 View
 * （与 SDK 内部 getter 一致；另外补一层 URL 兜底，兼容宿主把参数放在 hash 段）
 */

import { tryLoadSdk } from './sdk.js';
import { FIELDS, pickFields, rowsFromCells, rowsFromRecords } from '../data/source.js';
import { t } from '../i18n/index.js';

/* ---------------- SDK 句柄 ---------------- */
let sdk = null;
let sdkReady = false;

export function isSdkReady() { return sdkReady; }

export async function initSdk() {
  sdk = await tryLoadSdk();
  sdkReady = !!(sdk && sdk.bitable && sdk.bitable.dashboard);
  return sdk;
}

function dash() { return sdkReady ? sdk.bitable.dashboard : null; }
function ws() { return sdkReady ? sdk.workspace : null; }
function bridgeApi() { return sdkReady ? sdk.bitable.bridge : null; }

const STATE = { Create: 'Create', Config: 'Config', View: 'View', FullScreen: 'FullScreen' };

export function withTimeout(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => setTimeout(
      () => rej(new Error(t('err.timeout', { label: label, sec: Math.round(ms / 1000) }))), ms))
  ]);
}

/** 宿主可能把参数放在 search 或 hash */
export function readState() {
  const params = [];
  try { params.push(new URLSearchParams(location.search)); } catch (e) { /* noop */ }
  try {
    const h = location.hash || '';
    const qi = h.indexOf('?');
    if (qi > -1) params.push(new URLSearchParams(h.slice(qi + 1)));
  } catch (e) { /* noop */ }

  const get = (k) => {
    for (const sp of params) {
      const v = sp.get(k);
      if (v != null) return v;
    }
    return null;
  };

  if (get('isCreate') === '1') return STATE.Create;
  if (get('isFullScreen') === '1') return STATE.FullScreen;
  if (get('isConfig') === '1') return STATE.Config;
  return STATE.View;
}

/* ---------------- 运行期状态 ---------------- */
export const state = {
  rows: [],
  map: {},
  missing: [],
  columns: [],
  baseList: [],
  tables: [],
  curBase: null,
  curTable: null,
  total: 0
};

let onProgress = null;
export function setProgressHandler(fn) { onProgress = fn; }

/* ---------------- 多维表格选择 ---------------- */
async function listBases() {
  state.baseList = [];
  const w = ws();
  if (!w || typeof w.getBaseList !== 'function') return state.baseList;
  try {
    const list = await withTimeout(w.getBaseList(), 8000, 'getBaseList');
    state.baseList = Array.isArray(list) ? list : [];
  } catch (e) { /* 无授权 / 无权限：留空 */ }
  return state.baseList;
}

async function getBitableCtx(token) {
  const w = ws();
  if (!w) return null;
  try {
    return await withTimeout(token ? w.getBitable(token) : w.getBitable(), 8000, 'getBitable');
  } catch (e) {
    return null;
  }
}

/**
 * 在应用已授权的 Base / Table 里，挑出字段最匹配看板需求的那张表。
 * 这样就不需要硬编码 baseToken / tableId —— 插件实例换表也能用。
 */
async function autoPick() {
  await listBases();
  let best = null;

  // getBaseList 为空时用 dataConditions 里的 tableId 兜底
  let tableIdHint = null;
  try {
    const cfg = await withTimeout(dash().getConfig(), 6000, 'getConfig');
    const dc = cfg && cfg.dataConditions && cfg.dataConditions[0];
    if (dc && dc.tableId) tableIdHint = dc.tableId;
  } catch (e) { /* noop */ }

  const runPick = async (ctx) => {
    if (!ctx || !ctx.base) return null;
    let tables = [];
    try {
      tables = await withTimeout(ctx.base.getTableList(), 8000, 'getTableList');
    } catch (e) {
      return null;
    }
    tables = tables || [];
    if (!state.tables.length) state.tables = tables;

    let local = null;
    for (const tb of tables) {
      if (tableIdHint && tb.id !== tableIdHint) continue;
      let names = [];
      try {
        const tbl = await withTimeout(ctx.base.getTableById(tb.id), 8000, 'getTableById');
        const metas = await withTimeout(tbl.getFieldMetaList(), 8000, 'getFieldMetaList');
        names = (metas || []).map(m => m.name);
      } catch (e) {
        continue;
      }
      const picked = pickFields(names);
      const score = Object.keys(picked.map).length;
      if (!local || score > local.score) {
        local = { score, map: picked.map, missing: picked.missing, ctx, table: tb, names };
      }
      if (!picked.missing.length) break;
    }
    return local;
  };

  const bases = state.baseList.slice();
  if (bases.length) {
    for (const b of bases) {
      const token = b.appToken || b.baseToken || b.token || b.id || null;
      const ctx = await getBitableCtx(token);
      const hit = await runPick(ctx);
      if (!hit) continue;
      hit.base = b;
      if (!best || hit.score > best.score) best = hit;
      if (!hit.missing.length) break;
    }
  }
  if (!best) {
    const hit = await runPick(await getBitableCtx(null));
    if (hit) best = hit;
  }
  return best;
}

/* ---------------- 读数据 ---------------- */
/** View 态：数据已落库，必须读明细 */
async function loadByRecords(ctx, tableId, map) {
  const tbl = await withTimeout(ctx.base.getTableById(tableId), 10000, 'getTableById');
  const metas = await withTimeout(tbl.getFieldMetaList(), 10000, 'getFieldMetaList');
  const idToName = {};
  (metas || []).forEach(m => { idToName[m.id] = m.name; });

  const recs = [];
  let pageToken;
  let guard = 0;
  do {
    const resp = await withTimeout(
      tbl.getRecordsByPage({ pageSize: 200, pageToken }), 30000, 'getRecordsByPage');
    const items = (resp && (resp.records || resp.items)) || [];
    for (const r of items) recs.push(r);
    if (typeof onProgress === 'function') onProgress(recs.length, resp && resp.total);
    pageToken = resp && resp.hasMore ? resp.pageToken : undefined;
    guard++;
  } while (pageToken && guard < 200);

  state.total = recs.length;
  return rowsFromRecords(recs, idToName, map);
}

/** Create / Config 态：数据未落库，只能 getPreviewData（用 getData 会导致点确定后保存失败） */
async function loadByPreview(map, columns) {
  const data = await withTimeout(dash().getPreviewData(), 20000, 'getPreviewData');
  return rowsFromCells(data, columns, map);
}

/**
 * 是否走「预览数据」分支。
 *
 * 官方指南：Create / Config 态数据未落库，只能 getPreviewData；
 * View 态必须 getData。仪表盘的 FullScreen 是 View 的全屏表现，同样属于已落库，
 * 因此只有 Create / Config 走预览 —— 宁可多读一次明细接口，也不要在展示态误用预览接口
 * （那会让用户看到配置面板的临时数据而不是真实数据）。
 */
function isPreviewState(st) {
  return st === STATE.Create || st === STATE.Config;
}

/**
 * 全量加载。
 * emptyReason: 'no-sdk' 不在宿主内 | 'no-source' 未选数据源 | 'no-match' 无字段匹配的表 | 'no-data' 表为空
 */
export async function load() {
  const st = readState();
  let map = {};
  let rows = [];
  let emptyReason = null;
  let error = null;

  if (!sdkReady) {
    return { rows: [], emptyReason: 'no-sdk', error: null, map: {}, missing: [] };
  }

  let columns = [];
  try {
    const cfg = await withTimeout(dash().getConfig(), 8000, 'getConfig').catch(() => null);
    const groups = (cfg && cfg.dataConditions && cfg.dataConditions[0] && cfg.dataConditions[0].groups) || [];
    columns = groups.map((g, i) => g.fieldName || ('col' + i)).filter(Boolean);
  } catch (e) { /* noop */ }

  try {
    const best = await autoPick();
    if (!best) {
      emptyReason = 'no-match';
    } else {
      state.map = best.map;
      state.missing = best.missing;
      state.curBase = best.base || null;
      state.curTable = best.table;
      state.columns = best.names;
      map = best.map;

      if (isPreviewState(st)) {
        rows = await loadByPreview(map, columns.length ? columns : best.names);
      } else {
        rows = await loadByRecords(best.ctx, best.table.id, map);
      }
    }
  } catch (e) {
    error = (e && e.message) ? e.message : String(e);
  }

  if (!error && !rows.length && !emptyReason) {
    if (isPreviewState(st) && !columns.length) emptyReason = 'no-source';
    else emptyReason = 'no-data';
  }

  state.rows = rows;
  return { rows, emptyReason, error, map, missing: state.missing };
}

/* ---------------- 主题 / 语言 ---------------- */
export async function getTheme() {
  const b = bridgeApi();
  if (!b) return null;
  try {
    const r = await withTimeout(b.getTheme(), 2500, 'getTheme');
    const v = r && (r.theme || r);
    return /dark/i.test(String(v)) ? 'dark' : 'light';
  } catch (e) {
    return null;
  }
}

export async function getLocale() {
  const b = bridgeApi();
  if (!b) return null;
  try {
    const r = await withTimeout(b.getLocale(), 2000, 'getLocale');
    return r || null;
  } catch (e) {
    return null;
  }
}

/** 监听数据源 / 配置 / 主题变化 */
export function onChange(handlers) {
  const offs = [];
  const db = dash();
  const bind = (api, name, cb) => {
    try {
      if (api && typeof api[name] === 'function') {
        const off = api[name](cb);
        if (typeof off === 'function') offs.push(off);
      }
    } catch (e) { /* noop */ }
  };
  bind(db, 'onDataChange', handlers.data);
  bind(db, 'onConfigChange', handlers.config);
  bind(db, 'onThemeChange', handlers.theme);
  bind(bridgeApi(), 'onThemeChange', handlers.theme);
  return () => offs.forEach(f => { try { f(); } catch (e) { /* noop */ } });
}

/** 通知宿主渲染完成（自动化截图依赖它） */
export async function markRendered() {
  try {
    const db = dash();
    if (db && typeof db.setRendered === 'function') await db.setRendered();
  } catch (e) { /* noop */ }
}

/** 把自动匹配到的字段写回配置，保证创建副本时能读到（官方 check list 要求） */
export async function persistConfig(map) {
  const db = dash();
  if (!db || typeof db.saveConfig !== 'function') return false;
  if (!isPreviewState(readState())) return false;    // 展示态不写配置
  const groups = Object.keys(FIELDS).filter(k => map[k]).map(k => ({ fieldName: map[k] }));
  if (!groups.length) return false;
  try {
    await withTimeout(db.saveConfig({ dataConditions: [{ groups }] }), 8000, 'saveConfig');
    return true;
  } catch (e) {
    return false;
  }
}

export { STATE as DashboardState };
