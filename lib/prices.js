'use strict';
// 시세 모듈 — 엑셀 업로드 파싱/업서트, 이력 스냅샷, 통계
const XLSX = require('xlsx');
const { db } = require('../db');
const { now, kstDate, addDays } = require('./util');

const CATS = { golf: '골프회원권', corporate: '법인회원권', condo: '콘도회원권', fitness: '피트니스회원권' };
const CAT_ALIASES = {
  golf: ['골프', '골프회원권', 'golf', '개인'], corporate: ['법인', '법인회원권', 'corporate', 'corp'],
  condo: ['콘도', '콘도회원권', '리조트', 'condo', 'resort'], fitness: ['피트니스', '휘트니스', '헬스', 'fitness'],
};
function normCat(s) {
  s = String(s || '').trim().toLowerCase();
  for (const [k, arr] of Object.entries(CAT_ALIASES)) if (arr.some(a => s === a.toLowerCase() || s.includes(a.toLowerCase()))) return k;
  return null;
}
function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

const upsertStmt = db.prepare(`INSERT INTO prices (category,name,region,today,prev,members,note,updated_at)
  VALUES (@category,@name,@region,@today,@prev,@members,@note,@updated_at)
  ON CONFLICT(category,name) DO UPDATE SET
    region=COALESCE(NULLIF(excluded.region,''),prices.region),
    prev=CASE WHEN excluded.prev IS NOT NULL THEN excluded.prev ELSE prices.today END,
    today=excluded.today, members=COALESCE(excluded.members,prices.members),
    note=COALESCE(NULLIF(excluded.note,''),prices.note), updated_at=excluded.updated_at`);
const histStmt = db.prepare(`INSERT INTO price_history (price_id,date,value) VALUES (?,?,?) ON CONFLICT(price_id,date) DO UPDATE SET value=excluded.value`);

// rows: [{category,name,region,today,prev,members,note}]
function upsertRows(rows, date = kstDate()) {
  let inserted = 0, updated = 0; const ts = now();
  const tx = db.transaction((rs) => {
    for (const r of rs) {
      const exists = db.prepare('SELECT id FROM prices WHERE category=? AND name=?').get(r.category, r.name);
      upsertStmt.run({ category: r.category, name: r.name, region: r.region || '', today: r.today, prev: r.prev ?? null, members: r.members ?? null, note: r.note || '', updated_at: ts });
      const id = exists ? exists.id : db.prepare('SELECT id FROM prices WHERE category=? AND name=?').get(r.category, r.name).id;
      if (r.today !== null && r.today !== undefined) histStmt.run(id, date, r.today);
      if (exists) updated++; else inserted++;
    }
  });
  tx(rows);
  return { inserted, updated };
}

// 엑셀(.xlsx/.xls/.csv) → rows. 헤더 자동 인식(구분/회원권명/금일시세/전일시세/회원수/지역/비고)
function parseWorkbook(buffer, defaultCategory) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const out = []; const errors = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!data.length) continue;
    // 헤더 행 찾기(회원권/종목/name 포함 행)
    let hi = data.findIndex(r => r.some(c => /회원권\s*명|종목|name|골프장/i.test(String(c))));
    if (hi < 0) hi = 0;
    const header = data[hi].map(c => String(c).trim());
    const col = (re) => header.findIndex(h => re.test(h));
    const cName = col(/회원권\s*명|종목|골프장|name/i);
    const cToday = col(/금일|현재|시세|today|price/i);
    const cPrev = col(/전일|prev|이전/i);
    const cMem = col(/회원\s*수|members/i);
    const cReg = col(/지역|region/i);
    const cCat = col(/구분|분류|category|종류/i);
    const cNote = col(/비고|메모|note/i);
    const sheetCat = normCat(sheetName) || defaultCategory || 'golf';
    if (cName < 0 || cToday < 0) { errors.push(`시트 "${sheetName}": 회원권명/금일시세 열을 찾지 못해 건너뜀`); continue; }
    for (let i = hi + 1; i < data.length; i++) {
      const r = data[i]; const name = String(r[cName] || '').trim();
      if (!name) continue;
      const today = toInt(r[cToday]); if (today === null) { errors.push(`${sheetName} ${i + 1}행 "${name}": 금일시세 숫자 아님`); continue; }
      const category = (cCat >= 0 && normCat(r[cCat])) || sheetCat;
      out.push({ category, name, today, prev: cPrev >= 0 ? toInt(r[cPrev]) : null, members: cMem >= 0 ? toInt(r[cMem]) : null, region: cReg >= 0 ? String(r[cReg] || '').trim() : '', note: cNote >= 0 ? String(r[cNote] || '').trim() : '' });
    }
  }
  return { rows: out, errors };
}

// 업로드 양식 xlsx 생성(현재 DB 값으로 채움)
function buildTemplate() {
  const wb = XLSX.utils.book_new();
  for (const [cat, label] of Object.entries(CATS)) {
    const rows = db.prepare('SELECT name, today, prev, members, region, note FROM prices WHERE category=? ORDER BY name').all(cat);
    const aoa = [['회원권명', '금일시세(만원)', '전일시세(만원)', '회원수', '지역', '비고']];
    for (const r of rows) aoa.push([r.name, r.today, r.prev, r.members, r.region, r.note]);
    if (!rows.length) aoa.push(['예시) 아시아나', 94000, 92000, '', '수도권', '']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, label);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── 조회 ──
function list(category, { region, q, sort } = {}) {
  let sql = 'SELECT * FROM prices WHERE category=?'; const args = [category];
  if (region) { sql += ' AND region=?'; args.push(region); }
  if (q) { sql += ' AND name LIKE ?'; args.push(`%${q}%`); }
  sql += sort === 'price' ? ' ORDER BY today DESC' : ' ORDER BY name COLLATE NOCASE';
  return db.prepare(sql).all(...args).map(withChange);
}
function withChange(r) {
  const diff = (r.today ?? 0) - (r.prev ?? r.today ?? 0);
  const pct = r.prev ? Math.round((diff / r.prev) * 1000) / 10 : 0;
  return { ...r, diff, pct };
}
function byName(category, name) { const r = db.prepare('SELECT * FROM prices WHERE category=? AND name=?').get(category, name); return r ? withChange(r) : null; }
function history(priceId, days = 90) {
  return db.prepare('SELECT date, value FROM price_history WHERE price_id=? AND date>=? ORDER BY date').all(priceId, addDays(kstDate(), -days));
}
function stats(category = 'golf') {
  const rows = list(category);
  const up = rows.filter(r => r.diff > 0).sort((a, b) => b.pct - a.pct);
  const down = rows.filter(r => r.diff < 0).sort((a, b) => a.pct - b.pct);
  const total = rows.length; const flat = total - up.length - down.length;
  const avg = total ? Math.round(rows.reduce((s, r) => s + (r.today || 0), 0) / total) : 0;
  const lastUpdated = db.prepare('SELECT MAX(updated_at) m FROM prices WHERE category=?').get(category).m;
  const regions = {};
  for (const r of rows) { const k = r.region || '기타'; regions[k] = regions[k] || { n: 0, up: 0, down: 0, sum: 0 }; regions[k].n++; regions[k].sum += r.today || 0; if (r.diff > 0) regions[k].up++; if (r.diff < 0) regions[k].down++; }
  return { total, up: up.length, down: down.length, flat, avg, topUp: up.slice(0, 5), topDown: down.slice(0, 5), lastUpdated, regions, max: rows.slice().sort((a, b) => b.today - a.today).slice(0, 5) };
}
function regions(category) { return db.prepare("SELECT DISTINCT region FROM prices WHERE category=? AND region<>'' ORDER BY region").all(category).map(r => r.region); }
function lastUpdatedAll() { return db.prepare('SELECT MAX(updated_at) m FROM prices').get().m; }
function uploadsSince(ts) { return db.prepare('SELECT COUNT(*) c FROM price_uploads WHERE created_at>=?').get(ts).c; }

module.exports = { CATS, normCat, parseWorkbook, upsertRows, buildTemplate, list, byName, history, stats, regions, lastUpdatedAll, uploadsSince, withChange };
