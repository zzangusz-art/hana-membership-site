'use strict';
// 동아회원권거래소(dongagolf.co.kr) 골프회원권 시세 자동 반영.
// 매일 지정 시각(기본 08:30 KST)에 시세표를 읽어, 종목명이 매핑된 우리 시세(prices)에 금일시세로 반영하고 이력을 남긴다.
// - 엑셀 업로드(관리자)는 그대로 유효. 같은 날 엑셀이 나중에 올라오면 엑셀 값이 덮어쓴다.
// - 매핑: 자동(정규화 이름 일치) + 수동(settings.donga_map JSON: { "우리 종목명": "동아 종목명" }). 매핑 안 된 종목은 건드리지 않는다.
// - 출처는 관리자 화면에만 표시하고 공개 페이지에는 노출하지 않는다.
const { db, getSetting, setSetting } = require('../db');
const prices = require('./prices');
const { kstDate, now } = require('./util');

const SOURCES = { golf: 'https://www.dongagolf.co.kr/membership/golf' };
const UA = 'Mozilla/5.0 (compatible; hana-site price-sync; +https://hanamember.co.kr)';

function strip(t) { return String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function num(t) { const m = String(t || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Math.round(Number(m[0])) : null; }

// HTML → [{name, today, prev}] (회원권명 | 금일시세 | 전일시세 | 등락 ... 표만 사용)
function parse(html) {
  const out = [];
  for (const t of html.match(/<table[\s\S]*?<\/table>/g) || []) {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/g) || [];
    if (!rows.length) continue;
    const head = (rows[0].match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(strip);
    const iName = head.findIndex(h => /회원권명/.test(h)), iToday = head.findIndex(h => /금일/.test(h)), iPrev = head.findIndex(h => /전일/.test(h));
    if (iName < 0 || iToday < 0 || iPrev < 0) continue;
    for (const r of rows.slice(1)) {
      const cells = (r.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(strip);
      const name = cells[iName]; const today = num(cells[iToday]); const prev = num(cells[iPrev]);
      if (name && today !== null && today > 0) out.push({ name, today, prev });
    }
  }
  // 같은 이름이 여러 번 나오면 첫 값
  const seen = new Set(); return out.filter(r => (seen.has(r.name) ? false : (seen.add(r.name), true)));
}

async function fetchRows(category = 'golf') {
  const url = SOURCES[category]; if (!url) throw new Error('지원하지 않는 분류: ' + category);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text(); const rows = parse(html);
  const dateM = html.match(/id="nowdatestr">\s*(\d{4})\.(\d{2})\.(\d{2})/); const srcDate = dateM ? `${dateM[1]}-${dateM[2]}-${dateM[3]}` : null;
  return { rows, srcDate, count: rows.length };
}

// 이름 정규화: 공백·특수문자 제거, 한글 독음 괄호("(팔팔)") 제거, 영문 소문자
function norm(n) { return String(n || '').toLowerCase().replace(/\((?:[가-힣]{1,4})\)/g, '').replace(/[\s\-_.·]/g, '').replace(/컨트리클럽|골프클럽|cc$/g, ''); }
function base(n) { return norm(n).replace(/\(.*?\)/g, ''); }

// 자동 매칭이 안 되는 종목의 기본 매핑(2026-09-29 가격 대조로 확정). 관리자 수동 매핑이 우선한다.
const DEFAULT_MAP = { 'H1클럽': '에이치원(H1)-일반(舊.덕평)', '남촌55000': '남촌', '동래베네스트': '동래베네스트-남자', '동부산VIP': '동부산VIP(20000)', '드비치': '드비치(18000)', '발리오스': '발리오스-일반', '베이사이드(로얄)': '베이사이드-로얄(25000)', '베이사이드(프리미어)': '베이사이드-프리미어(24500)', '부곡': '부곡(3250)', '서울 여자': '서울(여자)', '오션힐스영천(25000-비지니스)': '오션힐스영천(25000)(비즈니스)', '울산 여자': '울산(여자)', '정산': '정산(32000)', '캐슬렉스 개인분담금': '캐슬렉스서울개인분담금', '캐슬렉스 일반': '캐슬렉스서울일반', '파미힐스': '파미힐스주주' };
function manualMap() { let m = {}; try { m = JSON.parse(getSetting('donga_map', '') || '{}'); } catch (_) { m = {}; } return { ...DEFAULT_MAP, ...m }; }
// 우리 종목 → 동아 종목 매칭. 수동 매핑 우선, 다음 정규화 완전 일치, 다음 괄호 제거 후 유일 일치.
function matchAll(ours, theirs) {
  const manual = manualMap(); const byNorm = new Map(); const byBase = new Map();
  for (const t of theirs) { byNorm.set(norm(t.name), t); const b = base(t.name); byBase.set(b, byBase.has(b) ? null : t); }
  const matched = [], unmatched = [];
  for (const o of ours) {
    let hit = null, how = '';
    if (manual[o.name]) { hit = theirs.find(t => t.name === manual[o.name]) || null; how = 'manual'; }
    if (!hit) { hit = byNorm.get(norm(o.name)) || null; how = 'exact'; }
    if (!hit) { const b = byBase.get(base(o.name)); if (b && base(o.name).length >= 2) { hit = b; how = 'base'; } }
    if (hit) matched.push({ ours: o.name, theirs: hit.name, today: hit.today, prev: hit.prev, how }); else unmatched.push(o.name);
  }
  return { matched, unmatched };
}

function enabled() { return getSetting('donga_sync', '1') !== '0'; }
function syncTime() { return (getSetting('donga_time', '') || '08:30').trim(); }

async function sync({ dryRun = false } = {}) {
  const category = 'golf';
  const { rows, srcDate, count } = await fetchRows(category);
  const ours = db.prepare("SELECT name, region, today FROM prices WHERE category=?").all(category);
  const { matched, unmatched } = matchAll(ours, rows);
  const date = kstDate();
  let changed = 0;
  if (!dryRun) {
    const upd = matched.map(m => { const cur = ours.find(o => o.name === m.ours); if (cur.today !== m.today) changed++; return { category, name: m.ours, region: cur.region, today: m.today, prev: cur.today !== m.today ? cur.today : (m.prev ?? cur.today) }; });
    // 값이 바뀐 종목만 전일시세를 갱신, 나머지는 이력만 찍는다
    prices.upsertRows(upd, date);
    setSetting('donga_last', JSON.stringify({ time: new Date().toISOString(), date, srcDate, fetched: count, matched: matched.length, unmatched: unmatched.length, changed, ok: true }));
    setSetting('donga_last_date', date);
  }
  return { ok: true, date, srcDate, fetched: count, matched: matched.length, unmatched, changed, sample: matched.slice(0, 5), dryRun };
}

// 스케줄러에서 매 분 호출: 켜져 있고, 시각이 지났고, 오늘 아직 안 했으면 실행
async function maybeRun(date, hm) {
  if (!enabled()) return null;
  if (hm < syncTime()) return null;
  if (getSetting('donga_last_date', '') === date) return null;
  try { const r = await sync(); console.log(`[donga] ${date} 시세 동기화: ${r.matched}종목 반영, ${r.changed}건 변동, 미매핑 ${r.unmatched.length}`); return r; }
  catch (e) { setSetting('donga_last', JSON.stringify({ time: new Date().toISOString(), date, ok: false, error: e.message })); setSetting('donga_last_date', date); console.error('[donga] 실패:', e.message); return { ok: false, error: e.message }; }
}

function status() {
  let last = null; try { last = JSON.parse(getSetting('donga_last', '') || 'null'); } catch (_) { /* no-op */ }
  return { enabled: enabled(), time: syncTime(), source: SOURCES.golf, last, map: manualMap() };
}

module.exports = { parse, fetchRows, matchAll, sync, maybeRun, status, norm, SOURCES };
