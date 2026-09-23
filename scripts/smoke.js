'use strict';
// 런타임 스모크 테스트 — 서버를 임시 포트로 띄우고 주요 페이지·API·관리자 흐름을 실제 요청으로 검증
process.env.PORT = process.env.PORT || '3477';
process.env.DISABLE_SCHEDULER = '1';
process.env.DATA_DIR = process.env.DATA_DIR || require('path').join(__dirname, '..', 'data', 'smoke');
process.env.JWT_SECRET = 'smoke-secret';
require('fs').rmSync(process.env.DATA_DIR, { recursive: true, force: true });
require('../server');
const { db } = require('../db');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, msg, extra = '') => { console.log(`${c ? '✔' : '✘'} ${msg}${extra ? ' — ' + extra : ''}`); if (!c) fails++; };

(async () => {
  await sleep(800);
  const get = async (p, opt = {}) => { const r = await fetch(BASE + p, opt); return { status: r.status, text: await r.text(), headers: r.headers }; };
  // 공개 페이지
  const pages = ['/', '/market/golf', '/market/condo', '/market/corporate', '/market/fitness', '/golf', '/guide/golf', '/guide/condo', '/guide/fitness', '/guide/process', '/faq', '/exclusive/anonymous', '/listings', '/apply', '/blog', '/notice', '/news', '/videos', '/about', '/about/history', '/about/location', '/about/careers', '/privacy'];
  const titles = new Set(); const descs = new Set();
  for (const p of pages) {
    const r = await get(p);
    const t = (r.text.match(/<title>([^<]*)<\/title>/) || [])[1] || ''; const d = (r.text.match(/name="description" content="([^"]*)"/) || [])[1] || '';
    const canon = (r.text.match(/rel="canonical" href="([^"]*)"/) || [])[1] || '';
    const ld = (r.text.match(/application\/ld\+json/g) || []).length;
    ok(r.status === 200 && t.length > 10 && d.length > 50 && ld >= 2 && canon.endsWith(p === '/' ? '/' : p), `GET ${p}`, `title ${t.length}자 · desc ${d.length}자 · JSON-LD ${ld}`);
    titles.add(t); descs.add(d);
  }
  ok(titles.size === pages.length, 'title 전 페이지 고유', `${titles.size}/${pages.length}`);
  ok(descs.size === pages.length, 'description 전 페이지 고유', `${descs.size}/${pages.length}`);
  // 상세 페이지
  const club = db.prepare("SELECT slug FROM clubs WHERE status='published' LIMIT 1").get();
  let r = await get('/golf/' + encodeURIComponent(club.slug)); ok(r.status === 200 && r.text.includes('"GolfCourse"') && r.text.includes('"Product"'), 'GET /golf/:slug (GolfCourse·Product 스키마)');
  const post = db.prepare("SELECT slug FROM posts WHERE kind='blog' AND status='published' LIMIT 1").get();
  r = await get('/blog/' + post.slug); ok(r.status === 200 && r.text.includes('"Article"') && r.text.includes('"FAQPage"'), 'GET /blog/:slug (Article·FAQPage 스키마)');
  const lst = db.prepare("SELECT id FROM listings WHERE status='open' AND image<>'' LIMIT 1").get();
  if (lst) { r = await get('/listings/' + lst.id); ok(r.status === 200 && r.text.includes('"Product"') && r.text.includes('prd-fig'), 'GET /listings/:id (Product 스키마·이미지)'); }
  // SEO 파일
  r = await get('/sitemap.xml'); const locs = (r.text.match(/<loc>/g) || []).length; ok(r.status === 200 && locs >= 60, 'sitemap.xml', `${locs} URL`);
  r = await get('/robots.txt'); ok(r.text.includes('Sitemap:') && r.text.includes('GPTBot') && r.text.includes('Disallow: /admin'), 'robots.txt');
  r = await get('/llms.txt'); ok(r.text.startsWith('# (주)하나회원권거래소'), 'llms.txt');
  r = await get('/llms-full.txt'); ok(r.text.length > 5000, 'llms-full.txt', `${r.text.length}자`);
  r = await get('/rss.xml'); ok(r.text.includes('<rss') && r.text.includes('<item>'), 'rss.xml');
  const inx = require('../lib/indexnow'); r = await get('/' + inx.key() + '.txt'); ok(r.status === 200 && r.text.trim() === inx.key(), 'IndexNow 키 파일');
  ok((await inx.submit(['/'])).skipped === true, 'IndexNow: 임시 도메인에선 전송 안 함(skipped)');
  r = await get('/market/01'); ok(r.status === 200 || r.status === 301, '구 URL 리다이렉트 /market/01');
  r = await fetch(BASE + '/company/03', { redirect: 'manual' }); ok(r.status === 301 && r.headers.get('location') === '/about/location', '구 URL 301 /company/03 → /about/location');
  // fetch는 Host 헤더를 못 바꾸므로 http.request로 구 도메인 호스트를 흉내낸다
  r = await new Promise((resolve, reject) => { require('http').request({ host: '127.0.0.1', port: process.env.PORT, path: '/company/03?x=1', headers: { Host: 'www.hanamark.co.kr' } }, (res) => { res.resume(); resolve({ status: res.statusCode, location: res.headers.location || '' }); }).on('error', reject).end(); });
  ok(r.status === 301 && /^https:\/\/[^/]+\/company\/03\?x=1$/.test(r.location), '구 도메인 별칭 호스트 301 (경로·쿼리 유지)', r.location);
  r = await get('/no-such-page'); ok(r.status === 404 && r.text.includes('noindex'), '404 페이지 noindex');
  // 공개 API
  r = await get('/api/prices/golf'); const j = JSON.parse(r.text); ok(j.count > 50 && j.items[0].name, 'API /api/prices/golf', `${j.count}종목`);
  r = await get(`/api/prices/golf/${j.items[0].id}/history`); ok(JSON.parse(r.text).history.length >= 1, 'API 시세 이력');
  r = await fetch(BASE + '/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'buy', name: '테스트', phone: '010-1234-5678', agree: 1, item: '아시아나', category: 'golf' }) }); ok(r.status === 200 && (await r.json()).ok, 'POST /api/inquiry');
  r = await fetch(BASE + '/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }) }); ok(r.status === 400, 'POST /api/inquiry 검증(400)');
  // 관리자
  r = await fetch(BASE + '/api/admin/dashboard'); ok(r.status === 401, '관리자 미로그인 401');
  r = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', pw: 'hana1234!' }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0]; ok(r.status === 200 && cookie.startsWith('hana_admin='), '관리자 로그인');
  const A = (p, opt = {}) => fetch(BASE + '/api/admin' + p, { ...opt, headers: { 'Content-Type': 'application/json', cookie, ...(opt.headers || {}) } });
  r = await A('/dashboard'); const dash = await r.json(); ok(r.status === 200 && dash.prices.golf > 50 && dash.week >= 1, '관리자 대시보드', `${dash.week}주차 · 골프 ${dash.prices.golf}종목 · 문의 ${dash.inquiries.total}`);
  r = await A('/prices/template.xlsx'); const xbuf = Buffer.from(await r.arrayBuffer()); ok(r.status === 200 && xbuf.length > 5000, '시세 엑셀 양식 다운로드', `${xbuf.length} bytes`);
  // 엑셀 업로드(양식을 수정해 업로드)
  const XLSX = require('xlsx'); const wb = XLSX.read(xbuf, { type: 'buffer' }); const ws = wb.Sheets['골프회원권']; const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
  aoa[1][1] = Number(aoa[1][1]) + 1000; aoa.push(['스모크테스트CC', 12345, 12000, '', '수도권', '']);
  wb.Sheets['골프회원권'] = XLSX.utils.aoa_to_sheet(aoa); const up = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fd = new FormData(); fd.append('file', new Blob([up], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'test.xlsx');
  r = await fetch(BASE + '/api/admin/prices/upload', { method: 'POST', headers: { cookie }, body: fd }); const uj = await r.json(); ok(r.status === 200 && uj.inserted === 1 && uj.updated > 50, '시세 엑셀 업로드', `신규 ${uj.inserted} · 갱신 ${uj.updated}`);
  const smoke = db.prepare("SELECT * FROM prices WHERE name='스모크테스트CC'").get(); ok(smoke && smoke.today === 12345, '업로드 값 반영');
  // 템플릿 콘텐츠 생성(LLM 키 없이) — 시세 리포트 + 골프장 소개
  r = await A('/automation/generate', { method: 'POST', body: JSON.stringify({ type: 'report', template: true }) }); const g1 = await r.json(); ok(r.status === 200 && g1.post && g1.post.status === 'published', '주간 시세 리포트 템플릿 생성', g1.post?.title);
  r = await A('/automation/generate', { method: 'POST', body: JSON.stringify({ type: 'club', template: true }) }); const g2 = await r.json(); ok(r.status === 200 && g2.post, '골프장 소개 템플릿 생성', g2.post?.title);
  r = await get('/blog/' + g1.post.slug); ok(r.status === 200 && r.text.includes('상승률 상위'), '생성된 리포트 페이지 렌더');
  // 스케줄러 틱(멱등) — 슬롯 시각 이전이면 생성 0, 이후면 생성. 두 번 호출해도 중복 없음.
  const before = db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog'").get().c;
  const sch = require('../lib/scheduler'); await sch.tick(); const mid = db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog'").get().c; await sch.tick(); const after = db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog'").get().c;
  ok(after === mid && mid - before <= 2, '스케줄러 멱등(두 번 tick 해도 중복 생성 없음)', `+${mid - before}`);
  // 감사·리포트
  r = await A('/audit/run', { method: 'POST' }); const au = await r.json(); ok(r.status === 200 && au.score >= 80, '자체 기술 감사', `${au.score}점 · 미충족: ${au.items.filter(i => !i.ok).map(i => i.label).join(', ') || '없음'}`);
  r = await A('/reports/generate', { method: 'POST', body: JSON.stringify({ kind: 'baseline', week: 1, audit: false }) }); const rp = await r.json(); ok(r.status === 200 && rp.report && rp.report.docx_path, '베이스라인 리포트 생성(HTML+DOCX)', rp.report?.docx_path);
  r = await A(`/reports/${rp.report.id}/html`); ok(r.status === 200 && (await r.text()).includes('실행계획 체크'), '리포트 HTML');
  r = await A(`/reports/${rp.report.id}/docx`); ok(r.status === 200 && (await r.arrayBuffer()).byteLength > 3000, '리포트 DOCX 다운로드');
  r = await A('/plan'); const pl = await r.json(); ok(pl.weeks.length === 4 && pl.weeks[0].tasks.length >= 8, '4주 실행계획', `1주차 ${pl.weeks[0].tasks.length}항목`);
  r = await A('/inquiries'); ok((await r.json()).length >= 1, '문의 목록');
  r = await A('/settings', { method: 'POST', body: JSON.stringify({ inblog_url: 'https://blog.hanamarket.co.kr' }) }); ok(r.status === 200, '설정 저장');
  r = await get('/'); ok(r.text.includes('https://blog.hanamarket.co.kr'), '설정 반영(sameAs·푸터)');
  console.log(fails ? `\n실패 ${fails}건` : '\n모든 스모크 테스트 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('스모크 오류', e); process.exit(1); });
