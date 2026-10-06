'use strict';
// AI 검색·검색엔진 노출 전후 비교용 일일 캡처.
//   node scripts/ai-capture.js            → 측정/AI검색/<오늘>/ 에 엔진×질의 스크린샷 + result.json + 요약 md
//   node scripts/ai-capture.js --engines google,naver --queries "골프회원권,콘도회원권"
// 판정: 페이지 본문 텍스트에 우리 도메인(hanamember.co.kr) 또는 상호가 나오는지, 경쟁 거래소 상호가 나오는지 기록.
const fs = require('fs');
const path = require('path');
const shot = require('../lib/screenshot');
const { kstDate } = require('../lib/util');

const ROOT_OUT = path.join(__dirname, '..', '..', '측정', 'AI검색');
const SITE = 'hanamember.co.kr';
const BRAND = ['하나회원권거래소', '하나회원권'];
const COMPETITORS = ['동아회원권', '에이스회원권', '토탈골프', '회원권마켓', '프리미엄회원권', '신세계회원권', '동부회원권', '한솔회원권', '골프클럽119'];
const QUERIES = ['하나회원권거래소', '골프회원권', '무기명 골프회원권', '콘도회원권', '골프회원권 시세', '골프회원권 거래소 추천'];
const ENGINES = {
  google: { url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=ko&gl=kr`, wait: 4000, full: true },
  naver: { url: (q) => `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`, wait: 4000, full: true },
  bing: { url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=ko&cc=KR`, wait: 5000, full: true },
  naverai: { url: (q) => `https://search.naver.com/search.naver?ssc=tab.ait.all&query=${encodeURIComponent(q)}`, wait: 15000, full: true }, // 네이버 AI탭(로그인 불필요)
  perplexity: { url: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`, wait: 18000, full: true },
};

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const engines = arg('engines', Object.keys(ENGINES).join(',')).split(',').map(s => s.trim()).filter(e => ENGINES[e]);
const queries = arg('queries', QUERIES.join(',')).split(',').map(s => s.trim()).filter(Boolean);
const date = arg('date', kstDate());
const outDir = path.join(ROOT_OUT, date); fs.mkdirSync(outDir, { recursive: true });
const safe = (s) => s.replace(/[^\w가-힣]+/g, '_').replace(/^_|_$/g, '');

(async () => {
  if (!shot.available()) { console.error('크롬을 찾지 못했습니다.'); process.exit(1); }
  // 구글·Perplexity는 헤드리스를 봇으로 막으므로, 창을 띄운 실제 크롬 + 전용 프로필(쿠키 유지)로 연다
  const puppeteer = require('puppeteer-core');
  const profileDir = path.join(ROOT_OUT, '.chrome-profile'); fs.mkdirSync(profileDir, { recursive: true });
  // 이전 실행이 남긴 캡처용 크롬(같은 프로필)을 정리 — 남아 있으면 프로필 잠금 때문에 새 크롬이 뜨지 않는다
  if (process.platform === 'win32') { try { const { execSync } = require('child_process'); const cmd = "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*.chrome-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"; execSync('powershell -NoProfile -EncodedCommand ' + Buffer.from(cmd, 'utf16le').toString('base64'), { stdio: 'ignore', timeout: 20000 }); } catch (_) { /* no-op */ } }
  const browser = await puppeteer.launch({ executablePath: shot.findChrome(), headless: process.argv.includes('--headless') ? true : false, userDataDir: profileDir, defaultViewport: null,
    args: ['--disable-blink-features=AutomationControlled', '--window-size=1366,900', '--lang=ko-KR', '--no-first-run', '--no-default-browser-check', '--disable-infobars'], ignoreDefaultArgs: ['--enable-automation'] });
  const results = [];
  for (const q of queries) {
    for (const e of engines) {
      const E = ENGINES[e]; const page = await browser.newPage();
      const r = { date, engine: e, query: q, url: E.url(q), file: '', site: false, brand: false, competitors: [], blocked: false, aiBlock: false, error: '' };
      try {
        await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
        await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });
        if (results.length) await new Promise(res => setTimeout(res, 6000 + Math.random() * 6000)); // 요청 간격(봇 판정 완화)
        await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(res => setTimeout(res, E.wait));
        // 답변이 늦게 오는 엔진: 본문에 도메인/상호가 보일 때까지 조금 더 대기(최대 +12초)
        if (e === 'perplexity' || e === 'google') { for (let i = 0; i < 6; i++) { const t = await page.evaluate(() => document.body.innerText || ''); if (t.length > 800) break; await new Promise(res => setTimeout(res, 2000)); } }
        // 네이버 AI탭: 답변이 스트리밍되므로 본문 길이가 더 안 늘 때까지 스크롤하며 대기(최대 +30초)
        if (e === 'naverai') { let prev = -1; for (let i = 0; i < 10; i++) { const n = await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); return (document.body.innerText || '').length; }); if (n === prev && n > 800) break; prev = n; await new Promise(res => setTimeout(res, 3000)); } await page.evaluate(() => window.scrollTo(0, 0)); }
        // Perplexity: 쿠키 배너 닫기 + 긴 뷰포트로 답변 전체가 보이게
        if (e === 'perplexity') { try { const btn = await page.$$('button'); for (const b of btn) { const t = await page.evaluate(el => el.textContent.trim(), b); if (/필수 항목만|Reject|거부/.test(t)) { await b.click(); break; } } } catch (_) { /* no-op */ } await page.setViewport({ width: 1366, height: 2400, deviceScaleFactor: 1 }); await new Promise(res => setTimeout(res, 1500)); }
        const text = await page.evaluate(() => (document.body.innerText || '').slice(0, 200000));
        let blocked = /unusual traffic|비정상적인 트래픽|robot|보안 확인|verify you are human|Cloudflare/i.test(text) && text.length < 3000;
        if (blocked) { await new Promise(res => setTimeout(res, 20000)); await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await new Promise(res => setTimeout(res, E.wait)); }
        const text2 = blocked ? await page.evaluate(() => (document.body.innerText || '').slice(0, 200000)) : text;
        r.blocked = /unusual traffic|비정상적인 트래픽|robot|보안 확인|verify you are human|Cloudflare/i.test(text2) && text2.length < 3000;
        { const T = text2; r.site = T.includes(SITE); r.brand = BRAND.some(b => T.includes(b)); r.competitors = COMPETITORS.filter(c => T.includes(c)); r.aiBlock = /AI 개요|AI Overview|AI 브리핑|AI Tab|Copilot 답변|Answer|답변/.test(T.slice(0, 4000)); fs.writeFileSync(path.join(outDir, `${e}_${safe(q)}.txt`), T.slice(0, 20000), 'utf8'); }
        r.file = path.join(outDir, `${e}_${safe(q)}.png`);
        await page.screenshot({ path: r.file, fullPage: E.full, captureBeyondViewport: true }).catch(async () => { await page.screenshot({ path: r.file }); });
      } catch (err) { r.error = err.message.slice(0, 200); }
      finally { await page.close(); }
      results.push(r);
      console.log(`${e} | ${q} | 우리사이트 ${r.site ? 'O' : '-'} | 상호 ${r.brand ? 'O' : '-'} | 경쟁 ${r.competitors.join(',') || '-'}${r.blocked ? ' | 차단' : ''}${r.error ? ' | ERR ' + r.error : ''}`);
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 1), 'utf8');
  // 요약 md
  const lines = [`# AI 검색·검색 노출 캡처 — ${date}`, '', '| 질의 | 엔진 | 우리 사이트 | 상호 언급 | 경쟁 거래소 | 비고 |', '|---|---|---|---|---|---|'];
  for (const r of results) lines.push(`| ${r.query} | ${r.engine} | ${r.site ? '✅' : '—'} | ${r.brand ? '✅' : '—'} | ${r.competitors.join(', ') || '—'} | ${r.blocked ? '봇 차단 화면' : ''}${r.error ? '오류: ' + r.error : ''} |`);
  const hit = results.filter(r => !r.error && !r.blocked); const siteN = hit.filter(r => r.site).length, brandN = hit.filter(r => r.brand).length;
  lines.push('', `- 유효 캡처 ${hit.length}/${results.length} · 우리 사이트 노출 ${siteN} · 상호 언급 ${brandN}`, `- 스크린샷: \`측정/AI검색/${date}/\``);
  fs.writeFileSync(path.join(outDir, `요약_${date}.md`), lines.join('\n'), 'utf8');
  // 누적 로그(CSV) — 날짜별 추이
  const csv = path.join(ROOT_OUT, '추이.csv'); const head = 'date,engine,query,site,brand,competitors,blocked,error\n';
  if (!fs.existsSync(csv)) fs.writeFileSync(csv, '﻿' + head, 'utf8');
  fs.appendFileSync(csv, results.map(r => [r.date, r.engine, r.query, r.site ? 1 : 0, r.brand ? 1 : 0, r.competitors.join('|'), r.blocked ? 1 : 0, r.error.replace(/,/g, ' ')].join(',')).join('\n') + '\n', 'utf8');
  console.log(`완료: ${results.length}건 → ${outDir}`);
})().catch(e => { console.error(e); process.exit(1); });
