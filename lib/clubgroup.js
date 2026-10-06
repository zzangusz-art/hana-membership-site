'use strict';
// 골프장 묶기 — "강남300 / 강남300 주중가족 / 강남300 주중개인"처럼 회원권 종류별로 나뉜 항목을
// 골프장 하나(대표)와 그 안의 회원권 종류로 묶는다. clubs.parent_id(대표 id) · variant_label(종류 이름)에 저장.
const { db } = require('../db');

// 이름 끝에서 떼어낼 회원권 종류 표현. glued=true는 띄어쓰기 없이 붙어 있어도 뗀다(예: 김포씨사이드여자).
const TOKENS = [
  ['주중가족골드'], ['주중무기명'], ['주중가족'], ['주중개인'], ['가족분담금'], ['개인분담금'], ['10억무기명'],
  ['무기명', true], ['분담금'], ['주중', true], ['여자', true], ['우대'], ['특별'], ['일반', true], ['주주'], ['주식'], ['입회', true],
  ['분양', true], ['VVIP', true], ['VIP', true], ['플러스', true], ['노블'], ['하나로'], ['골드'], ['로얄'], ['가족'], ['개인'], ['나다'],
  ['비즈니스'], ['비지니스'], ['프리미엄'], ['프리미어'], ['1,2차'], ['3차'],
];
const SUFFIX = /(컨트리클럽|골프클럽|골프앤리조트|골프리조트|cc|c\.c|gc)$/i;
// 자동 규칙이 틀리는 이름은 여기에 직접 적는다: 이름 → 대표 키('' 이면 묶지 않음)
const OVERRIDE = {
  '토탈골프': '', '골드레이크': '골드레이크', '골드레이크 주중': '골드레이크',
  '캐슬렉스서울': '캐슬렉스', '캐슬렉스제주': '캐슬렉스제주', '캐슬렉스제주 우대': '캐슬렉스제주', '캐슬렉스제주골프텔(3900)': '캐슬렉스제주',
  '블랙스톤이천cc': '블랙스톤이천', '블랙스톤': '블랙스톤', '블랙스톤(15000)': '블랙스톤',
  '더시에나서울(구 중부cc)': '더시에나서울',
  '오션힐스 포항': '오션힐스포항', '오션힐스 청도': '오션힐스청도',
  '세레니티강촌cc': '세레니티강촌', '해내다CC': '해내다',
};

function baseKey(name) {
  const raw = String(name || '').trim();
  if (raw in OVERRIDE) return OVERRIDE[raw];
  let s = raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim(); // 괄호 구좌·평형 제거
  let changed = true;
  while (changed) {
    changed = false;
    const m = s.match(/^(.*?\D)\s*-?\s*\d{4,}$/); // 끝의 4자리 이상 숫자(분양가 구좌): 남촌55000
    if (m && m[1].trim()) { s = m[1].trim(); changed = true; }
    for (const [t, glued] of TOKENS) {
      if (s.length <= t.length || !s.toLowerCase().endsWith(t.toLowerCase())) continue;
      const head = s.slice(0, s.length - t.length);
      if (/[\s-]$/.test(head) || glued) { const h = head.replace(/[\s-]+$/, ''); if (h.length >= 2) { s = h; changed = true; break; } }
    }
  }
  s = s.replace(/\s+/g, '');
  const cut = s.replace(SUFFIX, ''); if (cut.length >= 2) s = cut;
  return s.toLowerCase();
}
// 대표로 삼을 이름(골프장 자체를 가리키는 항목)
const PARENT_PREF = new Set(['캐슬렉스서울', '캐슬렉스제주', '해내다CC']);
const GROUP_NAME = { '캐슬렉스': '캐슬렉스서울', '해내다': '해내다CC' };
// 화면에 쓸 대표 이름: 종류 표현만 떼고 띄어쓰기·표기는 유지 (예: "아난티 남해(35평형)" → "아난티 남해")
function baseDisplay(name) {
  let s = String(name || '').trim().replace(/\s*\([^)]*\)\s*/g, ' ').trim(); let changed = true;
  while (changed) {
    changed = false;
    const m = s.match(/^(.*?\D)\s*-?\s*\d{4,}$/); if (m && m[1].trim()) { s = m[1].trim(); changed = true; }
    for (const [t, glued] of TOKENS) { if (s.length <= t.length || !s.toLowerCase().endsWith(t.toLowerCase())) continue; const head = s.slice(0, s.length - t.length); if (/[\s-]$/.test(head) || glued) { const h = head.replace(/[\s-]+$/, ''); if (h.length >= 2) { s = h; changed = true; break; } } }
  }
  return s;
}
const isPlain = (name, key) => PARENT_PREF.has(name) || SUFFIX.test(name) || String(name).replace(/\s+/g, '').toLowerCase() === key;

// 종류 이름: 원래 이름에서 대표 이름 부분을 뺀 나머지
function variantLabel(name, parentName) {
  const n = String(name || '').trim(); const bases = [parentName, parentName.replace(SUFFIX, ''), parentName.replace(/\s+/g, '')].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const b of bases) if (n.toLowerCase().startsWith(b.toLowerCase()) && n.length > b.length) return n.slice(b.length).replace(/^[\s\-·]+/, '').replace(/^\((.*)\)$/, '$1').trim() || n;
  // 대표 이름이 "○○컨트리클럽"이고 종류가 "○○ 주중"인 경우
  const k = baseKey(n); const compact = n.replace(/\s+/g, '');
  if (k && compact.toLowerCase().startsWith(k) && compact.length > k.length) { let i = 0, c = 0; while (i < n.length && c < k.length) { if (!/\s/.test(n[i])) c++; i++; } const rest = n.slice(i).replace(/^[\s\-·]+/, '').replace(/^\((.*)\)$/, '$1').trim(); if (rest) return rest; }
  return n;
}

// 묶음 계산. 반환: [{ key, parent, children: [...] }]
function compute(rows) {
  const groups = new Map();
  for (const r of rows) {
    const keys = [baseKey(r.name)]; const k = keys[0];
    if (!k) { groups.set('__solo_' + r.id, [r]); continue; }
    if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r);
  }
  const out = [];
  for (const [key, list] of groups) {
    // 대표: 해설 글이 있는 곳 → 이름이 대표 키와 같은 곳(컨트리클럽 등 접미사 허용) → 이름이 가장 짧은 곳
    const score = (r) => { const plain = String(r.name).replace(/\s+/g, '').replace(SUFFIX, '').toLowerCase() === key; return (PARENT_PREF.has(r.name) ? 16 : 0) + (SUFFIX.test(r.name) && r.price_name ? 8 : 0) + (r.body_html ? 4 : 0) + (plain ? 2 : 0) + (SUFFIX.test(r.name) ? 1 : 0); };
    const sorted = [...list].sort((a, b) => score(b) - score(a) || a.name.length - b.name.length || a.id - b.id);
    const parent = sorted[0]; const children = sorted.slice(1).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const groupName = !children.length ? '' : (isPlain(parent.name, key) ? parent.name : (GROUP_NAME[key] || baseDisplay(parent.name)));
    out.push({ key, parent, children, groupName });
  }
  return out;
}

// DB 반영(멱등). 서버 시작·시드 후 호출.
function sync() {
  const rows = db.prepare("SELECT id, name, price_name, body_html, parent_id, variant_label, group_name FROM clubs WHERE status='published'").all();
  const up = db.prepare('UPDATE clubs SET parent_id=?, variant_label=?, group_name=? WHERE id=?'); let changed = 0; let grouped = 0;
  const tx = db.transaction(() => {
    for (const g of compute(rows)) {
      const set = (r, pid, label, gname) => { if ((r.parent_id || null) !== pid || (r.variant_label || '') !== label || (r.group_name || '') !== gname) { up.run(pid, label, gname, r.id); changed++; } };
      const plain = isPlain(g.parent.name, g.key);
      set(g.parent, null, g.groupName && !plain ? variantLabel(g.parent.name, g.groupName) : '', g.groupName);
      for (const c of g.children) { set(c, g.parent.id, variantLabel(c.name, g.groupName), ''); grouped++; }
    }
  });
  tx();
  return { clubs: rows.length - grouped, variants: grouped, changed };
}

// 요청 1건에서 여러 골프장을 처리할 때 시세 목록을 한 번만 읽기 위한 컨텍스트
function context() {
  const prices = require('./prices'); const list = prices.list('golf'); const byName = new Map(list.map(p => [p.name, p])); const byKey = new Map();
  for (const p of list) { const k = baseKey(p.name); if (!k) continue; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p); }
  const kids = new Map(); for (const c of db.prepare("SELECT * FROM clubs WHERE status='published' AND parent_id IS NOT NULL ORDER BY name").all()) { if (!kids.has(c.parent_id)) kids.set(c.parent_id, []); kids.get(c.parent_id).push(c); }
  return { byName, byKey, kids };
}
// 대표 골프장의 회원권 종류 목록. 각 항목: { club(없으면 시세만 있는 종류), name, label, price }
// 시세 한 종목은 한 종류에만 붙인다: ①이름이 정확히 같은 종목 ②대표의 시세 종목명 ③종류의 시세 종목명 순.
function variants(parent, ctx = context()) {
  const children = ctx.kids.get(parent.id) || []; const title = parent.group_name || parent.name; const key = baseKey(parent.name);
  const items = [parent, ...children].map(c => ({ club: c, name: c.name, label: c.id === parent.id ? (parent.variant_label || '') : (c.variant_label || c.name), price: null, isParent: c.id === parent.id }));
  const used = new Set(); const take = (it, p) => { if (p && !used.has(p.id) && !it.price) { it.price = p; used.add(p.id); } };
  for (const it of items) take(it, ctx.byName.get(it.name));
  take(items[0], parent.price_name ? ctx.byName.get(parent.price_name) : null);
  for (const it of items.slice(1)) take(it, it.club.price_name ? ctx.byName.get(it.club.price_name) : null);
  // 골프장 항목은 없고 시세표에만 있는 종류
  if (children.length || items[0].price) for (const p of ctx.byKey.get(key) || []) if (!used.has(p.id)) { used.add(p.id); items.push({ club: null, name: p.name, label: variantLabel(p.name, title), price: p, isParent: false }); }
  let out = items;
  // 대표가 골프장 자체를 가리키는 항목이고 자기 시세가 없으면(시세는 종류 쪽에 붙음) 종류 탭에서는 뺀다
  if (out.length > 1 && !out[0].price && !parent.variant_label && (SUFFIX.test(parent.name) || PARENT_PREF.has(parent.name)) && out.slice(1).some(v => v.price)) out = out.slice(1);
  for (const it of out) { if (it.isParent && !it.label) it.label = it.price && it.price.name !== title ? it.price.name : title; if (/^[\d,.\s-]+$/.test(it.label)) it.label = it.name; }
  return out;
}
function countByParent() { const m = {}; for (const r of db.prepare("SELECT parent_id p, COUNT(*) c FROM clubs WHERE status='published' AND parent_id IS NOT NULL GROUP BY parent_id").all()) m[r.p] = r.c; return m; }

module.exports = { baseKey, baseDisplay, variantLabel, compute, sync, context, variants, countByParent };
