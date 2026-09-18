'use strict';
// 동적 OG 썸네일 — 글·골프장 페이지 제목이 들어간 1200×630 이미지를 puppeteer로 렌더해 캐시.
// 크롬이 없으면 기본 og.png로 폴백.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../db');
const shot = require('./screenshot');
const { esc } = require('./util');

const OG_DIR = path.join(DATA_DIR, 'og');
fs.mkdirSync(OG_DIR, { recursive: true });
const FALLBACK = path.join(__dirname, '..', 'public', 'img', 'og.png');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'logo.png')).toString('base64');

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
// key: 캐시 파일명(안전 문자만). 반환: 파일 경로(생성 실패 시 FALLBACK)
async function render(key, data, { maxAgeSec = 7 * 86400 } = {}) {
  const file = path.join(OG_DIR, key.replace(/[^\w.-]/g, '_') + '.png');
  try { const st = fs.statSync(file); if (Date.now() - st.mtimeMs < maxAgeSec * 1000) return file; } catch (_) { /* 없음 */ }
  if (!shot.available()) return FALLBACK;
  if (inflight.has(file)) return inflight.get(file);
  const p = (async () => {
    const browser = await shot.launch();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
      await page.setContent(html(data), { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(r => setTimeout(r, 300));
      await page.screenshot({ path: file, type: 'png' });
      return file;
    } catch (e) { console.error('[og] 생성 실패', key, e.message); return FALLBACK; }
    finally { await browser.close(); inflight.delete(file); }
  })();
  inflight.set(file, p);
  return p;
}
function invalidate(key) { try { fs.unlinkSync(path.join(OG_DIR, key.replace(/[^\w.-]/g, '_') + '.png')); } catch (_) { /* no-op */ } }

module.exports = { render, invalidate, FALLBACK };
