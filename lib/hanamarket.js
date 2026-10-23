'use strict';
// 구 하나회원권 사이트(hanamarket.co.kr) 시세 반영 — 클라이언트가 지금도 시세를 입력하는 곳(2026-10-23 확인: 법인 191·콘도 82·피트니스 50종목이 10/19 갱신).
//  · 법인: 동아에 같은 기준 시세가 없어 이 사이트가 유일한 출처. 우리 종목 ↔ 구 사이트 행은 법인 통합표(data/seed/corporate-merge.json) 기준.
//  · 골프: 동아 자동 반영에 연결되지 않은 종목만(동아 연결 종목은 동아가 기준).
//  · 콘도·피트니스: 같은 이름 행.
// 수기 잠금(manual_lock=1) 종목은 건드리지 않는다. 값이 바뀐 종목만 전일시세를 갱신하고, 나머지는 오늘 기록만 남긴다.
const path = require('path'); const fs = require('fs');
const { db, getSetting, setSetting } = require('../db');
const prices = require('./prices'); const { kstDate } = require('./util');
const HM = 'https://www.hanamarket.co.kr'; const UA = 'Mozilla/5.0 (compatible; hana-site price-sync; +https://hanamember.co.kr)';
const LIST = { golf: '/golf/02/', corporate: '/market/02/', condo: '/resort/02/', fitness: '/fitness/02/' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const strip = (t) => String(t || '').replace(/<span>[^<]*<\/span>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const num = (t) => { const m = String(t || '').replace(/,/g, '').match(/-?\d+/); return m ? Number(m[0]) : null; };
async function get(url) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' }, signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); } catch (e) { if (i === 2) throw e; await sleep(1500); } } }

// 목록 페이지(회원권 명 | 금일시세 | 전일시세 | 등락율 | 회원수) 전체 → [{ id, name(원래 표기), today, prev }]
function parseList(html) {
  const out = [];
  for (const tr of html.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const a = tr.match(/href="\/[a-z]+\/02_view\/(\d+)"[^>]*>([\s\S]*?)<\/a>/); if (!a) continue;
    const tds = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(strip);
    const name = strip(a[2]); const today = num(tds[1]); const prev = num(tds[2]);
    if (name && today > 0) out.push({ id: a[1], name, today, prev });
  }
  return out;
}
async function fetchList(cat) {
  const base = HM + LIST[cat]; const first = await get(base); const last = Number((first.match(/p=(\d+)\/"\s*>\s*맨끝|class="page last" href="[^"]*p=(\d+)\//) || []).slice(1).find(Boolean) || 1);
  const rows = parseList(first);
  for (let p = 2; p <= last; p++) { await sleep(250); rows.push(...parseList(await get(`${base}p=${p}/`))); }
  const seen = new Set(); return rows.filter(r => seen.has(r.name) ? false : (seen.add(r.name), true));
}

// 우리 법인 종목 이름 → 구 사이트 행 이름
function corporateSourceMap() {
  const m = new Map(); try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed', 'corporate-merge.json'), 'utf8'));
    for (const g of j.groups || []) m.set(g.keep, g.price);
    for (const n of j.singles || []) m.set(n.replace(/\s*\(법인\)\s*$/, '').trim(), n);
  } catch (_) { /* 표가 없으면 같은 이름만 */ }
  // 이후 이름 정정(price-corrections rename)을 거꾸로 따라간다
  try { for (const o of JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed', 'price-corrections.json'), 'utf8')).ops || []) if (o.op === 'rename' && o.category === 'corporate') m.set(o.to, m.get(o.from) || o.from); } catch (_) { /* 없음 */ }
  return m;
}

async function plan(cat) {
  const rows = await fetchList(cat); const byName = new Map(rows.map(r => [r.name, r]));
  const ours = db.prepare('SELECT name, region, today, prev FROM prices WHERE category=? AND COALESCE(manual_lock,0)=0').all(cat);
  let skip = new Set();
  if (cat === 'golf') { // 동아가 기준인 종목은 제외
    const donga = require('./donga'); try { const { rows: dr } = await donga.fetchRows('golf'); skip = new Set(donga.matchAll(ours, dr).matched.map(m => m.ours)); } catch (e) { return { cat, error: '동아 목록 실패(골프 건너뜀): ' + e.message, matched: [], unmatched: [] }; }
  }
  const src = cat === 'corporate' ? corporateSourceMap() : new Map();
  const matched = [], unmatched = [];
  for (const o of ours) {
    if (skip.has(o.name)) continue;
    const r = byName.get(src.get(o.name) || o.name) || (cat === 'corporate' ? byName.get(o.name + ' (법인)') : null);
    if (r) matched.push({ ours: o.name, theirs: r.name, today: r.today, cur: o.today, region: o.region }); else unmatched.push(o.name);
  }
  return { cat, fetched: rows.length, matched, unmatched };
}

async function sync({ cats = ['corporate', 'golf', 'condo', 'fitness'], dryRun = false } = {}) {
  const date = kstDate(); const res = [];
  for (const cat of cats) {
    const p = await plan(cat); if (p.error) { res.push(p); continue; }
    const changed = p.matched.filter(m => m.cur !== m.today);
    if (!dryRun) prices.upsertRows(p.matched.map(m => ({ category: cat, name: m.ours, region: m.region, today: m.today, prev: m.cur !== m.today ? m.cur : m.today })), date);
    res.push({ cat, fetched: p.fetched, matched: p.matched.length, changed: changed.length, unmatched: p.unmatched.length, sample: changed.slice(0, 5).map(m => `${m.ours} ${m.cur}→${m.today}`) });
  }
  if (!dryRun) { setSetting('hanamarket_last', JSON.stringify({ time: new Date().toISOString(), date, res })); setSetting('hanamarket_last_date', date); }
  return { date, res, dryRun };
}

function enabled() { return getSetting('hanamarket_sync', '1') !== '0'; }
// 동아(08:30·12:00·18:00) 뒤에 하루 한 번
async function maybeRun(date, hm) {
  if (!enabled() || hm < (getSetting('hanamarket_time', '') || '09:00')) return null;
  if (getSetting('hanamarket_last_date', '') === date) return null;
  try { const r = await sync(); console.log('[hanamarket]', date, r.res.map(x => `${x.cat} ${x.matched ?? 0}종목·변동 ${x.changed ?? 0}${x.error ? ' ' + x.error : ''}`).join(' / ')); return r; }
  catch (e) { setSetting('hanamarket_last', JSON.stringify({ time: new Date().toISOString(), date, ok: false, error: e.message })); setSetting('hanamarket_last_date', date); console.error('[hanamarket] 실패:', e.message); return null; }
}
function status() { try { return JSON.parse(getSetting('hanamarket_last', '') || 'null'); } catch (_) { return null; } }

module.exports = { parseList, fetchList, plan, sync, maybeRun, status, enabled, corporateSourceMap };
