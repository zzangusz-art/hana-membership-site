'use strict';
// 유입 경로·전환 추적 — 방문(세션) 단위로 "어디서 왔는지 → 어떤 페이지를 봤는지 → 전화·카톡·문의까지 갔는지"를 기록한다.
//  - 채널: 검색(자연) / 광고 / AI 검색·챗봇 / 블로그·SNS·메신저 / 외부 사이트 / 캠페인 링크(UTM) / 직접 방문
//  - 1st-party 쿠키 2개(hsid: 세션 30분, hvid: 재방문 구분 1년). IP는 저장하지 않는다.
//  - 봇·관리자 로그인 상태·프리페치는 제외.
const crypto = require('crypto');
const { db } = require('../db');
const { kstDate, now } = require('./util');
const { classify } = require('./analytics');

const SID = 'hsid'; const VID = 'hvid';
const SESSION_TTL = 30 * 60; // 초
const ADMIN_COOKIE = 'hana_admin';

const CHANNELS = { organic: '검색(자연)', paid: '광고', ai: 'AI 검색·챗봇', social: '블로그·SNS·메신저', referral: '외부 사이트', campaign: '캠페인 링크', direct: '직접 방문' };
const CHANNEL_ORDER = ['organic', 'ai', 'social', 'paid', 'campaign', 'referral', 'direct'];

// [호스트 정규식, 표시 이름, 채널, 검색어 파라미터]
const HOSTS = [
  // AI 검색·챗봇 (검색 규칙보다 먼저)
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$|(^|\.)openai\.com$/, 'ChatGPT', 'ai'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity', 'ai'],
  [/^gemini\.google\.com$|^bard\.google\.com$|^aistudio\.google\.com$/, 'Gemini', 'ai'],
  [/^copilot\.microsoft\.com$|^copilot\.com$/, 'Copilot', 'ai'],
  [/(^|\.)claude\.ai$/, 'Claude', 'ai'],
  [/^clova-x\.naver\.com$|^cue\.search\.naver\.com$/, '네이버 AI(클로바X·Cue)', 'ai'],
  [/(^|\.)wrtn\.ai$/, '뤼튼', 'ai'],
  [/(^|\.)grok\.com$/, 'Grok', 'ai'], [/(^|\.)deepseek\.com$/, 'DeepSeek', 'ai'], [/(^|\.)you\.com$/, 'You.com', 'ai'],
  [/(^|\.)felo\.ai$/, 'Felo', 'ai'], [/(^|\.)genspark\.ai$/, 'Genspark', 'ai'], [/(^|\.)getliner\.com$|(^|\.)liner\.com$/, 'Liner', 'ai'],
  [/(^|\.)poe\.com$/, 'Poe', 'ai'], [/(^|\.)meta\.ai$/, 'Meta AI', 'ai'], [/(^|\.)phind\.com$/, 'Phind', 'ai'],
  // 네이버 서비스(검색 외)
  [/^(m\.)?blog\.naver\.com$/, '네이버 블로그', 'social'],
  [/^(m\.)?cafe\.naver\.com$/, '네이버 카페', 'social'],
  [/^(m\.)?kin\.naver\.com$/, '네이버 지식iN', 'social'],
  [/^(m\.)?(map|place)\.naver\.com$|^m\.place\.naver\.com$|^pcmap\.place\.naver\.com$|^naver\.me$/, '네이버 지도·플레이스', 'referral'],
  // 검색
  [/^(m\.)?search\.naver\.com$/, '네이버 검색', 'organic', 'query'],
  [/(^|\.)naver\.com$/, '네이버', 'organic', 'query'],
  [/(^|\.)google\.[a-z.]{2,6}$/, '구글 검색', 'organic', 'q'],
  [/(^|\.)bing\.com$/, 'Bing 검색', 'organic', 'q'],
  [/(^|\.)daum\.net$/, '다음 검색', 'organic', 'q'],
  [/(^|\.)zum\.com$/, '줌 검색', 'organic', 'query'],
  [/(^|\.)nate\.com$/, '네이트 검색', 'organic', 'q'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo', 'organic', 'q'],
  [/(^|\.)yahoo\.(com|co\.jp)$/, 'Yahoo', 'organic', 'p'],
  // SNS·메신저·블로그
  [/(^|\.)youtube\.com$|^youtu\.be$/, '유튜브', 'social'],
  [/(^|\.)instagram\.com$/, '인스타그램', 'social'],
  [/(^|\.)facebook\.com$|^fb\.me$/, '페이스북', 'social'],
  [/(^|\.)threads\.(net|com)$/, '스레드', 'social'],
  [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'X(트위터)', 'social'],
  [/(^|\.)kakao\.com$|(^|\.)kakaocorp\.com$/, '카카오톡·카카오 채널', 'social'],
  [/(^|\.)tistory\.com$/, '티스토리', 'social'],
  [/(^|\.)band\.us$/, '네이버 밴드', 'social'],
  [/(^|\.)inblog\.ai$/, '인블로그', 'social'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, '링크드인', 'social'],
  // 구 홈페이지
  [/(^|\.)hanamarket\.co\.kr$|(^|\.)hanamark\.co\.kr$/, '구 홈페이지(hanamarket)', 'referral'],
];
// utm_source 값 → 표시 이름(자주 쓰는 것만)
const UTM_NAMES = { naver: '네이버', naver_blog: '네이버 블로그', naverblog: '네이버 블로그', blog: '네이버 블로그', naver_cafe: '네이버 카페', naver_place: '네이버 플레이스', google: '구글', kakao: '카카오톡·카카오 채널', kakaotalk: '카카오톡·카카오 채널', kakao_channel: '카카오톡·카카오 채널', youtube: '유튜브', instagram: '인스타그램', facebook: '페이스북', sms: '문자', email: '이메일', inblog: '인블로그', offline: '오프라인(QR·명함)', qr: '오프라인(QR·명함)' };

const clip = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
function hostRule(host) { for (const r of HOSTS) if (r[0].test(host)) return r; return null; }
function parseRef(ref) { try { if (!ref) return null; const u = new URL(ref); if (!/^https?:$/.test(u.protocol)) return null; return u; } catch (_) { return null; } }

// 요청 1건에서 유입 출처를 판정. ownHosts: 자기 사이트로 볼 호스트 목록
function detect({ referer = '', query = {}, ua = '', ownHosts = [] } = {}) {
  const q = (k) => { const v = query[k]; return clip(Array.isArray(v) ? v[0] : v, 120); };
  const out = { channel: 'direct', source: '직접 방문', medium: '', campaign: '', term: '', content: '', keyword: '', ref_host: '', ref_url: '' };
  const u = parseRef(referer);
  let host = u ? u.hostname.toLowerCase().replace(/^www\./, '') : '';
  if (host && ownHosts.includes(host)) host = ''; // 사이트 안에서의 이동
  const rule = host ? hostRule(host) : null;
  if (host) { out.ref_host = clip(host, 80); out.ref_url = clip(u.origin + u.pathname, 200); }

  // 1) 리퍼러 기준
  if (host) {
    if (rule) { out.channel = rule[2]; out.source = rule[1]; if (rule[3]) out.keyword = clip(u.searchParams.get(rule[3]) || '', 80); }
    else { out.channel = 'referral'; out.source = host; }
  } else {
    // 리퍼러가 없는 인앱 브라우저
    if (/KAKAOTALK/i.test(ua)) { out.channel = 'social'; out.source = '카카오톡·카카오 채널'; out.medium = 'inapp'; }
    else if (/NAVER\(inapp/i.test(ua)) { out.channel = 'organic'; out.source = '네이버'; out.medium = 'inapp'; }
    else if (/Instagram/i.test(ua)) { out.channel = 'social'; out.source = '인스타그램'; out.medium = 'inapp'; }
    else if (/FBAN|FBAV|FB_IAB/i.test(ua)) { out.channel = 'social'; out.source = '페이스북'; out.medium = 'inapp'; }
  }
  // 2) 광고 클릭 식별자
  if (q('gclid') || q('gbraid') || q('wbraid')) { out.channel = 'paid'; out.source = '구글 광고'; out.medium = 'cpc'; }
  if (q('n_media') || q('n_query') || q('n_keyword') || q('n_ad')) { out.channel = 'paid'; out.source = '네이버 광고'; out.medium = 'cpc'; out.keyword = q('n_query') || q('n_keyword') || out.keyword; }
  if (q('fbclid') && out.channel === 'direct') { out.channel = 'social'; out.source = '페이스북'; }
  // 3) UTM(가장 우선)
  const us = q('utm_source').toLowerCase();
  if (us) {
    out.medium = q('utm_medium').toLowerCase(); out.campaign = q('utm_campaign'); out.term = q('utm_term'); out.content = q('utm_content');
    if (out.term && !out.keyword) out.keyword = out.term;
    const asHost = hostRule(us.replace(/^www\./, ''));
    if (asHost) { out.source = asHost[1]; out.channel = asHost[2]; } // 예: utm_source=chatgpt.com
    else out.source = UTM_NAMES[us] || us;
    const m = out.medium;
    if (/^(cpc|ppc|paid|ad|ads|da|display|banner|sa|powerlink|brandsearch)/.test(m)) out.channel = 'paid';
    else if (/^(social|sns|blog|cafe|community|messenger|kakao|video)/.test(m)) out.channel = 'social';
    else if (/^(organic|search)/.test(m)) out.channel = 'organic';
    else if (/^(ai|llm|chatbot)/.test(m)) out.channel = 'ai';
    else if (!asHost) out.channel = 'campaign';
  }
  return out;
}

function device(ua = '') { if (/iPad|Tablet/i.test(ua)) return 'tablet'; if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile'; return 'desktop'; }

const SKIP_PATH = /^\/(admin|api|healthz|og|css|js|img|fonts|favicon)/;
const SKIP_EXT = /\.(png|jpe?g|gif|webp|svg|ico|css|js|map|woff2?|xml|txt|json|webmanifest|pdf|docx?|xlsx?)$/i;

const st = {
  get: db.prepare('SELECT * FROM visits WHERE id=?'),
  ins: db.prepare(`INSERT INTO visits (id,vid,date,started_at,last_at,channel,source,medium,campaign,term,content,keyword,ref_host,ref_url,landing,last_path,device,revisit,pv) VALUES (@id,@vid,@date,@ts,@ts,@channel,@source,@medium,@campaign,@term,@content,@keyword,@ref_host,@ref_url,@landing,@landing,@device,@revisit,1)`),
  touch: db.prepare('UPDATE visits SET last_at=?, last_path=?, pv=pv+1 WHERE id=?'),
  ev: db.prepare('INSERT INTO visit_events (visit_id,ts,date,type,label,path) VALUES (?,?,?,?,?,?)'),
};

function ownHostsOf(req) {
  const hs = new Set(['localhost', '127.0.0.1']);
  try { hs.add(String(req.hostname || '').toLowerCase().replace(/^www\./, '')); } catch (_) { /* no-op */ }
  try { hs.add(new URL(require('./settings').siteUrl()).hostname.replace(/^www\./, '')); } catch (_) { /* no-op */ }
  return [...hs].filter(Boolean);
}
function cookieOpt(req, maxAgeSec) { return { httpOnly: true, sameSite: 'lax', path: '/', secure: req.secure || req.headers['x-forwarded-proto'] === 'https', maxAge: maxAgeSec * 1000 }; }

function middleware(req, res, next) {
  try {
    if (req.method !== 'GET') return next();
    const p = req.path;
    if (SKIP_PATH.test(p) || SKIP_EXT.test(p)) return next();
    const ua = String(req.headers['user-agent'] || '');
    if (!/^Mozilla\//.test(ua) || classify(ua).agent !== 'human') return next(); // 브라우저가 아닌 스크립트·모니터링 제외
    if (req.headers['sec-purpose'] || /prefetch|prerender|preview/i.test(String(req.headers.purpose || req.headers['x-purpose'] || ''))) return next();
    if (req.cookies && req.cookies[ADMIN_COOKIE]) return next(); // 관리자(내부) 방문 제외
    const d = detect({ referer: req.headers.referer || req.headers.referrer || '', query: req.query || {}, ua, ownHosts: ownHostsOf(req) });
    const ts = now();
    let sid = req.cookies && /^[a-f0-9]{24}$/.test(req.cookies[SID] || '') ? req.cookies[SID] : '';
    const sess = sid ? st.get.get(sid) : null;
    let isNew = !sess || ts - sess.last_at > SESSION_TTL;
    // 세션 도중 다른 출처로 다시 들어오면 새 방문으로 본다(같은 출처 재진입·리다이렉트는 이어붙임)
    if (!isNew && d.channel !== 'direct' && (d.source !== sess.source || (d.campaign || '') !== (sess.campaign || ''))) isNew = true;
    let vid = req.cookies && /^[a-f0-9]{24}$/.test(req.cookies[VID] || '') ? req.cookies[VID] : '';
    const revisit = vid ? 1 : 0;
    // 쿠키가 전혀 없는데 사이트 내부 이동이면(쿠키 차단 브라우저) 매 페이지가 새 방문으로 잡히므로 기록하지 않음
    const selfNav = !!parseRef(req.headers.referer || '') && !d.ref_host;
    if (isNew && selfNav && !vid) return next();
    if (isNew) sid = crypto.randomBytes(12).toString('hex');
    if (!vid) vid = crypto.randomBytes(12).toString('hex');
    res.cookie(SID, sid, cookieOpt(req, SESSION_TTL));
    res.cookie(VID, vid, cookieOpt(req, 365 * 86400));
    req.visitId = sid;
    const path = clip(p, 160);
    res.on('finish', () => {
      try {
        if (res.statusCode >= 300 && res.statusCode !== 304) return; // 리다이렉트·오류는 방문으로 세지 않음
        if (isNew) st.ins.run({ id: sid, vid, date: kstDate(), ts, ...d, landing: path, device: device(ua), revisit });
        else st.touch.run(ts, path, sid);
        st.ev.run(sid, ts, kstDate(), 'view', '', path);
      } catch (_) { /* 통계 실패는 서비스에 영향 없음 */ }
    });
  } catch (_) { /* no-op */ }
  next();
}

// 전환 이벤트: tel(전화 클릭) · kakao(카카오톡 문의 클릭) · inquiry(문의 접수) · outbound(외부 채널 클릭) · form(문의 폼 입력 시작)
const EVENT_TYPES = { tel: '전화 클릭', kakao: '카카오톡 문의 클릭', inquiry: '문의 접수', outbound: '외부 채널 클릭', form: '문의 폼 입력 시작', consult: '차트 상담 버튼 클릭' };
const bump = { tel: db.prepare('UPDATE visits SET tel=tel+1, last_at=? WHERE id=?'), kakao: db.prepare('UPDATE visits SET kakao=kakao+1, last_at=? WHERE id=?'), inquiry: db.prepare('UPDATE visits SET inq=inq+1, last_at=? WHERE id=?') };
function sessionOf(req) { const sid = req.cookies && req.cookies[SID]; if (!sid || !/^[a-f0-9]{24}$/.test(sid)) return null; return st.get.get(sid) || null; }
function track(req, type, label = '', path = '') {
  if (!EVENT_TYPES[type] || type === 'view') return false;
  const s = sessionOf(req); if (!s) return false;
  const ts = now();
  // 같은 방문에서 같은 이벤트가 3초 안에 반복되면 중복으로 본다(더블 클릭)
  const dup = db.prepare('SELECT ts FROM visit_events WHERE visit_id=? AND type=? AND label=? ORDER BY id DESC LIMIT 1').get(s.id, type, clip(label, 120));
  if (dup && ts - dup.ts < 3) return false;
  st.ev.run(s.id, ts, kstDate(), type, clip(label, 120), clip(path, 160));
  if (bump[type]) bump[type].run(ts, s.id);
  return true;
}
// 문의 접수 시 호출 — 문의 행에 붙일 유입 정보
function attribution(req) {
  const s = sessionOf(req); if (!s) return { session_id: '', src_channel: '', src_source: '', src_medium: '', src_campaign: '', src_keyword: '', src_landing: '' };
  return { session_id: s.id, src_channel: s.channel, src_source: s.source, src_medium: s.medium || '', src_campaign: s.campaign || '', src_keyword: s.keyword || '', src_landing: s.landing || '' };
}
function linkInquiry(req, inquiryId) { const s = sessionOf(req); if (!s) return; db.prepare('UPDATE visits SET inquiry_id=? WHERE id=?').run(inquiryId, s.id); track(req, 'inquiry', '#' + inquiryId, String(req.headers.referer || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 160)); }

// ── 집계 ──
const AGG = 'COUNT(*) sessions, COUNT(DISTINCT vid) visitors, SUM(pv) pv, SUM(CASE WHEN inq>0 THEN 1 ELSE 0 END) inq, SUM(CASE WHEN tel>0 THEN 1 ELSE 0 END) tel, SUM(CASE WHEN kakao>0 THEN 1 ELSE 0 END) kakao, SUM(CASE WHEN inq>0 OR tel>0 OR kakao>0 THEN 1 ELSE 0 END) conv';
function summary(from, to) {
  const W = 'WHERE date>=? AND date<=?'; const a = [from, to];
  const total = db.prepare(`SELECT ${AGG}, SUM(CASE WHEN revisit=0 THEN 1 ELSE 0 END) fresh, SUM(CASE WHEN pv<=1 THEN 1 ELSE 0 END) bounce, SUM(CASE WHEN device='mobile' THEN 1 ELSE 0 END) mobile FROM visits ${W}`).get(...a);
  const byChannel = db.prepare(`SELECT channel, ${AGG} FROM visits ${W} GROUP BY channel`).all(...a)
    .sort((x, y) => CHANNEL_ORDER.indexOf(x.channel) - CHANNEL_ORDER.indexOf(y.channel)).map(r => ({ ...r, label: CHANNELS[r.channel] || r.channel }));
  const bySource = db.prepare(`SELECT channel, source, ${AGG} FROM visits ${W} GROUP BY channel, source ORDER BY sessions DESC LIMIT 40`).all(...a).map(r => ({ ...r, label: CHANNELS[r.channel] || r.channel }));
  const keywords = db.prepare(`SELECT keyword, source, ${AGG} FROM visits ${W} AND keyword<>'' GROUP BY keyword, source ORDER BY sessions DESC LIMIT 40`).all(...a);
  const campaigns = db.prepare(`SELECT campaign, source, medium, ${AGG} FROM visits ${W} AND campaign<>'' GROUP BY campaign, source, medium ORDER BY sessions DESC LIMIT 30`).all(...a);
  const landings = db.prepare(`SELECT landing, ${AGG} FROM visits ${W} GROUP BY landing ORDER BY sessions DESC LIMIT 20`).all(...a);
  const refs = db.prepare(`SELECT ref_host, ${AGG} FROM visits ${W} AND ref_host<>'' GROUP BY ref_host ORDER BY sessions DESC LIMIT 30`).all(...a);
  const daily = db.prepare(`SELECT date, channel, COUNT(*) sessions FROM visits ${W} GROUP BY date, channel ORDER BY date`).all(...a);
  const events = db.prepare(`SELECT type, COUNT(*) c FROM visit_events ${W} AND type<>'view' GROUP BY type`).all(...a).reduce((o, r) => { o[r.type] = r.c; return o; }, {});
  const pages = db.prepare(`SELECT path, COUNT(*) c FROM visit_events ${W} AND type='view' GROUP BY path ORDER BY c DESC LIMIT 20`).all(...a);
  const convPages = db.prepare(`SELECT path, type, COUNT(*) c FROM visit_events ${W} AND type IN ('tel','kakao','inquiry') AND path<>'' GROUP BY path, type ORDER BY c DESC LIMIT 20`).all(...a);
  return { from, to, channels: CHANNELS, eventTypes: EVENT_TYPES, total, byChannel, bySource, keywords, campaigns, landings, refs, daily, events, pages, convPages };
}
function sessions({ from, to, channel = '', source = '', conv = '', keyword = '', campaign = '', landing = '', date = '', path = '', event = '', device = '', ref = '', limit = 200 }) {
  const w = ['v.date>=?', 'v.date<=?']; const a = [from, to];
  if (channel) { w.push('v.channel=?'); a.push(channel); }
  if (source) { w.push('v.source=?'); a.push(source); }
  if (keyword) { w.push('v.keyword=?'); a.push(keyword); }
  if (campaign) { w.push('v.campaign=?'); a.push(campaign); }
  if (landing) { w.push('v.landing=?'); a.push(landing); }
  if (ref) { w.push('v.ref_host=?'); a.push(ref); }
  if (date) { w.push('v.date=?'); a.push(date); }
  if (device) { w.push('v.device=?'); a.push(device); }
  if (conv === '1') w.push('(v.inq>0 OR v.tel>0 OR v.kakao>0)');
  else if (conv === 'inq') w.push('v.inq>0'); else if (conv === 'tel') w.push('v.tel>0'); else if (conv === 'kakao') w.push('v.kakao>0');
  // 특정 페이지를 열람한 방문 / 특정 페이지에서 특정 전환 행동을 한 방문
  if (path) { if (event && event !== 'view') { w.push('v.id IN (SELECT visit_id FROM visit_events WHERE path=? AND type=?)'); a.push(path, event); } else { w.push("v.id IN (SELECT visit_id FROM visit_events WHERE path=? AND type='view')"); a.push(path); } }
  else if (event && event !== 'view') { w.push('v.id IN (SELECT visit_id FROM visit_events WHERE type=?)'); a.push(event); }
  return db.prepare(`SELECT v.* FROM visits v WHERE ${w.join(' AND ')} ORDER BY v.started_at DESC LIMIT ?`).all(...a, Math.min(2000, Math.max(1, Number(limit) || 200))).map(r => ({ ...r, label: CHANNELS[r.channel] || r.channel }));
}
function trail(id) { const v = st.get.get(id); if (!v) return null; return { visit: { ...v, label: CHANNELS[v.channel] || v.channel }, events: db.prepare('SELECT ts,type,label,path FROM visit_events WHERE visit_id=? ORDER BY id').all(id) }; }
// 오래된 원시 기록 정리(기본 400일)
function prune(days = 400) { const cut = kstDate(new Date(Date.now() - days * 86400000)); const a = db.prepare('DELETE FROM visit_events WHERE date<?').run(cut).changes; const b = db.prepare('DELETE FROM visits WHERE date<?').run(cut).changes; return a + b; }

module.exports = { middleware, detect, device, track, attribution, linkInquiry, summary, sessions, trail, prune, CHANNELS, EVENT_TYPES, SID, VID };
