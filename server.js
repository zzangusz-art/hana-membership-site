'use strict';
// (주)하나회원권거래소 홈페이지 + 관리자 — 서버 엔트리
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { db, DATA_DIR } = require('./db');
const layout = require('./lib/layout');
const seo = require('./lib/seo');
const analytics = require('./lib/analytics');
const scheduler = require('./lib/scheduler');
const audit = require('./lib/audit');
const settings = require('./lib/settings');
const { seedIfEmpty } = require('./scripts/seed');
const { page } = layout;

seedIfEmpty();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.googletagmanager.com', 'https://www.youtube.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:'],
      imgSrc: ["'self'", 'data:', 'https://i.ytimg.com', 'https://www.google-analytics.com', 'https://*.googleusercontent.com'],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://www.google.com', 'https://maps.google.com'],
      connectSrc: ["'self'", 'https://www.google-analytics.com', 'https://region1.google-analytics.com'],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], upgradeInsecureRequests: null,
    },
  },
  crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// 정적 파일(캐시 도장)
const PUBLIC_DIR = path.join(__dirname, 'public');
const STAMP = (() => { try { return String(Math.max(...['css/site.css', 'js/site.js', 'admin/admin.js', 'admin/admin.css'].map(f => fs.statSync(path.join(PUBLIC_DIR, f)).mtimeMs))).slice(-8); } catch (_) { return String(Date.now()).slice(-8); } })();
layout.setStamp(STAMP);
// 구 도메인(hanamark.co.kr 등) 별칭 호스트로 들어오면 정식 도메인으로 301 (경로 유지 → 아래 REDIRECTS가 구 URL을 다시 매핑).
// Railway에 구 도메인을 커스텀 도메인으로 붙이고 DNS만 가리키면 호스팅 업체 리다이렉트 없이 동작. REDIRECT_HOSTS=호스트,호스트 로 변경 가능.
const REDIRECT_HOSTS = new Set(String(process.env.REDIRECT_HOSTS || 'hanamark.co.kr,www.hanamark.co.kr').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
app.use((req, res, next) => {
  try {
    const host = String(req.hostname || '').toLowerCase();
    if (REDIRECT_HOSTS.has(host) && host !== new URL(settings.siteUrl()).hostname) return res.redirect(301, settings.siteUrl() + req.originalUrl);
  } catch (_) { /* no-op */ }
  next();
});

app.use(express.static(PUBLIC_DIR, { maxAge: '7d', index: false, setHeaders: (res, p) => { if (/\.html$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));

// 임시 도메인(Railway *.up.railway.app 등)으로 접속되면 검색엔진 색인 금지 — 정식 도메인 연결 전 중복 색인 방지
app.use((req, res, next) => {
  try { const canon = new URL(settings.siteUrl()).hostname; const host = String(req.hostname || '').toLowerCase();
    if (host && host !== canon && host !== 'localhost' && host !== '127.0.0.1') res.setHeader('X-Robots-Tag', 'noindex, nofollow'); } catch (_) { /* no-op */ }
  next();
});
app.use((req, res, next) => { layout.setRequestOrigin(`${req.protocol}://${req.get('host')}`); next(); });
app.use(analytics.middleware);

// 동적 OG 썸네일: /og/post/<slug>.png · /og/club/<slug>.png · /og/page/<key>.png (7일 캐시, 크롬 없으면 기본 og.png)
const og = require('./lib/og');
const OG_PAGES = { 'market-golf': { kicker: '골프회원권 시세표 · 매주 갱신', title: '전국 골프회원권 시세 한눈에', sub: '금일·전일 시세, 등락률, 지역 필터, 90일 추이' }, 'market-condo': { kicker: '콘도회원권 시세표', title: '콘도·리조트 회원권 시세', sub: '공유제·회원제 조건과 함께 확인하세요' }, 'market-corporate': { kicker: '법인회원권 시세표', title: '법인 골프회원권 시세', sub: '등록 인원·무기명 조건 상담' }, 'market-fitness': { kicker: '피트니스회원권 시세표', title: '호텔 피트니스 회원권 시세', sub: '개인·부부 회원권' }, golf: { kicker: '골프장별 회원권 안내', title: '골프장마다 시세·입회 조건·적합한 매수자', sub: '수도권·영남·강원·충청·제주' }, faq: { kicker: 'FAQ', title: '회원권 거래, 이것이 궁금합니다', sub: '시세·수수료·명의개서·법인·세금' }, blog: { kicker: '시세 리포트 · 가이드', title: '매일 발행하는 회원권 시세 리포트와 거래 가이드', sub: '' }, apply: { kicker: '매매 신청', title: '회원권 매수·매도 상담, 당일 연락', sub: '24시간 전화 상담 02-583-0583' }, about: { kicker: '회사소개', title: '2004년부터 이어온 회원권 전문 거래소', sub: '서울 강남 압구정 · 분양 대행 28건' } };
app.get('/og/:kind/:slug.png', async (req, res) => {
  const { kind, slug } = req.params; let data = null;
  if (kind === 'post') { const p = db.prepare("SELECT title, excerpt, type FROM posts WHERE slug=? AND status='published'").get(slug); if (p) data = { kicker: { club: '골프장 소개', report: '주간 시세 리포트', guide: '거래 가이드', trend: '시장 동향' }[p.type] || '시세 리포트·가이드', title: p.title, sub: (p.excerpt || '').slice(0, 70), badge: p.type === 'report' ? '시세 리포트' : '' }; }
  else if (kind === 'club') { const c = db.prepare("SELECT name, region, address, price_name FROM clubs WHERE slug=? AND status='published'").get(slug); if (c) { const pr = c.price_name ? require('./lib/prices').byName('golf', c.price_name) : null; data = { kicker: `골프장 소개 · ${c.region || ''} ${c.address || ''}`.trim(), title: `${c.name} 회원권 시세·입회 조건·매수 가이드`, sub: pr ? `현재 시세 ${require('./lib/util').fmtMan(pr.today)} · 매주 갱신` : '', badge: pr ? require('./lib/util').fmtMan(pr.today) : '' }; } }
  else if (kind === 'page' && OG_PAGES[slug]) data = OG_PAGES[slug];
  if (!data) return res.status(404).end();
  const file = await og.render(`${kind}-${slug}`, data);
  res.set('Cache-Control', 'public, max-age=86400'); res.type('png').sendFile(file);
});
app.get('/healthz', (req, res) => res.json({ ok: true, app: '하나회원권거래소', version: require('./package.json').version, commit: (() => { try { return fs.readFileSync(path.join(__dirname, '.deploy-stamp'), 'utf8').trim().split(' ')[0]; } catch (_) { return (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || null; } })(), deployedAt: (() => { try { return fs.readFileSync(path.join(__dirname, '.deploy-stamp'), 'utf8').trim().split(' ')[1] || null; } catch (_) { return null; } })(), siteUrl: settings.siteUrl(), chrome: require('./lib/screenshot').available(), volume: !!process.env.DATA_DIR, dataDir: DATA_DIR, prices: db.prepare('SELECT COUNT(*) c FROM prices').get().c, posts: db.prepare("SELECT COUNT(*) c FROM posts WHERE status='published'").get().c, time: new Date().toISOString() }));

// SEO 파일
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(seo.sitemap()));
app.get('/robots.txt', (req, res) => res.type('text/plain').send(seo.robots()));
// 구글 서치콘솔 HTML 파일 확인(메타태그와 병행) — 파일명은 설정 google_verification_file
app.get(/^\/(google[a-f0-9]{16})\.html$/, (req, res, next) => { const f = settings.cfg('google_verification_file'); if (req.params[0] + '.html' !== f) return next(); res.type('text/html').send(`google-site-verification: ${f}`); });
// IndexNow 키 파일(네이버·Bing 소유 확인용)
const indexnow = require('./lib/indexnow');
app.get(/^\/([a-f0-9]{32})\.txt$/, (req, res, next) => { if (req.params[0] !== indexnow.key()) return next(); res.type('text/plain').send(indexnow.key()); });
app.get('/llms.txt', (req, res) => res.type('text/plain; charset=utf-8').send(seo.llms()));
app.get('/llms-full.txt', (req, res) => res.type('text/plain; charset=utf-8').send(seo.llmsFull()));
app.get('/rss.xml', (req, res) => res.type('application/rss+xml').send(seo.rss()));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'img', 'favicon.ico')));

// 구 사이트 URL → 새 URL 301 (검색 신호 승계)
const REDIRECTS = { '/market/01': '/market/golf', '/market/02': '/market/corporate', '/market/03': '/market/condo', '/market/04': '/market/fitness', '/membership/01': '/listings?category=golf', '/membership/02': '/listings?category=condo', '/membership/03': '/listings?category=fitness', '/membership/04': '/listings?category=sale', '/membership/05': '/listings?category=tour', '/building/01': '/exclusive/anonymous', '/building/02': '/exclusive/daemyung', '/building/03': '/exclusive/prepaid', '/golf/01': '/golf', '/golf/02': '/market/golf', '/resort/01': '/guide/condo', '/resort/02': '/market/condo', '/fitness/01': '/guide/fitness', '/fitness/02': '/market/fitness', '/application': '/apply', '/community/01': '/notice', '/community/02': '/news', '/community/03': '/faq', '/community/04': '/notice', '/company/01': '/about', '/company/02': '/about', '/company/03': '/about/location', '/company/04': '/about/careers' };
app.use((req, res, next) => { const p = req.path.replace(/\/$/, ''); if (REDIRECTS[p]) return res.redirect(301, REDIRECTS[p]); next(); });

// 공개 API
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false }));
app.use('/api', require('./routes/api').router);

// 관리자
app.use('/api/admin', rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes.router);
app.get(['/admin', '/admin/*'], (req, res) => { res.setHeader('X-Robots-Tag', 'noindex'); res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html')); });

// 공개 페이지
app.use(require('./routes/pages-main').router);
app.use(require('./routes/pages-info').router);
app.use(require('./routes/pages-content').router);

// 404
app.use((req, res) => {
  res.status(404).send(page({ title: '페이지를 찾을 수 없습니다', description: '요청하신 페이지가 없습니다.', path: req.path, noindex: true, body: `<section class="section"><div class="wrap narrow center"><h1>페이지를 찾을 수 없습니다</h1><p>주소가 바뀌었거나 삭제된 페이지입니다.</p><p><a class="btn btn-primary" href="/">홈으로</a> <a class="btn btn-ghost" href="/market/golf">시세표</a></p></div></section>` }));
});
// 오류
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => { console.error('[error]', err.message); res.status(500).send(page({ title: '오류', description: '일시적인 오류', path: req.path, noindex: true, body: '<section class="section"><div class="wrap narrow center"><h1>일시적인 오류가 발생했습니다</h1><p>잠시 후 다시 시도해 주세요.</p></div></section>' })); });

// 자체 감사용 내부 렌더러(외부 네트워크 없이 자기 페이지 GET)
const PORT = Number(process.env.PORT) || 3000;
function renderLocal(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { 'user-agent': 'hana-self-audit' } }, (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', c => b += c); r.on('end', () => resolve(b)); }).on('error', reject);
  });
}
const runAudit = () => audit.run(renderLocal, settings.siteUrl());
adminRoutes.setAuditRunner(runAudit);

app.listen(PORT, () => {
  console.log(`[server] 하나회원권거래소 http://localhost:${PORT} (DATA_DIR=${DATA_DIR}, SITE_URL=${settings.siteUrl()})`);
  if (process.env.DISABLE_SCHEDULER !== '1') setTimeout(() => scheduler.start({ audit: runAudit }), 3000);
});

module.exports = { app, renderLocal };
