'use strict';
// 콘텐츠 생성 파이프라인 — 주제 선택 → (LLM 또는 템플릿) → posts 저장 → (자동발행) → 인블로그 전송
const { db, getSetting } = require('../../db');
const { now, kstDate, slugify, sanitizeHtml, extractJson, stripHtml, truncate, koSlug } = require('../util');
const { getLlmConfig, runLLM, llmAvailable } = require('../providers');
const templates = require('./templates');
const inblog = require('../inblog');
const settings = require('../settings');
const prices = require('../prices');

const TYPE_LABEL = { club: '골프장 소개', report: '주간 시세 리포트', guide: '거래 가이드·FAQ', trend: '뉴스·트렌드' };

function recentTitles(limit = 40) { return db.prepare('SELECT title FROM posts WHERE kind=? ORDER BY created_at DESC LIMIT ?').all('blog', limit).map(r => r.title); }
function uniqueSlug(base) { let s = base, n = 1; while (db.prepare('SELECT 1 FROM posts WHERE slug=?').get(s)) { n++; s = `${base}-${n}`; } return s; }

// 유형 로테이션: 슬롯별로 유형을 번갈아 선택. 월요일 첫 슬롯은 시세 리포트 고정.
function pickType(slot, date) {
  const weekday = new Date(date + 'T00:00:00+09:00').getUTCDay(); // 1=Mon
  if (weekday === 1 && slot === (getSetting('gen_times', '09:00,15:00').split(',')[0] || '09:00').trim()) return 'report';
  const counts = {}; for (const t of Object.keys(TYPE_LABEL)) counts[t] = db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND type=?").get(t).c;
  // 목표 비율: guide 40 / club 30 / trend 20 / report 10 → 부족한 유형 우선
  const target = { guide: 0.4, club: 0.3, trend: 0.2, report: 0.1 };
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  let best = 'guide', gap = -Infinity;
  for (const t of ['guide', 'club', 'trend']) { const g = target[t] - counts[t] / total; if (g > gap) { gap = g; best = t; } }
  if (best === 'club' && !nextClub()) best = 'guide';
  if (best === 'trend' && !llmAvailable()) best = nextClub() ? 'club' : 'report';
  if (best === 'guide' && !llmAvailable()) best = nextClub() ? 'club' : 'report';
  return best;
}
function nextClub() { return db.prepare("SELECT * FROM clubs WHERE (body_html IS NULL OR body_html='') ORDER BY id LIMIT 1").get() || null; }
function pickTopic(type) {
  return db.prepare('SELECT * FROM topic_pool WHERE active=1 AND type=? ORDER BY (last_used IS NULL) DESC, last_used ASC, weight DESC LIMIT 1').get(type) || null;
}
function markTopic(id) { db.prepare('UPDATE topic_pool SET last_used=?, use_count=use_count+1 WHERE id=?').run(now(), id); }

const SYSTEM = (search) => `너는 대한민국 골프·콘도·피트니스 회원권 거래 전문기업 '하나회원권거래소'(2004년 설립, 서울 강남구 압구정로 152)의 콘텐츠 에디터다. 회원권 매수·매도를 고려하는 개인·법인 독자를 위해 한국어로 글을 쓴다.

## 원칙
${search ? '1. 웹검색으로 최신 제도·세율·시장 정보를 확인한 뒤 작성한다. 확인된 수치만 쓰고, 출처 URL을 남긴다. 특정 골프장의 회원권 가격은 검색값이 아니라 "하나회원권거래소 시세표 기준"으로만 언급한다(사용자 프롬프트에 주어진 값만 사용).' : '1. 웹검색 불가. 확실한 일반 정보 위주로 쓰고 세율·수치는 "최신 규정 확인 필요"를 명시한다. 회원권 가격은 프롬프트에 주어진 값만 쓴다.'}
2. AI 답변엔진과 검색엔진이 인용하기 쉬운 구조: 첫 문단은 질문에 대한 직답(BLUF) 2~3문장. 소제목(h2)은 독자가 실제로 검색할 질문형 문장. 각 h2 아래 첫 문장이 곧바로 답이 되게 쓴다.
3. 목록은 <ul><li>, 비교는 <table>. 단정적 투자 권유·수익 보장·과장 표현 금지. 세무·법률은 전문가 확인 권고 문구 포함.
4. 다른 사이트 문장을 그대로 복제하지 않는다. 경쟁 거래소를 비방하지 않는다.
5. 말미에 하나회원권거래소 상담(02-583-0583, /apply) CTA 1개만.
6. 분량 1,200~2,000자. 마지막에 FAQ 3개(h3 "자주 묻는 질문" 아래 h4 질문 + p 답변).

## 출력
설명 없이 아래 JSON 하나만 \`\`\`json 코드펜스로 출력:
{"title":"검색 키워드를 담은 32자 내외 제목","slug":"english-url-slug","meta_description":"120~150자 요약","excerpt":"목록용 2문장","tags":["태그1","태그2","태그3"],"body_html":"<p>직답…</p><h2>질문형 소제목</h2>…<h3>자주 묻는 질문</h3><h4>Q</h4><p>A</p>…","faq":[{"q":"질문","a":"답"}],"source_urls":["https://…"]}`;

function priceContext() {
  const g = prices.stats('golf');
  return `[하나회원권거래소 시세표 요약 — 오늘 ${kstDate()}] 골프 ${g.total}종목, 상승 ${g.up}/하락 ${g.down}/보합 ${g.flat}, 평균 ${g.avg}만원. 상승 상위: ${g.topUp.slice(0, 3).map(r => `${r.name} ${r.today}만원(+${r.pct}%)`).join(', ')}. 하락 상위: ${g.topDown.slice(0, 3).map(r => `${r.name} ${r.today}만원(${r.pct}%)`).join(', ')}. 최고가: ${g.max.slice(0, 3).map(r => `${r.name} ${r.today}만원`).join(', ')}.`;
}

async function llmArticle({ type, topic, hint, club }) {
  const cfg = getLlmConfig();
  const avoid = recentTitles();
  let user = `유형: ${TYPE_LABEL[type]}\n주제: "${topic}"\n힌트: ${hint || '없음'}\n${priceContext()}\n`;
  if (club) user += `골프장 정보(확인된 것만): 이름 ${club.name}, 권역 ${club.region || '미상'}, 주소 ${club.address || '미상'}${club.verified && club.holes ? ', 홀수 ' + club.holes : ''}. 시세: ${club.price_name ? (prices.byName('golf', club.price_name)?.today || '미상') + '만원(하나회원권거래소 기준)' : '미상'}. 확인되지 않은 코스 상세(설계자·홀 구성·연혁)는 지어내지 말 것.\n`;
  if (avoid.length) user += `최근 제목과 중복 금지:\n- ${avoid.slice(0, 20).join('\n- ')}\n`;
  user += '위 형식의 JSON을 출력하라.';
  const { text, sources } = await runLLM(cfg, { system: SYSTEM(cfg.supportsSearch), user });
  const j = extractJson(text);
  if (!j || !j.title || !j.body_html) throw new Error('LLM 응답에서 글 JSON을 추출하지 못했습니다.');
  return { ...j, source_urls: [...new Set([...(j.source_urls || []), ...sources])], model: `${cfg.provider}/${cfg.model}` };
}

// 글 저장 + 발행 + 인블로그
function savePost(art, { type, source, slot, model, autoPublish }) {
  const ts = now();
  const slug = uniqueSlug(slugify(art.slug, 'post-' + ts.toString(36)));
  const status = autoPublish ? 'published' : 'draft';
  const info = db.prepare(`INSERT INTO posts (kind,type,slug,title,excerpt,meta_description,body_html,tags,status,source,model,gen_slot,source_urls,published_at,created_at,updated_at)
    VALUES ('blog',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(type, slug, truncate(art.title, 120), art.excerpt || truncate(stripHtml(art.body_html), 160), truncate(art.meta_description || art.excerpt || '', 160),
    sanitizeHtml(art.body_html), Array.isArray(art.tags) ? art.tags.join(',') : (art.tags || ''), status, source, model || null, slot || 'manual', JSON.stringify(art.source_urls || []), autoPublish ? ts : null, ts, ts);
  return db.prepare('SELECT * FROM posts WHERE id=?').get(info.lastInsertRowid);
}

async function pushToInblog(post) {
  if (!inblog.enabled() || getSetting('inblog_push', '1') !== '1') return { skipped: true };
  const site = settings.siteUrl();
  const faqLd = (() => { try { const f = JSON.parse(post.faq_json || '[]'); return f.length ? JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: f.map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) }) : null; } catch (_) { return null; } })();
  try {
    let res;
    const payload = { title: post.title, slug: post.slug, content_html: post.body_html + `<p><em>원문: <a href="${site}/blog/${post.slug}">${site}/blog/${post.slug}</a></em></p>`, meta_description: post.meta_description, description: post.excerpt, canonical_url: `${site}/blog/${post.slug}`, published: post.status === 'published', cta_text: '회원권 매매 상담 신청', cta_link: `${site}/apply`, json_ld: faqLd };
    if (post.inblog_id) res = await inblog.updatePost(post.inblog_id, { title: payload.title, content_html: payload.content_html, meta_description: payload.meta_description, description: payload.description, canonical_url: payload.canonical_url });
    else res = await inblog.createPost(payload);
    if (post.status === 'published' && res && !res.published) { try { await inblog.publish(res.id); } catch (_) { /* 이미 published 일 수 있음 */ } }
    const url = res ? (settings.cfg('inblog_url') ? settings.cfg('inblog_url').replace(/\/$/, '') + '/' + (res.slug || post.slug) : '') : '';
    db.prepare('UPDATE posts SET inblog_id=?, inblog_status=?, inblog_error=NULL, inblog_url=? WHERE id=?').run(res?.id || post.inblog_id, post.status === 'published' ? 'published' : 'draft', url, post.id);
    return { ok: true, id: res?.id };
  } catch (e) {
    db.prepare('UPDATE posts SET inblog_status=?, inblog_error=? WHERE id=?').run('error', String(e.message).slice(0, 400), post.id);
    return { ok: false, error: e.message };
  }
}

// 메인 — 글 1건 생성. opts: { slot, type?, topicId?, clubId?, forceTemplate? }
async function generateOne(opts = {}) {
  const autoPublish = getSetting('auto_publish', '1') === '1';
  const date = kstDate();
  const type = opts.type || pickType(opts.slot || '', date);
  let art, source = 'ai', model = null, topicRow = null, club = null;

  if (type === 'report') {
    art = templates.weeklyReport({ date }); source = 'template';
    if (llmAvailable() && !opts.forceTemplate) {
      // 리포트 해설 문단을 LLM으로 보강(실패해도 템플릿 그대로 발행)
      try { const cfg = getLlmConfig(); const { text } = await runLLM(cfg, { system: '너는 회원권 시장 애널리스트다. 주어진 시세 요약만 근거로, 지어낸 수치 없이 이번 주 흐름을 3문단(각 2~3문장) 한국어 HTML(<p>)로 해설하라. 투자 권유·보장 표현 금지.', user: priceContext(), webSearch: false }); const html = sanitizeHtml(text.replace(/```html|```/g, '')); if (html.includes('<p>')) { art.body_html = art.body_html.replace('<h2>이번 주 골프회원권 시세는', `<h2>이번 주 시장 해설</h2>${html}<h2>이번 주 골프회원권 시세는`); source = 'ai'; model = `${cfg.provider}/${cfg.model}`; } } catch (_) { /* 템플릿 유지 */ }
    }
  } else if (type === 'club') {
    club = opts.clubId ? db.prepare('SELECT * FROM clubs WHERE id=?').get(opts.clubId) : nextClub();
    if (!club) throw new Error('소개글이 필요한 골프장이 없습니다.');
    if (llmAvailable() && !opts.forceTemplate) {
      const r = await llmArticle({ type, topic: `${club.name} 회원권 완전 가이드 — 시세·입회 조건·적합한 매수자`, hint: '상단 요약(직답) → 누구에게 맞는가 → 매수 전 확인사항 → 시세 흐름 읽는 법 → FAQ. 코스 세부(설계자·홀 구성)는 확인된 정보 없으면 언급 금지.', club });
      art = r; model = r.model;
      db.prepare("UPDATE clubs SET body_html=?, summary=COALESCE(NULLIF(summary,''),?), faq_json=COALESCE(NULLIF(faq_json,''),?), ai_generated=1, updated_at=? WHERE id=?")
        .run(sanitizeHtml(r.body_html), truncate(stripHtml(r.excerpt || r.meta_description || ''), 200), JSON.stringify(r.faq || []), now(), club.id);
    } else {
      const d = templates.clubDraft(club); source = 'template';
      db.prepare("UPDATE clubs SET summary=?, body_html=?, faq_json=?, fit_for=COALESCE(NULLIF(fit_for,''),?), booking=COALESCE(NULLIF(booking,''),?), transfer=COALESCE(NULLIF(transfer,''),?), updated_at=? WHERE id=?")
        .run(d.summary, d.body_html, d.faq_json, d.fit_for, d.booking, d.transfer, now(), club.id);
      art = { title: `${club.name} 회원권 시세와 매수 가이드`, slug: `club-guide-${koSlug(club.name)}`, meta_description: truncate(d.summary, 155), excerpt: truncate(d.summary, 160), tags: [club.name, '골프회원권', club.region || '골프장'], body_html: `<p class="bluf">${d.summary}</p>${d.body_html}<p>상세 정보: <a href="/golf/${club.slug}">${club.name} 소개 페이지</a></p>`, faq: JSON.parse(d.faq_json) };
    }
  } else {
    if (!llmAvailable()) throw new Error('LLM API 키가 없어 가이드/트렌드 글을 생성할 수 없습니다. 관리자 → 설정에서 키를 입력하세요.');
    topicRow = opts.topicId ? db.prepare('SELECT * FROM topic_pool WHERE id=?').get(opts.topicId) : pickTopic(type);
    if (!topicRow) throw new Error(`${TYPE_LABEL[type]} 주제 풀이 비어 있습니다.`);
    const r = await llmArticle({ type, topic: topicRow.topic, hint: topicRow.hint });
    art = r; model = r.model; markTopic(topicRow.id);
  }

  const post = savePost(art, { type, source, slot: opts.slot, model, autoPublish });
  if (art.faq) db.prepare('UPDATE posts SET source_urls=? WHERE id=?').run(JSON.stringify({ sources: art.source_urls || [], faq: art.faq }), post.id);
  const full = db.prepare('SELECT * FROM posts WHERE id=?').get(post.id);
  full.faq_json = JSON.stringify(art.faq || []);
  const ib = await pushToInblog(full);
  return { post: db.prepare('SELECT * FROM posts WHERE id=?').get(post.id), autoPublished: autoPublish, inblog: ib, type };
}

module.exports = { generateOne, pushToInblog, TYPE_LABEL, nextClub, pickType };
