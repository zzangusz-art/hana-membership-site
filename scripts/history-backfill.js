'use strict';
// 과거 시세 이력 다시 모으기(전 분류) — 차트 1년·3년·5년·10년 구간용. 결과: data/seed/price-history.json (version 2)
//   node scripts/history-backfill.js [--skip-donga]
// 출처
//   1) 동아회원권(골프): 동아와 연결된 종목은 월 단위 5년 + 그 이전 연 단위. 지금 매일 동아 시세를 반영하므로 차트가 끊기지 않는다.
//   2) 기존 하나회원권 사이트(hanamarket.co.kr): 골프(동아 미연결)·법인·콘도·피트니스. 종목별 차트 데이터(전체·3년·1년·6개월·1개월).
// 우리 기록이 시작된 날(FIRST_OWN) 이후 날짜는 넣지 않는다 — 실제 일별 기록과 섞이지 않게.
// 이름이 바뀐 종목(price-corrections.json의 rename)은 새 이름으로 붙인다. 요청 간 0.3초 대기.
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs'); const path = require('path');
const prices = require('../lib/prices'); const donga = require('../lib/donga');
const OUT = path.join(__dirname, '..', 'data', 'seed', 'price-history.json');
const FIRST_OWN = '2026-09-30';
const UA = 'Mozilla/5.0 (compatible; hana-site price-history; +https://hanamember.co.kr)';
const HM = 'https://www.hanamarket.co.kr'; const DG = 'https://www.dongagolf.co.kr';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const strip = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
async function get(url, referer) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko', ...(referer ? { Referer: referer } : {}) }, signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); } catch (e) { if (i === 2) throw e; await sleep(1500); } } }

// 기존 사이트 분류별 경로(종목 상세 / 차트 데이터)
const OLD = {
  golf: { view: '/golf/02_view/', chart: '/dataurl_action/chart_test/', seed: 280 },
  corporate: { view: '/market/02_view/', chart: '/dataurl_action/chart_test03/', seed: 10 },
  condo: { view: '/resort/02_view/', chart: '/dataurl_action/chart_test01/', seed: 3 },
  fitness: { view: '/fitness/02_view/', chart: '/dataurl_action/chart_test02/', seed: 50 },
};
const RANGES = ['', '36/', '12/', '6/', '1/'];
const cleanOld = (n) => String(n || '').replace(/\s*\(법인\)\s*$/, '').trim(); // 법인 목록은 이름 뒤에 ' (법인)'
const renames = {}; for (const o of (require('../data/seed/price-corrections.json').ops || [])) if (o.op === 'rename') renames[o.category + '|' + o.from] = o.to;

async function oldSiteList(cat) {
  const o = OLD[cat]; const html = await get(HM + o.view + o.seed + '/');
  const re = new RegExp(`href="${o.view.replace(/\//g, '\\/')}(\\d+)\\/?\\?adresspoint="[^>]*>([\\s\\S]*?)<\\/a>`, 'g');
  const out = new Map(); let m; while ((m = re.exec(html))) { const name = cleanOld(strip(m[2])); if (name && !out.has(m[1])) out.set(m[1], name); }
  if (!out.has(String(o.seed))) { const t = html.match(/class="tit[^"]*"[^>]*>([^<]+)</); if (t) out.set(String(o.seed), strip(t[1])); }
  return out; // id → 이름
}
async function oldSiteHistory(cat, id) {
  const o = OLD[cat]; const pts = new Map();
  for (const r of RANGES) {
    let arr = []; try { arr = JSON.parse(await get(HM + o.chart + id + '/' + r, HM + o.view + id + '/')); } catch (_) { arr = []; } await sleep(300);
    for (const d of arr || []) { const mm = String(d.date).match(/^(\d{2})\/(\d{2})\/(\d{2})$/); const v = Math.round(Number(d.price)); if (mm && v > 0) pts.set(`20${mm[1]}-${mm[2]}-${mm[3]}`, v); }
  }
  return pts;
}
async function dongaHistory(oursGolf) {
  const html = await get(donga.SOURCES.golf); const ids = new Map();
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) || []) { const m = row.match(/href="\/membership\/info\?custid=(\d+)&(?:amp;)?code=(\d+)"[^>]*>([\s\S]*?)<\/a>/); if (!m) continue; const name = strip(m[3]); if (name && !ids.has(name)) ids.set(name, { id: m[1], code: m[2] }); }
  const { matched } = donga.matchAll(oursGolf, donga.parse(html)); const out = {};
  for (const m of matched) {
    const k = ids.get(m.theirs); if (!k) continue; const pts = new Map(); const chart = async (type, start = '') => JSON.parse(await get(`${DG}/api/chart.php?id=${k.id}&code=${k.code}&type=${type}&start=${encodeURIComponent(start)}`, `${DG}/membership/info?custid=${k.id}&code=${k.code}`));
    try {
      const t = await chart('t'); await sleep(300);
      for (const d of t.data || []) { const mm = String(d.date).match(/^(\d{4})\/(\d{2})$/); if (mm && d.price > 0) pts.set(`${mm[1]}-${mm[2]}-15`, Math.round(d.price)); }
      let start = '';
      for (let y = 0; y < 5; y++) { const j = await chart('y', start); await sleep(300); for (const d of j.data || []) { const mm = String(d.date).match(/^(\d{2})\/(\d{2})\/(\d{2})$/); if (mm && d.price > 0) pts.set(`20${mm[1]}-${mm[2]}-${mm[3]}`, Math.round(d.price)); } if (!j.previousDay) break; start = j.previousDay; }
      const monthly = [...pts.keys()].filter(d => !d.endsWith('-15')).sort(); if (monthly[0]) for (const d of [...pts.keys()]) if (d.endsWith('-15') && d >= monthly[0].slice(0, 7) + '-00' && !monthly.includes(d)) pts.delete(d);
      out[m.ours] = pts; process.stdout.write('.');
    } catch (e) { console.log('\n ✘ 동아', m.ours, e.message); }
  }
  console.log(`\n동아 이력 ${Object.keys(out).length}종목`); return out;
}

(async () => {
  if (process.argv.includes('--check')) { // 연결 점검만: 기존 사이트 종목 ↔ 우리 종목
    for (const cat of Object.keys(OLD)) { const ours = prices.list(cat); const byName = new Set(ours.map(r => r.name)); const byOld = new Set(ours.filter(r => r.old_id).map(r => String(r.old_id))); const l = await oldSiteList(cat); const miss = [...l].filter(([id, n]) => !byOld.has(id) && !byName.has(n) && !byName.has(renames[cat + '|' + n] || '')).map(([, n]) => n); console.log(cat, '기존', l.size, '우리', ours.length, '연결', l.size - miss.length, '| 못 찾음:', miss.slice(0, 20).join(', ')); }
    process.exit(0);
  }
  const result = { generated: new Date().toISOString().slice(0, 10), version: 2, note: `골프는 동아회원권 연결 종목은 동아 이력(월 단위 5년+연 단위), 나머지와 법인·콘도·피트니스는 기존 하나회원권 사이트 이력. ${FIRST_OWN} 이후(자체 일별 기록 시작)는 제외. 단위 만원.`, items: {}, sources: {} };
  const dg = process.argv.includes('--skip-donga') ? {} : await dongaHistory(prices.list('golf'));
  for (const cat of Object.keys(OLD)) {
    const ours = prices.list(cat); const byName = new Map(ours.map(r => [r.name, r])); const byOld = new Map(ours.filter(r => r.old_id).map(r => [String(r.old_id), r]));
    const list = await oldSiteList(cat); result.items[cat] = {}; let fromOld = 0, fromDonga = 0, miss = [];
    console.log(`${cat}: 기존 사이트 종목 ${list.size} · 우리 종목 ${ours.length}`);
    const used = new Set(); // 병합된 중복 종목은 첫 번째(우리 old_id와 같은 것 우선)만
    const order = [...list].sort((a, b) => (byOld.has(b[0]) ? 1 : 0) - (byOld.has(a[0]) ? 1 : 0));
    for (const [id, oldName] of order) {
      const our = byOld.get(id) || byName.get(oldName) || byName.get(renames[cat + '|' + oldName] || '');
      if (!our) { miss.push(oldName); continue; } if (used.has(our.name)) continue; used.add(our.name);
      if (cat === 'golf' && dg[our.name]) continue; // 동아 이력이 있으면 그쪽을 쓴다
      const pts = await oldSiteHistory(cat, id); const arr = [...pts.entries()].filter(([d]) => d < FIRST_OWN).sort((a, b) => a[0].localeCompare(b[0]));
      if (arr.length) { result.items[cat][our.name] = arr; result.sources[cat + '|' + our.name] = 'hanamarket:' + id; fromOld++; }
    }
    if (cat === 'golf') for (const [name, pts] of Object.entries(dg)) { const arr = [...pts.entries()].filter(([d]) => d < FIRST_OWN).sort((a, b) => a[0].localeCompare(b[0])); if (arr.length) { result.items.golf[name] = arr; result.sources['golf|' + name] = 'donga'; fromDonga++; } }
    const covered = Object.keys(result.items[cat]).length;
    console.log(`  → 이력 ${covered}/${ours.length}종목 (동아 ${fromDonga} · 기존 사이트 ${fromOld}) · 이름 못 찾음 ${miss.length}${miss.length ? ': ' + miss.slice(0, 12).join(', ') : ''}`);
    console.log(`  이력 없는 우리 종목: ${ours.filter(r => !result.items[cat][r.name]).map(r => r.name).slice(0, 20).join(', ')}`);
  }
  // 정제(2026-10-21 실측으로 정함): ① 앞뒤 두 점은 비슷한데(±20%) 가운데만 둘 다와 35% 넘게 다른 점 = 입력 오류
  // ② 기존 사이트 법인 2026-07-13 = 줄이 밀린 일괄 오입력 ③ 법인 일부 종목은 2025-12-22에 표기 기준이 절반으로 바뀜 → 그 이전 값 제외
  const off = (a, b) => Math.abs(a / b - 1); let dropped = 0;
  for (const cat of Object.keys(result.items)) {
    const cur = new Map(prices.list(cat).map(r => [r.name, r.today]));
    for (const [name, arr0] of Object.entries(result.items[cat])) {
      let arr = cat === 'corporate' ? arr0.filter(p => p[0] !== '2026-07-13') : arr0;
      if (cat === 'corporate') { const i = arr.findIndex(p => p[0] === '2025-12-22'); if (i > 0) { const r = arr[i][1] / arr[i - 1][1]; if (r > 0.45 && r < 0.55) arr = arr.slice(i); } }
      arr = arr.filter((p, i) => { const prev = i > 0 ? arr[i - 1][1] : null; const next = i < arr.length - 1 ? arr[i + 1][1] : cur.get(name); return !(prev && next && off(prev, next) <= 0.2 && off(p[1], prev) > 0.35 && off(p[1], next) > 0.35); });
      dropped += arr0.length - arr.length; result.items[cat][name] = arr;
    }
  }
  result.note += ` 입력 오류로 보이는 점 ${dropped}개 제외(튀는 값·법인 2026-07-13 일괄 오입력·법인 2025-12-22 표기 기준 변경 이전).`;
  fs.writeFileSync(OUT, JSON.stringify(result), 'utf8');
  console.log('완료 →', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
