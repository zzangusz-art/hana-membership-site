'use strict';
// 공개 페이지 ① 홈 · 시세표 · 골프장 소개
const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { page, faqLd } = require('../lib/layout');
const settings = require('../lib/settings');
const prices = require('../lib/prices');
const { esc, attr, fmtNum, fmtMan, kstDate, isoFromTs, fmtKoDate, truncate, stripHtml } = require('../lib/util');

const router = express.Router();
const FAQ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed', 'faq.json'), 'utf8'));

// ── 공용 조각 ──
function chg(r) {
  if (r.diff > 0) return `<span class="chg up">▲ ${fmtNum(r.diff)} <small>(+${r.pct}%)</small></span>`;
  if (r.diff < 0) return `<span class="chg down">▼ ${fmtNum(Math.abs(r.diff))} <small>(${r.pct}%)</small></span>`;
  return '<span class="chg flat">보합</span>';
}
function sparkline(hist, w = 120, h = 32) {
  const vals = hist.map(x => x.value).filter(v => v != null);
  if (vals.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#cfd6e3" stroke-dasharray="3 3"/></svg>`;
  const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 3 - (v - min) / span * (h - 6)).toFixed(1)}`);
  const up = vals[vals.length - 1] >= vals[0];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="${up ? '#d0342c' : '#1a63c9'}" stroke-width="2" stroke-linejoin="round" points="${pts.join(' ')}"/><circle r="2.5" cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" fill="${up ? '#d0342c' : '#1a63c9'}"/></svg>`;
}
function faqHtml(faqs, title = '자주 묻는 질문') {
  return `<section class="faq" id="faq"><h2>${esc(title)}</h2><div class="faq-list">${faqs.map((f, i) => `<details class="faq-item"${i === 0 ? ' open' : ''}><summary><h3>${esc(f.q)}</h3></summary><div class="faq-a"><p>${esc(f.a)}</p></div></details>`).join('')}</div></section>`;
}
function postCard(p) {
  const TL = { club: '골프장 소개', report: '시세 리포트', guide: '거래 가이드', trend: '시장 동향' };
  return `<article class="post-card reveal"><a href="/blog/${attr(p.slug)}"><span class="tag tag-${attr(p.type || 'guide')}">${TL[p.type] || '가이드'}</span><h3>${esc(p.title)}</h3><p>${esc(truncate(p.excerpt || stripHtml(p.body_html), 90))}</p><time datetime="${isoFromTs(p.published_at || p.created_at)}">${fmtKoDate(kstDate(new Date((p.published_at || p.created_at) * 1000)))}</time></a></article>`;
}
function datasetLd(category, rows, updated) {
  const site = settings.siteUrl(); const label = prices.CATS[category];
  return { '@context': 'https://schema.org', '@type': 'Dataset', name: `${label} 시세표, 하나회원권거래소`, description: `${label} ${rows.length}종목의 금일·전일 시세(만원)와 등락률. 하나회원권거래소가 실거래·호가를 반영해 매주 갱신하는 1차 데이터.`, url: `${site}/market/${category}`, creator: { '@id': site + '/#org' }, license: `${site}/privacy`, dateModified: updated ? isoFromTs(updated).slice(0, 10) : kstDate(), temporalCoverage: `${kstDate()}`, spatialCoverage: '대한민국', keywords: [`${label} 시세`, '회원권 시세', '골프회원권 시세', '회원권 매매'], variableMeasured: ['금일시세', '전일시세', '등락률'], isAccessibleForFree: true, distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${site}/api/prices/${category}` }] };
}

// ── 홈 ──
router.get('/', (req, res) => {
  const s = settings.all();
  const g = prices.stats('golf'); const all = prices.list('golf');
  const updated = g.lastUpdated ? kstDate(new Date(g.lastUpdated * 1000)) : kstDate();
  const posts = db.prepare("SELECT * FROM posts WHERE kind='blog' AND status='published' ORDER BY published_at DESC LIMIT 3").all();
  const videos = db.prepare('SELECT * FROM videos ORDER BY sort, id DESC LIMIT 3').all();
  const clubCount = db.prepare("SELECT COUNT(*) c FROM clubs WHERE status='published'").get().c;
  const featured = db.prepare("SELECT * FROM listings WHERE status='open' ORDER BY featured DESC, id DESC LIMIT 4").all();
  const years = new Date().getFullYear() - 2004;
  const ticker = all.slice().sort(() => 0.5 - Math.random()).slice(0, 28);
  const SLIDES = [
    { key: 'golf', icon: '⛳', kicker: '프리미엄 골프 라이프 · 2004년부터', tab: '프리미엄 골프 라이프', title: '골프회원권 <span class="hl">시세 조회·구매·매입</span>, 한 곳에서', sub: `골프회원권 ${g.total}종목 시세, 매주 월요일 갱신`, lead: '매도자가 부르는 값과 실제 계약된 값은 다릅니다. 시세표는 그 둘을 같이 보고 만듭니다. 골프장 회원권 거래는 상담한 담당자가 계약과 명의개서 접수까지 그대로 맡습니다.', href: '/market/golf', img: '/img/hero/golf.jpg', bg: '/img/hero/golf-bg.jpg' },
    { key: 'condo', icon: '🏔️', kicker: '콘도·리조트 회원권', tab: '휴식과 힐링의 콘도', title: '휴식과 힐링의 <span class="hl">콘도</span>', sub: '공유제인지 회원제인지부터 확인하세요', lead: '등기가 되는 공유제와 입회금을 맡기는 회원제는 세금도, 되팔 때도 다릅니다. 가족 휴가용인지 법인 복지용인지 말씀해 주시면 맞는 쪽을 골라 드립니다.', href: '/market/condo', img: '/img/hero/condo.jpg', bg: '/img/hero/condo-bg.jpg' },
    { key: 'fitness', icon: '🏋️', kicker: '피트니스 회원권', tab: '건강한 피트니스 라이프', title: '건강한 <span class="hl">피트니스 라이프</span>', sub: '호텔 피트니스 개인·부부 회원권', lead: '호텔마다 양도 승인 기간과 연회비가 다릅니다. 시세표에서 확인하시고 매매 신청을 남기시면 당일 연락드립니다.', href: '/market/fitness', img: '/img/hero/fitness.jpg', bg: '/img/hero/fitness-bg.jpg' },
  ];
  const tickerHtml = ticker.map(r => `<span class="tk"><b>${esc(r.name)}</b> ${fmtNum(r.today)} ${chg(r)}</span>`).join('');
  const faqs = FAQ.slice(0, 6);

  const body = `
<section class="hero hero-slider" aria-roledescription="carousel" aria-label="하나회원권거래소 대표 상품">
  <div class="hero-bg" aria-hidden="true"><span class="hero-spot"></span></div>
  <div class="slides" id="heroSlides">
    ${SLIDES.map((sl, i) => `<article class="slide${i === 0 ? ' active' : ''}" data-i="${i}" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${SLIDES.length}: ${attr(sl.title)}"${i ? ' aria-hidden="true"' : ''}><div class="slide-bg" style="background-image:url('${sl.bg}')"></div><div class="slide-shade"></div>
      <div class="wrap slide-inner"><div class="slide-photo" aria-hidden="true"><img src="${sl.img}" alt="" width="640" height="716" ${i ? 'loading="lazy"' : ''}></div><div class="slide-copy"><p class="eyebrow">${esc(sl.kicker)}</p>${i === 0 ? '<h1>' : '<h2 class="h1">'}${sl.title}${i === 0 ? '</h1>' : '</h2>'}<p class="slide-sub">${esc(sl.sub)}</p><p class="lead">${sl.lead}</p>
      <div class="hero-actions"><a class="btn btn-light magnet" href="${sl.href}">자세히 보기</a><a class="btn btn-green magnet" href="/apply">매매 신청</a><a class="btn btn-ghost magnet" href="tel:${attr(s.phone)}">📞 ${esc(s.phone)}</a></div></div></div></article>`).join('')}
    <div class="sl-dots" role="tablist" aria-label="배너 선택">${SLIDES.map((sl, i) => `<button type="button" class="sl-dot${i === 0 ? ' active' : ''}" role="tab" aria-selected="${i === 0}" data-i="${i}" aria-label="${attr(sl.tab)}"><i></i></button>`).join('')}</div><button type="button" class="sl-arrow prev" id="heroPrev" aria-label="이전 배너">‹</button><button type="button" class="sl-arrow next" id="heroNext" aria-label="다음 배너">›</button>
  </div>
  <form class="hero-search tilt" data-tilt="4" action="/market/golf" method="get" role="search"><label class="sr" for="q">종목 검색</label><input id="q" name="q" type="search" placeholder="골프장·회원권명 검색 (예: 아시아나, 남촌, 신원)" autocomplete="off" list="club-list"><datalist id="club-list">${all.slice(0, 120).map(r => `<option value="${attr(r.name)}">`).join('')}</datalist><button class="btn btn-primary" type="submit">시세 확인</button></form>
  <div class="ticker" aria-label="오늘의 시세 흐름"><div class="ticker-track">${tickerHtml}${tickerHtml}</div></div>
</section>

<section class="section market-hl">
  <div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">시세 하이라이트</p><h2>이번 주 골프회원권 시세</h2></div><a class="link" href="/market/golf">전체 시세표 →</a></div>
    <p class="bluf">${updated} 기준 집계 ${g.total}종목 중 <b class="up">상승 ${g.up}</b> · <b class="down">하락 ${g.down}</b> · 보합 ${g.flat}. 평균 시세 ${fmtMan(g.avg)}${g.topUp[0] ? `, 상승률 1위 ${esc(g.topUp[0].name)} (+${g.topUp[0].pct}%)` : ''}${g.topDown[0] ? `, 하락률 1위 ${esc(g.topDown[0].name)} (${g.topDown[0].pct}%)` : ''}.</p>
    <div class="hl-grid">
      <div class="hl-card reveal tilt" data-tilt="4"><h3>상승률 TOP 5</h3><ol>${g.topUp.map(r => `<li><a href="/market/golf?q=${encodeURIComponent(r.name)}">${esc(r.name)}</a><span>${fmtNum(r.today)}</span>${chg(r)}</li>`).join('') || '<li>변동 없음</li>'}</ol></div>
      <div class="hl-card reveal tilt" data-tilt="4"><h3>하락률 TOP 5</h3><ol>${g.topDown.map(r => `<li><a href="/market/golf?q=${encodeURIComponent(r.name)}">${esc(r.name)}</a><span>${fmtNum(r.today)}</span>${chg(r)}</li>`).join('') || '<li>변동 없음</li>'}</ol></div>
      <div class="hl-card reveal tilt" data-tilt="4"><h3>최고가 종목</h3><ol>${g.max.map(r => `<li><a href="/market/golf?q=${encodeURIComponent(r.name)}">${esc(r.name)}</a><span>${fmtMan(r.today)}</span>${chg(r)}</li>`).join('')}</ol></div>
    </div>
    <div class="quick-table reveal">
      <div class="qt-controls"><input type="search" id="qtFilter" placeholder="종목명으로 바로 찾기" aria-label="시세 필터"><div class="chips" id="qtRegions"><button class="chip active" data-region="">전체</button>${Object.keys(g.regions).map(r => `<button class="chip" data-region="${attr(r)}">${esc(r)}</button>`).join('')}</div></div>
      <div class="table-wrap"><table class="price-table" id="qtTable"><thead><tr><th>회원권명</th><th>지역</th><th class="num">금일시세(만원)</th><th class="num">전일 대비</th><th>추이</th></tr></thead><tbody>
      ${all.map(r => `<tr data-name="${attr(r.name)}" data-region="${attr(r.region || '')}"><td><a href="/market/golf?q=${encodeURIComponent(r.name)}">${esc(r.name)}</a></td><td>${esc(r.region || '-')}</td><td class="num"><b>${fmtNum(r.today)}</b></td><td class="num">${chg(r)}</td><td>${sparkline(prices.history(r.id, 60), 90, 26)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note">단위: 만원 · ${updated} 갱신 · 명의개서료·수수료 별도 · <a href="/market/golf">지역 필터·비교·90일 추이는 전체 시세표에서</a></p>
    </div>
  </div>
</section>

<section class="section services">
  <div class="wrap">
    <div class="sec-head center"><p class="eyebrow">하는 일</p><h2>회원권 상담과 매매가 본업입니다</h2><p class="sub">분양 대행과 골프장·리조트 예약, 해외 골프투어도 같은 담당자가 봅니다.</p></div>
    <div class="svc-grid">
      ${[['01', '회원권 상담', '지금 예산으로 살 수 있는 종목과, 그 골프장의 주말 부킹이 실제로 되는지까지 말씀드립니다.', '/apply'], ['02', '회원권 매매', '계약서와 정산 내역서를 드리고, 골프장 명의개서가 끝날 때까지 담당자가 바뀌지 않습니다.', '/market/golf'], ['03', '회원권 분양', '2004년부터 28건을 대행했습니다. 분양가만 보지 말고 입회금 반환 조건을 같이 보시도록 안내합니다.', '/listings?category=sale'], ['04', '예약 알선', '회원권이 없는 골프장이나 성수기 리조트 예약을 대신 잡아 드립니다.', '/apply'], ['05', '해외 골프투어', '일정, 티타임, 숙소까지 담당자가 짭니다. 계열사 하나멤버쉽투어가 진행합니다.', '/listings?category=tour']]
        .map(([ic, t, d, h]) => `<a class="svc reveal" href="${h}"><span class="svc-ic">${ic}</span><h3>${t}</h3><p>${d}</p><span class="more">자세히 →</span></a>`).join('')}
    </div>
  </div>
</section>

<section class="section why">
  <div class="wrap why-grid">
    <div class="reveal">
      <p class="eyebrow">2004년부터</p>
      <h2>22년째 같은 일을 하고 있습니다</h2>
      <p>2004년 에이원회원권거래소로 시작해 2008년 비전회원권거래소와 합치고 2014년 지금 이름이 됐습니다. 그동안 블루버드, 서원밸리, 엘리시안 강촌, 프리스틴밸리, 레이크힐스, 서울드래곤시티 등 골프장·리조트·피트니스 회원권 분양 28건을 대행했습니다. 시세표에 올리는 숫자는 그 주에 실제로 오간 호가와 계약가에서 나옵니다.</p>
      <ul class="checks"><li>시세표는 매주 월요일 갱신</li><li>상담한 담당자가 명의개서 접수까지 그대로 맡음</li><li>법인·무기명·분담금 회원권도 다룸</li><li>등록 뒤 부킹 문의도 받음</li></ul>
      <a class="btn btn-primary" href="/about">회사소개 보기</a>
    </div>
    <div class="timeline reveal">
      ${[['2004', '에이원회원권거래소 설립'], ['2006', '블루버드CC · 서원밸리CC · 엘리시안 강촌 분양'], ['2008', '비전회원권거래소 합병 · 가산노블리세 · 파인리즈 분양'], ['2010', '리베라CC · 레이크힐스CC 무기명 · 반얀트리 휘트니스 분양'], ['2014', '하나회원권거래소 출범 · 프리스틴밸리 · 크리스탈밸리 · 썬밸리 분양'], ['2016', '레이크힐스 리조트 · 더 스타휴 분양'], ['2017~2021', '서울드래곤시티 휘트니스·시티즌쉽·호텔멤버쉽 · 오크밸리리조트 분양'], ['2022~2025', '금호아시아나 웨하이 · 벨라 45 · 고흥 썬밸리 · 더헤븐CC · 오크밸리 · 스마트스코어 선불카드 분양']]
        .map(([y, t]) => `<div class="tl-item"><b>${y}</b><span>${t}</span></div>`).join('')}
    </div>
  </div>
</section>

<section class="section guides">
  <div class="wrap">
    <div class="sec-head center"><p class="eyebrow">회원권 안내</p><h2>종류별로 다른 점</h2></div>
    <div class="guide-grid">
      ${[['골프', '골프회원권', '정회원·주중·법인·무기명 회원권의 차이와 매수 전 확인사항, 명의개서 절차', '/guide/golf'], ['콘도', '콘도회원권', '공유제와 회원제, 성수기 이용일수, 관리비와 양도 절차', '/guide/condo'], ['피트니스', '피트니스회원권', '호텔 피트니스 개인·부부 회원권 구조와 양도 방법', '/guide/fitness'], ['무기명', '무기명 전용관', '법인 접대·모임에 유리한 무기명 회원권 매물과 이용 조건', '/exclusive/anonymous'], ['소노', '대명리조트 전용관', '소노(대명) 리조트 회원권 전용 매물과 이용 안내', '/exclusive/daemyung'], ['선불', '선불카드 전용관', '골프장 선불카드·이용권 매물', '/exclusive/prepaid']]
        .map(([ic, t, d, h]) => `<a class="gcard reveal" href="${h}"><span class="gc-ic">${ic}</span><h3>${t}</h3><p>${d}</p></a>`).join('')}
    </div>
  </div>
</section>

${featured.length ? `<section class="section listings-hl"><div class="wrap"><div class="sec-head"><div><p class="eyebrow">추천 매물</p><h2>지금 나온 회원권 매물</h2></div><a class="link" href="/listings">전체 매물 →</a></div><div class="lst-grid">${featured.map(l => `<a class="lst reveal${l.image ? ' has-img' : ''}" href="/listings/${l.id}">${l.image ? `<span class="lst-img"><img src="${attr(l.image)}" alt="" loading="lazy" width="600" height="600"></span>` : ''}<span class="tag">${esc(l.kind || '매물')}</span><h3>${esc(l.title)}</h3><p>${esc(l.region || '')} ${l.price ? '· ' + fmtMan(l.price) : ''}</p></a>`).join('')}</div></div></section>` : ''}

<section class="section posts">
  <div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">시세 리포트 · 가이드</p><h2>시세 리포트와 거래 가이드</h2></div><a class="link" href="/blog">전체 글 →</a></div>
    <div class="post-grid">${posts.map(postCard).join('') || '<p class="note">첫 리포트가 곧 발행됩니다.</p>'}</div>
  </div>
</section>

<section class="section videos">
  <div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">유튜브</p><h2>하나회원권TV, 구독자 1.4만 유튜브 채널</h2></div><a class="link" href="${attr(s.youtube)}" target="_blank" rel="noopener">채널 구독 →</a></div>
    ${videos.length ? `<div class="video-grid">${videos.map(v => `<div class="video reveal"><div class="yt" data-id="${attr(v.youtube_id)}"><img src="https://i.ytimg.com/vi/${attr(v.youtube_id)}/hqdefault.jpg" alt="${attr(v.title)}" loading="lazy" width="480" height="360"><button class="yt-play" aria-label="${attr(v.title)} 재생">▶</button></div><h3>${esc(v.title)}</h3></div>`).join('')}</div>` : `<div class="video-empty reveal"><p>공식 채널 <a href="${attr(s.youtube)}" target="_blank" rel="noopener">${esc(s.youtube)}</a>에서 회원권 시세 해설과 골프장 소개 영상을 보실 수 있습니다.</p></div>`}
  </div>
</section>

<section class="section faq-sec"><div class="wrap">
  <div class="sec-head center"><p class="eyebrow">FAQ</p><h2>상담에서 자주 나오는 질문</h2></div>
  ${faqHtml(faqs, '자주 묻는 질문')}
  <p class="center"><a class="link" href="/faq">FAQ 전체 보기 →</a></p>
</div></section>

<section class="section contact-sec" id="contact"><div class="wrap contact-grid">
  <div class="reveal"><p class="eyebrow">상담 신청</p><h2>매매 신청</h2><p>종목과 예산만 적어 주세요. 영업시간이면 보통 한 시간 안에 담당자가 전화드립니다. 밤이나 주말은 ${esc(s.phone)}으로 바로 하셔도 됩니다.</p>
  <ul class="checks"><li>매수·매도·분양 상담 무료</li><li>법인·무기명·분담금 회원권 전문</li><li>명의개서 대행 · 등록 후 지원</li></ul></div>
  <form class="inq-form reveal" id="inqForm" method="post" action="/api/inquiry" data-ajax>
    <input type="hidden" name="kind" value="consult">
    <div class="row"><label>성함 <input name="name" required maxlength="40" placeholder="홍길동"></label><label>연락처 <input name="phone" required maxlength="20" placeholder="010-0000-0000" inputmode="tel"></label></div>
    <div class="row"><label>구분 <select name="category"><option value="golf">골프회원권</option><option value="condo">콘도회원권</option><option value="fitness">피트니스회원권</option><option value="corporate">법인회원권</option><option value="sale">분양</option><option value="tour">해외투어</option></select></label><label>희망 종목 <input name="item" maxlength="60" placeholder="예: 아시아나, 남촌"></label></div>
    <label>문의 내용 <textarea name="message" rows="3" maxlength="1000" placeholder="예산, 매수/매도 여부, 연락 가능 시간"></textarea></label>
    <label class="agree"><input type="checkbox" name="agree" value="1" required> <a href="/privacy" target="_blank">개인정보 수집·이용</a>에 동의합니다 (상담 목적, 1년 보관)</label>
    <button class="btn btn-green block" type="submit">상담 신청</button>
    <p class="form-msg" aria-live="polite"></p>
  </form>
</div></section>

<section class="partners"><div class="wrap"><p class="eyebrow center">함께한 파트너</p><div class="marquee"><div class="marquee-track">${['한국골프회원권경영인협회', 'NEOWIZ', '미래신용정보', '동양생명', 'samyang', 'POSCO ICT', '한글과컴퓨터', 'SEOUL DRAGON CITY', '한국골프회원권경영인협회', 'NEOWIZ', '미래신용정보', '동양생명', 'samyang', 'POSCO ICT', '한글과컴퓨터', 'SEOUL DRAGON CITY'].map(p => `<span>${p}</span>`).join('')}</div></div></div></section>`;

  res.send(page({
    title: `하나회원권거래소 | 골프회원권 시세 조회·구매·매입, 회원권 거래 전문 (2004년~)`,
    description: `골프회원권 시세 조회와 구매·매입·판매, 콘도·피트니스 회원권 거래. 2004년부터 회원권 거래 전문, 24시간 상담 ${s.phone}.`,
    path: '/', body, bodyClass: 'home',
    jsonld: [faqLd(faqs), datasetLd('golf', all, g.lastUpdated)],
    dateModified: g.lastUpdated ? isoFromTs(g.lastUpdated) : undefined,
  }));
});

// ── 시세표 ──
const MARKET_META = {
  golf: { h1: '골프회원권 시세 조회', intro: (n) => `전국 회원제 골프장 ${n}종목의 회원권 시세입니다. 실거래와 매도·매수 호가를 반영해 매주 월요일 갱신하며, 표의 가격은 만원 단위 회원권 시세(명의개서료·수수료 별도)입니다.`, desc: (n, d) => `골프회원권 시세 조회: ${n}종목 금일·전일 시세와 시세 변동, 지역별 필터, 90일 추이. ${d} 갱신, 실거래 기준.` },
  corporate: { h1: '법인회원권 시세표', intro: (n) => `법인 명의로 등록·이용하는 골프회원권 ${n}종목의 시세입니다. 법인 회원권은 지정 등록자 수·무기명 여부에 따라 같은 골프장이라도 개인 회원권과 가격이 다릅니다.`, desc: (n, d) => `법인 골프회원권 시세표, ${n}종목 금일·전일 시세와 등락률. ${d} 갱신. 법인 명의 등록·취득세·무기명 조건 상담.` },
  condo: { h1: '콘도회원권 시세표', intro: (n) => `전국 콘도·리조트 회원권 ${n}종목의 시세입니다. 공유제(등기)·회원제(입회금) 여부, 성수기 이용일수, 객실 타입에 따라 가격이 달라지므로 매수 전 이용 조건을 함께 확인하세요.`, desc: (n, d) => `콘도회원권 시세표, 소노(대명)·한화·용평 등 리조트 회원권 ${n}종목 금일·전일 시세. ${d} 갱신. 하나회원권거래소.` },
  fitness: { h1: '피트니스회원권 시세표', intro: (n) => `호텔 피트니스(헬스) 개인·부부 회원권 ${n}종목의 시세입니다. 호텔 피트니스 회원권은 연회비·부대시설 이용 범위가 가격에 반영됩니다.`, desc: (n, d) => `피트니스회원권 시세표, 그랜드인터컨티넨탈·노보텔·롯데 등 호텔 헬스 회원권 ${n}종목 시세. ${d} 갱신.` },
};
router.get('/market/:category', (req, res, next) => {
  const cat = req.params.category; const meta = MARKET_META[cat]; if (!meta) return next();
  const q = String(req.query.q || '').trim().slice(0, 40); const region = String(req.query.region || '').trim().slice(0, 20); const sort = req.query.sort === 'price' ? 'price' : 'name';
  const rows = prices.list(cat, { q, region, sort }); const all = prices.list(cat); const st = prices.stats(cat); const regions = prices.regions(cat);
  const updated = st.lastUpdated ? kstDate(new Date(st.lastUpdated * 1000)) : kstDate();
  const label = prices.CATS[cat];
  const tabs = Object.entries(prices.CATS).map(([k, v]) => `<a class="tab${k === cat ? ' active' : ''}" href="/market/${k}">${v}</a>`).join('');
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">회원권 시세</p><h1>${meta.h1} <small>${updated} 갱신</small></h1><p class="bluf">${meta.intro(all.length)} 집계 ${st.total}종목 중 상승 ${st.up} · 하락 ${st.down} · 보합 ${st.flat}, 평균 ${fmtMan(st.avg)}.</p><div class="tabs">${tabs}</div></div></section>
<section class="section market">
  <div class="wrap">
    <div class="stat-row">${[['종목 수', st.total], ['상승', st.up, 'up'], ['하락', st.down, 'down'], ['보합', st.flat], ['평균 시세', fmtMan(st.avg)]].map(([l, v, c]) => `<div class="stat ${c || ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    <form class="market-controls" method="get" action="/market/${cat}">
      <input type="search" name="q" value="${attr(q)}" placeholder="회원권명 검색" aria-label="검색" id="mkQ">
      <div class="chips">${['', ...regions].map(r => `<a class="chip${region === r ? ' active' : ''}" href="/market/${cat}?${new URLSearchParams({ ...(q ? { q } : {}), ...(r ? { region: r } : {}), ...(sort === 'price' ? { sort } : {}) })}">${r || '전체 지역'}</a>`).join('')}</div>
      <select name="sort" aria-label="정렬" onchange="this.form.submit()"><option value="name"${sort === 'name' ? ' selected' : ''}>이름순</option><option value="price"${sort === 'price' ? ' selected' : ''}>시세 높은순</option></select>
      <button class="btn btn-primary" type="submit">검색</button>
      <button class="btn btn-ghost" type="button" id="cmpToggle">종목 비교</button>
    </form>
    <div class="compare-panel" id="cmpPanel" hidden><h3>선택한 종목 비교 (최대 3개)</h3><div id="cmpBody" class="cmp-body"></div></div>
    <div class="table-wrap"><table class="price-table market-table" id="mkTable"><thead><tr><th class="cmp-col" hidden>비교</th><th>회원권명</th><th>지역</th><th class="num">금일시세</th><th class="num">전일시세</th><th class="num">전일 대비</th>${cat !== 'golf' ? '<th class="num">회원수</th>' : ''}<th>90일 추이</th></tr></thead><tbody>
      ${rows.map(r => `<tr data-id="${r.id}" data-name="${attr(r.name)}" data-region="${attr(r.region || '')}" data-today="${r.today}" data-prev="${r.prev ?? ''}"><td class="cmp-col" hidden><input type="checkbox" class="cmp-chk" aria-label="${attr(r.name)} 비교 선택"></td><td><a class="row-name" href="${cat === 'golf' ? '/golf?q=' + encodeURIComponent(r.name) : '#'}" data-hist="${r.id}">${esc(r.name)}</a></td><td>${esc(r.region || '-')}</td><td class="num"><b>${fmtNum(r.today)}</b></td><td class="num">${fmtNum(r.prev)}</td><td class="num">${chg(r)}</td>${cat !== 'golf' ? `<td class="num">${r.members ? fmtNum(r.members) : '-'}</td>` : ''}<td><button class="spark-btn" data-hist="${r.id}" aria-label="${attr(r.name)} 90일 추이 보기">${sparkline(prices.history(r.id, 90), 100, 28)}</button></td></tr>`).join('') || `<tr><td colspan="8">검색 결과가 없습니다. <a href="/market/${cat}">전체 보기</a></td></tr>`}
    </tbody></table></div>
    <p class="note">단위: 만원 · 전일시세는 직전 갱신값 · 종목명을 누르면 골프장 소개, 추이를 누르면 90일 그래프가 열립니다 · JSON: <a href="/api/prices/${cat}">/api/prices/${cat}</a></p>
    <div class="modal" id="histModal" hidden><div class="modal-box"><button class="modal-close" aria-label="닫기">×</button><h3 id="histTitle"></h3><div id="histChart"></div><p class="note" id="histNote"></p></div></div>
  </div>
</section>
<section class="section explain"><div class="wrap narrow">
  <h2>${label} 시세표 읽는 법</h2>
  <p><strong>금일시세</strong>는 이번 주 실거래·호가를 반영한 현재 회원권 가격, <strong>전일시세</strong>는 직전 갱신 시점 가격이며, <strong>전일 대비</strong>는 그 차이와 등락률입니다. 시세는 매도자가 받는 금액 기준이므로 매수 시에는 거래소 수수료와 골프장 명의개서료가 추가됩니다.</p>
  <h2>시세가 움직이는 이유</h2>
  <ul><li><strong>계절</strong>: 봄·가을 성수기 앞뒤로 매수 수요가 늘어 강세, 한겨울·장마철은 약세 경향.</li><li><strong>골프장 정책</strong>: 회원수 조정, 입회금 인상·반환, 주말 부킹 제도 변경은 즉시 시세에 반영됩니다.</li><li><strong>금리·경기</strong>: 법인 접대 수요와 자산 시장 흐름이 고가 종목에 먼저 반영됩니다.</li><li><strong>신규 분양</strong>: 인근 신규 골프장 분양은 기존 종목 시세를 흔드는 요인입니다.</li></ul>
  <h2>매수·매도 판단은 이렇게</h2>
  <p>한 주 등락만 보지 마시고 <a href="/blog?type=report">주간 시세 리포트</a>에서 4주 흐름과 <a href="/golf">골프장별 입회 조건</a>을 같이 보세요. 지금 나온 매물과 호가는 ${esc(settings.cfg('phone'))}으로 물어보시는 게 가장 정확합니다.</p>
  ${faqHtml([{ q: '시세는 언제 갱신되나요?', a: '매주 월요일 오전 실거래·호가를 반영해 갱신합니다. 급변 시 주중에도 수시 반영합니다.' }, { q: '표의 가격에 수수료가 포함되나요?', a: '아니요. 회원권 자체 시세이며 거래소 수수료와 골프장 명의개서료는 별도입니다.' }, { q: '표에 없는 종목도 거래할 수 있나요?', a: '네. 표는 주요 종목이며 그 외 종목은 상담 시 시세를 안내해 드립니다.' }])}
</div></section>`;
  res.send(page({ title: `${meta.h1} ${updated} 갱신: ${all.length}종목 금일·전일 시세와 시세 변동 | 하나회원권거래소`, description: meta.desc(all.length, updated), path: `/market/${cat}`, body, breadcrumbs: [{ name: '회원권 시세', href: '/market/golf' }, { name: label, href: `/market/${cat}` }], jsonld: [datasetLd(cat, all, st.lastUpdated), faqLd([{ q: '시세는 언제 갱신되나요?', a: '매주 월요일 오전 실거래·호가를 반영해 갱신합니다.' }, { q: '표의 가격에 수수료가 포함되나요?', a: '회원권 자체 시세이며 거래소 수수료와 골프장 명의개서료는 별도입니다.' }])], dateModified: st.lastUpdated ? isoFromTs(st.lastUpdated) : undefined, bodyClass: 'market-page', ogImage: `/og/page/market-${cat}.png` }));
});

// ── 골프장 목록 ──
// 주소 → 시·도(지도 라벨). 주소가 없으면 '' (지도 밖 목록에만 표시)
const kmap = require('../lib/korea-map');
function sido(addr) {
  const a = String(addr || '').trim();
  const T = [['서울', '서울'], ['인천', '인천'], ['경기', '경기도'], ['강원', '강원도'], ['충청북도', '충청북도'], ['충북', '충청북도'], ['충청남도', '충청남도'], ['충남', '충청남도'], ['대전', '대전'], ['세종', '세종'], ['전라북도', '전라북도'], ['전북', '전라북도'], ['전라남도', '전라남도'], ['전남', '전라남도'], ['광주', '광주'], ['경상북도', '경상북도'], ['경북', '경상북도'], ['대구', '대구'], ['경상남도', '경상남도'], ['경남', '경상남도'], ['부산', '부산'], ['울산', '울산'], ['제주', '제주도']];
  for (const [k, v] of T) if (a.startsWith(k)) return v; return '';
}
router.get('/golf', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 40); const region = String(req.query.region || '').trim().slice(0, 10);
  let sql = "SELECT * FROM clubs WHERE status='published'"; const args = [];
  if (q) { sql += ' AND (name LIKE ? OR price_name LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  if (region) { sql += ' AND region=?'; args.push(region); }
  sql += ' ORDER BY name';
  const clubs = db.prepare(sql).all(...args).map(c => ({ ...c, price: c.price_name ? prices.byName('golf', c.price_name) : null }));
  const regions = db.prepare("SELECT region, COUNT(*) c FROM clubs WHERE status='published' AND region<>'' GROUP BY region ORDER BY c DESC").all();
  const total = db.prepare("SELECT COUNT(*) c FROM clubs WHERE status='published'").get().c;
  const site = settings.siteUrl();
  const sidoCount = {}; clubs.forEach(c => { const sd = sido(c.address); if (sd) sidoCount[sd] = (sidoCount[sd] || 0) + 1; });
  const sidos = Object.entries(sidoCount).sort((a, b) => b[1] - a[1]);
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">골프장 소개</p><h1>골프장 회원권 거래·입회권 안내 <small>${total}개 골프장</small></h1><p class="bluf">골프장마다 회원권 시세, 입회권·명의개서 조건, 회원권 혜택과 부킹 특징, 어떤 분께 맞는지를 정리했습니다. 시세는 시세표와 연동되어 매주 갱신됩니다.</p>
<form class="market-controls" method="get" action="/golf"><input type="search" name="q" value="${attr(q)}" placeholder="골프장명 검색"><div class="chips"><a class="chip${!region ? ' active' : ''}" href="/golf">전체</a>${regions.map(r => `<a class="chip${region === r.region ? ' active' : ''}" href="/golf?region=${encodeURIComponent(r.region)}">${esc(r.region)} ${r.c}</a>`).join('')}</div><button class="btn btn-primary" type="submit">검색</button></form></div></section>
<section class="section kmap-sec"><div class="wrap"><div class="sec-head"><div><p class="eyebrow">지역별 골프장</p><h2>지도에서 지역을 눌러 골프장을 찾아보세요</h2></div><p class="note">지역을 누르면 목록이 바뀌고, 다시 누르면 전체로 돌아갑니다.</p></div>
<div class="kmap-wrap"><div class="kmap-box" data-short='${JSON.stringify(kmap.SHORT).replace(/'/g, '&#39;')}'>${kmap.SVG}</div>
<div class="kmap-side"><div class="chips kmap-chips"><button type="button" class="chip active" data-sido="">전체 ${clubs.length}</button>${sidos.map(([sd, n]) => `<button type="button" class="chip" data-sido="${attr(sd)}">${esc(kmap.SHORT[sd] || sd)} ${n}</button>`).join('')}</div>
<div class="kmap-list" id="kmapList"><h3 id="kmapTitle">전체 골프장 <small>${clubs.length}</small></h3><ul id="kmapUl">${clubs.map(c => `<li data-sido="${attr(sido(c.address))}"><a href="/golf/${encodeURIComponent(c.slug)}"><b>${esc(c.name)}</b><span>${esc((c.address || '').split(' ').slice(0, 2).join(' ') || c.region || '')}${c.holes && c.verified ? ` · ${c.holes}홀` : ''}</span>${c.price ? `<em>${fmtMan(c.price.today)}</em>` : ''}</a></li>`).join('')}</ul><p class="kmap-empty" id="kmapEmpty" hidden>이 지역에 등록된 골프장 소개가 아직 없습니다. 전국 회원제 골프장 회원권을 중개하니 <a href="/apply">매매 신청</a>으로 문의해 주세요.</p></div></div></div></div></section>
<section class="section"><div class="wrap"><h2 class="sr-h">골프장 상세 카드</h2>
  <div class="club-grid">${clubs.map(c => `<a class="club-card reveal" href="/golf/${encodeURIComponent(c.slug)}" data-sido="${attr(sido(c.address))}"><div class="cc-top"><span class="tag">${esc(c.region || '')}</span>${c.body_html ? '' : '<span class="tag tag-soft">준비 중</span>'}</div><h2>${esc(c.name)}</h2><p class="cc-addr">${esc(c.address || '')}</p><div class="cc-price">${c.price ? `<b>${fmtMan(c.price.today)}</b>${chg(c.price)}` : '<span class="note">시세 상담 문의</span>'}</div></a>`).join('') || '<p>검색 결과가 없습니다.</p>'}</div>
</div></section>
<section class="section explain"><div class="wrap narrow"><h2>골프장 소개 페이지에 있는 것</h2><p>시세·지역·규모 표, 어떤 분께 맞는 회원권인지 상담 경험으로 쓴 해설, 상담에서 자주 받는 질문의 답이 있습니다. 골프장이 회원 수나 입회금, 부킹 제도를 바꾸면 내용을 고칩니다.</p><h2>원하는 골프장이 없다면?</h2><p>표시된 골프장 외에도 전국 회원제 골프장 회원권을 중개합니다. <a href="/apply">매매 신청</a> 또는 ${esc(settings.cfg('phone'))}으로 문의하시면 시세와 매물을 안내해 드립니다.</p></div></section>`;
  res.send(page({ title: `골프장 회원권 거래·입회권 안내: 골프장별 시세·혜택·추천 (${total}개 골프장)`, description: `전국 ${total}개 골프장 회원권 시세와 입회권·명의개서 조건, 회원권 혜택, 어떤 분께 맞는지 골프장별 추천. 지역 지도 검색.`, path: '/golf', body, breadcrumbs: [{ name: '골프장 소개', href: '/golf' }], ogImage: '/og/page/golf.png', jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: '골프장별 회원권 안내', numberOfItems: clubs.length, itemListElement: clubs.slice(0, 100).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, url: `${site}/golf/${encodeURIComponent(c.slug)}` })) }] }));
});

// ── 골프장 상세 ──
router.get('/golf/:slug', (req, res, next) => {
  const c = db.prepare("SELECT * FROM clubs WHERE slug=? AND status='published'").get(req.params.slug); if (!c) return next();
  const s = settings.all(); const site = settings.siteUrl();
  const p = c.price_name ? prices.byName('golf', c.price_name) : null; const hist = p ? prices.history(p.id, 90) : [];
  let faqs = []; try { faqs = JSON.parse(c.faq_json || '[]'); } catch (_) { /* no-op */ }
  const related = db.prepare("SELECT slug,name,price_name FROM clubs WHERE status='published' AND region=? AND id<>? ORDER BY RANDOM() LIMIT 4").all(c.region || '', c.id).map(r => ({ ...r, price: r.price_name ? prices.byName('golf', r.price_name) : null }));
  const posts = db.prepare("SELECT * FROM posts WHERE kind='blog' AND status='published' AND (title LIKE ? OR tags LIKE ?) ORDER BY published_at DESC LIMIT 3").all(`%${c.name.replace(/컨트리클럽|골프클럽|CC/g, '').trim()}%`, `%${c.name}%`);
  const updated = p ? kstDate(new Date(p.updated_at * 1000)) : '';
  const summary = c.summary || `${c.name} 회원권 정보와 시세를 하나회원권거래소가 안내합니다.`;
  const bodyHtml = c.body_html || `<h2>${esc(c.name)} 회원권, 이런 분께 맞습니다</h2><p>이 골프장 해설은 아직 쓰는 중입니다. 시세와 입회 조건은 아래 표를 보시거나 전화로 물어봐 주세요.</p>`;
  const specs = [['현재 시세', p ? `<b>${fmtMan(p.today)}</b> ${chg(p)}` : '상담 시 안내'], ['전일 시세', p ? fmtMan(p.prev ?? p.today) : '-'], ['시세 갱신', updated || '-'], ['권역', esc(c.region || '-')], ['소재지', esc(c.address || '-')], ['규모', c.verified && c.holes ? `${c.holes}홀` : '상담 시 안내'], ['운영 형태', esc(c.type || '회원제')], ['시세표 종목명', p ? `<a href="/market/golf?q=${encodeURIComponent(p.name)}">${esc(p.name)}</a>` : '-']];
  const body = `
<section class="page-head club-head"><div class="wrap"><p class="eyebrow">골프장 소개 · ${esc(c.region || '')}</p><h1>${esc(c.name)} 회원권 시세·입회 조건·매수 가이드</h1><p class="bluf">${esc(summary)}</p>
<div class="club-actions"><a class="btn btn-green" href="/apply?item=${encodeURIComponent(c.name)}">이 회원권 매매 상담</a><a class="btn btn-ghost" href="tel:${attr(s.phone)}">📞 ${esc(s.phone)}</a></div></div></section>
<section class="section club-body"><div class="wrap club-grid2">
  <div class="club-main">
    <div class="spec-card"><h2>${esc(c.name)} 회원권 기본 정보</h2><table class="spec"><tbody>${specs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
    ${p ? `<div class="spec-chart"><h3>최근 90일 시세 추이</h3>${sparkline(hist, 600, 120)}<p class="note">단위 만원 · 하나회원권거래소 시세표 기준 · 갱신 ${updated}</p></div>` : ''}</div>
    <div class="three"><div class="box"><h3>적합한 매수자</h3><p>${esc(c.fit_for || '상담 시 이용 패턴에 맞춰 안내')}</p></div><div class="box"><h3>부킹 특징</h3><p>${esc(c.booking || '주말 예약 방식·동반 규정은 골프장 규정 확인')}</p></div><div class="box"><h3>입회·명의개서</h3><p>${esc(c.transfer || '명의개서료·심사 기간은 상담 시 최신 조건 안내')}</p></div></div>
    <article class="prose">${bodyHtml}</article>
    ${faqs.length ? faqHtml(faqs, `${c.name} 회원권 자주 묻는 질문`) : ''}
    ${!c.verified ? `<p class="note">※ 기본 정보(규모·소재지)는 담당자 검증 후 표시됩니다. 오류가 있다면 <a href="mailto:${attr(s.email)}">${esc(s.email)}</a>로 알려 주세요.</p>` : ''}
  </div>
  <aside class="club-side">
    <div class="side-card"><h3>매매 상담</h3><p>${esc(c.name)} 회원권 매수·매도 호가와 매물을 확인해 드립니다.</p><a class="btn btn-green block" href="/apply?item=${encodeURIComponent(c.name)}">매매 신청</a><a class="btn btn-ghost block" href="tel:${attr(s.phone)}">${esc(s.phone)}</a></div>
    ${related.length ? `<div class="side-card"><h3>같은 권역 골프장</h3><ul class="side-list">${related.map(r => `<li><a href="/golf/${encodeURIComponent(r.slug)}">${esc(r.name)}</a>${r.price ? `<span>${fmtNum(r.price.today)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
    ${posts.length ? `<div class="side-card"><h3>관련 글</h3><ul class="side-list">${posts.map(x => `<li><a href="/blog/${attr(x.slug)}">${esc(x.title)}</a></li>`).join('')}</ul></div>` : ''}
    <div class="side-card author"><h3>안내</h3><p><b>${esc(s.legal_name)}</b> 회원권 상담팀<br>2004년부터 회원권 매매 중개 · 분양 대행 28건<br><a href="/about">회사소개</a></p></div>
  </aside>
</div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'GolfCourse', name: c.name, url: `${site}/golf/${encodeURIComponent(c.slug)}`, address: c.address ? { '@type': 'PostalAddress', streetAddress: c.address, addressCountry: 'KR' } : undefined, description: summary },
    { '@context': 'https://schema.org', '@type': 'Article', headline: `${c.name} 회원권 시세·입회 조건·매수 가이드`, description: truncate(stripHtml(summary), 155), url: `${site}/golf/${encodeURIComponent(c.slug)}`, datePublished: isoFromTs(c.created_at), dateModified: isoFromTs(c.updated_at), author: { '@id': site + '/#org' }, publisher: { '@id': site + '/#org' }, mainEntityOfPage: `${site}/golf/${encodeURIComponent(c.slug)}`, about: { '@type': 'Thing', name: `${c.name} 골프회원권` } }];
  if (p) ld.push({ '@context': 'https://schema.org', '@type': 'Product', name: `${c.name} 골프회원권`, description: summary, brand: { '@type': 'Brand', name: c.name }, offers: { '@type': 'Offer', priceCurrency: 'KRW', price: p.today * 10000, availability: 'https://schema.org/InStock', url: `${site}/golf/${encodeURIComponent(c.slug)}`, seller: { '@id': site + '/#org' }, priceValidUntil: kstDate(new Date(Date.now() + 7 * 86400000)) } });
  if (faqs.length) ld.push(faqLd(faqs));
  res.send(page({ title: `${c.name} 회원권 시세 ${p ? fmtMan(p.today) : ''} · 입회 조건·매수 가이드`, description: truncate(`${c.name} 회원권 시세 ${p ? fmtMan(p.today) + '(' + updated + ' 갱신)' : ''}, ${c.region || ''} ${c.address || ''}. 적합한 매수자, 부킹 특징, 명의개서 조건과 자주 묻는 질문. 하나회원권거래소 매매 상담 ${s.phone}.`, 158), path: `/golf/${encodeURIComponent(c.slug)}`, body, breadcrumbs: [{ name: '골프장 소개', href: '/golf' }, { name: c.name, href: `/golf/${encodeURIComponent(c.slug)}` }], jsonld: ld, dateModified: isoFromTs(c.updated_at), bodyClass: 'club-page', ogImage: `/og/club/${encodeURIComponent(c.slug)}.png` }));
});

module.exports = { router, chg, sparkline, faqHtml, postCard };
