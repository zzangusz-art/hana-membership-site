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
// (남자)·(여자)는 다른 상품이라 지우지 않는다 — 지우면 '울산(여자)'가 '울산'과 같은 이름이 돼 남자 회원권에 여자 시세가 들어갔다(2026-10-23)
function norm(n) { return String(n || '').toLowerCase().replace(/\((?!(?:남자|여자|남|여)\))(?:[가-힣]{1,4})\)/g, '').replace(/[\s\-_.·]/g, '').replace(/컨트리클럽|골프클럽|cc$/g, ''); }
function base(n) { return norm(n).replace(/\(.*?\)/g, ''); }

// 자동 매칭이 안 되는 종목의 기본 매핑(2026-09-29 가격 대조로 확정). 관리자 수동 매핑이 우선한다.
const DEFAULT_MAP = { 'H1클럽': '에이치원(H1)-일반(舊.덕평)', '남촌55000': '남촌', '동래베네스트': '동래베네스트-남자', '동부산VIP': '동부산VIP(20000)', '드비치': '드비치(18000)', '발리오스': '발리오스-일반', '베이사이드(로얄)': '베이사이드-로얄(25000)', '베이사이드(프리미어)': '베이사이드-프리미어(24500)', '부곡': '부곡(3250)', '서울 여자': '서울(여자)', '오션힐스영천(25000-비지니스)': '오션힐스영천(25000)(비즈니스)', '울산 여자': '울산(여자)', '캐슬렉스 개인분담금': '캐슬렉스서울개인분담금', '캐슬렉스 일반': '캐슬렉스서울일반', '파미힐스': '파미힐스주주',
  // 2026-10-23 클라이언트 지적(김포씨사이드·골드 미갱신)으로 미연결 124종목 전수 점검 — 과거 기록이 동아 차트와 같은 값으로 움직인 것만 연결(scripts/donga-map-audit.js)
  '경주신라': '경주신라주주', '레이크우드 분담금': '레이크우드-프리빌리지', '가야': '가야일반', '골드레이크': '골드레이크일반', '김포씨사이드': '김포', '남부': '남부일반', '동부산': '동부산(12000)', '레이크우드': '레이크우드일반(구.로얄)', '마우나오션 우대': '마우나오션-VIP(9500)', '부산': '부산-남자', '블랙스톤-제주': '블랙스톤(제주)', '안성': '안성일반', '에덴밸리': '에덴밸리(14000)', '오션힐스영천(18000-로얄)': '오션힐스영천(18000)(로얄)', '창원': '창원남자', '골드 일반': '골드', '김포씨사이드여자': '김포여자', '지산': '지산일반', '설악플라자': '플라자설악(舊.설악프라자)', '에이원(16000)': '에이원-VIP(16000)', '가야 분담금': '가야우대', '용원': '용원남자', '오펠-프리미엄': '오펠-프리미엄(19000)', '해내다': '해내다(23000)', '캐슬렉스제주': '캐슬렉스제주일반', '울산': '울산(남자)', '프리스틴밸리 주중가족': '프리스틴주중가족(6500)', '프리스틴밸리 주중개인': '프리스틴주중개인(4000)' };
// 위 2026-10-23 연결분: 9/30 이후 멈춘 값으로 쌓인 자체 기록을 동아 기록으로 한 번 바로잡는다(lib/prices.js importHistory relinked)
// 정산은 우리에게 정산·정산(32000) 두 종목이 있어 정산(32000)은 동아 같은 이름, 정산은 구 사이트 기준(2026-10-23)
const RELINKED_20261023 = ["울산","경주신라","레이크우드 분담금","가야","골드레이크","김포씨사이드","남부","동부산","레이크우드","마우나오션 우대","부산","블랙스톤-제주","안성","에덴밸리","오션힐스영천(18000-로얄)","창원","골드 일반","김포씨사이드여자","지산","설악플라자","에이원(16000)","가야 분담금","용원","오펠-프리미엄","해내다","캐슬렉스제주","프리스틴밸리 주중가족","프리스틴밸리 주중개인"];
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
  // 동아 한 종목에 우리 종목 여러 개가 붙으면(예: 오션힐스포항 로얄·비지니스가 원창립 값으로) 하나만 남긴다 — 2026-10-23
  // 우선순위: 수동 > 완전 일치 > 괄호 제거 일치, 같으면 괄호 속 숫자가 동아 이름에 있는 쪽, 그다음 이름이 짧은 쪽. 수동 매핑은 일부러 정한 것이라 유지.
  const rank = { manual: 0, exact: 1, base: 2 }; const digits = (s) => (String(s).match(/\d{3,}/g) || []);
  const groups = new Map(); for (const m of matched) { if (!groups.has(m.theirs)) groups.set(m.theirs, []); groups.get(m.theirs).push(m); }
  const keep = new Set();
  for (const [theirs, g] of groups) {
    const score = (m) => [rank[m.how], digits(m.ours).some(d => theirs.includes(d)) ? 0 : 1, m.ours.length];
    g.sort((a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
    keep.add(g[0]); for (const m of g.slice(1)) if (m.how === 'manual') keep.add(m);
  }
  return { matched: matched.filter(m => keep.has(m)), unmatched: [...unmatched, ...matched.filter(m => !keep.has(m)).map(m => m.ours)] };
}

function enabled() { return getSetting('donga_sync', '1') !== '0'; }
function syncTime() { return (getSetting('donga_time', '') || '08:30').trim(); }

async function sync({ dryRun = false } = {}) {
  const category = 'golf';
  const { rows, srcDate, count } = await fetchRows(category);
  // 수기 관리(manual_lock=1) 종목은 자동 반영에서 제외
  const ours = db.prepare("SELECT name, region, today, prev FROM prices WHERE category=? AND COALESCE(manual_lock,0)=0").all(category);
  const locked = db.prepare("SELECT COUNT(*) c FROM prices WHERE category=? AND manual_lock=1").get(category).c;
  const all = matchAll(ours, rows);
  repairOutliers(ours, all.matched, dryRun);
  // 안전장치: 이름 앞부분만 같은(base) 매칭인데 값이 우리 시세와 60% 넘게 다르면 다른 상품(예: 용원 ↔ 용원(VVIP))으로 보고 반영하지 않는다
  const suspect = []; const matched = all.matched.filter(m => { const cur = ours.find(o => o.name === m.ours); const base = cur && (cur.today || cur.prev); if (m.how === 'base' && base && (m.today / base > 1.6 || m.today / base < 0.6)) { suspect.push(`${m.ours}→${m.theirs}(${m.today}/${base})`); return false; } return true; });
  const unmatched = [...all.unmatched, ...suspect.map(x => x.split('→')[0])];
  const date = kstDate();
  let changed = 0;
  if (!dryRun) {
    const upd = matched.map(m => { const cur = ours.find(o => o.name === m.ours); if (cur.today !== m.today) changed++; return { category, name: m.ours, region: cur.region, today: m.today, prev: cur.today !== m.today ? cur.today : (m.prev ?? cur.today) }; });
    // 값이 바뀐 종목만 전일시세를 갱신, 나머지는 이력만 찍는다
    prices.upsertRows(upd, date);
    setSetting('donga_last', JSON.stringify({ time: new Date().toISOString(), date, srcDate, fetched: count, matched: matched.length, unmatched: unmatched.length, changed, suspect, locked, ok: true }));
    setSetting('donga_last_date', date);
  }
  return { ok: true, date, srcDate, fetched: count, matched: matched.length, unmatched, suspect, changed, locked, sample: matched.slice(0, 5), dryRun };
}

// 이전에 안전장치 없이 들어간 잘못된 값 복구: base 매칭 종목의 금일시세가 전일의 5배 초과·1/5 미만이면 전일로 되돌리고 오늘 이력을 지운다
function repairOutliers(ours, matched, dryRun = false) {
  const bad = matched.filter(m => m.how === 'base').map(m => ours.find(o => o.name === m.ours)).filter(o => o && o.prev && (o.today / o.prev > 5 || o.today / o.prev < 0.2));
  for (const o of bad) {
    const row = db.prepare('SELECT id FROM prices WHERE category=? AND name=?').get('golf', o.name); if (!row) continue;
    if (!dryRun) db.prepare('UPDATE prices SET today=prev, updated_at=? WHERE id=?').run(now(), row.id);
    if (!dryRun) db.prepare('DELETE FROM price_history WHERE price_id=? AND value=? AND date>=?').run(row.id, o.today, kstDate(new Date(Date.now() - 7 * 86400000)));
    console.log(`[donga] 잘못된 값 복구: ${o.name} ${o.today} → ${o.prev}`); o.today = o.prev;
  }
}

// 스케줄러에서 매 분 호출: 지정 시각(기본 08:30)과 12:00·18:00에 하루 세 번 실행.
// 08:30에는 동아가 아직 당일 시세를 올리기 전이라 전일 값이 들어가는 날이 있어(2026-10-23 확인: 운영 금일=동아 전일) 낮·저녁에 다시 받아 당일 값으로 덮는다.
const SLOTS = () => [...new Set([syncTime(), '12:00', '18:00'])].sort();
async function maybeRun(date, hm) {
  if (!enabled()) return null;
  const done = getSetting('donga_last_date', '') === date ? (getSetting('donga_slots', '').startsWith(date + '|') ? getSetting('donga_slots', '').split('|')[1].split(',') : [syncTime()]) : [];
  const due = SLOTS().filter(s => hm >= s && !done.includes(s)); if (!due.length) return null;
  const mark = () => setSetting('donga_slots', `${date}|${[...new Set([...done, ...due])].join(',')}`);
  try { const r = await sync(); mark(); console.log(`[donga] ${date} ${due[due.length - 1]} 시세 동기화: ${r.matched}종목 반영, ${r.changed}건 변동, 미매핑 ${r.unmatched.length}`); return r; }
  catch (e) { mark(); setSetting('donga_last', JSON.stringify({ time: new Date().toISOString(), date, ok: false, error: e.message })); setSetting('donga_last_date', date); console.error('[donga] 실패:', e.message); return { ok: false, error: e.message }; }
}

function status() {
  let last = null; try { last = JSON.parse(getSetting('donga_last', '') || 'null'); } catch (_) { /* no-op */ }
  return { enabled: enabled(), time: syncTime(), source: SOURCES.golf, last, map: manualMap() };
}

module.exports = { parse, fetchRows, matchAll, sync, maybeRun, status, norm, SOURCES, enabled, syncTime, DEFAULT_MAP, RELINKED_20261023 };
