'use strict';
// 초기 데이터 시드 — 비어 있을 때만 채움(멱등). `node scripts/seed.js --force` 로 주제·계획만 재시드.
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const prices = require('../lib/prices');
const { now, koSlug, kstDate } = require('../lib/util');

const SEED = path.join(__dirname, '..', 'data', 'seed');
const J = (f) => JSON.parse(fs.readFileSync(path.join(SEED, f), 'utf8'));

function seedPrices() {
  if (db.prepare('SELECT COUNT(*) c FROM prices').get().c) return 0;
  const p = J('prices.json'); const rows = [];
  for (const cat of Object.keys(prices.CATS)) for (const [name, today, prev, region] of (p[cat] || [])) rows.push({ category: cat, name, today, prev, region });
  // 이력: 전일값(-7일)·금일값(오늘) 두 점으로 시작
  const r = prices.upsertRows(rows.map(x => ({ ...x, today: x.prev })), require('../lib/util').addDays(kstDate(), -7));
  prices.upsertRows(rows, kstDate());
  return rows.length;
}
function seedClubs() {
  if (db.prepare('SELECT COUNT(*) c FROM clubs').get().c) return 0;
  const ts = now(); let n = 0;
  const ins = db.prepare('INSERT OR IGNORE INTO clubs (slug,name,region,address,holes,opened,type,price_name,status,verified,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)');
  for (const c of J('clubs.json').clubs) { ins.run(koSlug(c.name), c.name, c.region || '', c.address || '', c.holes || null, c.opened || '', c.type || '회원제', c.price_name || '', 'published', ts, ts); n++; }
  return n;
}
function seedTopics(force) {
  if (!force && db.prepare('SELECT COUNT(*) c FROM topic_pool').get().c) return 0;
  const ins = db.prepare('INSERT INTO topic_pool (type,topic,hint,weight,active) VALUES (?,?,?,1,1)'); let n = 0;
  for (const t of J('topics.json')) { if (!db.prepare('SELECT 1 FROM topic_pool WHERE topic=?').get(t.topic)) { ins.run(t.type, t.topic, t.hint || ''); n++; } }
  return n;
}
function seedPlan(force) {
  if (!force && db.prepare('SELECT COUNT(*) c FROM plan_tasks').get().c) return 0;
  const plan = J('plan.json'); const ins = db.prepare('INSERT INTO plan_tasks (week,title,owner,auto_key,done,done_at,sort) VALUES (?,?,?,?,?,?,?)'); let n = 0;
  for (const w of plan.weeks) w.tasks.forEach((t, i) => { if (!db.prepare('SELECT 1 FROM plan_tasks WHERE week=? AND title=?').get(w.week, t.title)) { ins.run(w.week, t.title, t.owner || '', t.auto_key || null, t.done ? 1 : 0, t.done ? now() : null, i); n++; } });
  db.prepare("INSERT INTO settings (key,value) VALUES ('kickoff_date',?) ON CONFLICT(key) DO NOTHING").run(plan.kickoff);
  return n;
}
function seedArticles() {
  if (db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog'").get().c) return 0;
  const ts = now(); let n = 0;
  const ins = db.prepare("INSERT INTO posts (kind,type,slug,title,excerpt,meta_description,body_html,tags,status,source,source_urls,published_at,created_at,updated_at) VALUES ('blog',?,?,?,?,?,?,?,'published','manual',?,?,?,?)");
  J('articles.json').forEach((a, i) => { const t = ts - (J('articles.json').length - i) * 3600; ins.run(a.type, a.slug, a.title, a.excerpt, a.meta_description, a.body_html, (a.tags || []).join(','), JSON.stringify({ sources: [], faq: a.faq || [] }), t, t, t); n++; });
  return n;
}
function seedNotice() {
  if (db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='notice'").get().c) return 0;
  const ts = now();
  db.prepare("INSERT INTO posts (kind,slug,title,excerpt,body_html,status,source,published_at,created_at,updated_at) VALUES ('notice','new-homepage-open',?,?,?,'published','manual',?,?,?)")
    .run('하나회원권거래소 홈페이지를 새롭게 열었습니다', '시세표·골프장 소개·거래 가이드를 새 홈페이지에서 확인하세요.', '<p>하나회원권거래소 홈페이지를 새롭게 단장했습니다. 골프·법인·콘도·피트니스 회원권 시세표는 매주 월요일 갱신되며, 골프장별 회원권 안내와 거래 가이드, 주간 시세 리포트를 새로 제공합니다.</p><ul><li><a href="/market/golf">골프회원권 시세표</a> — 지역 필터, 종목 비교, 90일 추이</li><li><a href="/golf">골프장별 회원권 안내</a></li><li><a href="/blog">시세 리포트·거래 가이드</a></li></ul><p>기존 홈페이지 주소로 접속하셔도 새 페이지로 연결됩니다. 문의 02-583-0583.</p>', ts, ts, ts);
  return 1;
}

function seedVideos() {
  if (db.prepare('SELECT COUNT(*) c FROM videos').get().c) return 0;
  if (!fs.existsSync(path.join(SEED, 'videos.json'))) return 0;
  const ins = db.prepare('INSERT OR IGNORE INTO videos (youtube_id,title,description,published,sort,created_at) VALUES (?,?,?,?,?,?)'); let n = 0;
  J('videos.json').forEach((v, i) => { ins.run(v.youtube_id, v.title, v.description || '', v.published || '', i, now()); n++; });
  return n;
}

function seedIfEmpty(force = false) {
  const r = { prices: seedPrices(), clubs: seedClubs(), topics: seedTopics(force), plan: seedPlan(force), articles: seedArticles(), notice: seedNotice(), videos: seedVideos() };
  if (Object.values(r).some(Boolean)) console.log('[seed]', JSON.stringify(r));
  return r;
}

if (require.main === module) { console.log(seedIfEmpty(process.argv.includes('--force'))); }
module.exports = { seedIfEmpty };
