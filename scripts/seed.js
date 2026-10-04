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
// 이미 시드된 DB(운영 볼륨)에도 웹 검증 결과를 반영: 시드가 verified=1인 골프장 중 DB에서 아직 미검증인 행만 주소·홀수·개장·지역을 갱신
function syncVerifiedClubs() {
  const upd = db.prepare('UPDATE clubs SET region=?, address=?, holes=?, opened=?, verified=1, updated_at=? WHERE name=? AND verified=0');
  let n = 0; const ts = now();
  for (const c of J('clubs.json').clubs) { if (c.verified && upd.run(c.region || '', c.address || '', c.holes || null, c.opened || '', ts, c.name).changes) n++; }
  return n;
}
function seedClubs() {
  if (db.prepare('SELECT COUNT(*) c FROM clubs').get().c) return syncVerifiedClubs();
  const ts = now(); let n = 0;
  const ins = db.prepare('INSERT OR IGNORE INTO clubs (slug,name,region,address,holes,opened,type,price_name,status,verified,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const c of J('clubs.json').clubs) { ins.run(koSlug(c.name), c.name, c.region || '', c.address || '', c.holes || null, c.opened || '', c.type || '회원제', c.price_name || '', 'published', c.verified ? 1 : 0, ts, ts); n++; }
  return n;
}
// 구 사이트 매물·전용관 이관본(listings.json) — src_id 기준으로 없는 것만 추가. 상세 정보표는 info_json, 설명은 desc_html, 대표 이미지는 image.
function seedListings() {
  const f = path.join(SEED, 'listings.json'); if (!fs.existsSync(f)) return 0;
  const items = J('listings.json').items || []; const ts = now(); let n = 0;
  const has = db.prepare('SELECT 1 FROM listings WHERE src_id=?');
  const ins = db.prepare('INSERT INTO listings (category,title,name,region,price,kind,body,status,featured,image,images,info_json,desc_html,src_id,link,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  // 구 사이트 순서(최신이 앞) 유지: 뒤에서부터 넣어 id가 커질수록 최신
  const upd = db.prepare('UPDATE listings SET images=?, info_json=?, desc_html=?, image=?, body=?, price=COALESCE(?, price), link=COALESCE(NULLIF(?, \'\'), link) WHERE src_id=?');
  for (const it of [...items].reverse()) {
    const _exists = !!has.get(it.src_id);
    const price = (() => { const r = (it.info || []).find(([k]) => /매매가|분양가/.test(k)); const m = r && String(r[1]).replace(/,/g, '').match(/(\d+)\s*만원/); return m ? Number(m[1]) : null; })();
    const body = (it.info || []).filter(([k, v]) => v && !/부대비용|매매가|분양가|골프장 소개|회원 혜택|^기타$/.test(k) && v !== it.title).map(([k, v]) => `${k}: ${v}`).join(' / ').slice(0, 300);
    if (_exists) { upd.run(JSON.stringify(it.images || []), JSON.stringify(it.info || []), it.desc_html || '', (it.images || [])[0] || '', body, price, it.link || '', it.src_id); continue; }
    ins.run(it.category, it.title, it.title.replace(/\s*(회원권|분양)?\s*(안내|분양안내|모집안내)$/, '').trim(), '', price, it.kind || '', body, 'open', 0, (it.images || [])[0] || '', JSON.stringify(it.images || []), JSON.stringify(it.info || []), it.desc_html || '', it.src_id, it.link || '', ts - n, ts - n); n++;
  }
  return n;
}
// 구 사이트 골프장 안내(clubs-hanamarket.json, 고객사 데이터) 병합: 이름이 같은 기존 골프장은 보강, 없는 골프장은 신규 등록. old_id 기준 멱등.
const SIDO_REGION = { '서울': '수도권', '인천': '수도권', '경기도': '수도권', '강원도': '강원', '충청북도': '충청', '충청남도': '충청', '대전': '충청', '세종': '충청', '경상북도': '영남', '경상남도': '영남', '대구': '영남', '부산': '영남', '울산': '영남', '전라북도': '호남', '전라남도': '호남', '광주': '호남', '제주도': '제주' };
const normName = (n) => String(n || '').toLowerCase().replace(/(컨트리클럽|골프클럽|골프앤리조트|골프리조트|골프장|리조트|cc|gc|c\.c|g\.c|\s|\(.*?\))/g, '');
function seedClubsHanamarket() {
  const f = path.join(SEED, 'clubs-hanamarket.json'); if (!fs.existsSync(f)) return 0;
  const items = J('clubs-hanamarket.json').clubs || []; const ts = now(); let ins = 0, upd = 0;
  const byOld = db.prepare('SELECT id FROM clubs WHERE old_id=?');
  const existing = db.prepare('SELECT id, name, address, holes, summary, fit_for, booking, transfer, verified, old_id FROM clubs').all();
  const priceNames = db.prepare("SELECT name FROM prices WHERE category='golf'").all().map(r => r.name);
  const findPrice = (name) => { const k = normName(name); return priceNames.find(p => normName(p) === k) || ''; };
  const upStmt = db.prepare('UPDATE clubs SET sido=?, phone=?, website=?, members=?, logo=?, tables_json=?, old_id=?, source=?, address=CASE WHEN address IS NULL OR address=\'\' OR verified=0 THEN ? ELSE address END, holes=CASE WHEN holes IS NULL OR verified=0 THEN ? ELSE holes END, region=?, summary=CASE WHEN summary IS NULL OR summary=\'\' THEN ? ELSE summary END, fit_for=CASE WHEN fit_for IS NULL OR fit_for=\'\' THEN ? ELSE fit_for END, booking=CASE WHEN booking IS NULL OR booking=\'\' THEN ? ELSE booking END, transfer=CASE WHEN transfer IS NULL OR transfer=\'\' THEN ? ELSE transfer END, verified=CASE WHEN ?>0 THEN 1 ELSE verified END, updated_at=? WHERE id=?');
  const insStmt = db.prepare('INSERT OR IGNORE INTO clubs (slug,name,region,address,holes,opened,type,price_name,status,verified,summary,fit_for,booking,transfer,sido,phone,website,members,logo,tables_json,old_id,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const it of items) {
    const region = SIDO_REGION[it.sido] || ''; const addr = it.address || ''; const holes = it.holes || null;
    const clientVerified = (addr || holes) ? 1 : 0; const tables = JSON.stringify(it.tables || []);
    const hit = byOld.get(it.old_id) || existing.find(e => !e.old_id && normName(e.name) === normName(it.name));
    if (hit) {
      // 지도용 sido·연락처·로고·표는 항상 최신화, 주소·홀수는 미검증 행만 고객사 값으로 교체, 해설류는 비어 있을 때만 채움
      upStmt.run(it.sido || '', it.phone || '', it.website || '', it.members || null, it.logo || '', tables, it.old_id, 'hanamarket', addr, holes, region, it.intro || '', it.membership_types || '', it.benefits || '', it.extra || '', clientVerified, ts, hit.id);
      if (!hit.old_id) hit.old_id = it.old_id; upd++;
    } else {
      let slug = koSlug(it.name); let n = 1; const base = slug; while (db.prepare('SELECT 1 FROM clubs WHERE slug=?').get(slug)) slug = `${base}-${++n}`;
      insStmt.run(slug, it.name, region, addr, holes, '', '회원제', findPrice(it.name), 'published', clientVerified, it.intro || '', it.membership_types || '', it.benefits || '', it.extra || '', it.sido || '', it.phone || '', it.website || '', it.members || null, it.logo || '', tables, it.old_id, 'hanamarket', ts, ts);
      existing.push({ id: null, name: it.name, old_id: it.old_id }); ins++;
    }
  }
  // 이관 텍스트의 HTML 엔티티(&quot; &amp; &apos; &nbsp; 등) 해제 — 템플릿에서 다시 이스케이프되므로 원문은 평문이어야 함
  const unesc1 = (t) => String(t || '').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;| /g, ' ').replace(/&amp;/g, '&').trim();
  const unesc = (t) => unesc1(unesc1(t)); // 이중 인코딩(&amp;gt;) 대비 두 번
  for (const r of db.prepare("SELECT id, name, address, summary, fit_for, booking, transfer, tables_json, phone, website FROM clubs WHERE source='hanamarket'").all()) {
    const v = { name: unesc(r.name), address: unesc(r.address), summary: unesc(r.summary), fit_for: unesc(r.fit_for), booking: unesc(r.booking), transfer: unesc(r.transfer), tables_json: unesc(r.tables_json).replace(/\s+$/, '') || '[]', phone: unesc(r.phone), website: unesc(r.website) };
    if (/^[\d\-()\s]+$/.test(v.website) && v.website) { if (!v.phone) v.phone = v.website; v.website = ''; }
    if (Object.keys(v).some(k => (v[k] || '') !== (r[k] || ''))) db.prepare('UPDATE clubs SET name=?, address=?, summary=?, fit_for=?, booking=?, transfer=?, tables_json=?, phone=?, website=? WHERE id=?').run(v.name, v.address, v.summary, v.fit_for, v.booking, v.transfer, v.tables_json, v.phone, v.website, r.id);
  }
  for (const r of db.prepare("SELECT id, title, body, info_json FROM listings WHERE src_id IS NOT NULL").all()) {
    const v = { title: unesc(r.title), body: unesc(r.body), info_json: unesc(r.info_json) };
    if (Object.keys(v).some(k => (v[k] || '') !== (r[k] || ''))) db.prepare('UPDATE listings SET title=?, body=?, info_json=? WHERE id=?').run(v.title, v.body, v.info_json, r.id);
  }
  // 주소 정리: 앞의 우편번호 "(363880) " 제거, 주소 칸에 URL이 들어간 경우 홈페이지로 이동
  for (const r of db.prepare("SELECT id, address, website FROM clubs WHERE address LIKE '(%' OR address LIKE 'http%'").all()) {
    let a = String(r.address || '').trim(); let w = r.website || '';
    if (/^https?:/i.test(a)) { if (!w) w = a; a = ''; }
    a = a.replace(/^\(\d{5,6}\)\s*/, '').trim();
    db.prepare('UPDATE clubs SET address=?, website=? WHERE id=?').run(a, w, r.id);
  }
  // 구 사이트에 없는 골프장은 주소 앞머리로 시·도 채움(지도 매핑용)
  const SIDO_OF = [['서울', '서울'], ['인천', '인천'], ['경기', '경기도'], ['강원', '강원도'], ['충청북도', '충청북도'], ['충북', '충청북도'], ['충청남도', '충청남도'], ['충남', '충청남도'], ['대전', '대전'], ['세종', '세종'], ['전라북도', '전라북도'], ['전북', '전라북도'], ['전라남도', '전라남도'], ['전남', '전라남도'], ['광주', '광주'], ['경상북도', '경상북도'], ['경북', '경상북도'], ['대구', '대구'], ['경상남도', '경상남도'], ['경남', '경상남도'], ['부산', '부산'], ['울산', '울산'], ['제주', '제주도']];
  for (const r of db.prepare("SELECT id, address FROM clubs WHERE sido IS NULL OR sido=''").all()) { const a = String(r.address || '').trim(); const hit = SIDO_OF.find(([k]) => a.startsWith(k)); if (hit) db.prepare('UPDATE clubs SET sido=? WHERE id=?').run(hit[1], r.id); }
  return ins + upd;
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
// 가이드 글 시드 — articles.json + articles-*.json 을 slug 기준으로 없는 것만 추가(멱등). 발행일은 파일의 date(YYYY-MM-DD) 또는 지금.
function seedArticles() {
  const files = fs.readdirSync(SEED).filter(f => /^articles.*\.json$/.test(f)).sort();
  const ins = db.prepare("INSERT INTO posts (kind,type,slug,title,excerpt,meta_description,body_html,tags,status,source,source_urls,published_at,created_at,updated_at) VALUES ('blog',?,?,?,?,?,?,?,?,'manual',?,?,?,?)");
  let n = 0;
  for (const f of files) {
    const m = f.match(/articles-(\d{4}-\d{2}-\d{2})/); const base = m ? Math.floor(new Date(m[1] + 'T09:00:00+09:00') / 1000) : now() - 86400;
    const arr = J(f);
    arr.forEach((a, i) => {
      const ex = db.prepare('SELECT id, body_html FROM posts WHERE slug=?').get(a.slug);
      if (ex) { if (ex.body_html !== a.body_html) db.prepare('UPDATE posts SET title=?, excerpt=?, meta_description=?, body_html=?, updated_at=? WHERE id=?').run(a.title, a.excerpt, a.meta_description, a.body_html, now(), ex.id); return; }
      // 파일 날짜가 미래면 예약 발행(scheduled): 스케줄러가 그 시각에 발행하고 인블로그로 보낸다
      const when = base + i * 3600; const future = when > now(); const t = future ? when : Math.min(now(), when);
      ins.run(a.type, a.slug, a.title, a.excerpt, a.meta_description, a.body_html, (a.tags || []).join(','), future ? 'scheduled' : 'published', JSON.stringify({ sources: [], faq: a.faq || [] }), t, future ? now() : t, future ? now() : t); n++;
    });
  }
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
  const r = { prices: seedPrices(), clubs: seedClubs(), topics: seedTopics(force), plan: seedPlan(force), articles: seedArticles(), notice: seedNotice(), videos: seedVideos(), listings: seedListings(), clubsHanamarket: seedClubsHanamarket() };
  if (Object.values(r).some(Boolean)) console.log('[seed]', JSON.stringify(r));
  return r;
}

if (require.main === module) { console.log(seedIfEmpty(process.argv.includes('--force'))); }
module.exports = { seedIfEmpty };
