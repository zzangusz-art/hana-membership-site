'use strict';
// 시세 출처 전수 점검 — 운영 시세표의 모든 종목을 동아회원권(자동 반영 출처)·구 하나회원권 사이트(hanamarket)와 나란히 놓고 본다.
//  · 골프: 동아 연결 여부와 연결이 맞는지(구 사이트 기록 ↔ 동아 차트가 같은 값으로 움직였는지), 동아 최신값과 운영값 차이
//  · 전 분류: 구 사이트 최근 갱신일·값(클라이언트가 아직 구 사이트에 입력하는 종목 찾기)
//  · 콘도·피트니스: 동아 목록에 같은 이름이 있으면 최신값 비교
// 출력: ../측정/시세점검_<날짜>.json  실행: node scripts/price-source-audit.js [--cats golf,corporate,condo,fitness]
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs'); const path = require('path');
const { db } = require('../db'); const donga = require('../lib/donga'); const { kstDate } = require('../lib/util');
const HM = 'https://www.hanamarket.co.kr'; const DG = 'https://www.dongagolf.co.kr'; const SITE = 'https://hanamember.co.kr';
const UA = 'Mozilla/5.0 (compatible; hana-site price-audit; +https://hanamember.co.kr)';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const strip = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
async function get(url, referer) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko', ...(referer ? { Referer: referer } : {}) }, signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); } catch (e) { if (i === 2) throw e; await sleep(1200); } } }
const OLD = { golf: { view: '/golf/02_view/', chart: '/dataurl_action/chart_test/', seed: 280 }, corporate: { view: '/market/02_view/', chart: '/dataurl_action/chart_test03/', seed: 10 }, condo: { view: '/resort/02_view/', chart: '/dataurl_action/chart_test01/', seed: 3 }, fitness: { view: '/fitness/02_view/', chart: '/dataurl_action/chart_test02/', seed: 50 } };
const cleanOld = (n) => String(n || '').replace(/\s*\(법인\)\s*$/, '').trim();
const argv = process.argv.slice(2); const CATS = (argv.includes('--cats') ? argv[argv.indexOf('--cats') + 1] : 'golf,corporate,condo,fitness').split(',');
const DATE = kstDate(); const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);

async function oldList(cat) { const o = OLD[cat]; const html = await get(HM + o.view + o.seed + '/'); const re = new RegExp(`href="${o.view.replace(/\//g, '\\/')}(\\d+)\\/?\\?adresspoint="[^>]*>([\\s\\S]*?)<\\/a>`, 'g'); const out = new Map(); let m; while ((m = re.exec(html))) { const n = cleanOld(strip(m[2])); if (n && !out.has(n)) out.set(n, m[1]); } return out; }
async function oldPts(cat, id) { const o = OLD[cat]; const pts = new Map(); for (const r of ['1/', '12/']) { let arr = []; try { arr = JSON.parse(await get(HM + o.chart + id + '/' + r, HM + o.view + id + '/')); } catch (_) { arr = []; } await sleep(120); for (const d of arr || []) { const mm = String(d.date).match(/^(\d{2})\/(\d{2})\/(\d{2})$/); const v = Math.round(Number(d.price)); if (mm && v > 0) pts.set(`20${mm[1]}-${mm[2]}-${mm[3]}`, v); } } return [...pts.entries()].sort((a, b) => a[0].localeCompare(b[0])); }

(async () => {
  const out = { date: DATE, items: {} };
  for (const cat of CATS) {
    const prod = JSON.parse(await get(`${SITE}/api/prices/${cat}`)).items; const local = new Map(db.prepare('SELECT name, old_id FROM prices WHERE category=?').all(cat).map(r => [r.name, r.old_id]));
    const ol = await oldList(cat); const byId = new Map([...ol].map(([n, id]) => [id, n]));
    let dg = null, dgIds = new Map(), matchBy = new Map();
    if (cat === 'golf') {
      const html = await get(donga.SOURCES.golf); const rows = donga.parse(html);
      for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) || []) { const m = row.match(/href="\/membership\/info\?custid=(\d+)&(?:amp;)?code=(\d+)"[^>]*>([\s\S]*?)<\/a>/); if (m) dgIds.set(strip(m[3]), { id: m[1], code: m[2] }); }
      const { matched } = donga.matchAll(prod.map(p => ({ name: p.name, today: p.today, prev: p.prev })), rows); matchBy = new Map(matched.map(m => [m.ours, m])); dg = new Map(rows.map(r => [r.name, r]));
    } else if (cat === 'condo' || cat === 'fitness') {
      const d = DATE.replace(/-/g, '.'); const qs = new URLSearchParams({ date: d, region: '전체 지역', type: '', query: '', sort: '' });
      try { const list = JSON.parse(await get(`${DG}/api/${cat}/getPriceTable.php?${qs}`, `${DG}/membership/${cat}`)); dg = new Map(list.map(x => [x.name, { name: x.name, today: Number(x.price) }])); } catch (e) { console.log('동아', cat, '목록 실패', e.message); }
    }
    const res = []; let i = 0;
    for (const p of prod) {
      i++; if (i % 25 === 0) process.stdout.write(`${cat} ${i}/${prod.length}\n`);
      const oid = local.get(p.name) && byId.has(String(local.get(p.name))) ? String(local.get(p.name)) : ol.get(p.name);
      const op = oid ? await oldPts(cat, oid) : [];
      const r = { name: p.name, ours: p.today, oldId: oid || null, oldLast: op.length ? op[op.length - 1] : null };
      if (cat === 'golf') {
        const m = matchBy.get(p.name);
        if (m) {
          r.donga = { name: m.theirs, today: m.today, how: m.how };
          // 연결 검증: 구 사이트 기록(2026-09-30 이전) ↔ 동아 차트
          const k = dgIds.get(m.theirs); let dp = [];
          if (k && op.length) { let start = ''; for (let y = 0; y < 2; y++) { try { const j = JSON.parse(await get(`${DG}/api/chart.php?id=${k.id}&code=${k.code}&type=y&start=${encodeURIComponent(start)}`, `${DG}/membership/info?custid=${k.id}&code=${k.code}`)); await sleep(120); for (const d of j.data || []) { const mm = String(d.date).match(/^(\d{2})\/(\d{2})\/(\d{2})$/); if (mm && d.price > 0) dp.push([`20${mm[1]}-${mm[2]}-${mm[3]}`, Math.round(d.price)]); } if (!j.previousDay) break; start = j.previousDay; } catch (_) { break; } } }
          let n = 0, same = 0; for (const [d, v] of op) { const near = dp.filter(x => dayDiff(x[0], d) <= 10).sort((a, b) => dayDiff(a[0], d) - dayDiff(b[0], d))[0]; if (!near) continue; n++; if (Math.abs(near[1] - v) <= Math.max(50, v * 0.01)) same++; }
          r.verify = { n, same };
        }
      } else if (dg && dg.get(p.name)) r.donga = { name: p.name, today: dg.get(p.name).today, how: 'exact' };
      res.push(r);
    }
    out.items[cat] = res;
    fs.writeFileSync(path.join(__dirname, '..', '..', '측정', `시세점검_${DATE}.json`), JSON.stringify(out, null, 1));
    console.log(`${cat} 완료 ${res.length}`);
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
