'use strict';
// 동아 연결을 새로 하거나 바로잡은 골프 종목의 시세 기록을 동아 기록으로 채운다.
//  · 9/30 이전: data/seed/price-history.json items.golf[이름] 을 동아 기록(월 단위 전체 + 최근 5년)으로 교체
//  · 9/30 이후: 연결이 틀려 멈춘 값으로 쌓인 자체 기록을 동아 기록 + 오늘 동아 시세로 한 번 교체(relinked, lib/prices.js importHistory)
// 실행: node scripts/relink-history.js <배치ID> 이름1 이름2 ...   (이름을 생략하면 lib/donga.js RELINKED_20261023)
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs'); const path = require('path');
const { db } = require('../db'); const donga = require('../lib/donga');
const DG = 'https://www.dongagolf.co.kr'; const UA = 'Mozilla/5.0 (compatible; hana-site price-sync; +https://hanamember.co.kr)';
const OUT = path.join(__dirname, '..', 'data', 'seed', 'price-history.json'); const FIRST_OWN = '2026-09-30';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const strip = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
async function get(url, referer) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) }, signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); } catch (e) { if (i === 2) throw e; await sleep(1500); } } }

(async () => {
  const [batch, ...names0] = process.argv.slice(2); if (!batch) { console.error('배치 ID가 필요합니다(예: 20261023)'); process.exit(1); }
  const names = names0.length ? names0 : donga.RELINKED_20261023;
  const html = await get(donga.SOURCES.golf); const rows = donga.parse(html); const ids = new Map();
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) || []) { const m = row.match(/href="\/membership\/info\?custid=(\d+)&(?:amp;)?code=(\d+)"[^>]*>([\s\S]*?)<\/a>/); if (m) ids.set(strip(m[3]), { id: m[1], code: m[2] }); }
  const dateM = html.match(/id="nowdatestr">\s*(\d{4})\.(\d{2})\.(\d{2})/); const srcDate = dateM ? `${dateM[1]}-${dateM[2]}-${dateM[3]}` : null;
  const ours = db.prepare("SELECT name, today, prev FROM prices WHERE category='golf'").all();
  const { matched } = donga.matchAll(ours, rows); const by = new Map(matched.map(m => [m.ours, m]));
  const j = JSON.parse(fs.readFileSync(OUT, 'utf8')); j.relinked = j.relinked && j.relinked.batch === batch ? j.relinked : { batch, note: '동아 연결을 바로잡은 종목 — 9/30 이후 자체 기록을 동아 기록으로 한 번 교체', items: {} };
  for (const name of names) {
    const m = by.get(name); if (!m) { console.log(' ✘ 동아 연결 없음:', name); continue; }
    const k = ids.get(m.theirs); if (!k) { console.log(' ✘ 동아 id 없음:', m.theirs); continue; }
    const chart = async (type, start = '') => JSON.parse(await get(`${DG}/api/chart.php?id=${k.id}&code=${k.code}&type=${type}&start=${encodeURIComponent(start)}`, `${DG}/membership/info?custid=${k.id}&code=${k.code}`));
    const pts = new Map();
    const t = await chart('t'); await sleep(300);
    for (const d of t.data || []) { const mm = String(d.date).match(/^(\d{4})\/(\d{2})$/); if (mm && d.price > 0) pts.set(`${mm[1]}-${mm[2]}-15`, Math.round(d.price)); }
    let start = ''; for (let y = 0; y < 5; y++) { const c = await chart('y', start); await sleep(300); for (const d of c.data || []) { const mm = String(d.date).match(/^(\d{2})\/(\d{2})\/(\d{2})$/); if (mm && d.price > 0) pts.set(`20${mm[1]}-${mm[2]}-${mm[3]}`, Math.round(d.price)); } if (!c.previousDay) break; start = c.previousDay; }
    // 월 단위(-15)와 실제 날짜가 겹치는 달은 실제 날짜만
    const exactMonths = new Set([...pts.keys()].filter(d => !d.endsWith('-15')).map(d => d.slice(0, 7)));
    for (const d of [...pts.keys()]) if (d.endsWith('-15') && exactMonths.has(d.slice(0, 7))) pts.delete(d);
    if (srcDate) pts.set(srcDate, m.today);
    const arr = [...pts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    j.items.golf[name] = arr.filter(([d]) => d < FIRST_OWN); j.sources['golf|' + name] = 'donga:' + m.theirs;
    j.relinked.items['golf|' + name] = arr.filter(([d]) => d >= FIRST_OWN);
    if (j.dropped) delete j.dropped['golf|' + name];
    console.log(` ✔ ${name} ← ${m.theirs}: ${arr.length}점(${arr[0][0]} ~ ${arr[arr.length - 1][0]}), 지금 ${m.today}`);
  }
  j.generated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(OUT, JSON.stringify(j));
  console.log('저장', OUT);
})().catch(e => { console.error(e); process.exitCode = 1; });
