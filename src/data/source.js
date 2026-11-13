/* 数据层：连接飞书多维表格，读取数据源，归一化成看板需要的行结构。
 *
 * ★ 与「写死某张表」的旧版最大差别：
 *   应用插件不绑定固定 Base —— 每个插件实例都可以指定不同的多维表格。
 *   因此这里不再硬编码 baseToken / tableId，而是用「多维表格选择器」的方式：
 *   workspace.getBaseList() 列出应用下已授权的 Base，base.getTableList() 列字段，
 *   再按语义自动匹配所需的 9 个字段（产品型号 / 一~三级标签 / 兜底归属 /
 *   问题描述 / 消息记录 / 知识链接 / 编号）。
 */

import { t } from '../i18n/index.js';

/* ---------------- 看板依赖的字段（逻辑名 → 语义） ---------------- */
export const FIELDS = {
  model: { zh: '产品型号', en: 'Product model', jp: '製品型番' },
  l1: { zh: '一级标签', en: 'Level 1 tag', jp: 'レベル1タグ' },
  l2: { zh: '二级标签', en: 'Level 2 tag', jp: 'レベル2タグ' },
  l3: { zh: '三级标签', en: 'Level 3 tag', jp: 'レベル3タグ' },
  desc: { zh: '问题描述', en: 'Issue description', jp: '問題の説明' },
  msg: { zh: '消息记录', en: 'Message log', jp: 'メッセージログ' },
  kb: { zh: '知识链接', en: 'Knowledge link', jp: 'ナレッジリンク' },
  no: { zh: '编号', en: 'No.', jp: '番号' },
  team: { zh: '兜底归属', en: 'Team', jp: '所属' }
};

/* 附加字段：缺失也不影响主流程，只影响明细弹层的信息丰富度 */
export const OPTIONAL_FIELDS = {
  ask: { zh: '用户当前诉求', en: 'User request', jp: 'ユーザーの要望' },
  sat: { zh: '用户满意度', en: 'Satisfaction', jp: '満足度' },
  staff: { zh: '客服姓名', en: 'Agent', jp: '担当者' },
  channel: { zh: '渠道', en: 'Channel', jp: 'チャネル' },
  cat: { zh: '问题分类', en: 'Category', jp: '問題分類' },
  skill: { zh: '技能名称', en: 'Skill', jp: 'スキル' },
  time: { zh: '创建时间', en: 'Created at', jp: '作成日時' }
};

/* 别名：同一语义在不同表里的常见命名，用于自动匹配 */
const ALIAS = {
  model: ['产品型号', '机型', '型号', '产品', 'product model', 'model', '製品型番'],
  l1: ['一级标签', '1级标签', '一级', 'level 1 tag', 'l1'],
  l2: ['二级标签', '2级标签', '二级', 'level 2 tag', 'l2'],
  l3: ['三级标签', '3级标签', '三级', 'level 3 tag', 'l3'],
  desc: ['问题描述', '问题说明', '描述', 'issue description', 'description'],
  msg: ['消息记录', '对话记录', '会话内容', 'message log', 'messages'],
  kb: ['知识链接', '知识库链接', '知识', 'knowledge link', 'knowledge'],
  no: ['编号', '工单号', 'no.', 'no', 'id'],
  team: ['兜底归属', '归属', '团队', 'team']
};

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[\s_\-（）()【】[\]:：·.,，]/g, '');

/** 语义匹配字段名：先精确（归一化后），再包含 */
function matchField(name, logicalKey, dict) {
  const key = norm(name);
  if (!key) return false;
  const cands = [dict.zh, dict.en, dict.jp].concat(ALIAS[logicalKey] || []).map(norm);
  if (cands.indexOf(key) > -1) return true;
  return cands.some(c => c.length >= 3 && key.indexOf(c) > -1);
}

/**
 * 从表字段列表里自动挑出看板需要的字段。
 * 返回 { map: {逻辑名: 字段名}, missing: [缺失的逻辑名] }
 */
export function pickFields(fieldNames) {
  const map = {};
  const used = new Set();
  const all = Object.assign({}, FIELDS, OPTIONAL_FIELDS);

  for (const key of Object.keys(all)) {
    const hit = fieldNames.find(n => !used.has(n) && matchField(n, key, all[key]));
    if (hit) { map[key] = hit; used.add(hit); }
  }
  const missing = Object.keys(FIELDS).filter(k => !map[k]);
  return { map, missing };
}

/* ---------------- 产品型号拆解 ---------------- */
export function splitModel(p, unfilled) {
  const s = String(p || '').trim();
  const fb = unfilled || t('unfilled');
  if (!s) return { fam: fb, model: fb };
  const parts = s.split('/').map(x => x.trim()).filter(Boolean);
  if (!parts.length) return { fam: fb, model: fb };
  if (parts.length === 1) return { fam: parts[0], model: parts[0] };
  return { fam: parts[0], model: parts[parts.length - 1] };
}

/* ---------------- 单元格取值 ---------------- */
export function toText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    if ('text' in v) return String(v.text == null ? '' : v.text);
    if ('name' in v) return String(v.name == null ? '' : v.name);
    if ('link' in v) return String(v.link == null ? '' : v.link);
    if ('fullLink' in v) return String(v.fullLink == null ? '' : v.fullLink);
    if ('value' in v) return toText(v.value);
  }
  return '';
}

function normalizeRow(raw, map, idx) {
  const g = (k) => (map[k] ? toText(raw[map[k]]).trim() : '');
  const model = g('model');
  const sm = splitModel(model);
  return {
    id: 'r' + idx,
    l1: g('l1'), l2: g('l2'), l3: g('l3'),
    model,
    fam: sm.fam,
    modelShort: sm.model,
    desc: g('desc'),
    msg: g('msg'),
    kb: g('kb').replace(/^\[(.*)\]\((.*)\)$/, '$2'),
    no: g('no'),
    ask: g('ask'),
    sat: g('sat'),
    staff: g('staff'),
    team: g('team'),
    channel: g('channel'),
    cat: g('cat'),
    skill: g('skill'),
    time: g('time')
  };
}

/**
 * 把 getData / getPreviewData 返回的二维数组转成行对象。
 * columns: 列字段名数组（来自 dataConditions.groups[].fieldName）
 */
export function rowsFromCells(cells, columns, map) {
  const flat = (cells || []).map((row) => {
    const o = {};
    (row || []).forEach((c, i) => {
      const key = columns[i];
      if (!key) return;
      o[key] = c ? String(c.text != null ? c.text : c.value) : '';
    });
    return o;
  });
  return flat.map((o, i) => normalizeRow(o, map, i));
}

/** 把 getRecordsByPage 返回的记录转成行对象 */
export function rowsFromRecords(records, fieldIdToName, map) {
  return (records || []).map((rec, i) => {
    const o = {};
    const fields = rec.fields || {};
    Object.keys(fields).forEach(fid => {
      const name = fieldIdToName[fid] || fid;
      o[name] = toText(fields[fid]);
    });
    return normalizeRow(o, map, i);
  });
}
