'use strict';
// 공개 페이지 ③ 블로그(시세 리포트·가이드) · 공지 · 뉴스
const express = require('express');
const { db } = require('../db');
const { page, faqLd } = require('../lib/layout');
const settings = require('../lib/settings');
const { esc, attr, kstDate, isoFromTs, fmtKoDate, truncate, stripHtml } = require('../lib/util');
const { postCard, faqHtml } = require('./pages-main');

const router = express.Router();
const TL = { club: '골프장 소개', report: '주간 시세 리포트', guide: '거래 가이드·FAQ', trend: '시장 동향' };

router.get('/blog', (req, res) => {
  const type = TL[req.query.type] ? req.query.type : '';
  const pageNo = Math.max(1, parseInt(req.query.page || '1', 10) || 1); const per = 12;
  const where = `kind='blog' AND status='published'${type ? ' AND type=?' : ''}`; const args = type ? [type] : [];
  const total = db.prepare(`SELECT COUNT(*) c FROM posts WHERE ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM posts WHERE ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`).all(...args, per, (pageNo - 1) * per);
  const pages = Math.max(1, Math.ceil(total / per));
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">시세 리포트 · 가이드</p><h1>${type ? TL[type] : '회원권 시세 리포트와 거래 가이드'} <small>${total}건</small></h1><p class="bluf">하나회원권거래소 시세 데이터로 작성하는 주간 시세 리포트, 실제 상담 질문을 정리한 거래 가이드·FAQ, 골프장별 회원권 소개, 시장 동향을 발행합니다. 매일 새 글이 올라오며 RSS로 구독할 수 있습니다.</p><div class="tabs"><a class="tab${!type ? ' active' : ''}" href="/blog">전체</a>${Object.entries(TL).map(([k, v]) => `<a class="tab${type === k ? ' active' : ''}" href="/blog?type=${k}">${v}</a>`).join('')}</div></div></section>
<section class="section"><div class="wrap"><div class="post-grid">${rows.map(postCard).join('') || '<p class="note">첫 글이 곧 발행됩니다.</p>'}</div>
${pages > 1 ? `<nav class="pager" aria-label="페이지"><ul>${Array.from({ length: pages }, (_, i) => i + 1).map(n => `<li><a class="${n === pageNo ? 'active' : ''}" href="/blog?${new URLSearchParams({ ...(type ? { type } : {}), page: n })}">${n}</a></li>`).join('')}</ul></nav>` : ''}
<p class="note">RSS: <a href="/rss.xml">/rss.xml</a>${settings.cfg('inblog_url') ? ` · 블로그: <a href="${attr(settings.cfg('inblog_url'))}" target="_blank" rel="noopener">${esc(settings.cfg('inblog_url'))}</a>` : ''}</p></div></section>`;
  res.send(page({ title: `${type ? TL[type] : '회원권 시세 리포트·거래 가이드'} ${total}건 — 매일 발행`, description: `골프회원권 주간 시세 리포트, 명의개서·세금·법인·무기명 회원권 거래 가이드, 골프장별 소개, 시장 동향 ${total}건. 하나회원권거래소 시세 데이터 기반.`, path: '/blog', body, breadcrumbs: [{ name: '시세 리포트·가이드', href: '/blog' }], jsonld: [{ '@context': 'https://schema.org', '@type': 'Blog', name: '하나회원권거래소 시세 리포트·가이드', url: settings.siteUrl() + '/blog', publisher: { '@id': settings.siteUrl() + '/#org' }, blogPost: rows.slice(0, 10).map(p => ({ '@type': 'BlogPosting', headline: p.title, url: `${settings.siteUrl()}/blog/${p.slug}`, datePublished: isoFromTs(p.published_at) })) }] }));
});

router.get('/blog/:slug', (req, res, next) => {
  const p = db.prepare("SELECT * FROM posts WHERE kind='blog' AND slug=? AND status='published'").get(req.params.slug); if (!p) return next();
  const s = settings.all(); const site = settings.siteUrl();
  let faqs = [], sources = [];
  try { const j = JSON.parse(p.source_urls || '[]'); if (Array.isArray(j)) sources = j; else { faqs = j.faq || []; sources = j.sources || []; } } catch (_) { /* no-op */ }
  const related = db.prepare("SELECT * FROM posts WHERE kind='blog' AND status='published' AND id<>? AND type=? ORDER BY published_at DESC LIMIT 4").all(p.id, p.type);
  const latest = db.prepare("SELECT * FROM posts WHERE kind='blog' AND status='published' AND id<>? ORDER BY published_at DESC LIMIT 5").all(p.id);
  const tags = (p.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const pubDate = kstDate(new Date(p.published_at * 1000)); const modDate = kstDate(new Date(p.updated_at * 1000));
  const body = `<section class="page-head post-head"><div class="wrap narrow"><p class="eyebrow"><a href="/blog?type=${attr(p.type)}">${TL[p.type] || '가이드'}</a></p><h1>${esc(p.title)}</h1><p class="post-meta"><span>작성 ${esc(p.author || '하나회원권거래소 편집팀')}</span><time datetime="${isoFromTs(p.published_at)}">발행 ${fmtKoDate(pubDate)}</time>${modDate !== pubDate ? `<time datetime="${isoFromTs(p.updated_at)}">수정 ${fmtKoDate(modDate)}</time>` : ''}</p>${p.excerpt ? `<p class="bluf">${esc(p.excerpt)}</p>` : ''}</div></section>
<section class="section"><div class="wrap club-grid2"><div class="club-main"><article class="prose post-body">${p.body_html}</article>
${sources.length ? `<div class="sources"><h3>참고 자료</h3><ul>${sources.slice(0, 8).map(u => `<li><a href="${attr(u)}" target="_blank" rel="noopener nofollow">${esc(truncate(u, 80))}</a></li>`).join('')}</ul></div>` : ''}
${tags.length ? `<p class="tags">${tags.map(t => `<a class="tag" href="/blog?type=${attr(p.type)}">#${esc(t)}</a>`).join(' ')}</p>` : ''}
<div class="author-box"><img src="/img/mark.png" alt="" width="48" height="48"><div><b>${esc(s.legal_name)} 편집팀</b><p>2004년부터 골프·콘도·피트니스 회원권 매매를 중개해 온 하나회원권거래소가 자체 시세 데이터와 상담 경험을 바탕으로 작성합니다. 세무·법률 사항은 전문가 확인을 권장합니다.</p></div></div>
${related.length ? `<h2 class="rel-h">같은 주제의 글</h2><div class="post-grid">${related.map(postCard).join('')}</div>` : ''}</div>
<aside class="club-side"><div class="side-card"><h3>매매 상담</h3><p>글에서 다룬 종목의 실제 호가와 매물을 확인해 드립니다.</p><a class="btn btn-green block" href="/apply">매매 신청</a><a class="btn btn-ghost block" href="tel:${attr(s.phone)}">${esc(s.phone)}</a></div><div class="side-card"><h3>최신 글</h3><ul class="side-list">${latest.map(x => `<li><a href="/blog/${attr(x.slug)}">${esc(x.title)}</a></li>`).join('')}</ul></div><div class="side-card"><h3>오늘의 시세</h3><a class="link" href="/market/golf">골프회원권 시세표 →</a></div></aside></div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': p.type === 'report' ? 'AnalysisNewsArticle' : 'Article', headline: p.title, description: p.meta_description || p.excerpt, url: `${site}/blog/${p.slug}`, mainEntityOfPage: `${site}/blog/${p.slug}`, datePublished: isoFromTs(p.published_at), dateModified: isoFromTs(p.updated_at), author: { '@type': 'Organization', name: s.legal_name, url: site + '/' }, publisher: { '@id': site + '/#org' }, image: site + '/img/og.png', inLanguage: 'ko-KR', keywords: tags.join(', '), articleSection: TL[p.type] || '가이드', wordCount: stripHtml(p.body_html).length, isAccessibleForFree: true }];
  if (faqs.length) ld.push(faqLd(faqs));
  res.send(page({ title: p.title, description: p.meta_description || truncate(p.excerpt || stripHtml(p.body_html), 155), path: `/blog/${p.slug}`, body, breadcrumbs: [{ name: '시세 리포트·가이드', href: '/blog' }, { name: TL[p.type] || '가이드', href: `/blog?type=${p.type}` }, { name: truncate(p.title, 30), href: `/blog/${p.slug}` }], jsonld: ld, dateModified: isoFromTs(p.updated_at), bodyClass: 'post-page' }));
});

// 공지·뉴스
for (const [kind, label, path] of [['notice', '공지사항', '/notice'], ['news', '회원권 뉴스', '/news']]) {
  router.get(path, (req, res) => {
    const rows = db.prepare("SELECT * FROM posts WHERE kind=? AND status='published' ORDER BY published_at DESC LIMIT 100").all(kind);
    const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">커뮤니티</p><h1>${label} <small>${rows.length}건</small></h1><p class="bluf">${kind === 'notice' ? '하나회원권거래소의 운영 안내, 시세 갱신, 휴무 등 공지사항입니다.' : '골프장 정책 변화, 신규 분양, 회원권 시장 이슈를 정리한 뉴스입니다.'}</p><div class="tabs"><a class="tab${kind === 'notice' ? ' active' : ''}" href="/notice">공지사항</a><a class="tab${kind === 'news' ? ' active' : ''}" href="/news">회원권 뉴스</a><a class="tab" href="/videos">유튜브</a></div></div></section>
<section class="section"><div class="wrap narrow"><ul class="board">${rows.map(r => `<li><a href="${path}/${attr(r.slug)}"><span class="b-title">${esc(r.title)}</span><time datetime="${isoFromTs(r.published_at)}">${kstDate(new Date(r.published_at * 1000))}</time></a></li>`).join('') || '<li class="note">등록된 글이 없습니다.</li>'}</ul></div></section>`;
    res.send(page({ title: `${label} ${rows.length}건 — 하나회원권거래소 ${kind === 'notice' ? '운영 안내·시세 갱신·휴무 공지' : '골프장 정책·신규 분양·시장 이슈'}`, description: kind === 'notice' ? `하나회원권거래소 공지사항 ${rows.length}건 — 시세 갱신 일정, 운영·휴무 안내, 홈페이지 변경 사항을 알려 드립니다.` : `하나회원권거래소 회원권 뉴스 ${rows.length}건 — 골프장 회원 정책 변화, 신규 회원권 분양, 콘도·피트니스 회원권 시장 이슈 브리핑.`, path, body, breadcrumbs: [{ name: '커뮤니티', href: '/notice' }, { name: label, href: path }] }));
  });
  router.get(path + '/:slug', (req, res, next) => {
    const r = db.prepare("SELECT * FROM posts WHERE kind=? AND slug=? AND status='published'").get(kind, req.params.slug); if (!r) return next();
    const body = `<section class="page-head"><div class="wrap narrow"><p class="eyebrow"><a href="${path}">${label}</a></p><h1>${esc(r.title)}</h1><p class="post-meta"><time datetime="${isoFromTs(r.published_at)}">${fmtKoDate(kstDate(new Date(r.published_at * 1000)))}</time></p></div></section><section class="section"><div class="wrap narrow"><article class="prose">${r.body_html}</article><p><a class="link" href="${path}">← ${label} 목록</a></p></div></section>`;
    res.send(page({ title: r.title, description: r.meta_description || truncate(stripHtml(r.body_html), 150), path: `${path}/${r.slug}`, body, breadcrumbs: [{ name: '커뮤니티', href: '/notice' }, { name: label, href: path }, { name: truncate(r.title, 30), href: `${path}/${r.slug}` }], jsonld: [{ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: r.title, datePublished: isoFromTs(r.published_at), dateModified: isoFromTs(r.updated_at), publisher: { '@id': settings.siteUrl() + '/#org' }, url: `${settings.siteUrl()}${path}/${r.slug}` }] }));
  });
}

module.exports = { router };
