'use strict';
// 동아 자동 반영에 연결되지 않은 골프 종목 점검 — 이름 후보를 찾고, 과거 시세가 실제로 같은 값으로 움직였는지 대조해 매핑을 제안한다.
// 이름만 비슷한 다른 상품(용원 ↔ 용원(VVIP) 같은 사례)을 막으려고, 겹치는 기간의 우리 기록과 동아 차트가 같은 값인지 본다.
// 실행: node scripts/donga-map-audit.js [--out 파일]   → 제안(confirmed/ambiguous/none) JSON
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs'); const path = require('path');
const { db } = require('../db'); const donga = require('../lib/donga');
const DG = 'https://www.dongagolf.co.kr'; const UA = 'Mozilla/5.0 (compatible; hana-site price-audit; +https://hanamember.co.kr)';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const strip = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
async function get(url, referer) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) }, signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); } catch (e) { if (i === 2) throw e; await sleep(1500); } } }
const argv = process.argv.slice(2); const OUT = argv[argv.indexOf('--out') + 1] && argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join(__dirname, '..', '..', '측정', `동아연결점검_${new Date().toISOString().slice(0, 10)}.json`);

// 비교용 이름: 괄호 속 옛 이름·공백·기호·흔한 꼬리말 제거
const key = (s) => String(s).toLowerCase().replace(/\(舊[^)]*\)|\(구\.[^)]*\)/g, '').replace(/[\s\-_.·()]/g, '').replace(/컨트리클럽|골프클럽|cc|일반|씨사이드|남자/g, '');
const prefixLen = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };

(async () => {
  const html = await get(donga.SOURCES.golf); const rows = donga.parse(html); const ids = new Map();
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) || []) { const m = row.match(/href="\/membership\/info\?custid=(\d+)&(?:amp;)?code=(\d+)"[^>]*>([\s\S]*?)<\/a>/); if (m) ids.set(strip(m[3]), { id: m[1], code: m[2] }); }
  const ours = db.prepare("SELECT id, name, today, prev FROM prices WHERE category='golf' AND COALESCE(manual_lock,0)=0").all();
  const { matched, unmatched } = donga.matchAll(ours, rows); const used = new Set(matched.map(m => m.theirs));
  const free = rows.filter(r => !used.has(r.name));
  const chartCache = new Map();
  const chart = async (name) => { if (chartCache.has(name)) return chartCache.get(name); const k = ids.get(name); let pts = [];
    if (k) { let start = ''; for (let y = 0; y < 3; y++) { const j = JSON.parse(await get(`${DG}/api/chart.php?id=${k.id}&code=${k.code}&type=y&start=${encodeURIComponent(start)}`, `${DG}/membership/info?custid=${k.id}&code=${k.code}`)); await sleep(250); for (const d of j.data || []) { const mm = String(d.date).match(/^(\d{2})\/(\d{2})\/(\d{2})$/); if (mm && d.price > 0) pts.push({ date: `20${mm[1]}-${mm[2]}-${mm[3]}`, v: Math.round(d.price) }); } if (!j.previousDay) break; start = j.previousDay; } }
    pts.sort((a, b) => a.date.localeCompare(b.date)); chartCache.set(name, pts); return pts; };
  const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
  const result = { checked: new Date().toISOString(), confirmed: [], ambiguous: [], none: [] };
  for (const name of unmatched) {
    const o = ours.find(x => x.name === name); const cur = o.today || o.prev;
    const ko = key(name);
    const cands = free.filter(t => { const kt = key(t.name); return kt === ko || (prefixLen(ko, kt) >= 2 && prefixLen(ko, kt) >= Math.min(ko.length, kt.length) * 0.6); });
    if (!cands.length || !cur) { result.none.push({ name, cur, reason: !cur ? '우리 시세 없음' : '동아에 같은 이름 후보 없음' }); continue; }
    // 우리 과거 기록(9/30 이전, 동아가 아닌 구 사이트 기록)과 동아 차트를 ±10일 안에서 비교
    const hist = db.prepare("SELECT date, value FROM price_history WHERE price_id=? AND date<'2026-09-30' AND date>='2023-10-01' ORDER BY date").all(o.id);
    const scored = [];
    for (const t of cands) {
      const pts = await chart(t.name); let n = 0, same = 0;
      for (const h of hist) { const near = pts.filter(p => dayDiff(p.date, h.date) <= 10).sort((a, b) => dayDiff(a.date, h.date) - dayDiff(b.date, h.date))[0]; if (!near) continue; n++; if (Math.abs(near.v - h.value) <= Math.max(50, h.value * 0.01)) same++; }
      scored.push({ theirs: t.name, today: t.today, n, same, rate: n ? same / n : 0, ratio: +(t.today / cur).toFixed(2) });
    }
    scored.sort((a, b) => b.rate - a.rate || b.n - a.n);
    const best = scored[0]; const second = scored[1];
    const ok = best && best.n >= 3 && best.rate >= 0.75 && !(second && second.rate >= 0.75 && second.n >= 3);
    (ok ? result.confirmed : result.ambiguous).push({ name, cur, best, others: scored.slice(1, 3), histPts: hist.length });
  }
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log(`미연결 ${unmatched.length} → 확인 ${result.confirmed.length} · 애매 ${result.ambiguous.length} · 후보 없음 ${result.none.length} → ${OUT}`);
})().catch(e => { console.error(e); process.exitCode = 1; });
