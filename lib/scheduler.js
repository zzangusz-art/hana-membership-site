'use strict';
// 스케줄러(KST) — ① 매일 2슬롯 콘텐츠 자동 생성·발행(멱등) ② 매주 월요일 주간 리포트 ③ 매일 시세 스냅샷·기술 감사
const { db, getSetting } = require('../db');
const { now, kstParts, kstDate } = require('./util');
const { generateOne } = require('./content/generate');
const report = require('./report');
const shot = require('./screenshot');
const auth = require('./auth');

let timer = null; let auditRunner = null;

function slots() { return String(getSetting('gen_times', '09:00,15:00')).split(',').map(s => s.trim()).filter(Boolean); }
function alreadyRan(date, slot) { return !!db.prepare('SELECT 1 FROM gen_runs WHERE run_date=? AND slot=?').get(date, slot); }

async function runSlot(date, slot) {
  try { db.prepare('INSERT INTO gen_runs (run_date,slot,status,created_at) VALUES (?,?,?,?)').run(date, slot, 'running', now()); } catch (_) { return; }
  try {
    const { post, autoPublished, inblog, type } = await generateOne({ slot });
    if (autoPublished) setTimeout(() => require('./og').warmPosts().catch(e => console.error('[og] warm', e.message)), 2000);
    db.prepare('UPDATE gen_runs SET status=?, post_id=?, detail=? WHERE run_date=? AND slot=?').run('ok', post.id, `${type}/${autoPublished ? 'published' : 'draft'}/inblog:${inblog.ok ? 'ok' : inblog.skipped ? 'skip' : 'err'}`, date, slot);
    console.log(`[scheduler] ${date} ${slot} 생성 완료: "${post.title}"`);
  } catch (e) {
    if (e.skip) { db.prepare('UPDATE gen_runs SET status=?, detail=? WHERE run_date=? AND slot=?').run('skipped', String(e.message).slice(0, 200), date, slot); return; }
    // 같은 날 3회까지 재시도 허용: 실패 기록을 남기되 슬롯을 비워 다음 틱에서 재시도
    const fails = db.prepare("SELECT COUNT(*) c FROM gen_runs WHERE run_date=? AND slot LIKE ? AND status='failed'").get(date, slot + '#%').c;
    db.prepare('DELETE FROM gen_runs WHERE run_date=? AND slot=?').run(date, slot);
    if (fails < 3) db.prepare('INSERT INTO gen_runs (run_date,slot,status,detail,created_at) VALUES (?,?,?,?,?)').run(date, `${slot}#${fails + 1}`, 'failed', String(e.message).slice(0, 300), now());
    else db.prepare('INSERT INTO gen_runs (run_date,slot,status,detail,created_at) VALUES (?,?,?,?,?)').run(date, slot, 'failed', '3회 실패: ' + String(e.message).slice(0, 250), now());
    console.error(`[scheduler] ${date} ${slot} 생성 실패(${fails + 1}회): ${e.message}`);
  }
}

// 시세 일별 스냅샷(업로드 없는 날도 이력 유지 → 스파크라인 연속)
function snapshotPrices(date) {
  if (getSetting('snap_' + date)) return;
  db.prepare('INSERT OR IGNORE INTO price_history (price_id,date,value) SELECT id, ?, today FROM prices WHERE today IS NOT NULL').run(date);
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('snap_' + date, '1');
}

async function weeklyJobs(date, weekday) {
  // 매주 월요일 08:30 이후: 지난주 리포트 + 감사. 4주차 종료 후에는 월간 리포트도.
  if (weekday !== 'Mon') return;
  const key = 'weekly_done_' + date; if (getSetting(key)) return;
  const { hm } = kstParts(); if (hm < '08:30') return;
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, '1');
  try {
    if (auditRunner) await auditRunner();
    if (shot.available()) { try { const r = await shot.weeklyCapture({ base: `http://127.0.0.1:${process.env.PORT || 3000}`, adminCookie: auth.signInternal() }); console.log(`[scheduler] 주간 스크린샷 ${r.files.length}장`); } catch (e) { console.error('[scheduler] 스크린샷 실패', e.message); } }
    const cur = report.currentWeek(date);
    const prev = cur - 1;
    if (prev >= 1) { await report.generate(prev, 'weekly'); console.log(`[scheduler] ${prev}주차 주간 리포트 생성`); }
    if (prev === 4) { await report.generate(4, 'monthly'); console.log('[scheduler] 월간 종합 리포트 생성'); }
  } catch (e) { console.error('[scheduler] 주간 리포트 실패', e.message); }
}

async function dailyAudit(date) {
  const key = 'audit_done_' + date; if (getSetting(key) || !auditRunner) return;
  const { hm } = kstParts(); if (hm < '07:00') return;
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, '1');
  try { await auditRunner(); } catch (e) { console.error('[scheduler] 감사 실패', e.message); }
}

// 예약 발행: 발행 시각이 지난 scheduled 글을 발행하고 인블로그·IndexNow·썸네일 처리
async function publishScheduled(nowTs = now()) {
  const rows = db.prepare("SELECT * FROM posts WHERE status='scheduled' AND published_at<=? ORDER BY published_at").all(nowTs);
  const out = [];
  for (const p of rows) {
    db.prepare("UPDATE posts SET status='published', updated_at=? WHERE id=?").run(nowTs, p.id);
    const full = db.prepare('SELECT * FROM posts WHERE id=?').get(p.id);
    try { full.faq_json = JSON.stringify((JSON.parse(full.source_urls || '{}') || {}).faq || []); } catch (_) { full.faq_json = '[]'; }
    let ib = { skipped: true }; try { ib = await require('./content/generate').pushToInblog(full); } catch (e) { ib = { ok: false, error: e.message }; }
    try { await require('./indexnow').submit([`/blog/${full.slug}`, '/blog', '/']); } catch (_) { /* no-op */ }
    out.push({ id: p.id, slug: p.slug, inblog: ib });
    console.log(`[scheduler] 예약 발행: ${full.title}${ib.ok ? ' · 인블로그 전송' : ib.skipped ? '' : ' · 인블로그 오류 ' + ib.error}`);
  }
  if (out.length) setTimeout(() => require('./og').warmPosts().catch(() => {}), 2000);
  return out;
}

async function tick() {
  try { await publishScheduled(); } catch (e) { console.error('[scheduler] 예약 발행 오류', e.message); }
  const { date, hm, weekday } = kstParts();
  snapshotPrices(date);
  if (getSetting('auto_generate', '1') === '1') {
    for (const slot of slots()) if (hm >= slot && !alreadyRan(date, slot)) await runSlot(date, slot);
  }
  try { require('./naverblog').cached(1); } catch (_) { /* no-op */ }
  await dailyAudit(date);
  try { const { hm } = kstParts(); await require('./donga').maybeRun(date, hm); } catch (e) { console.error('[donga]', e.message); }
  await weeklyJobs(date, weekday);
}

function start({ audit } = {}) {
  auditRunner = audit || null;
  if (timer) return;
  tick().catch(e => console.error('[scheduler] tick 오류', e.message));
  timer = setInterval(() => tick().catch(e => console.error('[scheduler] tick 오류', e.message)), 60 * 1000);
  console.log(`[scheduler] 시작 — 콘텐츠 슬롯 ${slots().join(', ')} (KST), 주간 리포트 매주 월 08:30, 감사 매일 07:00, 동아 시세 동기화 매일 ${require('./donga').status().time}`);
}
function status() {
  const date = kstDate();
  return { slots: slots(), today: db.prepare('SELECT * FROM gen_runs WHERE run_date=? ORDER BY id').all(date), recent: db.prepare('SELECT * FROM gen_runs ORDER BY id DESC LIMIT 20').all(), autoGenerate: getSetting('auto_generate', '1') === '1', autoPublish: getSetting('auto_publish', '1') === '1', currentWeek: report.currentWeek() };
}

module.exports = { publishScheduled, start, tick, slots, status, runSlot };
