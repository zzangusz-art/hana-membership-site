'use strict';
// 과거 시세 이력 채우기(1회성) — 차트 1년·3년·5년·10년 구간용.
//   node scripts/donga-backfill.js            → data/seed/price-history.json 생성(월 단위 5년 + 연 단위 10년)
// 서버는 시드 단계에서 이 파일을 price_history에 "없는 날짜만" 넣는다(실제 일별 기록을 덮어쓰지 않음).
// 매핑은 lib/donga.js의 종목 매핑(자동+수동)을 그대로 쓴다. 요청 간 0.4초 대기.
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs');
const path = require('path');
const donga = require('../lib/donga');
const prices = require('../lib/prices');

const UA = 'Mozilla/5.0 (compatible; hana-site price-sync; +https://hanamember.co.kr)';
const BASE = 'https://www.dongagolf.co.kr';
const OUT = path.join(__dirname, '..', 'data', 'seed', 'price-history.json');
const YEARS_MONTHLY = Number(process.argv[2] || 5);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const strip = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function get(url, referer) { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko', ...(referer ? { Referer: referer } : {}) }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }
async function chart(id, code, type, start = '') { const t = await get(`${BASE}/api/chart.php?id=${id}&code=${code}&type=${type}&start=${encodeURIComponent(start)}`, `${BASE}/membership/info?custid=${id}&code=${code}`); return JSON.parse(t); }

(async () => {
  const html = await get(donga.SOURCES.golf);
  // 종목명 → {id, code}
  const ids = new Map();
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) || []) { const m = row.match(/href="\/membership\/info\?custid=(\d+)&(?:amp;)?code=(\d+)"[^>]*>([\s\S]*?)<\/a>/); if (!m) continue; const name = strip(m[3]); if (name && !ids.has(name)) ids.set(name, { id: m[1], code: m[2] }); }
  const theirs = donga.parse(html); const ours = prices.list('golf');
  const { matched, unmatched } = donga.matchAll(ours, theirs);
  console.log(`동아 종목 ${theirs.length} · 링크 ${ids.size} · 매핑 ${matched.length}/${ours.length}`);
  const out = { generated: new Date().toISOString().slice(0, 10), note: '월 단위(최근 ' + YEARS_MONTHLY + '년) + 연 단위(그 이전). 단위 만원.', items: {} };
  let n = 0;
  for (const m of matched) {
    const k = ids.get(m.theirs); if (!k) { console.log(' - 링크 없음', m.theirs); continue; }
    const pts = new Map();
    try {
      // 연 단위 전체
      const t = await chart(k.id, k.code, 't'); await sleep(400);
      for (const d of t.data || []) { const mm = String(d.date).match(/^(\d{4})\/(\d{2})$/); if (mm && d.price > 0) pts.set(`${mm[1]}-${mm[2]}-15`, Math.round(d.price)); }
      // 월 단위: 1년씩 거슬러 올라감
      let start = '';
      for (let y = 0; y < YEARS_MONTHLY; y++) {
        const j = await chart(k.id, k.code, 'y', start); await sleep(400);
        for (const d of j.data || []) { const mm = String(d.date).match(/^(\d{2})\/(\d{2})\/(\d{2})$/); if (mm && d.price > 0) pts.set(`20${mm[1]}-${mm[2]}-${mm[3]}`, Math.round(d.price)); }
        if (!j.previousDay) break; start = j.previousDay;
      }
      // 월 단위가 있는 기간의 연 단위(15일 가상 날짜) 점은 제거
      const monthly = [...pts.keys()].filter(d => !d.endsWith('-15') || false).sort(); const firstMonthly = monthly[0];
      if (firstMonthly) for (const d of [...pts.keys()]) if (d.endsWith('-15') && d >= firstMonthly.slice(0, 7) + '-00' && !monthly.includes(d)) pts.delete(d);
      out.items[m.ours] = [...pts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => [d, v]);
      n++; console.log(` ✓ ${m.ours} ← ${m.theirs}: ${out.items[m.ours].length}점 (${out.items[m.ours][0]?.[0]} ~)`);
    } catch (e) { console.log(' ✘', m.ours, e.message); }
  }
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  console.log(`완료: ${n}종목 → ${OUT} · 미매핑 ${unmatched.length}: ${unmatched.join(', ')}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
