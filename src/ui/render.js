import { t } from '../i18n/index.js';
import { esc, num, famStyle, colorAlpha, COLORS } from './theme.js';
import { $, delegate, emptyBlock, loadingBlock } from './util.js';

/* ---------------- 视图状态 ---------------- */
export const S = {
  rows: [],
  team: 'FAE',
  teamSplit: 'none',
  sel: { fam: null, model: null, l1: null, l2: null, l3: null },
  lvl: 1,
  mode: 'product',
  panel: 'detail',
  q: '',
  theme: 'auto',
  loaded: false,
  err: null,
  loadingMsg: '',
  state: 'View',
  emptyReason: null,
  missing: []
};

const UNTAGGED = () => t('untagged');

/* ---------------- 团队归属 ---------------- */
const TEAM_MATCH = {
  FAE: (t2) => /fae/i.test(t2),
  TRAIN: (t2) => /培训|train/i.test(t2),
  VAS: (t2) => /增值|value/i.test(t2)
};

export function detectTeamSplit() {
  S.teamSplit = S.rows.some(r => (r.team || '').trim()) ? 'split' : 'none';
}

function teamRows() {
  if (S.teamSplit === 'none') return S.rows;
  const hit = S.rows.filter(r => TEAM_MATCH[S.team]((r.team || '').trim()));
  return hit.length ? hit : S.rows;
}

export function baseRows() {
  let rs = teamRows();
  const q = S.q.trim().toLowerCase();
  if (q) {
    rs = rs.filter(r => (r.l1 + ' ' + r.l2 + ' ' + r.l3 + ' ' + r.desc + ' ' +
      r.modelShort + ' ' + r.fam + ' ' + r.no).toLowerCase().indexOf(q) > -1);
  }
  return rs;
}

/* ---------------- 聚合 ---------------- */
function countBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = String(r[key] || '').trim() || UNTAGGED();
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

const matchBy = (rows, key, v) =>
  (v == null ? rows : rows.filter(r => (String(r[key] || '').trim() || UNTAGGED()) === v));

const lvlKey = (lv) => (lv === 1 ? 'l1' : lv === 2 ? 'l2' : 'l3');

function scopedRows() {
  let rs = baseRows();
  if (S.sel.fam) rs = rs.filter(r => r.fam === S.sel.fam);
  if (S.sel.model) rs = rs.filter(r => r.modelShort === S.sel.model);
  if (S.sel.l1) rs = matchBy(rs, 'l1', S.sel.l1);
  if (S.sel.l2) rs = matchBy(rs, 'l2', S.sel.l2);
  if (S.sel.l3) rs = matchBy(rs, 'l3', S.sel.l3);
  return rs;
}

function scopeOfRank() {
  let rs = baseRows();
  if (S.sel.fam) rs = rs.filter(r => r.fam === S.sel.fam);
  if (S.sel.model) rs = rs.filter(r => r.modelShort === S.sel.model);
  if (S.sel.l1) rs = matchBy(rs, 'l1', S.sel.l1);
  if (S.sel.l2 && S.lvl === 3) rs = matchBy(rs, 'l2', S.sel.l2);
  return rs;
}

/* ---------------- KPI ---------------- */
function renderKpis(all) {
  const n = all.length;
  const fams = countBy(all, 'fam');
  const top1 = fams[0];
  const models = countBy(all, 'modelShort');
  const tagged = all.filter(r => r.l1).length;
  const kbN = all.filter(r => r.kb).length;

  const cards = [
    { k: t('kpi.sessions'), v: num(n), u: t('unit.row'), ic: '▤', c: COLORS.brand },
    { k: t('kpi.families'), v: num(fams.length), u: t('unit.productLine'), ic: '◈', c: COLORS.cyan },
    { k: t('kpi.models'), v: num(models.length), u: t('unit.model'), ic: '◎', c: COLORS.purple },
    { k: t('kpi.topProduct'), v: num(top1 ? top1[1] : 0), u: (top1 ? famStyle(top1[0]).short : '—'), ic: '▲', c: COLORS.orange },
    { k: t('kpi.tagCoverage'), v: (n ? Math.round(tagged / n * 100) : 0) + '', u: '%', ic: '✓', c: COLORS.green },
    { k: t('kpi.kbCoverage'), v: (n ? Math.round(kbN / n * 100) : 0) + '', u: '%', ic: '🔗', c: COLORS.amber }
  ];

  $('kpis').innerHTML = cards.map(c =>
    '<div class="kpi">'
    + '<span class="kico" style="background:' + colorAlpha(c.c, .12) + ';color:' + c.c + '">' + c.ic + '</span>'
    + '<div style="min-width:0">'
    + '<div class="kl">' + esc(c.k) + '</div>'
    + '<div class="kv">' + esc(c.v) + '<span class="ku">' + esc(c.u) + '</span></div>'
    + '</div></div>'
  ).join('');
}

/* ---------------- 产品排行（默认主视图：横向柱状 + 产品线分组） ---------------- */
export function renderByProduct(all) {
  const pm = new Map();
  for (const r of all) {
    const k = r.fam + '\u0001' + r.modelShort;
    if (!pm.has(k)) pm.set(k, { fam: r.fam, model: r.modelShort, n: 0 });
    pm.get(k).n++;
  }
  const prods = Array.from(pm.values()).sort((a, b) => b.n - a.n);

  const fm = new Map();
  for (const p of prods) {
    if (!fm.has(p.fam)) fm.set(p.fam, { fam: p.fam, n: 0, cnt: 0 });
    const o = fm.get(p.fam);
    o.n += p.n; o.cnt++;
  }
  const fams = Array.from(fm.values()).sort((a, b) => b.n - a.n);

  const total = all.length || 1;
  const maxN = prods.length ? prods[0].n : 1;

  $('chartTitle').textContent = t('chart.productTitle');
  $('chartSub').textContent = t('chart.sub', {
    fam: fams.length, model: prods.length, total: all.length
  });

  let html = '<div class="prank">';
  for (const p of prods) {
    const st = famStyle(p.fam);
    const w = Math.max(1.5, p.n / maxN * 100);
    const pct = Math.round(p.n / total * 1000) / 10;
    const isSel = S.sel.fam === p.fam && S.sel.model === p.model;
    html += '<div class="prow' + (isSel ? ' on' : '') + '" data-fam="' + esc(p.fam) + '" data-model="' + esc(p.model) + '" '
      + 'title="' + esc(p.fam) + ' / ' + esc(p.model) + ' · ' + p.n + '">'
      + '<span class="pdot" style="background:' + st.color + '"></span>'
      + '<span class="pname" title="' + esc(p.model) + '">' + esc(p.model) + '</span>'
      + '<span class="ptrack"><i style="width:' + w + '%;background:linear-gradient(90deg,'
      + colorAlpha(st.color, .95) + ',' + colorAlpha(st.color, .62) + ')"></i></span>'
      + '<span class="pnum">' + num(p.n) + '</span>'
      + '<span class="ppct">' + pct + '%</span>'
      + '<span class="pfam" style="color:' + st.color + ';background:' + colorAlpha(st.color, .10) + '">'
      + esc(st.short) + '</span>'
      + '</div>';
  }
  html += '</div>';

  // 产品线小计条
  html += '<div class="pfam-bar">';
  for (const f of fams) {
    const st = famStyle(f.fam);
    const w = f.n / total * 100;
    html += '<i style="width:' + w + '%;background:' + st.color + '" title="'
      + esc(st.short) + ' ' + f.n + '"></i>';
  }
  html += '</div>';
  html += '<div class="chart-legend">';
  for (const f of fams) {
    const st = famStyle(f.fam);
    html += '<span class="lg"><i style="background:' + st.color + '"></i>'
      + esc(st.short) + ' <b style="font-weight:650;color:var(--ink2)">' + num(f.n) + '</b></span>';
  }
  html += '</div>';

  $('leftBody').innerHTML = html;
}

/* ---------------- 热力矩阵（产品线 × 一级标签） ---------------- */
export function renderMatrix(all) {
  const fams = countBy(all, 'fam');
  const l1s = countBy(all, 'l1').slice(0, 9);

  $('chartTitle').textContent = t('chart.matrixTitle');
  $('chartSub').textContent = t('chart.subMatrix', { fam: fams.length, l1: l1s.length });

  const cellMap = new Map();
  for (const r of all) {
    const k = r.fam + '\u0001' + (String(r.l1 || '').trim() || UNTAGGED());
    cellMap.set(k, (cellMap.get(k) || 0) + 1);
  }
  let maxCell = 1;
  cellMap.forEach(v => { if (v > maxCell) maxCell = v; });

  const head = '<tr><th class="mh">' + esc(t('matrix.head')) + '<span class="hm">' + esc(t('matrix.headHint')) + '</span></th>'
    + l1s.map(([name, n]) =>
      '<th title="' + esc(name) + '">' + esc(name.length > 6 ? name.slice(0, 6) : name)
      + '<span class="hm">' + num(n) + '</span></th>'
    ).join('') + '<th>' + esc(t('matrix.total')) + '<span class="hm">' + esc(t('matrix.unit')) + '</span></th></tr>';

  const body = fams.map(([fam, famTotal]) => {
    const st = famStyle(fam);
    const cells = l1s.map(([name]) => {
      const v = cellMap.get(fam + '\u0001' + name) || 0;
      if (!v) return '<td><span class="cell z">·</span></td>';
      const tt = Math.pow(v / maxCell, .62);       // 幂次压缩，让小值也可分辨
      const pct = Math.round(v / famTotal * 100);
      return '<td><span class="cell" data-fam="' + esc(fam) + '" data-l1="' + esc(name) + '" '
        + 'style="background:' + colorAlpha(st.color, .10 + tt * .78)
        + ';color:' + (tt > .55 ? '#fff' : 'var(--ink)') + '">'
        + '<span class="cn">' + num(v) + '</span><span class="cp">' + pct + '%</span></span></td>';
    }).join('');
    return '<tr>'
      + '<td class="ml" title="' + esc(fam) + '">'
      + '<span class="fam-swatch" style="background:' + st.color + ';display:inline-block;margin-right:6px"></span>'
      + esc(st.short) + '<span class="sub">' + num(famTotal) + '</span></td>'
      + cells
      + '<td style="font-size:12px;font-weight:700;color:var(--ink2)">' + num(famTotal) + '</td>'
      + '</tr>';
  }).join('');

  const foot = '<tr><td class="ml">' + esc(t('matrix.total')) + '</td>'
    + l1s.map(([, n]) => '<td>' + num(n) + '</td>').join('')
    + '<td>' + num(all.length) + '</td></tr>';

  $('leftBody').innerHTML = '<table class="mtx"><thead>' + head + '</thead><tbody>'
    + body + '</tbody><tfoot>' + foot + '</tfoot></table>';
}

/* ---------------- 面包屑 ---------------- */
function renderCrumbs() {
  const parts = [];
  const teamName = t('team.' + S.team) || t('team.ALL');
  const atRoot = !S.sel.fam && !S.sel.l1 && !S.sel.l2 && !S.sel.l3;
  parts.push('<button class="crumb' + (atRoot ? ' cur' : '') + '" data-k="root">'
    + esc(teamName) + ' · ' + esc(t('crumb.overview')) + '</button>');

  const push = (k, label, cur) => {
    parts.push('<span class="sep">›</span>');
    parts.push('<button class="crumb' + (cur ? ' cur' : '') + '" data-k="' + k + '">' + esc(label) + '</button>');
  };

  if (S.sel.fam) push('fam', famStyle(S.sel.fam).short, !S.sel.model && !S.sel.l1 && !S.sel.l2 && !S.sel.l3);
  if (S.sel.model) push('model', S.sel.model, !S.sel.l1 && !S.sel.l2 && !S.sel.l3);
  if (S.sel.l1) push('l1', S.sel.l1, !S.sel.l2 && !S.sel.l3);
  if (S.sel.l2) push('l2', S.sel.l2, !S.sel.l3);
  if (S.sel.l3) {
    parts.push('<span class="sep">›</span>');
    parts.push('<span class="crumb cur">' + esc(S.sel.l3) + '</span>');
  }

  $('crumbs').innerHTML = parts.join('');
}

/* ---------------- 标签排名（右侧） ---------------- */
function renderRank(all) {
  const scope = scopeOfRank();
  const lv = S.lvl;
  const key = lvlKey(lv);
  const data = countBy(scope, key);
  const total = scope.length;

  $('rightTitle').textContent = t('rank.title' + lv);
  $('rightSub').textContent = num(data.length) + ' ' + t('rank.unit') + ' · ' + num(total) + ' ' + t('unit.row');

  if (!data.length) {
    $('rankBody').innerHTML = '<div class="empty"><span class="ic">◎</span><span>' + esc(t('empty.noTag')) + '</span></div>';
    return;
  }
  const max = data[0][1];
  $('rankBody').innerHTML = '<div class="rank">' + data.map(([name, n], i) => {
    const on = S.sel[key] === name;
    const pct = total ? Math.round(n / total * 100) : 0;
    return '<div class="rrow' + (on ? ' on' : '') + '" data-k="' + esc(name) + '">'
      + '<span class="rk' + (i === 0 ? ' t1' : i === 1 ? ' t2' : i === 2 ? ' t3' : '') + '">' + (i + 1) + '</span>'
      + '<span class="rname" title="' + esc(name) + '">' + esc(name) + '</span>'
      + '<span class="rtrack"><i style="width:' + Math.max(3, n / max * 100)
      + '%;background:linear-gradient(90deg,' + COLORS.brand + ',' + COLORS.cyan + ')"></i></span>'
      + '<span class="rval">' + num(n) + '<span style="font-weight:500;color:var(--ink3);font-size:9.5px">·' + pct + '%</span></span>'
      + '</div>';
  }).join('') + '</div>';
}

/* ---------------- 对话明细 ---------------- */
function kbTitle(url) {
  if (!url) return '';
  const tid = (url.split('pages/')[1] || '').split('?')[0];
  return tid ? t('kb.page', { id: tid.slice(0, 8) }) : '';
}

function kbCell(url) {
  if (!url) return '<span class="klink none">' + esc(t('kb.none')) + '</span>';
  const label = kbTitle(url) || url;
  const disp = label.length > 16 ? label.slice(0, 15) + '…' : label;
  return '<a class="klink" href="' + esc(url) + '" target="_blank" rel="noopener" '
    + 'title="' + esc(url) + '">' + esc(disp) + '</a>';
}

function renderDetail(rows) {
  const w = $('dtBody');
  $('dtSub').textContent = rows.length ? num(rows.length) + ' ' + t('unit.row') : '';

  if (!rows.length) {
    w.innerHTML = '<div class="empty"><span class="ic">◎</span><span>' + esc(t('empty.noRecord')) + '</span><br>'
      + '<span style="font-size:11px">' + esc(t('empty.noRecordHint')) + '</span></div>';
    return;
  }
  const LIMIT = 300;
  const list = rows.slice(0, LIMIT);
  const more = rows.length > LIMIT
    ? '<div style="padding:9px 12px;color:var(--ink3);font-size:11px">'
    + esc(t('more.limit', { total: rows.length, limit: LIMIT })) + '</div>'
    : '';

  w.innerHTML = '<table class="dt"><thead><tr>'
    + '<th style="width:23%">' + esc(t('table.model')) + '</th>'
    + '<th style="width:39%">' + esc(t('table.desc')) + '</th>'
    + '<th style="width:12%">' + esc(t('table.ask')) + '</th>'
    + '<th style="width:18%">' + esc(t('table.kb')) + '</th>'
    + '<th style="width:8%">' + esc(t('table.no')) + '</th>'
    + '</tr></thead><tbody>'
    + list.map((r, i) => '<tr data-i="' + i + '">'
      + '<td><span class="tag" title="' + esc(r.fam + ' / ' + r.model) + '">' + esc(r.modelShort) + '</span></td>'
      + '<td><div class="desc" title="' + esc(r.l1 + ' › ' + r.l2 + ' › ' + r.l3) + '">'
      + esc(r.desc || r.l3 || '—') + '</div></td>'
      + '<td>' + (r.ask ? '<span class="tag m">' + esc(r.ask) + '</span>' : '<span style="color:var(--ink3)">—</span>') + '</td>'
      + '<td>' + kbCell(r.kb) + '</td>'
      + '<td><span class="mono">' + esc(r.no ? r.no.slice(-6) : '—') + '</span></td>'
      + '</tr>').join('')
    + '</tbody></table>' + more;
}

/* ---------------- 知识链接榜 ---------------- */
function renderKbPanel(rows) {
  const m = new Map();
  for (const r of rows) {
    const u = String(r.kb || '').trim();
    if (!u) continue;
    m.set(u, (m.get(u) || 0) + 1);
  }
  const arr = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  const hits = arr.reduce((s, x) => s + x[1], 0);
  $('kbHint').textContent = arr.length
    ? t('kb.hint', { pages: arr.length, hits: hits })
    : t('empty.noKb');

  const list = $('kbList');
  if (!arr.length) {
    list.innerHTML = '<div class="empty"><span class="ic">◇</span><span>' + esc(t('empty.noKb')) + '</span></div>';
    return;
  }
  const max = arr[0][1];
  list.innerHTML = arr.slice(0, 40).map(([url, n], i) => {
    const label = kbTitle(url) || url;
    return '<div class="kb-row">'
      + '<span class="rk' + (i === 0 ? ' t1' : i === 1 ? ' t2' : i === 2 ? ' t3' : '') + '">' + (i + 1) + '</span>'
      + '<a class="kb-name" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(url) + '">'
      + esc(label) + '</a>'
      + '<span class="kb-mini"><i style="width:' + Math.max(6, n / max * 100) + '%"></i></span>'
      + '<span class="kb-n">' + num(n) + '</span>'
      + '</div>';
  }).join('');
}

function syncBottomPanel() {
  const showKb = S.panel === 'kb';
  $('dtBody').style.display = showKb ? 'none' : 'block';
  $('kbPanel').style.display = showKb ? 'block' : 'none';
  document.querySelectorAll('#botSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.pan === S.panel);
  });
}

export function syncLvlSeg() {
  document.querySelectorAll('#lvlSeg button').forEach(b => {
    b.classList.toggle('on', +b.dataset.lv === S.lvl);
  });
}

function syncModeSeg() {
  document.querySelectorAll('#modeSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.mode === S.mode);
  });
}

function syncTeamTabs() {
  const counts = { FAE: 0, TRAIN: 0, VAS: 0 };
  if (S.teamSplit === 'split') {
    for (const r of S.rows) {
      for (const k of Object.keys(TEAM_MATCH)) if (TEAM_MATCH[k]((r.team || '').trim())) counts[k]++;
    }
  } else {
    counts.FAE = S.rows.length;
  }
  const marks = { FAE: counts.FAE, TRAIN: counts.TRAIN, VAS: counts.VAS };
  document.querySelectorAll('.tab').forEach(tb => {
    const k = tb.dataset.team;
    const nb = tb.querySelector('.nb');
    if (!nb) {
      const span = document.createElement('span');
      span.className = 'nb';
      tb.appendChild(span);
    }
    tb.querySelector('.nb').textContent = marks[k] ? num(marks[k]) : '';
    tb.classList.toggle('on', k === S.team);
  });
}

/* ---------------- 主渲染 ---------------- */
export function paint() {
  if (!S.loaded && !S.err) {
    $('kpis').innerHTML = '';
    $('leftBody').innerHTML = loadingBlock(S.loadingMsg);
    $('rankBody').innerHTML = '<div class="loading"><span class="spin"></span></div>';
    return;
  }

  if (S.err) {
    $('kpis').innerHTML = '';
    $('leftBody').innerHTML = '<div class="banner"><b>' + esc(t('err.title')) + '</b>' + esc(S.err)
      + '<br><br>' + esc(t('err.suggest')) + '<br>1. ' + t('err.step1')
      + '<br>2. ' + t('err.step2', { tableId: (S.curTableId || '') })
      + '<br>3. ' + t('err.step3')
      + (S.missing && S.missing.length ? '<br><br>' + esc(t('config.missing', { fields: S.missing.join('、') })) : '')
      + '</div>';
    ['rankBody', 'dtBody', 'crumbs'].forEach(id => { $(id).innerHTML = ''; });
    return;
  }

  if (S.emptyReason) {
    $('kpis').innerHTML = '';
    ['rankBody', 'dtBody', 'crumbs'].forEach(id => { $(id).innerHTML = ''; });
    $('chartSub').textContent = '';
    $('rightTitle').textContent = '';
    $('rightSub').textContent = '';
    $('dtSub').textContent = '';
    $('kbHint').textContent = '';

    if (S.emptyReason === 'no-source') {
      $('chartTitle').textContent = t('chart.waitSource');
      $('leftBody').innerHTML = emptyBlock('◈',
        esc(t('state.needSource')),
        esc(t('state.needSourceDesc')) + '<br>'
        + '<b>' + esc(t('state.needSourceTable')) + '</b> = ' + esc(S.suggestTable || '—') + '<br>'
        + esc(t('state.needSourceFields')),
        esc(t('state.needSourceTip')));
    } else if (S.emptyReason === 'no-match') {
      $('chartTitle').textContent = t('chart.waitSource');
      $('leftBody').innerHTML = emptyBlock('◈', esc(t('err.noTable')),
        S.missing && S.missing.length ? esc(t('config.missing', { fields: S.missing.join('、') })) : '',
        esc(t('state.needSourceTip')));
    } else if (S.emptyReason === 'no-sdk') {
      $('chartTitle').textContent = t('chart.waitSource');
      $('leftBody').innerHTML = emptyBlock('◈', esc(t('state.noSdk')),
        esc(t('state.noSdkDesc')), esc(t('state.needSourceTip')));
    } else {
      $('chartTitle').textContent = t('chart.productTitle');
      $('leftBody').innerHTML = '<div class="empty"><span class="ic">◎</span><span>' + esc(t('empty.noRecord')) + '</span></div>';
    }
    return;
  }

  detectTeamSplit();
  syncTeamTabs();

  const all = baseRows();
  renderKpis(all);

  if (S.mode === 'matrix') renderMatrix(all);
  else renderByProduct(all);

  renderCrumbs();
  renderRank(all);
  const scoped = scopedRows();
  renderDetail(scoped);
  renderKbPanel(scoped);
  syncBottomPanel();
  syncLvlSeg();
  syncModeSeg();
}

/* ---------------- 弹层 ---------------- */
export function openModal(r) {
  if (!r) return;
  $('mTitle').textContent = r.desc || r.l3 || t('modal.title');
  $('mConvoH').textContent = t('modal.convo');
  $('mSub').innerHTML = [
    r.fam, r.modelShort, r.l1, r.l2, r.l3,
    r.team ? t('modal.team', { team: r.team }) : '',
    r.staff ? t('modal.staff', { staff: r.staff }) : ''
  ].filter(Boolean).map(x => '<span>' + esc(x) + '</span>').join('');

  const kv = [
    [t('field.no'), r.no],
    [t('field.model'), r.model],
    [t('field.tagPath'), [r.l1, r.l2, r.l3].filter(Boolean).join(' › ')],
    [t('field.category'), r.cat],
    [t('field.ask'), r.ask],
    [t('field.satisfaction'), r.sat],
    [t('field.channel'), r.channel],
    [t('field.skill'), r.skill],
    [t('field.createdAt'), r.time]
  ].filter(x => x[1]);
  $('mKv').innerHTML = kv.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');

  $('mConvo').textContent = r.msg || r.desc || t('modal.emptyConvo');

  const kbBtn = $('mKb');
  if (r.kb) { kbBtn.style.display = 'inline-block'; kbBtn.href = r.kb; }
  else { kbBtn.style.display = 'none'; kbBtn.removeAttribute('href'); }

  $('mask').classList.add('on');
}

export function closeModal() { $('mask').classList.remove('on'); }

/* ---------------- 事件 ---------------- */
export function bindUi() {
  // 团队切换
  delegate($('tabs'), '.tab', 'click', (e, el) => {
    S.team = el.dataset.team;
    S.sel = { fam: null, model: null, l1: null, l2: null, l3: null };
    S.lvl = 1;
    paint();
  });

  // 产品行下钻（主视图）
  delegate($('leftBody'), '.prow', 'click', (e, el) => {
    const same = S.sel.fam === el.dataset.fam && S.sel.model === el.dataset.model;
    S.sel.fam = same ? null : el.dataset.fam;
    S.sel.model = same ? null : el.dataset.model;
    S.sel.l1 = null; S.sel.l2 = null; S.sel.l3 = null;
    S.lvl = 1;
    paint();
  });

  // 矩阵单元格下钻
  delegate($('leftBody'), '.cell[data-fam]', 'click', (e, el) => {
    S.sel.fam = el.dataset.fam;
    S.sel.model = null;
    S.sel.l1 = el.dataset.l1;
    S.sel.l2 = null; S.sel.l3 = null;
    S.lvl = 2;
    paint();
  });

  // 标签排名下钻
  delegate($('rankBody'), '.rrow', 'click', (e, el) => {
    const key = lvlKey(S.lvl);
    const k = el.dataset.k;
    if (S.sel[key] === k) {
      S.sel[key] = null;
    } else {
      S.sel[key] = k;
      if (S.lvl === 1) { S.sel.l2 = null; S.sel.l3 = null; S.lvl = 2; }
      else if (S.lvl === 2) { S.sel.l3 = null; S.lvl = 3; }
    }
    paint();
  });

  // 面包屑回退
  delegate($('crumbs'), '.crumb[data-k]', 'click', (e, b) => {
    const k = b.dataset.k;
    if (k === 'root') S.sel = { fam: null, model: null, l1: null, l2: null, l3: null };
    if (k === 'fam') { S.sel.model = null; S.sel.l1 = null; S.sel.l2 = null; S.sel.l3 = null; }
    if (k === 'model') { S.sel.l1 = null; S.sel.l2 = null; S.sel.l3 = null; }
    if (k === 'l1') { S.sel.l2 = null; S.sel.l3 = null; }
    if (k === 'l2') { S.sel.l3 = null; }
    S.lvl = S.sel.l2 ? 3 : S.sel.l1 ? 2 : 1;
    paint();
  });

  // 明细行 → 弹层
  delegate($('dtBody'), 'tr[data-i]', 'click', (e, tr) => {
    const rows = scopedRows().slice(0, 300);
    openModal(rows[+tr.dataset.i]);
  });

  // 层级切换
  delegate($('lvlSeg'), 'button', 'click', (e, b) => {
    S.lvl = +b.dataset.lv;
    if (S.lvl < 3) S.sel.l3 = null;
    if (S.lvl < 2) S.sel.l2 = null;
    paint();
  });

  // 视图模式切换
  delegate($('modeSeg'), 'button', 'click', (e, b) => {
    S.mode = b.dataset.mode;
    paint();
  });

  // 底部面板切换
  delegate($('botSeg'), 'button', 'click', (e, b) => {
    S.panel = b.dataset.pan;
    syncBottomPanel();
  });

  // 搜索
  let timer = null;
  const q = $('q');
  if (q) {
    q.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        S.q = e.target.value || '';
        S.sel = { fam: null, model: null, l1: null, l2: null, l3: null };
        S.lvl = 1;
        paint();
      }, 180);
    });
  }

  // 弹层关闭
  $('mClose').addEventListener('click', closeModal);
  $('mOk').addEventListener('click', closeModal);
  $('mask').addEventListener('click', (e) => { if (e.target === $('mask')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

export function applyTheme(t2) {
  if (t2 === 'auto' || !t2) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t2);
  S.theme = t2 || 'auto';
}
