'use strict';
// 네이버 노출 정밀 점검 — 통합검색·웹문서 탭에서 새 도메인/구 도메인의 순위와 앞선 사이트를 질의별로 기록
// AI 캡처와 달리 '페이지 어딘가에 있나'가 아니라 '몇 번째인가'를 본다. 캡처 잠금과 무관(전용 프로필)
// 실행: node scripts/naver-audit.js [--queries "a,b"] → ../측정/네이버점검_<날짜>.json, 화면은 ../측정/스크린샷/<날짜>/naver_*.png
const fs = require('fs'); const path = require('path');
const puppeteer = require('puppeteer-core');
const shot = require('../lib/screenshot');
const { kstDate } = require('../lib/util');

const QUERIES = ['회원권거래소', '하나회원권거래소', '하나회원권', '골프회원권', '골프회원권 시세', '콘도회원권', '콘도회원권 시세', '피트니스회원권', '피트니스회원권 시세', '무기명 골프회원권', '골프회원권 거래소 추천', '콘도회원권 거래소 추천', '무기명 골프회원권 거래소', '법인 골프회원권'];
const SITE_QUERIES = ['site:hanamember.co.kr', 'site:hanamarket.co.kr'];
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : ''; };
const queries = arg('queries') ? arg('queries').split(',').map(s => s.trim()) : QUERIES;
const date = kstDate();
const ROOT = path.join(__dirname, '..', '..', '측정');
const shots = path.join(ROOT, '스크린샷', date); fs.mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 화면 위에서부터 외부 결과 링크를 순서대로(같은 호스트 연속은 1건, 네이버 내부 메뉴는 제외, 블로그·카페는 포함)
const collect = () => {
  const seen = []; const urls = [];
  for (const a of document.querySelectorAll('a[href^="http"]')) {
    let u; try { u = new URL(a.href); } catch (_) { continue; }
    const h = u.hostname.replace(/^www\./, '');
    const content = /^(m\.)?(blog|cafe|post|kin|in)\.naver\.com$/.test(h);
    if (/(^|\.)(naver\.com|naver\.net|pstatic\.net|nid\.naver\.com)$/.test(h) && !content) continue;
    const r = a.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (seen[seen.length - 1] === h) continue;
    seen.push(h); urls.push(u.href.slice(0, 120));
  }
  return { hosts: seen, urls, text: document.body.innerText.length, blocked: /비정상적인|자동입력|captcha/i.test(document.body.innerText.slice(0, 2000)) };
};
const rank = (hosts, d) => { const i = hosts.findIndex(h => h === d || h.endsWith('.' + d)); return i < 0 ? null : i + 1; };

(async () => {
  const browser = await puppeteer.launch({ executablePath: shot.findChrome(), headless: false, userDataDir: path.join(ROOT, '.naver-audit-profile'), defaultViewport: null, args: ['--window-size=1366,900', '--lang=ko-KR', '--no-first-run'] });
  const page = await browser.newPage(); const out = { date, queries: [], site: [] };
  const open = async (url) => { await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}); await sleep(2500); for (let y = 0; y < 30000; y += 700) { const h = await page.evaluate((v) => { window.scrollTo(0, v); return document.documentElement.scrollHeight; }, y); if (y > h) break; await sleep(180); } await sleep(800); await page.evaluate(() => window.scrollTo(0, 0)); return page.evaluate(collect); };
  for (const q of queries) {
    const all = await open('https://search.naver.com/search.naver?query=' + encodeURIComponent(q));
    if (all.blocked) { console.log('차단 화면 — 중단', q); out.blocked = q; break; }
    const safe = q.replace(/[^\w가-힣]+/g, '_'); await page.screenshot({ path: path.join(shots, `naver_${safe}.png`) }).catch(() => {});
    const web = await open('https://search.naver.com/search.naver?where=webkr&query=' + encodeURIComponent(q));
    const row = { q, all: { member: rank(all.hosts, 'hanamember.co.kr'), market: rank(all.hosts, 'hanamarket.co.kr'), n: all.hosts.length, top: all.hosts.slice(0, 12) }, web: { member: rank(web.hosts, 'hanamember.co.kr'), market: rank(web.hosts, 'hanamarket.co.kr'), n: web.hosts.length, top: web.hosts.slice(0, 12), memberUrl: web.urls.find(u => u.includes('hanamember.co.kr')) || '' } };
    out.queries.push(row);
    console.log(`${q} | 통합 새${row.all.member ?? '-'} 구${row.all.market ?? '-'} /${row.all.n} | 웹문서 새${row.web.member ?? '-'} 구${row.web.market ?? '-'} /${row.web.n}`);
    await sleep(2500);
  }
  if (!out.blocked) for (const q of SITE_QUERIES) {
    const web = await open('https://search.naver.com/search.naver?where=webkr&query=' + encodeURIComponent(q));
    const d = q.replace('site:', ''); const urls = web.urls.filter(u => u.includes(d));
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 600));
    out.site.push({ q, shown: urls.length, urls: urls.slice(0, 25), none: /검색결과가 없습니다/.test(txt) });
    console.log(q, '화면 표시', urls.length); await sleep(2000);
  }
  const file = path.join(ROOT, `네이버점검_${date}.json`); fs.writeFileSync(file, JSON.stringify(out, null, 1), 'utf8'); console.log('저장', file);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
