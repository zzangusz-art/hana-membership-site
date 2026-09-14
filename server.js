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
app.use(express.static(PUBLIC_DIR, { maxAge: '7d', index: false, setHeaders: (res, p) => { if (/\.html$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));

app.use(analytics.middleware);
app.get('/healthz', (req, res) => res.json({ ok: true, app: '하나회원권거래소', dataDir: DATA_DIR, prices: db.prepare('SELECT COUNT(*) c FROM prices').get().c, posts: db.prepare("SELECT COUNT(*) c FROM posts WHERE status='published'").get().c, time: new Date().toISOString() }));

// SEO 파일
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(seo.sitemap()));
app.get('/robots.txt', (req, res) => res.type('text/plain').send(seo.robots()));
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
