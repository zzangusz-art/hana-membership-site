'use strict';
// 동적 OG 썸네일 — 글·골프장 페이지 제목이 들어간 1200×630 이미지를 puppeteer로 렌더해 캐시.
// 크롬이 없으면 기본 og.png로 폴백.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, db } = require('../db');
const shot = require('./screenshot');
const { esc } = require('./util');

const OG_DIR = path.join(DATA_DIR, 'og');
fs.mkdirSync(OG_DIR, { recursive: true });
const FALLBACK = path.join(__dirname, '..', 'public', 'img', 'og.png');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'logo.png')).toString('base64');

// 테마별 사진(고객사 구 사이트 골프장 실사·히어로 사진). slug 해시로 고정 선택 → 글마다 다른 사진, 재생성해도 같은 사진
const THUMB_DIR = path.join(__dirname, '..', 'public', 'img', 'thumbs');
function themePhotos(theme) {
  try {
    if (theme === 'condo') return ['/img/hero/condo.jpg'];
    if (theme === 'fitness') return ['/img/hero/fitness.jpg'];
    return fs.readdirSync(THUMB_DIR).filter(f => /^golf-.*\.jpg$/.test(f)).sort().map(f => '/img/thumbs/' + f);
  } catch (_) { return []; }
}
function themeOf(text) { const t = String(text || ''); if (/콘도|리조트|공유제|소노|대명/.test(t)) return 'condo'; if (/피트니스|헬스|스포츠클럽/.test(t)) return 'fitness'; return 'golf'; }
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
function pickPhoto(slugOrText, theme) { const list = themePhotos(theme || themeOf(slugOrText)); return list.length ? list[hash(slugOrText) % list.length] : ''; }
function photoData(webPath) { try { const p = path.join(__dirname, '..', 'public', webPath.replace(/^\//, '')); const ext = path.extname(p).slice(1).replace('jpg', 'jpeg'); return `data:image/${ext};base64,` + fs.readFileSync(p).toString('base64'); } catch (_) { return ''; } }

// 사진 카드: 왼쪽 텍스트 패널 + 오른쪽 사진(사진이 없으면 기존 그라데이션 카드)
function htmlPhoto({ kicker, title, sub, badge, photo }) {
  const fz = title.length > 40 ? 40 : title.length > 28 ? 46 : 52;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;background:#152a55;color:#fff;position:relative}
  .photo{position:absolute;right:0;top:0;width:520px;height:630px;background:url('${photo}') center/cover no-repeat}
  .photo::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#152a55 0%,rgba(21,42,85,.55) 22%,rgba(21,42,85,0) 60%)}
  .panel{position:absolute;left:0;top:0;width:700px;height:630px;background:linear-gradient(120deg,#152a55 0%,#1f3a73 70%,#25488e 100%)}
  .grid{position:absolute;inset:0;width:700px;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:60px 60px}
  .card{position:absolute;left:64px;top:52px;background:#fff;border-radius:16px;padding:12px 20px}.card img{height:52px;display:block}
  .kicker{position:absolute;left:64px;top:170px;font-size:22px;font-weight:700;color:#b9e389;letter-spacing:.02em}
  .title{position:absolute;left:64px;width:600px;top:212px;font-size:${fz}px;font-weight:800;line-height:1.24;letter-spacing:-.02em;word-break:keep-all;text-shadow:0 4px 18px rgba(0,0,0,.3);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
  .sub{position:absolute;left:64px;width:600px;bottom:104px;font-size:22px;font-weight:500;color:#cfd9ec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .badge{position:absolute;right:40px;top:40px;background:rgba(21,42,85,.75);border:2px solid #7dc142;color:#d6f0bd;border-radius:999px;padding:8px 18px;font-size:20px;font-weight:700;backdrop-filter:blur(4px)}
  .bar{position:absolute;left:0;right:0;bottom:0;height:70px;background:#7dc142;color:#0f2a05;font-size:22px;font-weight:700;display:flex;align-items:center;padding-left:64px}
  </style></head><body><div class="panel"></div><span class="grid"></span><div class="photo"></div>
  <div class="card"><img src="${LOGO}" alt=""></div>${badge ? `<div class="badge">${esc(badge)}</div>` : ''}
  <div class="kicker">${esc(kicker)}</div><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  <div class="bar">하나회원권거래소 · hanamember.co.kr · 02-583-0583</div></body></html>`;
}

function html({ kicker, title, sub, badge }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;background:linear-gradient(120deg,#152a55 0%,#1f3a73 55%,#2c5aa8 100%);color:#fff;position:relative}
  .orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.55}.o1{width:520px;height:520px;background:#7dc142;right:-140px;top:-200px}.o2{width:420px;height:420px;background:#4b7bd6;left:-160px;bottom:-200px}
  .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:60px 60px}
  .card{position:absolute;left:72px;top:56px;background:#fff;border-radius:20px;padding:16px 26px}.card img{height:66px;display:block}
  .kicker{position:absolute;left:72px;top:190px;font-size:24px;font-weight:700;color:#b9e389;letter-spacing:.02em}
  .title{position:absolute;left:72px;right:72px;top:236px;font-size:${title.length > 34 ? 50 : 58}px;font-weight:800;line-height:1.22;letter-spacing:-.02em;word-break:keep-all;text-shadow:0 4px 20px rgba(0,0,0,.25);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .sub{position:absolute;left:72px;right:72px;bottom:110px;font-size:26px;font-weight:500;color:#dbe4f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .badge{position:absolute;right:72px;top:64px;background:rgba(125,193,66,.18);border:2px solid #7dc142;color:#d6f0bd;border-radius:999px;padding:10px 22px;font-size:22px;font-weight:700}
  .bar{position:absolute;left:0;right:0;bottom:0;height:78px;background:#7dc142;color:#0f2a05;font-size:24px;font-weight:700;display:flex;align-items:center;padding-left:72px}
  </style></head><body><span class="orb o1"></span><span class="orb o2"></span><span class="grid"></span>
  <div class="card"><img src="${LOGO}" alt=""></div>${badge ? `<div class="badge">${esc(badge)}</div>` : ''}
  <div class="kicker">${esc(kicker)}</div><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  <div class="bar">하나회원권거래소 · 2004년부터 · 24시간 상담 02-583-0583</div></body></html>`;
}

const inflight = new Map();
function fileFor(key, small) { return path.join(OG_DIR, key.replace(/[^\w.-]/g, '_') + (small ? '.jpg' : '.png')); }
function fresh(file, maxAgeSec) { try { const st = fs.statSync(file); return Date.now() - st.mtimeMs < maxAgeSec * 1000; } catch (_) { return false; } }
async function draw(browser, file, data, small) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: small ? 0.5 : 1 });
    const photo = data.photo ? photoData(data.photo) : '';
    await page.setContent(photo ? htmlPhoto({ ...data, photo }) : html(data), { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 300));
    if (small) await page.screenshot({ path: file, type: 'jpeg', quality: 82 }); else await page.screenshot({ path: file, type: 'png' });
  } finally { await page.close().catch(() => {}); }
}
// key: 캐시 파일명(안전 문자만). 반환: 파일 경로(생성 실패 시 FALLBACK)
async function render(key, data, { maxAgeSec = 7 * 86400, small = false } = {}) {
  const file = fileFor(key, small);
  if (fresh(file, maxAgeSec)) return file;
  if (!shot.available()) return FALLBACK;
  if (inflight.has(file)) return inflight.get(file);
  const p = (async () => {
    const browser = await shot.launch();
    try { await draw(browser, file, data, small); return file; }
    catch (e) { console.error('[og] 생성 실패', key, e.message); return FALLBACK; }
    finally { await browser.close(); inflight.delete(file); }
  })();
  inflight.set(file, p);
  return p;
}
// 사전 생성: 브라우저 1개로 여러 장 연속 렌더(목록 페이지 첫 로드 때 수십 장이 동시에 요청되는 것을 방지)
let warming = false;
async function warm(items, { maxAgeSec = 7 * 86400 } = {}) {
  if (warming || !shot.available()) return 0;
  const todo = items.filter(it => !fresh(fileFor(it.key, true), maxAgeSec));
  if (!todo.length) return 0;
  warming = true; let n = 0;
  try {
    const browser = await shot.launch();
    try { for (const it of todo) { try { await draw(browser, fileFor(it.key, true), it.data, true); n++; } catch (e) { console.error('[og] warm 실패', it.key, e.message); } } }
    finally { await browser.close(); }
  } catch (e) { console.error('[og] warm', e.message); }
  finally { warming = false; }
  if (n) console.log(`[og] 썸네일 사전 생성 ${n}장`);
  return n;
}
function invalidate(key) { for (const ext of ['.png', '.jpg']) { try { fs.unlinkSync(path.join(OG_DIR, key.replace(/[^\w.-]/g, '_') + ext)); } catch (_) { /* no-op */ } } }

function postOg(p) {
  let photo = '';
  if (p.type === 'club') { const cl = db.prepare("SELECT logo FROM clubs WHERE status='published' AND ? LIKE '%' || name || '%' AND logo<>'' LIMIT 1").get(p.title); photo = cl ? cl.logo : ''; }
  if (!photo) photo = pickPhoto(p.slug, themeOf(p.title + ' ' + (p.tags || '')));
  return { kicker: { club: '골프장 소개', report: '주간 시세 리포트', guide: '거래 가이드', trend: '시장 동향' }[p.type] || '시세 리포트·가이드', title: p.title, sub: (p.excerpt || '').slice(0, 70), badge: p.type === 'report' ? '시세 리포트' : '', photo };
}
// 발행 글 썸네일(목록용 jpg) 사전 생성 — 서버 시작 후·콘텐츠 생성 후 호출
function warmPosts() { const rows = db.prepare("SELECT slug, title, excerpt, type, tags FROM posts WHERE status='published' ORDER BY published_at DESC").all(); return warm(rows.map(p => ({ key: `v2-post-${p.slug}`, data: postOg(p) }))); }

module.exports = { render, warm, warmPosts, postOg, invalidate, FALLBACK, pickPhoto, themeOf };
