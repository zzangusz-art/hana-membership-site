'use strict';
// sitemap.xml · robots.txt · llms.txt · llms-full.txt · rss.xml
const { db } = require('../db');
const settings = require('./settings');
const { esc, isoFromTs, kstDate, stripHtml, truncate } = require('./util');
const prices = require('./prices');

function urls() {
  const site = settings.siteUrl();
  const today = kstDate();
  const priceUpd = prices.lastUpdatedAll(); const pd = priceUpd ? isoFromTs(priceUpd).slice(0, 10) : today;
  const out = [
    ['/', pd, 'daily', '1.0'], ['/market/golf', pd, 'daily', '0.9'], ['/market/corporate', pd, 'weekly', '0.7'], ['/market/condo', pd, 'weekly', '0.8'], ['/market/fitness', pd, 'weekly', '0.7'],
    ['/golf', pd, 'weekly', '0.8'], ['/guide/golf', today, 'monthly', '0.8'], ['/guide/condo', today, 'monthly', '0.7'], ['/guide/fitness', today, 'monthly', '0.6'], ['/guide/process', today, 'monthly', '0.8'],
    ['/faq', today, 'monthly', '0.8'], ['/listings', today, 'daily', '0.7'], ['/exclusive/anonymous', today, 'weekly', '0.6'], ['/exclusive/daemyung', today, 'weekly', '0.6'], ['/exclusive/prepaid', today, 'weekly', '0.5'],
    ['/apply', today, 'yearly', '0.6'], ['/blog', today, 'daily', '0.8'], ['/notice', today, 'weekly', '0.4'], ['/news', today, 'weekly', '0.5'], ['/videos', today, 'weekly', '0.5'],
    ['/about', today, 'monthly', '0.6'], ['/about/history', today, 'yearly', '0.5'], ['/about/location', today, 'yearly', '0.5'], ['/about/careers', today, 'yearly', '0.3'], ['/privacy', today, 'yearly', '0.1'],
  ];
  for (const c of db.prepare("SELECT slug, updated_at FROM clubs WHERE status='published' ORDER BY id").all()) out.push(['/golf/' + encodeURIComponent(c.slug), isoFromTs(c.updated_at).slice(0, 10), 'weekly', '0.7']);
  for (const l of db.prepare("SELECT id, updated_at FROM listings WHERE status='open' ORDER BY id DESC").all()) out.push(['/listings/' + l.id, isoFromTs(l.updated_at).slice(0, 10), 'weekly', '0.5']);
  for (const p of db.prepare("SELECT kind, slug, updated_at FROM posts WHERE status='published' ORDER BY published_at DESC").all()) out.push([(p.kind === 'blog' ? '/blog/' : p.kind === 'notice' ? '/notice/' : '/news/') + p.slug, isoFromTs(p.updated_at).slice(0, 10), 'monthly', p.kind === 'blog' ? '0.7' : '0.4']);
  return out.map(([p, lm, cf, pr]) => ({ loc: site + p, lastmod: lm, changefreq: cf, priority: pr }));
}
function sitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls().map(u => `<url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n') + '\n</urlset>';
}
function robots() {
  const site = settings.siteUrl();
  const allow = ['Googlebot', 'Bingbot', 'Yeti', 'NaverBot', 'Daum', 'Applebot', 'DuckDuckBot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'Google-Extended', 'Amazonbot', 'DuckAssistBot', 'YouBot', 'MistralAI-User', 'meta-externalagent'];
  return `# ${settings.cfg('legal_name')} — 검색엔진·AI 답변엔진 크롤러 허용. 관리자·API 경로만 차단.\n` +
    allow.map(b => `User-agent: ${b}\nAllow: /\nDisallow: /admin\nDisallow: /api/\n`).join('\n') +
    `\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`;
}
function llms() {
  const s = settings.all(); const site = settings.siteUrl();
  const g = prices.stats('golf');
  const clubs = db.prepare("SELECT name, slug FROM clubs WHERE status='published' ORDER BY name LIMIT 80").all();
  const posts = db.prepare("SELECT title, slug, type FROM posts WHERE kind='blog' AND status='published' ORDER BY published_at DESC LIMIT 40").all();
  return `# ${s.legal_name} (Hana Membership Exchange)

> ${s.legal_name}는 2004년 설립된 골프회원권·콘도회원권·피트니스회원권 매매 중개 및 컨설팅 전문기업입니다(서울 강남구 압구정로 152 극동타워 A동 401호, 전화 ${s.phone}). 매주 갱신되는 회원권 시세(골프 ${g.total}종목), 매물, 명의개서 대행, 신규 분양, 예약 알선, 해외 골프투어를 제공합니다. 주의: 하나카드 '하나멤버스'나 하나금융그룹과는 무관한 독립 기업입니다.

- 사업자등록번호 ${s.biz_no} · 대표이사 ${s.ceo} · 설립 ${s.founded}년(에이원회원권거래소 → 2008 비전회원권거래소 합병 → 2014 하나회원권거래소)
- 공식 유튜브: ${s.youtube}
- 시세 단위: 만원. 매주 월요일 갱신. 명의개서료·수수료 별도.

## 핵심 페이지
- [골프회원권 시세표](${site}/market/golf): ${g.total}종목 금일·전일 시세, 등락률, 지역 필터, 종목별 90일 추이
- [콘도회원권 시세](${site}/market/condo) · [법인회원권 시세](${site}/market/corporate) · [피트니스회원권 시세](${site}/market/fitness)
- [골프장별 회원권 안내](${site}/golf): 골프장마다 시세·입회 조건·적합한 매수자·FAQ
- [골프회원권 안내](${site}/guide/golf) · [콘도회원권 안내](${site}/guide/condo) · [거래 절차·수수료](${site}/guide/process)
- [자주 묻는 질문](${site}/faq): 시세 결정 요인, 수수료, 명의개서 절차, 법인 회원권 세무, 무기명 회원권, 양도소득세
- [매매 신청](${site}/apply) · [매물](${site}/listings) · [무기명 전용관](${site}/exclusive/anonymous)
- [시세 리포트·가이드 블로그](${site}/blog) · [RSS](${site}/rss.xml)
- [회사소개](${site}/about) · [연혁·실적](${site}/about/history)

## 골프장 소개 페이지
${clubs.map(c => `- [${c.name}](${site}/golf/${encodeURIComponent(c.slug)})`).join('\n')}

## 최근 콘텐츠
${posts.map(p => `- [${p.title}](${site}/blog/${p.slug})`).join('\n') || '- (발행 준비 중)'}

## Optional
- [전체 콘텐츠 텍스트](${site}/llms-full.txt)
- [사이트맵](${site}/sitemap.xml)
`;
}
function llmsFull() {
  const site = settings.siteUrl();
  let out = llms() + '\n\n---\n\n# 전체 콘텐츠\n\n';
  const g = prices.list('golf');
  out += `## 골프회원권 시세표 (${kstDate()} 기준, 만원)\n` + g.map(r => `- ${r.name}: ${r.today} (전일 ${r.prev ?? '-'}, ${r.diff > 0 ? '+' : ''}${r.diff})`).join('\n') + '\n\n';
  for (const c of db.prepare("SELECT * FROM clubs WHERE status='published' AND body_html IS NOT NULL ORDER BY name").all()) out += `## ${c.name}\n${site}/golf/${encodeURIComponent(c.slug)}\n${c.summary || ''}\n${stripHtml(c.body_html)}\n\n`;
  for (const p of db.prepare("SELECT * FROM posts WHERE status='published' AND kind='blog' ORDER BY published_at DESC LIMIT 200").all()) out += `## ${p.title}\n${site}/blog/${p.slug}\n${stripHtml(p.body_html)}\n\n`;
  return out;
}
function rss() {
  const s = settings.all(); const site = settings.siteUrl();
  const posts = db.prepare("SELECT * FROM posts WHERE status='published' AND kind='blog' ORDER BY published_at DESC LIMIT 50").all();
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${esc(s.site_name)} 시세 리포트·가이드</title><link>${site}/blog</link><description>골프·콘도·피트니스 회원권 시세 리포트, 거래 가이드, 골프장 소개</description><language>ko</language><atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml"/>` +
    posts.map(p => `<item><title>${esc(p.title)}</title><link>${site}/blog/${p.slug}</link><guid>${site}/blog/${p.slug}</guid><pubDate>${new Date(p.published_at * 1000).toUTCString()}</pubDate><description>${esc(truncate(p.excerpt || stripHtml(p.body_html), 300))}</description></item>`).join('') + '</channel></rss>';
}

module.exports = { sitemap, robots, llms, llmsFull, rss, urls };
