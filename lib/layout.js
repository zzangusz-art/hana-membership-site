'use strict';
// 공통 레이아웃 — SEO/AEO/GEO 필수 요소를 모든 페이지에 강제:
// 고유 title/description · self canonical · OG/Twitter · 원시 HTML JSON-LD · BreadcrumbList · 시맨틱 nav/main/footer
const settings = require('./settings');
const { esc, attr } = require('./util');

let ASSET_STAMP = String(Date.now()).slice(-6);
function setStamp(s) { ASSET_STAMP = s; }

const NAV = [
  { label: '회원권 시세', href: '/market/golf', children: [
    { label: '골프회원권 시세', href: '/market/golf' }, { label: '법인회원권 시세', href: '/market/corporate' }, { label: '콘도회원권 시세', href: '/market/condo' }, { label: '피트니스회원권 시세', href: '/market/fitness' }] },
  { label: '골프장 소개', href: '/golf', children: [
    { label: '골프장별 회원권 안내', href: '/golf' }, { label: '수도권 골프장', href: '/golf?region=수도권' }, { label: '영남권 골프장', href: '/golf?region=영남' }, { label: '강원·충청·제주', href: '/golf?region=강원' }] },
  { label: '회원권 안내', href: '/guide/golf', children: [
    { label: '골프회원권 안내', href: '/guide/golf' }, { label: '콘도회원권 안내', href: '/guide/condo' }, { label: '피트니스회원권 안내', href: '/guide/fitness' }, { label: '거래 절차·수수료', href: '/guide/process' }, { label: '자주 묻는 질문', href: '/faq' }] },
  { label: '매물·전용관', href: '/listings', children: [
    { label: '회원권 매물', href: '/listings' }, { label: '무기명 전용관', href: '/exclusive/anonymous' }, { label: '대명리조트 전용관', href: '/exclusive/daemyung' }, { label: '선불카드 전용관', href: '/exclusive/prepaid' }, { label: '회원권 분양·해외투어', href: '/listings?category=sale' }] },
  { label: '시세 리포트·가이드', href: '/blog', children: [
    { label: '전체 글', href: '/blog' }, { label: '주간 시세 리포트', href: '/blog?type=report' }, { label: '거래 가이드·FAQ', href: '/blog?type=guide' }, { label: '골프장 소개', href: '/blog?type=club' }, { label: '시장 동향', href: '/blog?type=trend' }] },
  { label: '커뮤니티', href: '/notice', children: [
    { label: '공지사항', href: '/notice' }, { label: '회원권 뉴스', href: '/news' }, { label: '유튜브', href: '/videos' }] },
  { label: '회사소개', href: '/about', children: [
    { label: '하나회원권거래소 소개', href: '/about' }, { label: '연혁·실적', href: '/about/history' }, { label: '찾아오시는 길', href: '/about/location' }, { label: '채용 안내', href: '/about/careers' }] },
];

function orgLd() {
  const s = settings.all(); const site = settings.siteUrl();
  const sameAs = [s.youtube, s.naver_blog, s.instagram, s.inblog_url, s.kakao_channel].filter(Boolean);
  return {
    '@context': 'https://schema.org', '@type': ['Organization', 'LocalBusiness'], '@id': site + '/#org',
    name: s.site_name, legalName: s.legal_name, alternateName: [s.en_name, '하나회원권', 'Hana Membership Exchange', '하나마켓'],
    url: site + '/', logo: site + '/img/logo.png', image: site + '/img/og.png',
    description: `${s.legal_name}는 2004년 설립된 골프회원권·콘도회원권·피트니스회원권 매매 중개 및 컨설팅 전문기업입니다. 매주 갱신되는 회원권 시세, 매물, 명의개서 대행, 신규 분양, 해외 골프투어 서비스를 제공합니다.`,
    foundingDate: s.founded, founder: { '@type': 'Person', name: s.ceo }, telephone: '+82-' + s.phone.replace(/^0/, ''), faxNumber: '+82-' + s.fax.replace(/^0/, ''), email: s.email,
    address: { '@type': 'PostalAddress', streetAddress: '압구정로 152 극동타워 A동 401호', addressLocality: '강남구', addressRegion: '서울특별시', addressCountry: 'KR' },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' }],
    areaServed: 'KR', priceRange: '₩₩₩', vatID: s.biz_no, taxID: s.biz_no,
    knowsAbout: ['골프회원권 시세', '골프회원권 매매', '콘도회원권', '피트니스회원권', '법인회원권', '무기명 회원권', '회원권 명의개서', '골프장 회원권 분양', '해외 골프투어'],
    hasOfferCatalog: { '@type': 'OfferCatalog', name: '회원권 서비스', itemListElement: ['회원권 상담', '회원권 매매 중개', '회원권 분양', '예약 알선', '해외 골프투어'].map(n => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: n } })) },
    sameAs, contactPoint: [{ '@type': 'ContactPoint', telephone: '+82-' + s.phone.replace(/^0/, ''), contactType: 'sales', areaServed: 'KR', availableLanguage: 'ko', hoursAvailable: '24시간 상담' }],
  };
}
function websiteLd() {
  const s = settings.all(); const site = settings.siteUrl();
  return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': site + '/#website', url: site + '/', name: s.site_name, inLanguage: 'ko-KR', publisher: { '@id': site + '/#org' },
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: site + '/market/golf?q={search_term_string}' }, 'query-input': 'required name=search_term_string' } };
}
function breadcrumbLd(items) {
  const site = settings.siteUrl();
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: '홈', href: '/' }, ...items].map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: site + it.href })) };
}
function faqLd(faqs) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}

function navHtml(current) {
  return `<nav class="nav" aria-label="주 메뉴"><ul class="nav-list">${NAV.map(n => {
    const active = current && (current === n.href || n.children.some(c => current === c.href.split('?')[0]) || (n.href === '/golf' && current.startsWith('/golf')) || (n.href === '/blog' && current.startsWith('/blog')) || (n.href === '/market/golf' && current.startsWith('/market')));
    return `<li class="nav-item${active ? ' active' : ''}"><a href="${n.href}">${n.label}</a><ul class="sub">${n.children.map(c => `<li><a href="${c.href}">${c.label}</a></li>`).join('')}</ul></li>`;
  }).join('')}</ul></nav>`;
}

function page({ title, description, path, jsonld = [], body, breadcrumbs = [], ogImage, noindex = false, bodyClass = '', extraHead = '', dateModified }) {
  const s = settings.all(); const site = settings.siteUrl();
  const url = site + (path === '/' ? '/' : path.replace(/\/$/, ''));
  const fullTitle = title.includes(s.site_name) ? title : `${title} | ${s.site_name}`;
  const ld = [orgLd(), websiteLd(), ...(breadcrumbs.length ? [breadcrumbLd(breadcrumbs)] : []), ...jsonld];
  const og = ogImage || site + '/img/og.png';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${attr(description)}">
<link rel="canonical" href="${attr(url)}">
${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">'}
<meta property="og:type" content="website"><meta property="og:site_name" content="${attr(s.site_name)}"><meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${attr(fullTitle)}"><meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(url)}"><meta property="og:image" content="${attr(og)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${attr(fullTitle)}"><meta name="twitter:description" content="${attr(description)}"><meta name="twitter:image" content="${attr(og)}">
${dateModified ? `<meta property="article:modified_time" content="${attr(dateModified)}">` : ''}
${s.naver_verification ? `<meta name="naver-site-verification" content="${attr(s.naver_verification)}">` : ''}
${s.google_verification ? `<meta name="google-site-verification" content="${attr(s.google_verification)}">` : ''}
<meta name="theme-color" content="#1f3a73">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/img/icon-32.png"><link rel="apple-touch-icon" href="/img/icon-180.png"><link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${attr(s.site_name)} 시세 리포트·가이드" href="${site}/rss.xml">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="/css/site.css?v=${ASSET_STAMP}">
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
${s.ga_id ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${attr(s.ga_id)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${attr(s.ga_id)}');</script>` : ''}
${extraHead}
</head>
<body class="${attr(bodyClass)}">
<a class="skip" href="#main">본문 바로가기</a>
<header class="header" id="header">
  <div class="topbar"><div class="wrap"><span>📞 ${esc(s.phone)} · 24시간 상담</span><span class="tb-right"><a href="${attr(s.youtube)}" target="_blank" rel="noopener">유튜브</a><a href="/apply">매매 신청</a><a href="/about/location">오시는 길</a></span></div></div>
  <div class="wrap header-inner">
    <a class="logo" href="/" aria-label="${attr(s.legal_name)} 홈"><img src="/img/logo.png" alt="${attr(s.legal_name)} 로고" width="200" height="52"></a>
    ${navHtml(path)}
    <div class="header-cta"><a class="btn btn-call" href="tel:${attr(s.phone)}">${esc(s.phone)}</a><a class="btn btn-primary" href="/apply">매매 신청</a></div>
    <button class="burger" id="burger" aria-label="메뉴 열기" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>
  <div class="mobile-nav" id="mobileNav">${NAV.map(n => `<details><summary>${n.label}</summary><ul>${n.children.map(c => `<li><a href="${c.href}">${c.label}</a></li>`).join('')}</ul></details>`).join('')}<a class="btn btn-primary block" href="/apply">매매 신청</a></div>
</header>
${breadcrumbs.length ? `<div class="wrap"><ol class="crumbs" aria-label="현재 위치"><li><a href="/">홈</a></li>${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1 ? `<li aria-current="page">${esc(b.name)}</li>` : `<li><a href="${attr(b.href)}">${esc(b.name)}</a></li>`).join('')}</ol></div>` : ''}
<main id="main">
${body}
</main>
<section class="cta-band"><div class="wrap cta-inner"><div><h2>회원권 매수·매도, 시세부터 명의개서까지 한 번에</h2><p>2004년부터 이어온 거래 경험으로 정확한 시세를 제시하고, 계약·명의개서·등록 완료 후 부킹 문의까지 한 담당자가 끝까지 지원합니다.</p></div><div class="cta-actions"><a class="btn btn-light" href="tel:${attr(s.phone)}">📞 ${esc(s.phone)}</a><a class="btn btn-green" href="/apply">매매 신청하기</a></div></div></section>
<footer class="footer">
  <div class="wrap footer-grid">
    <div class="f-brand"><img src="/img/logo.png" alt="" width="180" height="47" loading="lazy"><p>${esc(s.legal_name)}<br>${esc(s.slogan)}</p><p class="f-social"><a href="${attr(s.youtube)}" target="_blank" rel="noopener">YouTube</a>${s.inblog_url ? `<a href="${attr(s.inblog_url)}" target="_blank" rel="noopener">블로그</a>` : ''}${s.naver_blog ? `<a href="${attr(s.naver_blog)}" target="_blank" rel="noopener">네이버 블로그</a>` : ''}${s.instagram ? `<a href="${attr(s.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}</p></div>
    <div><h3>바로가기</h3><ul><li><a href="/market/golf">골프회원권 시세</a></li><li><a href="/market/condo">콘도회원권 시세</a></li><li><a href="/golf">골프장별 회원권 안내</a></li><li><a href="/guide/process">거래 절차·수수료</a></li><li><a href="/faq">자주 묻는 질문</a></li><li><a href="/blog">시세 리포트·가이드</a></li></ul></div>
    <div><h3>회사 정보</h3><address><strong>${esc(s.legal_name)}</strong><br>대표이사 ${esc(s.ceo)} · 사업자등록번호 ${esc(s.biz_no)}<br>통신판매업신고 ${esc(s.telecom_no)}<br>${esc(s.address)}<br>전화 <a href="tel:${attr(s.phone)}">${esc(s.phone)}</a> · 팩스 ${esc(s.fax)}<br>이메일 <a href="mailto:${attr(s.email)}">${esc(s.email)}</a><br>개인정보보호책임자 ${esc(s.privacy_officer)}</address></div>
  </div>
  <div class="wrap footer-bottom"><span>© ${new Date().getFullYear()} ${esc(s.legal_name)}. All rights reserved.</span><span><a href="/privacy">개인정보처리방침</a> · <a href="/sitemap.xml">사이트맵</a> · <a href="/llms.txt">AI 크롤러 안내</a></span></div>
</footer>
<div class="float-cta"><a href="tel:${attr(s.phone)}" class="fc-call" aria-label="전화 상담">📞</a><a href="/apply" class="fc-apply">매매 신청</a><button class="fc-top" id="toTop" aria-label="맨 위로">↑</button></div>
<script src="/js/site.js?v=${ASSET_STAMP}" defer></script>
</body>
</html>`;
}

module.exports = { page, orgLd, websiteLd, breadcrumbLd, faqLd, NAV, setStamp };
