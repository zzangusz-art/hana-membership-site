'use strict';
// 관리자 API — 로그인 · 대시보드 · 시세(엑셀) · 골프장 · 매물 · 콘텐츠 · 자동발행 · 문의 · 리포트 · 계획 · 설정
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR, getSetting, setSetting } = require('../db');
const auth = require('../lib/auth');
const prices = require('../lib/prices');
const { now, kstDate, koSlug, slugify, sanitizeHtml, truncate, stripHtml } = require('../lib/util');
const settings = require('../lib/settings');
const providers = require('../lib/providers');
const inblog = require('../lib/inblog');
const { generateOne, pushToInblog, TYPE_LABEL } = require('../lib/content/generate');
const templates = require('../lib/content/templates');
const scheduler = require('../lib/scheduler');
const report = require('../lib/report');
const audit = require('../lib/audit');
const analytics = require('../lib/analytics');
const shot = require('../lib/screenshot');
const og = require('../lib/og');
const indexnow = require('../lib/indexnow');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
let auditRunner = null; function setAuditRunner(fn) { auditRunner = fn; }

// ── 인증 ──
router.post('/login', (req, res) => {
  const token = auth.login(req.body?.id, req.body?.pw);
  if (!token) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  res.cookie(auth.COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure || req.headers['x-forwarded-proto'] === 'https', maxAge: 12 * 3600 * 1000 });
  res.json({ ok: true });
});
router.post('/logout', (req, res) => { res.clearCookie(auth.COOKIE); res.json({ ok: true }); });
router.use(auth.requireAdmin);
router.get('/me', (req, res) => res.json({ admin: req.admin }));
router.post('/password', (req, res) => { const pw = String(req.body?.pw || ''); if (pw.length < 8) return res.status(400).json({ error: '8자 이상' }); auth.changePw(req.admin.id, pw); res.json({ ok: true }); });

// ── 대시보드 ──
router.get('/dashboard', (req, res) => {
  const q = (sql, ...a) => db.prepare(sql).get(...a);
  const today = kstDate(); const wk = report.currentWeek();
  const g = prices.stats('golf');
  res.json({
    today, week: wk, kickoff: report.kickoff(), range: report.weekRange(wk),
    inquiries: { new: q("SELECT COUNT(*) c FROM inquiries WHERE status='new'").c, total: q('SELECT COUNT(*) c FROM inquiries').c, today: q('SELECT COUNT(*) c FROM inquiries WHERE created_at>=?', Math.floor(new Date(today + 'T00:00:00+09:00') / 1000)).c },
    posts: { published: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published'").c, drafts: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='draft'").c, inblog: q("SELECT COUNT(*) c FROM posts WHERE inblog_status='published'").c, inblogErr: q("SELECT COUNT(*) c FROM posts WHERE inblog_status='error'").c, today: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND created_at>=?", Math.floor(new Date(today + 'T00:00:00+09:00') / 1000)).c },
    clubs: { total: q("SELECT COUNT(*) c FROM clubs").c, withBody: q("SELECT COUNT(*) c FROM clubs WHERE body_html IS NOT NULL AND body_html<>''").c, verified: q('SELECT COUNT(*) c FROM clubs WHERE verified=1').c },
    prices: { golf: g.total, lastUpdated: g.lastUpdated, uploads: q('SELECT COUNT(*) c FROM price_uploads').c },
    scheduler: scheduler.status(), llm: { available: providers.llmAvailable(), ...providers.getLlmConfig(), apiKey: undefined }, inblog: { enabled: inblog.enabled(), push: getSetting('inblog_push', '1') === '1', url: settings.cfg('inblog_url') },
    audit: audit.latest() ? { score: audit.latest().score, date: audit.latest().date } : null,
    traffic: analytics.summary(report.weekRange(wk).start, today),
    plan: db.prepare('SELECT week, COUNT(*) n, SUM(done) d FROM plan_tasks GROUP BY week ORDER BY week').all(),
    reports: db.prepare('SELECT id, week, kind, title, created_at FROM reports ORDER BY created_at DESC LIMIT 5').all(),
  });
});

// ── 시세 ──
router.get('/prices', (req, res) => { const cat = prices.CATS[req.query.category] ? req.query.category : 'golf'; res.json({ category: cat, rows: prices.list(cat), uploads: db.prepare('SELECT * FROM price_uploads ORDER BY id DESC LIMIT 20').all() }); });
router.get('/prices/template.xlsx', (req, res) => { res.setHeader('Content-Disposition', 'attachment; filename="hana-price-template.xlsx"'); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(prices.buildTemplate()); });
router.post('/prices/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  const { rows, errors } = prices.parseWorkbook(req.file.buffer, req.body?.category || 'golf');
  if (!rows.length) return res.status(400).json({ error: '읽을 수 있는 시세 행이 없습니다. 양식(회원권명·금일시세 열)을 확인하세요.', errors });
  if (req.body?.dry === '1') return res.json({ preview: rows.slice(0, 50), count: rows.length, errors });
  const r = prices.upsertRows(rows);
  const fname = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 120);
  db.prepare('INSERT INTO price_uploads (filename,rows,inserted,updated,by_admin,created_at,detail) VALUES (?,?,?,?,?,?,?)').run(fname, rows.length, r.inserted, r.updated, req.admin.login_id, now(), JSON.stringify(errors.slice(0, 20)));
  try { fs.writeFileSync(path.join(DATA_DIR, 'uploads', `${kstDate()}-${Date.now()}-${fname.replace(/[^\w.가-힣-]/g, '_')}`), req.file.buffer); } catch (_) { /* no-op */ }
  res.json({ ok: true, ...r, count: rows.length, errors });
});
router.post('/prices', (req, res) => { const b = req.body || {}; if (!b.name || !prices.CATS[b.category]) return res.status(400).json({ error: '입력 확인' }); const r = prices.upsertRows([{ category: b.category, name: String(b.name).trim(), today: Number(b.today), prev: b.prev === '' || b.prev == null ? null : Number(b.prev), members: b.members ? Number(b.members) : null, region: b.region || '', note: b.note || '' }]); res.json({ ok: true, ...r }); });
router.delete('/prices/:id', (req, res) => { db.prepare('DELETE FROM prices WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ── 골프장 ──
router.get('/clubs', (req, res) => res.json(db.prepare('SELECT id,slug,name,region,address,holes,price_name,status,verified,ai_generated,updated_at, (body_html IS NOT NULL AND body_html<>\'\') has_body FROM clubs ORDER BY name').all()));
router.get('/clubs/:id', (req, res) => { const c = db.prepare('SELECT * FROM clubs WHERE id=?').get(req.params.id); if (!c) return res.status(404).json({ error: 'not found' }); res.json(c); });
router.post('/clubs', (req, res) => {
  const b = req.body || {}; if (!b.name) return res.status(400).json({ error: '이름 필요' });
  const ts = now(); const slug = b.slug || koSlug(b.name);
  if (b.id) {
    db.prepare('UPDATE clubs SET name=?,slug=?,region=?,address=?,holes=?,opened=?,type=?,summary=?,body_html=?,faq_json=?,fit_for=?,booking=?,transfer=?,price_name=?,status=?,verified=?,updated_at=? WHERE id=?')
      .run(b.name, slug, b.region || '', b.address || '', b.holes ? Number(b.holes) : null, b.opened || '', b.type || '회원제', b.summary || '', sanitizeHtml(b.body_html || ''), b.faq_json || '[]', b.fit_for || '', b.booking || '', b.transfer || '', b.price_name || '', b.status || 'published', b.verified ? 1 : 0, ts, b.id);
    return res.json({ ok: true, id: b.id });
  }
  const info = db.prepare('INSERT INTO clubs (slug,name,region,address,holes,opened,type,summary,body_html,faq_json,fit_for,booking,transfer,price_name,status,verified,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(slug, b.name, b.region || '', b.address || '', b.holes ? Number(b.holes) : null, b.opened || '', b.type || '회원제', b.summary || '', sanitizeHtml(b.body_html || ''), b.faq_json || '[]', b.fit_for || '', b.booking || '', b.transfer || '', b.price_name || '', b.status || 'published', b.verified ? 1 : 0, ts, ts);
  res.json({ ok: true, id: info.lastInsertRowid });
});
router.post('/clubs/:id/verify', (req, res) => { db.prepare('UPDATE clubs SET verified=?, updated_at=? WHERE id=?').run(req.body?.verified ? 1 : 0, now(), req.params.id); res.json({ ok: true }); });
router.post('/clubs/:id/generate', async (req, res) => {
  try { const r = await generateOne({ type: 'club', clubId: Number(req.params.id), slot: 'manual', forceTemplate: !!req.body?.template }); res.json({ ok: true, post: r.post, inblog: r.inblog }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/clubs/:id/draft', (req, res) => { const c = db.prepare('SELECT * FROM clubs WHERE id=?').get(req.params.id); if (!c) return res.status(404).json({ error: 'not found' }); res.json(templates.clubDraft(c)); });
router.delete('/clubs/:id', (req, res) => { db.prepare('DELETE FROM clubs WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ── 매물 ──
router.get('/listings', (req, res) => res.json(db.prepare('SELECT * FROM listings ORDER BY featured DESC, id DESC').all()));
router.post('/listings', (req, res) => {
  const b = req.body || {}; if (!b.title || !b.category) return res.status(400).json({ error: '제목·구분 필요' }); const ts = now();
  if (b.id) { db.prepare('UPDATE listings SET category=?,title=?,name=?,region=?,price=?,kind=?,body=?,status=?,featured=?,image=?,updated_at=? WHERE id=?').run(b.category, b.title, b.name || '', b.region || '', b.price ? Number(b.price) : null, b.kind || '', b.body || '', b.status || 'open', b.featured ? 1 : 0, b.image || '', ts, b.id); return res.json({ ok: true, id: b.id }); }
  const info = db.prepare('INSERT INTO listings (category,title,name,region,price,kind,body,status,featured,image,images,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(b.category, b.title, b.name || '', b.region || '', b.price ? Number(b.price) : null, b.kind || '', b.body || '', b.status || 'open', b.featured ? 1 : 0, b.image || '', JSON.stringify(b.image ? [b.image] : []), ts, ts);
  res.json({ ok: true, id: info.lastInsertRowid });
});
router.delete('/listings/:id', (req, res) => { db.prepare('DELETE FROM listings WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ── 콘텐츠(블로그·공지·뉴스) ──
router.get('/posts', (req, res) => {
  const kind = ['blog', 'notice', 'news'].includes(req.query.kind) ? req.query.kind : 'blog';
  const status = req.query.status ? ' AND status=?' : ''; const args = [kind]; if (req.query.status) args.push(req.query.status);
  res.json(db.prepare(`SELECT id,kind,type,slug,title,status,source,model,gen_slot,inblog_status,inblog_error,inblog_url,published_at,created_at,updated_at FROM posts WHERE kind=?${status} ORDER BY created_at DESC LIMIT 300`).all(...args));
});
router.get('/posts/:id', (req, res) => { const p = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); res.json(p); });
router.post('/posts', (req, res) => {
  const b = req.body || {}; if (!b.title || !b.body_html) return res.status(400).json({ error: '제목·본문 필요' }); const ts = now();
  const kind = ['blog', 'notice', 'news'].includes(b.kind) ? b.kind : 'blog';
  const status = b.status === 'published' ? 'published' : 'draft';
  if (b.id) {
    const old = db.prepare('SELECT * FROM posts WHERE id=?').get(b.id); if (!old) return res.status(404).json({ error: 'not found' });
    db.prepare('UPDATE posts SET kind=?,type=?,title=?,slug=?,excerpt=?,meta_description=?,body_html=?,tags=?,author=?,status=?,published_at=?,updated_at=? WHERE id=?')
      .run(kind, b.type || old.type, b.title, b.slug || old.slug, b.excerpt || '', b.meta_description || '', sanitizeHtml(b.body_html), b.tags || '', b.author || old.author, status, status === 'published' ? (old.published_at || ts) : old.published_at, ts, b.id);
    og.invalidate(`post-${b.slug || old.slug}`);
    if (status === 'published') indexnow.submit([`/${kind === 'blog' ? 'blog' : kind}/${b.slug || old.slug}`]).catch(() => {});
    return res.json({ ok: true, id: b.id });
  }
  let slug = slugify(b.slug || b.title, `${kind}-${ts.toString(36)}`); let n = 1; const base = slug; while (db.prepare('SELECT 1 FROM posts WHERE slug=?').get(slug)) slug = `${base}-${++n}`;
  const info = db.prepare('INSERT INTO posts (kind,type,slug,title,excerpt,meta_description,body_html,tags,author,status,source,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(kind, b.type || (kind === 'blog' ? 'guide' : null), slug, b.title, b.excerpt || truncate(stripHtml(b.body_html), 160), b.meta_description || '', sanitizeHtml(b.body_html), b.tags || '', b.author || '하나회원권거래소 편집팀', status, 'manual', status === 'published' ? ts : null, ts, ts);
  res.json({ ok: true, id: info.lastInsertRowid });
});
router.post('/posts/:id/publish', async (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' });
  const pub = req.body?.publish !== false; const ts = now();
  db.prepare('UPDATE posts SET status=?, published_at=?, updated_at=? WHERE id=?').run(pub ? 'published' : 'draft', pub ? (p.published_at || ts) : p.published_at, ts, p.id);
  let ib = { skipped: true };
  if (p.kind === 'blog') { const full = db.prepare('SELECT * FROM posts WHERE id=?').get(p.id); try { const j = JSON.parse(full.source_urls || '[]'); full.faq_json = JSON.stringify(j.faq || []); } catch (_) { full.faq_json = '[]'; } ib = await pushToInblog(full); if (!pub && full.inblog_id && inblog.enabled()) { try { await inblog.unpublish(full.inblog_id); db.prepare("UPDATE posts SET inblog_status='draft' WHERE id=?").run(p.id); } catch (_) { /* no-op */ } } }
  if (pub) indexnow.submit([`/${p.kind === 'blog' ? 'blog' : p.kind}/${p.slug}`]).catch(() => {});
  res.json({ ok: true, inblog: ib });
});
router.get('/indexnow', async (req, res) => res.json(await indexnow.status()));
router.post('/indexnow/submit-all', async (req, res) => { try { res.json(await indexnow.submitAll({ force: !!req.body?.force })); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/indexnow/submit', async (req, res) => { try { res.json(await indexnow.submit(Array.isArray(req.body?.urls) ? req.body.urls : [], { force: !!req.body?.force })); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/posts/:id/inblog', async (req, res) => { const p = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); try { const j = JSON.parse(p.source_urls || '[]'); p.faq_json = JSON.stringify(j.faq || []); } catch (_) { p.faq_json = '[]'; } res.json(await pushToInblog(p)); });
router.delete('/posts/:id', (req, res) => { db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ── 자동발행 ──
router.get('/automation', (req, res) => res.json({ ...scheduler.status(), topics: db.prepare('SELECT * FROM topic_pool ORDER BY type, id').all(), providers: providers.providerInfo(), llm: { ...providers.getLlmConfig(), apiKey: undefined, available: providers.llmAvailable() }, inblog: { enabled: inblog.enabled(), push: getSetting('inblog_push', '1') === '1' }, typeLabels: TYPE_LABEL }));
router.post('/automation/generate', async (req, res) => { try { const r = await generateOne({ slot: 'manual', type: req.body?.type || undefined, topicId: req.body?.topicId || undefined, forceTemplate: !!req.body?.template }); res.json({ ok: true, ...r }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/automation/run-now', async (req, res) => { try { await scheduler.tick(); res.json({ ok: true, status: scheduler.status() }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/automation/topics', (req, res) => { const b = req.body || {}; if (b.id) { db.prepare('UPDATE topic_pool SET type=?,topic=?,hint=?,weight=?,active=? WHERE id=?').run(b.type, b.topic, b.hint || '', Number(b.weight) || 1, b.active ? 1 : 0, b.id); } else { if (!b.topic || !TYPE_LABEL[b.type]) return res.status(400).json({ error: '유형·주제 필요' }); db.prepare('INSERT INTO topic_pool (type,topic,hint,weight,active) VALUES (?,?,?,?,1)').run(b.type, b.topic, b.hint || '', Number(b.weight) || 1); } res.json({ ok: true }); });
router.delete('/automation/topics/:id', (req, res) => { db.prepare('DELETE FROM topic_pool WHERE id=?').run(req.params.id); res.json({ ok: true }); });
router.get('/automation/inblog-test', async (req, res) => { try { res.json({ ok: true, blog: await inblog.me() }); } catch (e) { res.status(400).json({ error: e.message }); } });

// ── 문의 ──
router.get('/inquiries', (req, res) => res.json(db.prepare('SELECT * FROM inquiries ORDER BY id DESC LIMIT 500').all()));
router.post('/inquiries/:id', (req, res) => { db.prepare('UPDATE inquiries SET status=?, memo=?, updated_at=? WHERE id=?').run(req.body?.status || 'new', req.body?.memo || '', now(), req.params.id); res.json({ ok: true }); });
router.delete('/inquiries/:id', (req, res) => { db.prepare('DELETE FROM inquiries WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ── 유튜브 ──
router.get('/videos', (req, res) => res.json(db.prepare('SELECT * FROM videos ORDER BY sort, id DESC').all()));
router.post('/videos', (req, res) => { const b = req.body || {}; const m = String(b.url || b.youtube_id || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})|^([\w-]{11})$/); const id = m ? (m[1] || m[2]) : null; if (!id || !b.title) return res.status(400).json({ error: '유튜브 URL과 제목 필요' }); db.prepare('INSERT INTO videos (youtube_id,title,description,published,sort,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(youtube_id) DO UPDATE SET title=excluded.title, description=excluded.description, published=excluded.published, sort=excluded.sort').run(id, b.title, b.description || '', b.published || kstDate(), Number(b.sort) || 0, now()); res.json({ ok: true, id }); });
router.delete('/videos/:id', (req, res) => { db.prepare('DELETE FROM videos WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ── 실행계획·리포트 ──
router.get('/plan', (req, res) => { const wk = report.currentWeek(); const tasks = db.prepare('SELECT * FROM plan_tasks ORDER BY week, sort, id').all().map(t => ({ ...t, auto: t.auto_key ? report.autoStatus(t.auto_key, report.weekRange(t.week)) : null })); res.json({ currentWeek: wk, kickoff: report.kickoff(), weeks: [1, 2, 3, 4].map(w => ({ week: w, ...report.weekRange(w), tasks: tasks.filter(t => t.week === w) })) }); });
router.post('/plan/:id', (req, res) => { db.prepare('UPDATE plan_tasks SET done=?, done_at=?, note=? WHERE id=?').run(req.body?.done ? 1 : 0, req.body?.done ? now() : null, req.body?.note || '', req.params.id); res.json({ ok: true }); });
router.get('/reports', (req, res) => res.json(db.prepare('SELECT id, week, kind, title, period_start, period_end, docx_path, created_at FROM reports ORDER BY created_at DESC').all()));
router.get('/reports/:id/html', (req, res) => { const r = db.prepare('SELECT html FROM reports WHERE id=?').get(req.params.id); if (!r) return res.status(404).send('not found'); res.type('html').send(r.html); });
router.get('/reports/:id/docx', (req, res) => { const r = db.prepare('SELECT * FROM reports WHERE id=?').get(req.params.id); if (!r || !r.docx_path || !fs.existsSync(r.docx_path)) return res.status(404).json({ error: 'docx 없음' }); res.download(r.docx_path, `하나회원권_${r.title}_${r.period_start}.docx`); });
router.post('/reports/generate', async (req, res) => { try { const kind = ['weekly', 'monthly', 'baseline'].includes(req.body?.kind) ? req.body.kind : 'weekly'; const week = Number(req.body?.week) || report.currentWeek(); if (auditRunner && req.body?.audit !== false) await auditRunner(); const r = await report.generate(week, kind); res.json({ ok: true, report: r }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/reports/preview/:week', (req, res) => res.type('html').send(report.renderHtml(report.collect(Number(req.params.week) || 1), 'weekly')));
router.post('/audit/run', async (req, res) => { try { res.json(await auditRunner()); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/audit', (req, res) => res.json({ latest: audit.latest(), history: audit.history(30) }));
router.get('/traffic', (req, res) => { const to = kstDate(); const from = req.query.from || report.kickoff(); res.json({ from, to, ...analytics.summary(from, to) }); });

// ── 스크린샷(전후 비교) ──
router.get('/screenshots', (req, res) => { const p = shot.pairs(); res.json({ available: shot.available(), chrome: shot.findChrome(), dirs: shot.listDirs(), baseline: !!p.beforeDir, latest: p.afterDir ? path.basename(p.afterDir) : null, pairs: p.pairs, admin: p.admin }); });
router.post('/screenshots/capture', async (req, res) => { try { if (!shot.available()) return res.status(400).json({ error: '서버에 크롬/크로미움이 없습니다. 로컬에서 node scripts/capture.js after <배포URL> 로 캡처 후 업로드하세요.' }); const base = `http://127.0.0.1:${process.env.PORT || 3000}`; const r = await shot.weeklyCapture({ base, adminCookie: auth.signInternal() }); res.json({ ok: true, count: r.files.length, errors: r.errors }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/screenshots/file', (req, res) => { const f = path.resolve(String(req.query.path || '')); const ok = [shot.SHOT_DIR, shot.baselineDir()].filter(Boolean).some(d => f.startsWith(path.resolve(d))); if (!ok || !fs.existsSync(f)) return res.status(404).end(); res.sendFile(f); });
router.post('/screenshots/upload', upload.array('files', 40), (req, res) => { const dir = path.join(shot.SHOT_DIR, kstDate()); fs.mkdirSync(dir, { recursive: true }); let n = 0; for (const f of req.files || []) { const name = Buffer.from(f.originalname, 'latin1').toString('utf8').replace(/[^\w.가-힣-]/g, '_'); if (!/\.(png|jpe?g)$/i.test(name)) continue; fs.writeFileSync(path.join(dir, name), f.buffer); n++; } res.json({ ok: true, saved: n, dir }); });

// ── 설정 ──
const SETTING_KEYS = ['site_url', 'site_name', 'legal_name', 'slogan', 'phone', 'fax', 'email', 'address', 'ceo', 'privacy_officer', 'youtube', 'naver_blog', 'instagram', 'kakao_channel', 'inblog_url', 'naver_verification', 'google_verification', 'google_verification_file', 'indexnow_enabled', 'ga_id', 'gen_times', 'auto_generate', 'auto_publish', 'inblog_push', 'llm_provider', 'kickoff_date', 'inblog_api_key', ...Object.values(providers.KEY_SETTING), ...Object.values(providers.BASEURL_SETTING), 'model_anthropic', 'model_openai', 'model_gemini', 'model_openai-compatible'];
router.get('/settings', (req, res) => { const o = settings.all(); for (const k of SETTING_KEYS) if (!(k in o)) o[k] = getSetting(k, ''); for (const k of Object.keys(o)) if (/api_key/.test(k)) o[k] = o[k] ? '••••' + String(o[k]).slice(-4) : ''; o._env = { anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY, gemini: !!process.env.GEMINI_API_KEY, inblog: !!process.env.INBLOG_API_KEY }; res.json(o); });
router.post('/settings', (req, res) => { const b = req.body || {}; for (const k of SETTING_KEYS) if (k in b) { if (/api_key/.test(k) && String(b[k]).startsWith('••••')) continue; setSetting(k, b[k]); } res.json({ ok: true }); });

module.exports = { router, setAuditRunner };
