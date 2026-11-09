'use strict';
// 공개 페이지: 지역별 골프회원권 허브 — 해당 지역 골프장의 현재 시세로 가격대·낮은/높은 종목·질문 답변을 만든다
const express = require('express');
const { db } = require('../db');
const { page, faqLd } = require('../lib/layout');
const settings = require('../lib/settings');
const clubgroup = require('../lib/clubgroup');
const { HUBS, hubNav } = require('../lib/hubs');
const { esc, attr, fmtMan } = require('../lib/util');
const { postCard, faqHtml, sido } = require('./pages-main');

const router = express.Router();

function hubClubs(region) {
  const ctx = clubgroup.context();
  return db.prepare("SELECT * FROM clubs WHERE status='published' AND parent_id IS NULL AND region=? ORDER BY COALESCE(NULLIF(group_name, ''), name)").all(region).map(c => {
    // 같은 골프장 종류끼리 8배 넘게 어긋나는 값(입력 오류 의심: 크라운 주중 400 등)은 순위·요약에서 뺀다
    const raw = clubgroup.variants(c, ctx).filter(v => v.price && v.price.today != null && v.price.today > 0).map(v => v.price.today);
    const mid = raw.length ? median(raw) : 0; const ps = raw.length > 1 ? raw.filter(p => p <= mid * 8 && p >= mid / 8) : raw;
    return { ...c, title: c.group_name || c.name, kinds: ps.length, lo: ps.length ? Math.min(...ps) : null, hi: ps.length ? Math.max(...ps) : null, area: c.sido || sido(c.address) };
  });
}
const range = (c) => c.lo == null ? '상담 문의' : c.lo === c.hi ? fmtMan(c.lo) : `${fmtMan(c.lo)} ~ ${fmtMan(c.hi)}`;
const clubLink = (c) => `<a href="/golf/${encodeURIComponent(c.slug)}">${esc(c.title)}</a>`;
function median(a) { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

router.get('/golf/region/:hub', (req, res, next) => {
  const hub = HUBS.find(h => h.slug === req.params.hub); if (!hub) return next();
  const R = hub.region; const clubs = hubClubs(R); if (!clubs.length) return next();
  const priced = clubs.filter(c => c.lo != null).sort((a, b) => a.lo - b.lo);
  const site = settings.siteUrl();
  const low = priced.slice(0, 5), high = [...priced].sort((a, b) => b.hi - a.hi).slice(0, 5);
  const med = priced.length ? median(priced.map(c => c.lo)) : null;
  const bands = [['1억원 미만', c => c.lo < 10000], ['1억원 이상 3억원 미만', c => c.lo >= 10000 && c.lo < 30000], ['3억원 이상', c => c.lo >= 30000]].map(([k, f]) => [k, priced.filter(f).length]);
  const areas = {}; clubs.forEach(c => { if (c.area) areas[c.area] = (areas[c.area] || 0) + 1; });
  const areaText = Object.entries(areas).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}곳`).join(', ');
  const faqs = [];
  if (priced.length) {
    faqs.push({ q: `${R} 골프회원권은 얼마부터 있나요?`, a: `현재 시세가 가장 낮은 곳은 ${low[0].title}(${fmtMan(low[0].lo)})입니다. 주중·가족 회원권처럼 종류가 여러 가지인 골프장은 그중 가장 낮은 시세 기준입니다.` });
    faqs.push({ q: `${R}에서 시세가 가장 높은 골프장은 어디인가요?`, a: `${high[0].title}이 ${fmtMan(high[0].hi)}으로 가장 높습니다. 그다음은 ${high.slice(1, 3).map(c => `${c.title}(${fmtMan(c.hi)})`).join(', ') || '없습니다'}${high.length > 1 ? '입니다' : ''}.` });
    faqs.push({ q: `${R} 골프회원권 시세는 보통 얼마인가요?`, a: `시세가 있는 ${priced.length}곳의 가장 낮은 종목을 기준으로 중간값은 ${fmtMan(med)}입니다. ${bands.filter(b => b[1]).map(([k, n]) => `${k} ${n}곳`).join(', ')}입니다.` });
  }
  faqs.push({ q: `${R} 골프회원권은 어떻게 사나요?`, a: `골프장별 시세를 확인한 뒤 02-583-0583으로 상담하시면 매물과 입회 조건을 안내합니다. 명의개서 비용과 심사 조건은 골프장마다 다르므로 골프장 페이지의 세부 정보도 함께 확인해 주세요.` });
  const like = hub.terms.map(() => 'title LIKE ?').join(' OR ');
  const posts = db.prepare(`SELECT * FROM posts WHERE kind='blog' AND status='published' AND type<>'club' AND (${like}) ORDER BY published_at DESC LIMIT 4`).all(...hub.terms.map(t => `%${t}%`));
  const bluf = priced.length
    ? `${R} 골프장 ${clubs.length}곳 중 시세가 있는 곳은 ${priced.length}곳입니다. 가장 낮은 곳은 ${esc(low[0].title)} ${fmtMan(low[0].lo)}, 가장 높은 곳은 ${esc(high[0].title)} ${fmtMan(high[0].hi)}이고, 골프장별 최저 시세의 중간값은 ${fmtMan(med)}입니다.`
    : `${R} 골프장 ${clubs.length}곳의 회원권은 상담으로 시세를 안내합니다.`;
  const rankTable = (rows, val) => `<table><thead><tr><th>골프장</th><th>지역</th><th>시세</th></tr></thead><tbody>${rows.map(c => `<tr><td>${clubLink(c)}</td><td>${esc(c.area || '')}</td><td><b>${fmtMan(val(c))}</b></td></tr>`).join('')}</tbody></table>`;
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">지역별 골프회원권</p><h1>${esc(R)} 골프회원권 시세는 얼마인가요? <small>${clubs.length}개 골프장</small></h1><p class="bluf">${bluf}</p>${hubNav(hub.slug)}</div></section>
<section class="section explain"><div class="wrap narrow prose">
${priced.length ? `<h2>${esc(R)} 골프회원권 가격대</h2><table><thead><tr><th>가격대(골프장별 최저 시세)</th><th>골프장 수</th></tr></thead><tbody>${bands.map(([k, n]) => `<tr><td>${k}</td><td>${n}곳</td></tr>`).join('')}</tbody></table>
<h2>${esc(R)}에서 시세가 낮은 골프장</h2>${rankTable(low, c => c.lo)}
<h2>${esc(R)}에서 시세가 높은 골프장</h2>${rankTable(high, c => c.hi)}` : ''}
${areaText ? `<h2>시·도별 골프장 수</h2><p>${esc(areaText)}</p>` : ''}
<h2>${esc(R)} 골프장 전체 시세</h2><table><thead><tr><th>골프장</th><th>지역</th><th>시세</th><th>시세 종류</th></tr></thead><tbody>${[...priced, ...clubs.filter(c => c.lo == null)].map(c => `<tr><td>${clubLink(c)}</td><td>${esc(c.area || '')}</td><td>${range(c)}</td><td>${c.kinds || '-'}</td></tr>`).join('')}</tbody></table>
<p class="small">시세는 <a href="/market/golf">골프회원권 시세표</a>와 같은 값이며, 실제 거래가는 매물 조건에 따라 달라질 수 있습니다.</p>
${faqHtml(faqs, `${R} 골프회원권 자주 묻는 질문`)}
<p class="cta">${esc(R)} 골프회원권 매수·매도 상담은 02-583-0583 또는 <a href="/apply?category=golf">매매 신청</a>으로 문의하세요.</p>
</div></section>
${posts.length ? `<section class="section"><div class="wrap"><h2>${esc(R)} 관련 글</h2><div class="post-grid">${posts.map(postCard).join('')}</div></div></section>` : ''}`;
  res.send(page({
    title: `${R} 골프회원권 시세 얼마인가요? 골프장 ${clubs.length}곳 가격대 비교`,
    description: priced.length ? `${R} 골프회원권 시세: 골프장 ${clubs.length}곳, 최저 ${low[0].title} ${fmtMan(low[0].lo)}부터 최고 ${high[0].title} ${fmtMan(high[0].hi)}까지 가격대와 골프장별 시세. 회원권거래소 하나회원권거래소.` : `${R} 골프장 ${clubs.length}곳의 회원권 안내. 회원권거래소 하나회원권거래소.`,
    path: `/golf/region/${hub.slug}`, body,
    breadcrumbs: [{ name: '골프장 소개', href: '/golf' }, { name: `${R} 골프회원권`, href: `/golf/region/${hub.slug}` }],
    ogImage: '/og/page/golf.png',
    jsonld: [faqLd(faqs), { '@context': 'https://schema.org', '@type': 'ItemList', name: `${R} 골프장`, numberOfItems: clubs.length, itemListElement: clubs.slice(0, 80).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, url: `${site}/golf/${encodeURIComponent(c.slug)}` })) }],
  }));
});

module.exports = router;
