'use strict';
// IndexNow — 새 글·변경 URL을 네이버(2023.7~ 지원)·Bing 등에 즉시 알린다. 구글은 미지원(서치콘솔 사이트맵으로).
// 키는 settings.indexnow_key 에 자동 생성·보관하고 /<key>.txt 로 노출한다(검색엔진이 소유 확인용으로 읽어 감).
// 임시 도메인(*.railway.app)·localhost 에서는 전송하지 않는다(noindex 페이지를 알릴 이유가 없음).
const crypto = require('crypto');
const { getSetting, setSetting } = require('../db');
const settings = require('./settings');

const ENDPOINT = 'https://api.indexnow.org/indexnow';

function key() {
  let k = getSetting('indexnow_key', '');
  if (!/^[a-f0-9]{32}$/.test(k)) { k = crypto.randomBytes(16).toString('hex'); setSetting('indexnow_key', k); }
  return k;
}
function host() { try { return new URL(settings.siteUrl()).hostname; } catch (_) { return ''; } }
// "정식 도메인이 실제로 이 앱(우리 키 파일)을 서빙하는가"를 직접 확인한 뒤에만 전송한다.
// 로컬·임시 도메인·아직 구 사이트가 붙어 있는 도메인에서는 자동으로 꺼진다. 결과는 1시간(실패는 10분) 캐시.
let LIVE = { ok: false, at: 0, detail: '미확인' };
async function checkLive(force = false) {
  const h = host(); const k = key();
  if (getSetting('indexnow_enabled', '1') === '0') { LIVE = { ok: false, at: Date.now(), detail: '설정에서 꺼짐' }; return LIVE; }
  if (!h || /localhost|127\.0\.0\.1|\.railway\.app$/.test(h)) { LIVE = { ok: false, at: Date.now(), detail: `임시 도메인(${h || '없음'})` }; return LIVE; }
  const ttl = LIVE.ok ? 3600e3 : 600e3;
  if (!force && Date.now() - LIVE.at < ttl) return LIVE;
  try {
    const r = await fetch(`${settings.siteUrl()}/${k}.txt`, { signal: AbortSignal.timeout(6000), redirect: 'follow' });
    const t = r.ok ? (await r.text()).trim() : '';
    LIVE = { ok: t === k, at: Date.now(), detail: t === k ? `정식 도메인 확인(${h})` : `${h}가 아직 이 사이트를 서빙하지 않음(HTTP ${r.status})` };
  } catch (e) { LIVE = { ok: false, at: Date.now(), detail: `확인 실패: ${e.message}` }; }
  return LIVE;
}
function enabled() { return LIVE.ok; }
function keyLocation() { return `${settings.siteUrl()}/${key()}.txt`; }

// paths: ['/blog/slug', ...] 또는 절대 URL. 최대 10,000개/요청(여기선 1,000개씩 나눔)
async function submit(paths, { force = false } = {}) {
  const list = [...new Set((paths || []).map(p => /^https?:/.test(p) ? p : settings.siteUrl() + p))];
  if (!list.length) return { ok: false, skipped: true, reason: 'empty' };
  const live = await checkLive();
  if (!live.ok && !force) { return { ok: false, skipped: true, reason: live.detail, count: list.length }; }
  const results = [];
  for (let i = 0; i < list.length; i += 1000) {
    const chunk = list.slice(i, i + 1000);
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: host(), key: key(), keyLocation: keyLocation(), urlList: chunk }) });
      results.push({ status: r.status, count: chunk.length });
    } catch (e) { results.push({ status: 0, count: chunk.length, error: e.message }); }
  }
  // 200 OK / 202 Accepted 가 정상. 403=키 불일치, 422=URL 호스트 불일치, 429=과다
  const ok = results.every(r => r.status === 200 || r.status === 202);
  const last = { time: new Date().toISOString(), count: list.length, status: results.map(r => r.status).join(','), ok, error: results.find(r => r.error)?.error || '' };
  setSetting('indexnow_last', JSON.stringify(last));
  return { ok, ...last, results };
}

// 사이트맵 전체 URL 제출(도메인 연결 직후 1회, 이후엔 발행 시 개별 제출)
async function submitAll(opts) { const seo = require('./seo'); return submit(seo.urls().map(u => u.loc), opts); }

async function status() {
  let last = null; try { last = JSON.parse(getSetting('indexnow_last', '') || 'null'); } catch (_) { /* no-op */ }
  const live = await checkLive();
  return { enabled: live.ok, liveDetail: live.detail, host: host(), key: key(), keyLocation: keyLocation(), last, engines: ['네이버(서치어드바이저)', 'Bing', 'Yandex 등 IndexNow 참여 엔진'], note: '구글은 IndexNow 미지원 — 서치콘솔 사이트맵 제출로' };
}

module.exports = { key, enabled, checkLive, submit, submitAll, status, keyLocation };
