'use strict';
// 자체 기술 감사 — 진단보고서(2026-09-02)에서 실패한 항목을 매주 자동 재점검.
// 서버 내부에서 자기 페이지를 렌더해 검사하므로 외부 네트워크 불필요.
const { db } = require('../db');
const { now, kstDate } = require('./util');

function checkPage(html, path) {
  const get = (re) => { const m = html.match(re); return m ? m[1].trim() : ''; };
  const title = get(/<title>([^<]*)<\/title>/i);
  const desc = get(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const canonical = get(/<link\s+rel="canonical"\s+href="([^"]*)"/i);
  const h1 = get(/<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, '').trim();
  const jsonld = (html.match(/<script type="application\/ld\+json">/g) || []).length;
  const qHeads = (html.match(/<h[23][^>]*>[^<]*(?:나요|까요|인가요|무엇|어떻게|왜|얼마|언제|\?)[^<]*<\/h[23]>/g) || []).length;
  const uls = (html.match(/<ul[\s>]/g) || []).length;
  const words = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  return { path, title, desc, canonical, h1, jsonld, qHeads, uls, chars: words };
}

// render: (path) => html  — server.js가 주입
async function run(render, siteUrl) {
  const paths = ['/', '/market/golf', '/market/condo', '/guide/golf', '/faq', '/about', '/blog', '/apply'];
  const club = db.prepare("SELECT slug FROM clubs WHERE status='published' ORDER BY id LIMIT 1").get();
  if (club) paths.push('/golf/' + encodeURIComponent(club.slug));
  const post = db.prepare("SELECT slug FROM posts WHERE kind='blog' AND status='published' ORDER BY published_at DESC LIMIT 1").get();
  if (post) paths.push('/blog/' + post.slug);
  const pages = [];
  for (const p of paths) { try { pages.push(checkPage(await render(p), p)); } catch (e) { pages.push({ path: p, error: e.message }); } }

  const items = [];
  const add = (key, label, ok, detail, weight = 1) => items.push({ key, label, ok: !!ok, detail, weight });
  const okPages = pages.filter(p => !p.error);
  const titles = okPages.map(p => p.title);
  add('title_unique', '페이지별 고유 title', new Set(titles).size === titles.length && titles.every(t => t.length >= 10), `${new Set(titles).size}/${titles.length} 고유, 평균 ${Math.round(titles.reduce((a, t) => a + t.length, 0) / (titles.length || 1))}자`, 2);
  add('desc', 'meta description 페이지별 고유·50자 이상', okPages.every(p => p.desc.length >= 50) && new Set(okPages.map(p => p.desc)).size === okPages.length, `${okPages.filter(p => p.desc.length >= 50).length}/${okPages.length}`, 2);
  add('canonical', 'canonical이 자기 URL을 가리킴', okPages.every(p => p.canonical === siteUrl + (p.path === '/' ? '/' : p.path.replace(/\/$/, ''))), okPages.filter(p => p.canonical !== siteUrl + (p.path === '/' ? '/' : p.path)).map(p => p.path).join(', ') || '전 페이지 정상', 2);
  add('h1', 'H1 텍스트 존재', okPages.every(p => p.h1.length > 1), okPages.filter(p => !p.h1).map(p => p.path).join(', ') || '전 페이지 정상');
  add('jsonld', '원시 HTML JSON-LD 존재(전 페이지)', okPages.every(p => p.jsonld >= 1), `홈 ${okPages[0]?.jsonld || 0}개 등`, 3);
  add('faq_schema', '홈·FAQ 페이지 FAQPage 스키마', (await render('/')).includes('"FAQPage"') && (await render('/faq')).includes('"FAQPage"'), '', 2);
  add('org_schema', 'Organization/LocalBusiness + sameAs', /"Organization"/.test(await render('/')) && /"@id":"[^"]*#org"/.test(await render('/')) && (await render('/')).includes('"sameAs"'), '', 2);
  add('dataset', '시세 페이지 Dataset 스키마', (await render('/market/golf')).includes('"Dataset"'), '', 1);
  add('qheads', '질문형 소제목(H2/H3) 페이지당 3개 이상', okPages.filter(p => p.qHeads >= 3).length >= Math.ceil(okPages.length * 0.6), okPages.map(p => `${p.path}:${p.qHeads}`).join(' '), 2);
  add('sitemap', 'sitemap.xml 유효(URL 50개 이상)', ((await render('/sitemap.xml')).match(/<loc>/g) || []).length >= 50, `${((await render('/sitemap.xml')).match(/<loc>/g) || []).length} URL`, 2);
  add('robots', 'robots.txt에 Sitemap 지시어 + AI봇 허용', /Sitemap:/.test(await render('/robots.txt')) && /GPTBot/.test(await render('/robots.txt')), '', 1);
  add('llms', 'llms.txt 제공', (await render('/llms.txt')).startsWith('# '), '', 1);
  add('rss', 'RSS 피드 제공', (await render('/rss.xml')).includes('<rss'), '', 1);
  add('content_depth', '본문 2,000자 이상 페이지 비율 60%↑', okPages.filter(p => p.chars >= 2000).length >= Math.ceil(okPages.length * 0.6), okPages.map(p => `${p.path}:${p.chars}`).join(' '), 1);
  const updated = db.prepare('SELECT MAX(updated_at) m FROM prices').get().m || 0;
  add('price_fresh', '시세 갱신 7일 이내', now() - updated < 8 * 86400, `마지막 갱신 ${new Date(updated * 1000).toISOString().slice(0, 10)}`, 1);

  const maxW = items.reduce((a, i) => a + i.weight, 0);
  const score = Math.round(items.reduce((a, i) => a + (i.ok ? i.weight : 0), 0) / maxW * 100);
  const result = { date: kstDate(), score, items, pages };
  db.prepare('INSERT INTO audits (date,score,json,created_at) VALUES (?,?,?,?)').run(result.date, score, JSON.stringify(result), now());
  return result;
}
function latest() { const r = db.prepare('SELECT * FROM audits ORDER BY id DESC LIMIT 1').get(); return r ? JSON.parse(r.json) : null; }
function history(n = 12) { return db.prepare('SELECT date, score FROM audits ORDER BY id DESC LIMIT ?').all(n).reverse(); }

module.exports = { run, latest, history };
