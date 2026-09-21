'use strict';
// 스크린샷 캡처 — puppeteer-core + 시스템 크롬/크로미움. 전(구 사이트)·후(신규 사이트) 비교 이미지를 리포트에 첨부한다.
// 크롬을 못 찾으면 available()=false → 리포트는 이미지 없이 생성되고 관리자에서 수동 업로드로 대체.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../db');
const { kstDate } = require('./util');

const CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
function isSnapStub(p) { try { const head = fs.readFileSync(p, { encoding: 'utf8', flag: 'r' }).slice(0, 400); return head.startsWith('#!') && /snap/i.test(head); } catch (_) { return false; } }
function whichChromium() { try { const out = require('child_process').execSync('command -v chromium || command -v chromium-browser || command -v google-chrome', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0]; return out || null; } catch (_) { return null; } }
let CACHED;
function findChrome() {
  if (CACHED !== undefined) return CACHED;
  const list = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH, process.platform !== 'win32' ? whichChromium() : null, ...CANDIDATES].filter(Boolean);
  for (const p of list) { try { if (fs.existsSync(p) && !isSnapStub(p)) { CACHED = p; return p; } } catch (_) { /* no-op */ } }
  CACHED = null; return null;
}
function available() { return !!findChrome(); }

const SHOT_DIR = path.join(DATA_DIR, 'screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

// 비교 대상 페이지: key → { before(구 사이트 경로), after(신규 경로), label }
const PAGES = [
  { key: 'home', label: '홈', before: '/', after: '/' },
  { key: 'market', label: '골프회원권 시세', before: '/market/01/', after: '/market/golf' },
  { key: 'golf', label: '골프장 안내', before: '/golf/01/', after: '/golf' },
  { key: 'about', label: '회사소개', before: '/company/01/', after: '/about' },
];

async function launch() {
  const puppeteer = require('puppeteer-core');
  return puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--lang=ko-KR', '--hide-scrollbars'] });
}

// 한 페이지 캡처: {url, file, width=1440, height=900, mobile=false, fullPage=false, cookies=[]}
async function capture(browser, { url, file, width = 1440, height = 900, mobile = false, fullPage = false, cookies = [], waitMs = 1200, jpeg = false }) {
  const page = await browser.newPage();
  try {
    if (mobile) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    else await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setUserAgent(mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 hana-shot' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 hana-shot');
    if (cookies.length) await page.setCookie(...cookies);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    // 스크롤 리빌 애니메이션을 모두 트리거한 뒤 상단으로
    if (fullPage) { await page.evaluate(async () => { const h = document.body.scrollHeight; for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); }); }
    await page.evaluate(() => { document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')); });
    await new Promise(r => setTimeout(r, waitMs));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (jpeg) await page.screenshot({ path: file, fullPage, type: 'jpeg', quality: 78 }); else await page.screenshot({ path: file, fullPage, type: 'png' });
    return file;
  } finally { await page.close(); }
}

// 세트 캡처: base URL 기준으로 PAGES를 desktop(뷰포트)·full·mobile로 저장. side='before'|'after'
// variants: desktop(1440x900 png) · full(전체 png) · mobile(390x844 png) · thumb(960x600 jpeg, 리포트 첨부용)
async function captureSet({ base, side, outDir, variants = ['desktop', 'full', 'mobile', 'thumb'], adminCookie = null, adminBase = null }) {
  const opts = (v) => v === 'mobile' ? { mobile: true } : v === 'full' ? { fullPage: true } : v === 'thumb' ? { width: 960, height: 600, jpeg: true } : {};
  if (!available()) throw new Error('크롬/크로미움을 찾지 못했습니다. PUPPETEER_EXECUTABLE_PATH를 설정하세요.');
  const browser = await launch(); const files = []; const errors = [];
  try {
    for (const p of PAGES) {
      const rel = p[side] || p.after; const url = base.replace(/\/$/, '') + rel;
      for (const v of variants) {
        const file = path.join(outDir, `${side}_${p.key}_${v}.${v === 'thumb' ? 'jpg' : 'png'}`);
        try { await capture(browser, { url, file, ...opts(v) }); files.push({ key: p.key, label: p.label, variant: v, side, file }); }
        catch (e) { errors.push(`${side} ${p.key} ${v}: ${e.message}`); }
      }
    }
    if (adminCookie && adminBase) {
      for (const [key, hash, label] of [['admin_dash', '', '관리자 대시보드'], ['admin_prices', '#prices', '시세 관리'], ['admin_plan', '#plan', '4주 실행계획'], ['admin_reports', '#reports', '리포트']]) {
        for (const v of variants.filter(x => x === 'desktop' || x === 'thumb')) {
          const file = path.join(outDir, `after_${key}_${v}.${v === 'thumb' ? 'jpg' : 'png'}`);
          try { await capture(browser, { url: adminBase.replace(/\/$/, '') + '/admin' + hash, file, cookies: [{ name: 'hana_admin', value: adminCookie, url: adminBase }], waitMs: 2200, ...opts(v) }); files.push({ key, label, variant: v, side: 'after', file }); }
          catch (e) { errors.push(`admin ${key} ${v}: ${e.message}`); }
        }
      }
    }
  } finally { await browser.close(); }
  return { files, errors };
}

// 리포트용: 최신 after 세트 + 기준 before 세트 찾기
function baselineDir() { const seedDir = path.join(__dirname, '..', 'data', 'seed', 'screenshots', 'before'); return fs.existsSync(seedDir) ? seedDir : null; }
function latestAfterDir() {
  if (!fs.existsSync(SHOT_DIR)) return null;
  const dirs = fs.readdirSync(SHOT_DIR).filter(d => /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
  return dirs.length ? path.join(SHOT_DIR, dirs[dirs.length - 1]) : null;
}
// 리포트용 전후 쌍(thumb jpeg 우선, 없으면 desktop png)
function pick(dir, name) { if (!dir) return null; for (const ext of ['thumb.jpg', 'desktop.png']) { const f = path.join(dir, `${name}_${ext}`); if (fs.existsSync(f)) return f; } return null; }
function pairs() {
  const b = baselineDir(), a = latestAfterDir(); const out = [];
  for (const p of PAGES) {
    const before = pick(b, `before_${p.key}`), after = pick(a, `after_${p.key}`);
    if (before || after) out.push({ key: p.key, label: p.label, before, after });
  }
  const admin = a ? [['admin_dash', '관리자 대시보드'], ['admin_prices', '시세 관리(엑셀 업로드)'], ['admin_plan', '4주 실행계획'], ['admin_reports', '리포트']].map(([k, label]) => ({ key: k, label, file: pick(a, `after_${k}`) })).filter(x => x.file) : [];
  return { pairs: out, admin, afterDir: a, beforeDir: b };
}
function dataUri(file) { try { const buf = fs.readFileSync(file); return `data:image/${file.endsWith('.jpg') ? 'jpeg' : 'png'};base64,${buf.toString('base64')}`; } catch (_) { return ''; } }
function listDirs() { if (!fs.existsSync(SHOT_DIR)) return []; return fs.readdirSync(SHOT_DIR).filter(d => /^\d{4}-\d{2}-\d{2}/.test(d)).sort().reverse().map(d => ({ date: d, files: fs.readdirSync(path.join(SHOT_DIR, d)).filter(f => /\.(png|jpg)$/.test(f)) })); }

// 주간 자동 캡처(스케줄러/관리자에서 호출): 신규 사이트를 SITE_URL 또는 로컬 포트로 캡처
async function weeklyCapture({ base, adminCookie = null }) {
  const outDir = path.join(SHOT_DIR, kstDate());
  return captureSet({ base, side: 'after', outDir, adminCookie, adminBase: base });
}

module.exports = { available, findChrome, capture, captureSet, launch, PAGES, SHOT_DIR, pairs, weeklyCapture, baselineDir, latestAfterDir, dataUri, listDirs };
