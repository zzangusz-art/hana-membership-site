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
  const pages = ['/', '/market/golf', '/market/condo', '/market/corporate', '/market/fitness', '/golf', '/guide/golf', '/guide/anonymous', '/guide/condo', '/guide/fitness', '/guide/process', '/faq', '/exclusive/anonymous', '/listings', '/apply', '/blog', '/notice', '/news', '/videos', '/about', '/about/history', '/about/location', '/about/careers', '/privacy'];
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
  r = await get('/blog/' + post.slug); ok(r.status === 200 && r.text.includes('"Article"') && r.text.includes('"FAQPage"') && r.text.includes('class="post-hero"'), 'GET /blog/:slug (Article·FAQPage 스키마·대표 이미지)');
  { const rr = await fetch(BASE + '/og/post/' + encodeURIComponent(post.slug) + '.jpg'); ok(rr.status === 200 && /image\/(jpeg|png)/.test(rr.headers.get('content-type') || ''), '글 썸네일 jpg 라우트', rr.headers.get('content-type') || ''); }
  const lst = db.prepare("SELECT id FROM listings WHERE status='open' AND image<>'' LIMIT 1").get();
  if (lst) { r = await get('/listings/' + lst.id); ok(r.status === 200 && r.text.includes('"Product"') && r.text.includes('prd-fig'), 'GET /listings/:id (Product 스키마·이미지)'); }
  // SEO 파일
  r = await get('/sitemap.xml'); const locs = (r.text.match(/<loc>/g) || []).length; ok(r.status === 200 && locs >= 60, 'sitemap.xml', `${locs} URL`);
  r = await get('/robots.txt'); ok(r.text.includes('Sitemap:') && r.text.includes('GPTBot') && r.text.includes('Disallow: /admin'), 'robots.txt');
  r = await get('/llms.txt'); ok(r.text.startsWith('# (주)하나회원권거래소'), 'llms.txt');
  r = await get('/llms-full.txt'); ok(r.text.length > 5000, 'llms-full.txt', `${r.text.length}자`);
  r = await get('/rss.xml'); ok(r.text.includes('<rss') && r.text.includes('<item>'), 'rss.xml');
  r = await get('/google4502547acc516217.html'); ok(r.status === 200 && r.text.includes('google-site-verification: google4502547acc516217.html'), '서치콘솔 HTML 파일 확인 경로');
  r = await get('/'); ok(r.text.includes('name="google-site-verification" content="cz8hCAIc0eJ0psUK0tNGnlRJtrPoVBT7aD1fFVuV_qo"'), '서치콘솔 메타태그 출력');
  ok(r.text.includes('name="naver-site-verification" content="52dbce83db0c7054e7ef1c8fc7454d5942c28ce2"'), '서치어드바이저 메타태그 출력');
  { const dg = require('../lib/donga'); const rows = dg.parse('<table><tr><th>회원권명</th><th>금일시세</th><th>전일시세</th><th>등락</th></tr><tr><td>88(팔팔)</td><td>43,000</td><td>43,000</td><td>0</td></tr><tr><td>가야우대</td><td>16,300</td><td>15,800</td><td>500</td></tr></table>'); const m = dg.matchAll([{ name: '88' }, { name: '가야 우대' }, { name: '없는종목' }], rows); ok(rows.length === 2 && rows[1].today === 16300 && m.matched.length === 2 && m.unmatched[0] === '없는종목', '동아 시세 파서·매핑', JSON.stringify(m.matched.map(x => x.ours + '→' + x.theirs))); }
  { const nb = require('../lib/naverblog'); const items = nb.parse('<rss><channel><item><title><![CDATA[테스트 글]]></title><link><![CDATA[https://blog.naver.com/skim12160/1?fromRss=true&trackingCode=rss]]></link><pubDate>Wed, 23 Sep 2026 17:37:12 +0900</pubDate><description><![CDATA[<p>본문 &amp; 설명</p>]]></description></item></channel></rss>'); ok(items.length === 1 && items[0].link === 'https://blog.naver.com/skim12160/1' && items[0].date === '2026-09-23' && items[0].desc === '본문 & 설명', '네이버 블로그 RSS 파서'); }
  const inx = require('../lib/indexnow'); r = await get('/' + inx.key() + '.txt'); ok(r.status === 200 && r.text.trim() === inx.key(), 'IndexNow 키 파일');
  ok((await inx.submit(['/'])).skipped === true, 'IndexNow: 임시 도메인에선 전송 안 함(skipped)');
  r = await get('/market/01'); ok(r.status === 200 || r.status === 301, '구 URL 리다이렉트 /market/01');
  { const oc = db.prepare("SELECT old_id, slug FROM clubs WHERE old_id IS NOT NULL AND old_id<>'' AND parent_id IS NULL LIMIT 1").get(); if (oc) { const rr = await fetch(BASE + '/golf/01_view/' + oc.old_id, { redirect: 'manual' }); ok(rr.status === 301 && decodeURIComponent(rr.headers.get('location') || '') === '/golf/' + oc.slug, '구 골프장 URL 301 → 상세'); } ok(db.prepare("SELECT COUNT(*) c FROM clubs WHERE status='published'").get().c >= 250, '골프장 이관 250+', String(db.prepare("SELECT COUNT(*) c FROM clubs").get().c)); }
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
  // 골프장 회원권 종류 통합 · 차트 기간
  { const cg = require('../lib/clubgroup'); ok(cg.baseKey('강남300 주중가족') === cg.baseKey('강남300') && cg.baseKey('부곡(3250)') === cg.baseKey('부곡컨트리클럽') && cg.baseKey('남촌55000') === '남촌' && cg.baseKey('센추리21(10000)') === '센추리21' && cg.baseKey('골드레이크 주중') !== cg.baseKey('골드 주주'), '골프장 이름 묶기 규칙');
    const par = db.prepare("SELECT * FROM clubs WHERE name='강남300'").get(); const kid = db.prepare("SELECT * FROM clubs WHERE name='강남300 주중가족'").get();
    ok(par && kid && !par.parent_id && kid.parent_id === par.id && kid.variant_label === '주중가족', '회원권 종류 통합(강남300)');
    let rr = await fetch(BASE + '/golf/' + encodeURIComponent(kid.slug), { redirect: 'manual' }); ok(rr.status === 301 && decodeURIComponent(rr.headers.get('location')) === `/golf/${par.slug}?type=주중가족`, '종류 주소 → 대표 골프장 301', rr.headers.get('location'));
    rr = await get(`/golf/${encodeURIComponent(par.slug)}?type=${encodeURIComponent('주중가족')}`); ok(rr.status === 200 && rr.text.includes('class="vr-tabs"') && rr.text.includes('강남300 주중개인') && /class="vr-tab active"[^>]*data-label="주중가족"/.test(rr.text), '대표 페이지 안에서 종류 선택');
    rr = await get('/golf'); const nPar = db.prepare("SELECT COUNT(*) c FROM clubs WHERE status='published' AND parent_id IS NULL").get().c; ok(rr.status === 200 && !rr.text.includes('/golf/' + encodeURIComponent(kid.slug) + '"') && rr.text.includes(`${nPar}개 골프장`) && nPar < 200, '골프장 목록은 대표만', `${nPar}곳`);
    rr = await get('/sitemap.xml'); ok(!rr.text.includes('/golf/' + encodeURIComponent(kid.slug) + '<'), '사이트맵에서 종류 주소 제외');
    const asi = db.prepare("SELECT * FROM clubs WHERE name='아시아나컨트리클럽'").get(); rr = await get('/golf/' + encodeURIComponent(asi.slug)); ok(rr.text.includes('class="pchart"') && rr.text.includes('AggregateOffer') && rr.text.includes('아시아나 주중개인'), '종류별 시세·차트·AggregateOffer');
    const pr = db.prepare("SELECT id FROM prices WHERE category='golf' AND name='88'").get(); rr = await get(`/api/prices/golf/${pr.id}/history?days=3650`); const hj = JSON.parse(rr.text); const r90 = JSON.parse((await get(`/api/prices/golf/${pr.id}/history?days=90`)).text);
    ok(hj.days === 3650 && hj.history.length > 30 && hj.history[0].date < '2018-01-01' && hj.since <= hj.history[0].date && r90.history.length < hj.history.length, '시세 이력 10년 조회', `${hj.history.length}점 · ${hj.history[0].date}~`);
    rr = await get('/'); ok(rr.text.includes('class="hd-yt"') && !/hd-links"><a[^>]*>유튜브</.test(rr.text), '헤더 유튜브 로고'); }
  // 동아 자동 반영 안전장치: 이름 앞부분만 같은 매칭이 60% 넘게 다르면 반영하지 않음
  { const dg = require('../lib/donga'); const m = dg.matchAll([{ name: '용원', today: 8700, prev: 8700 }], [{ name: '용원(VVIP)', today: 230000, prev: 230000 }]); ok(m.matched.length === 1 && m.matched[0].how === 'base', '동아 base 매칭 확인(용원→용원(VVIP))');
    const pr = db.prepare("SELECT id FROM prices WHERE category='golf' AND name='용원'").get(); if (pr) { db.prepare('UPDATE prices SET today=230000, prev=8700 WHERE id=?').run(pr.id); const r = await dg.sync({ dryRun: false }).catch(e => ({ error: e.message })); const v = db.prepare('SELECT today, prev FROM prices WHERE id=?').get(pr.id); ok(!r.error && v.today < 50000 && (r.suspect || []).some(x => x.startsWith('용원')), '동아 안전장치: 잘못된 값 복구·의심 매칭 제외', `today ${v.today} · suspect ${(r.suspect || []).join(',')}`); } }
  // 골프장 해설 자동 작성(사실 기반)
  { const empty = db.prepare("SELECT COUNT(*) c FROM clubs WHERE status='published' AND parent_id IS NULL AND (body_html IS NULL OR body_html='')").get().c; const rr = await get('/golf/' + encodeURIComponent('강남300'));
    ok(empty === 0 && rr.text.includes('강남300 회원권, 이런 분께 맞습니다') && !rr.text.includes('해설은 아직 쓰는 중') && rr.text.includes('회원과 비회원의 그린피 차이') && rr.text.includes('15만원 차이') && !/현재 회원권 시세는 \d/.test(rr.text), '골프장 해설 자동 작성(요금 차이·시세 숫자 미포함)', `빈 해설 ${empty}`); }
  // 구 사이트 시세 이관 · 종목 상세 · 메뉴
  { const nC = db.prepare("SELECT COUNT(*) c FROM prices WHERE category='condo'").get().c, nF = db.prepare("SELECT COUNT(*) c FROM prices WHERE category='fitness'").get().c, nG = db.prepare("SELECT COUNT(*) c FROM prices WHERE category='golf'").get().c, nCo = db.prepare("SELECT COUNT(*) c FROM prices WHERE category='corporate'").get().c;
    ok(nC >= 80 && nF >= 50 && nG >= 250 && nCo >= 300, '구 사이트 시세 전체 이관', `골프 ${nG} · 법인 ${nCo} · 콘도 ${nC} · 피트니스 ${nF}`);
    const cp = db.prepare("SELECT id FROM prices WHERE category='condo' AND name='오크밸리-25'").get(); let rr = await get('/market/condo'); ok(cp && rr.text.includes(`href="/market/condo/${cp.id}"`) && !rr.text.includes('href="#"'), '콘도 시세표 회원권명 링크');
    rr = await get(`/market/condo/${cp.id}`); ok(rr.status === 200 && rr.text.includes('오크밸리-25 회원권 시세') && rr.text.includes('시설 정보') && rr.text.includes('오크밸리 다른 회원권 종류') && rr.text.includes('class="pchart"'), '콘도 종목 상세(시설 정보·다른 종류·차트)');
    const fp = db.prepare("SELECT id FROM prices WHERE category='fitness' AND name='반트-부부'").get(); rr = await get(`/market/fitness/${fp.id}`); ok(rr.status === 200 && rr.text.includes('vantt.com'), '피트니스 종목 상세');
    const gp = db.prepare("SELECT id FROM prices WHERE category='golf' AND name='강남300 주중가족'").get(); rr = await get('/market/golf'); ok(gp && rr.text.includes(`?type=${encodeURIComponent('주중가족')}"`), '골프 시세표 회원권명 → 골프장 페이지 종류');
    const strayGolf = db.prepare("SELECT id FROM prices WHERE category='golf' AND name='토탈골프'").get(); if (strayGolf) { rr = await get(`/market/golf/${strayGolf.id}`); ok(rr.status === 200 && rr.text.includes('토탈골프 회원권 시세'), '골프장 페이지 없는 골프 종목 상세'); }
    rr = await get('/'); ok(rr.text.includes('>회원권 매물<') && rr.text.includes('>전용관<') && rr.text.includes('/listings?category=tour') && rr.text.includes('/exclusive/prepaid') && !rr.text.includes('매물·전용관'), '메뉴: 회원권 매물 / 전용관 분리'); }
  // 해외투어(외부 링크형) 매물
  { const rr = await get('/listings?category=tour'); const n = db.prepare("SELECT COUNT(*) c FROM listings WHERE category='tour' AND link LIKE 'https://blog.naver.com/%'").get().c; ok(rr.status === 200 && n >= 15 && rr.text.includes('일정 보기 ↗') && rr.text.includes('target="_blank"') && rr.text.includes('하나멤버쉽투어'), '해외투어 목록(블로그 링크)', `${n}건`); }
  // 골프장 회원권 세부 정보 · 개인/법인 정보
  { let rr = await get('/golf/' + encodeURIComponent('88컨트리클럽')); ok(rr.status === 200 && rr.text.includes('회원권 세부 정보') && rr.text.includes('1988년 7월 8일 골프장 개장') && rr.text.includes('개인 회원권 정보') && rr.text.includes('법인 회원권 정보') && rr.text.includes('법인인감증명서') && rr.text.includes('<th>시세 흐름</th>') && !rr.text.includes('<th>향후 전망</th>'), '골프장 세부 정보·개인/법인 탭(88CC)');
    rr = await get('/golf/' + encodeURIComponent('제주')); ok(rr.text.includes('필요 서류(일반 기준)') && !rr.text.includes('<th>코스 소개</th>'), '세부 정보 없는 골프장은 빈 항목 미표시·일반 기준 서류');
    const cd = require('../lib/clubdetail'); const j = cd.fromForm({ d_intro: '소개', dp_docs: 'a\nb', dc_target: '법인' }, ''); const pj = cd.parse(j); ok(pj.intro === '소개' && pj.personal.docs === 'a\nb' && pj.corporate.target === '법인' && pj._edited === true, '세부 정보 관리자 저장 형식'); }
  // 유입 경로·전환 추적
  { const inf = require('../lib/inflow'); const own = ['hanamember.co.kr'];
    const d1 = inf.detect({ referer: 'https://search.naver.com/search.naver?query=%EA%B3%A8%ED%94%84%ED%9A%8C%EC%9B%90%EA%B6%8C', ownHosts: own });
    const d2 = inf.detect({ referer: 'https://chatgpt.com/', ownHosts: own }); const d3 = inf.detect({ referer: 'https://hanamember.co.kr/golf', ownHosts: own });
    const d4 = inf.detect({ referer: 'https://m.blog.naver.com/skim12160/1', query: { utm_source: 'naver_blog', utm_medium: 'social', utm_campaign: 'oct' }, ownHosts: own });
    const d5 = inf.detect({ query: { n_media: '27758', n_query: '무기명 골프회원권' }, ownHosts: own }); const d6 = inf.detect({ ua: 'Mozilla/5.0 (Linux; Android 14) KAKAOTALK 11.0', ownHosts: own });
    ok(d1.channel === 'organic' && d1.source === '네이버 검색' && d1.keyword === '골프회원권' && d2.channel === 'ai' && d2.source === 'ChatGPT' && d3.channel === 'direct' && d4.channel === 'social' && d4.campaign === 'oct' && d5.channel === 'paid' && d5.keyword === '무기명 골프회원권' && d6.source.includes('카카오'), '유입 출처 판정(검색·AI·내부이동·UTM·광고·인앱)');
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
    let rr = await fetch(BASE + '/market/golf', { headers: { 'user-agent': UA, referer: 'https://search.naver.com/search.naver?query=%EA%B3%A8%ED%94%84%ED%9A%8C%EC%9B%90%EA%B6%8C%20%EC%8B%9C%EC%84%B8' } });
    const ck = (rr.headers.getSetCookie ? rr.headers.getSetCookie() : []).map(c => c.split(';')[0]).filter(c => /^hsid=|^hvid=/.test(c)).join('; ');
    ok(rr.status === 200 && /hsid=/.test(ck) && /hvid=/.test(ck), '방문 쿠키 발급');
    await rr.text(); await (await fetch(BASE + '/golf', { headers: { 'user-agent': UA, cookie: ck, referer: BASE + '/market/golf' } })).text();
    rr = await fetch(BASE + '/api/t', { method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': UA, cookie: ck }, body: JSON.stringify({ t: 'tel', l: '02-583-0583', p: '/golf' }) }); ok(rr.status === 204, '전환 이벤트 수집(전화 클릭)');
    rr = await fetch(BASE + '/api/t', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: ck }, body: JSON.stringify({ t: 'inquiry', l: 'x' }) });
    rr = await fetch(BASE + '/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': UA, cookie: ck, referer: BASE + '/apply' }, body: JSON.stringify({ kind: 'buy', name: '유입테스트', phone: '010-2222-3333', agree: 1, item: '기흥', category: 'golf' }) }); const ij = await rr.json();
    const { db: sdb } = require('../db'); const row = sdb.prepare('SELECT * FROM inquiries WHERE id=?').get(ij.id); const v = sdb.prepare('SELECT * FROM visits WHERE id=?').get(row.session_id);
    ok(row.src_source === '네이버 검색' && row.src_keyword === '골프회원권 시세' && row.src_landing === '/market/golf' && v && v.pv === 2 && v.tel === 1 && v.inq === 1 && v.inquiry_id === ij.id, '문의에 유입 정보 연결', `${row.src_source} · ${row.src_keyword} · pv ${v && v.pv}`);
    rr = await fetch(BASE + '/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } }); ok(!(rr.headers.getSetCookie ? rr.headers.getSetCookie() : []).some(c => /^hsid=/.test(c)), '봇은 방문으로 기록하지 않음');
  }
  // 관리자
  r = await fetch(BASE + '/api/admin/dashboard'); ok(r.status === 401, '관리자 미로그인 401');
  r = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', pw: 'hana1234!' }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0]; ok(r.status === 200 && cookie.startsWith('hana_admin='), '관리자 로그인');
  const A = (p, opt = {}) => fetch(BASE + '/api/admin' + p, { ...opt, headers: { 'Content-Type': 'application/json', cookie, ...(opt.headers || {}) } });
  r = await A('/dashboard'); const dash = await r.json(); ok(r.status === 200 && dash.prices.golf > 50 && dash.week >= 1, '관리자 대시보드', `${dash.week}주차 · 골프 ${dash.prices.golf}종목 · 문의 ${dash.inquiries.total}`);
  { const today = require('../lib/util').kstDate(); r = await A(`/inflow?from=${today}&to=${today}`); const inf = await r.json(); const org = inf.byChannel.find(c => c.channel === 'organic');
    ok(r.status === 200 && org && org.sessions >= 1 && org.inq >= 1 && org.tel >= 1 && org.conv === 1 && inf.total.conv === 1 && inf.events.tel >= 1 && inf.events.inquiry >= 1 && !inf.events.view && inf.keywords.some(k => k.keyword === '골프회원권 시세'), '관리자 유입 경로 집계', `검색 ${org && org.sessions}건 · 문의 ${inf.events.inquiry} · 전화 ${inf.events.tel}`);
    r = await A(`/inflow/sessions?from=${today}&to=${today}&conv=1`); const ls = await r.json(); ok(r.status === 200 && ls.length >= 1 && ls[0].source, '관리자 방문 목록(전환 필터)');
    r = await A('/inflow/session/' + ls[0].id); const tr = await r.json(); ok(r.status === 200 && tr.events.some(e => e.type === 'view') && tr.events.some(e => e.type === 'inquiry'), '방문 경로 상세');
    r = await A(`/inflow/export.csv?from=${today}&to=${today}`); const csv = await r.text(); ok(r.status === 200 && csv.includes('네이버 검색'), '방문 목록 CSV'); }
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
  r = await A('/settings', { method: 'POST', body: JSON.stringify({ inblog_url: 'https://blog.hanamember.co.kr' }) }); ok(r.status === 200, '설정 저장');
  r = await get('/'); ok(r.text.includes('https://blog.hanamember.co.kr'), '설정 반영(sameAs·푸터)');
  console.log(fails ? `\n실패 ${fails}건` : '\n모든 스모크 테스트 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('스모크 오류', e); process.exit(1); });
