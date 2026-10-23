'use strict';
// 월간 리포트 — 착수 전(구 사이트·첫 측정) 대비 이번 달 결과를 전후 캡처로 보여 준다.
// 입력: data/seed/screenshots/before(구 사이트, 착수 시점) · data/screenshots/<날짜>(운영 사이트, capture.js after)
//       측정/AI검색/추이.csv + 날짜 폴더 캡처 · 측정/스크린샷/<날짜>(기능 개선 전후) · 측정/월간_<날짜>.json(구·신 사이트 실측값)
// 출력: 보고/하나회원권_월간리포트_<날짜>.html/.pdf
// 실행: node scripts/build-monthly-report.js [YYYY-MM-DD] [--from YYYY-MM-DD]
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const PROJ = path.join(ROOT, '..'); const AI = path.join(PROJ, '측정', 'AI검색'); const SS = path.join(PROJ, '측정', '스크린샷');
const shot = require(ROOT + '/lib/screenshot');
const argv = process.argv.slice(2); const opt = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const DATE = argv.find((a, i) => /^\d{4}-\d{2}-\d{2}$/.test(a) && argv[i - 1] !== '--from') || require(ROOT + '/lib/util').kstDate();
const FROM = opt('from') || '2026-09-19';
const NAME = opt('name') || '월간리포트'; // 통합본: --name 통합월간리포트 --from 2026-09-14
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v) => Number(v || 0).toLocaleString('ko-KR');
const md = (d) => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '-';
const uri = (f) => { if (!f || !fs.existsSync(f)) return ''; const e = path.extname(f).slice(1).toLowerCase(); return `data:image/${e === 'jpg' ? 'jpeg' : e};base64,${fs.readFileSync(f).toString('base64')}`; };
// 원본 PNG(전체 페이지 캡처는 수천 px)를 그대로 넣으면 PDF가 10MB를 넘어, 보여 줄 부분만 잘라 JPEG로 만든다.
// pos: 'top' | 'bottom' | 0~1(노출 위치 — 잘린 영역 위에서 30% 지점에 오게) · ratio: 결과 높이/너비
const TMP = path.join(PROJ, '측정', '월간_tmp'); fs.mkdirSync(TMP, { recursive: true });
const PY = path.join(__dirname, 'crop_jpg.py');
const cut = (src, pos = 'top', ratio = 0.62) => { if (!src || !fs.existsSync(src)) return null; const dst = path.join(TMP, require('crypto').createHash('md5').update(src + pos + ratio).digest('hex').slice(0, 12) + '.jpg'); if (!fs.existsSync(dst)) require('child_process').execFileSync('python', [PY, src, dst, String(pos), String(ratio)]); return dst; };
const fig = (f, cap, style = '') => { const u = uri(f); return u ? `<figure><img src="${u}" style="${style}" alt="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>` : `<figure class="miss">${esc(cap)} — 캡처 없음</figure>`; };
const pair = (title, b, bc, a, ac, style = '') => `<div class="pair"><h3>${esc(title)}</h3><div class="two"><div><span class="tag before">전</span>${fig(b, bc, style)}</div><div><span class="tag after">후</span>${fig(a, ac, style)}</div></div></div>`;

// ── 실측값(구·신 사이트, 같은 날 같은 PC) ──
const M = (() => { try { return JSON.parse(fs.readFileSync(path.join(PROJ, '측정', `월간_${DATE}.json`), 'utf8')); } catch (_) { return null; } })();
const health = (() => { try { return JSON.parse(fs.readFileSync(path.join(PROJ, '측정', `healthz_${DATE}.json`), 'utf8')); } catch (_) { return {}; } })();

// ── AI·검색 노출 ──
const ENG = { google: '구글', naver: '네이버', bing: 'Bing', naverai: '네이버 AI탭', perplexity: 'Perplexity', chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
const SEARCH5 = ['google', 'naver', 'bing', 'naverai', 'perplexity'];
const STD = ['하나회원권거래소', '골프회원권', '무기명 골프회원권', '콘도회원권', '골프회원권 시세', '골프회원권 거래소 추천']; // 9/29부터 매번 같은 질의
const NOW9 = ['회원권거래소', '하나회원권거래소', '콘도회원권 시세', '피트니스회원권 시세', '골프회원권 시세', '골프회원권', '무기명 골프회원권', '콘도회원권', '골프회원권 거래소 추천'];
const rows = fs.readFileSync(path.join(AI, '추이.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1)
  .map(l => { const c = l.split(','); return { date: c[0], engine: c[1], query: c[2], site: +c[3], brand: +c[4], comp: (c[5] || '').split('|').filter(Boolean), blocked: +c[6], error: c[7] || '' }; })
  .filter(r => r.date <= DATE && ENG[r.engine]);
const ok = (r) => r && !r.blocked && !r.error;
const cell = (d, e, q) => { const m = rows.filter(r => r.date === d && r.engine === e && r.query === q && ok(r)); return m.length ? m[m.length - 1] : null; };
const dates = [...new Set(rows.filter(r => STD.includes(r.query)).map(r => r.date))].sort();
const FIRST = dates[0]; const LAST = dates.filter(d => d <= DATE).pop();
// 추이: 9/29 이후 매번 같은 5개 검색엔진 × 6질의(네이버 AI탭은 10/6부터)
const trend = dates.map(d => { let s = 0, b = 0, c = 0; for (const e of SEARCH5) for (const q of STD) { const x = cell(d, e, q); if (x) { c++; s += x.site; b += x.brand; } } return { d, s, b, c }; }).filter(t => t.c >= 20);
const T0 = trend[0], T1 = trend[trend.length - 1];
const trendSvg = (() => { const W = 660, H = 170, L = 30, R = 10, T = 14, B = 26; const mx = Math.max(10, ...trend.map(t => Math.max(t.s, t.b))); const x = (i) => L + (trend.length < 2 ? 0 : i / (trend.length - 1)) * (W - L - R); const y = (v) => T + (1 - v / mx) * (H - T - B);
  const ln = (k, col) => `<polyline fill="none" stroke="${col}" stroke-width="2.5" points="${trend.map((t, i) => `${x(i)},${y(t[k])}`).join(' ')}"/>` + trend.map((t, i) => `<circle cx="${x(i)}" cy="${y(t[k])}" r="3" fill="${col}"/><text x="${x(i)}" y="${y(t[k]) - 6}" font-size="9.5" text-anchor="middle" fill="${col}">${t[k]}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${[0, .5, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(mx * f)}" y2="${y(mx * f)}" stroke="#e3e8f0"/>`).join('')}${ln('b', '#8e8aa8')}${ln('s', '#1f3a73')}${trend.map((t, i) => `<text x="${x(i)}" y="${H - 8}" font-size="9.5" text-anchor="middle" fill="#6b7485">${md(t.d)}</text>`).join('')}</svg>`; })();
const mark = (c) => !c ? '<span class="muted">-</span>' : c.site ? '<b class="ok">✅</b>' : c.brand ? '<span class="warn">△</span>' : '<span class="muted">—</span>';
const engsToday = Object.keys(ENG).filter(e => NOW9.some(q => cell(LAST, e, q)));
const nowSite = engsToday.reduce((s, e) => s + NOW9.filter(q => (cell(LAST, e, q) || {}).site).length, 0);
const nowValid = engsToday.reduce((s, e) => s + NOW9.filter(q => cell(LAST, e, q)).length, 0);

// 전후 캡처: 첫 측정에 없던 노출 → 오늘 노출된 엔진·질의(우선 키워드 순)
const hitPos = (d, e, q) => { try { const r = JSON.parse(fs.readFileSync(path.join(AI, d, 'result.json'), 'utf8')).filter(x => x.engine === e && x.query === q).pop(); return r && r.hit && r.hit.h ? r.hit.y / r.hit.h : null; } catch (_) { return null; } };
const safe = (q) => q.replace(/[^\w가-힣]+/g, '_').replace(/^_|_$/g, '');
const pngOf = (d, e, q) => path.join(AI, d, `${e}_${safe(q)}.png`);
const crop = (f, ratio, boxMm = 70) => { if (!fs.existsSync(f)) return ''; const b = fs.readFileSync(f); const w = b.readUInt32BE(16), h = b.readUInt32BE(20); const box = boxMm / 85, hs = h / w; let p = 0; if (ratio != null && hs > box) p = Math.max(0, Math.min(100, (ratio * hs - box * 0.3) / (hs - box) * 100)); return `height:${boxMm}mm;object-fit:cover;object-position:50% ${p.toFixed(1)}%`; };
const gains = [];
for (const q of STD) for (const e of SEARCH5) { const a = cell(FIRST, e, q), b = cell(LAST, e, q); if (b && b.site && a && !a.site && fs.existsSync(pngOf(FIRST, e, q)) && fs.existsSync(pngOf(LAST, e, q))) gains.push({ q, e }); }
const PREF = ['bing', 'naver', 'google', 'naverai', 'perplexity']; for (let i = gains.length - 1; i >= 0; i--) if (gains[i].e === 'perplexity') gains.splice(i, 1); // 9/29 Perplexity 캡처는 쿠키 동의 창에 가려 비교 화면으로 부적합
 gains.sort((a, b) => PREF.indexOf(a.e) - PREF.indexOf(b.e) || STD.indexOf(a.q) - STD.indexOf(b.q));
const pickGains = []; const usedE = {}; for (const g of gains) { if ((usedE[g.e] || 0) >= 2 || pickGains.length >= 4) continue; usedE[g.e] = (usedE[g.e] || 0) + 1; pickGains.push(g); }
const aiPairs = pickGains.map(({ q, e }) => pair(`${ENG[e]} — "${q}"`, cut(pngOf(FIRST, e, q), 'top', 0.75), `${md(FIRST)} 첫 측정: 우리 사이트 없음`, cut(pngOf(LAST, e, q), hitPos(LAST, e, q) != null ? hitPos(LAST, e, q) : 'top', 0.75), `${md(LAST)}: 우리 사이트 노출${hitPos(LAST, e, q) != null ? ' (노출 위치)' : ''}`, '')).join('');

// ── 홈페이지 전후 ──
const BEFORE = path.join(ROOT, 'data', 'seed', 'screenshots', 'before'); const AFTER = path.join(ROOT, 'data', 'screenshots', DATE);
const PAGES = [['home', '홈 첫 화면'], ['market', '시세표'], ['golf', '골프장 소개'], ['about', '회사소개']];
const pagePairs = PAGES.map(([k, l]) => pair(l, cut(path.join(BEFORE, `before_${k}_desktop.png`), 'top', 0.4), '착수 전 구 사이트(hanamarket.co.kr)', cut(path.join(AFTER, `after_${k}_desktop.png`), 'top', 0.4), `현재 hanamember.co.kr (${md(DATE)})`, '')).join('');
const mobilePair = `<div class="pair"><h3>모바일 홈</h3><div class="four"><div><span class="tag before">전</span>${fig(path.join(BEFORE, 'before_home_mobile.png'), '구 사이트', 'height:96mm;object-fit:cover;object-position:top')}</div><div><span class="tag after">후</span>${fig(path.join(AFTER, 'after_home_mobile.png'), `현재 (${md(DATE)})`, 'height:96mm;object-fit:cover;object-position:top')}</div><div><span class="tag before">전</span>${fig(path.join(BEFORE, 'before_market_mobile.png'), '구 사이트 시세', 'height:96mm;object-fit:cover;object-position:top')}</div><div><span class="tag after">후</span>${fig(path.join(AFTER, 'after_market_mobile.png'), `현재 시세 (${md(DATE)})`, 'height:96mm;object-fit:cover;object-position:top')}</div></div></div>`;

// 이번 달 기능 개선 전후(측정/스크린샷/날짜별)
const FEAT = [
  ['모바일 메뉴(10/13): 메뉴가 화면 위 64px에 갇혀 닫히지 않던 문제', path.join(SS, '2026-10-13', 'before_mobile_home_open.png'), '수정 전', path.join(SS, '2026-10-14', 'prod_mobile_home_open.png'), '수정 후(운영)', 'height:95mm;object-fit:cover;object-position:top'],
  ['문의 폼 상담 시간 선택(10/15)', path.join(SS, '2026-10-15', 'before_home_form_mobile.png'), '이전', path.join(SS, '2026-10-15', 'after_home_form_mobile.png'), '추가 후', 'height:95mm;object-fit:cover;object-position:bottom'],
  ['골프장 세부 정보(공식 홈페이지 기준, 10/14~)', path.join(SS, '2026-10-14', 'before_golf_songchoo_detail.png'), '송추CC 추가 전', path.join(SS, '2026-10-14', 'after_golf_songchoo_detail.png'), '추가 후', 'height:62mm;object-fit:cover;object-position:top'],
  ['시세 차트 과거 기록(10/21): 동아회원권·구 사이트 기록을 이어 2011년부터 표시', path.join(SS, '2026-10-21', 'before_chart10y_condo_yongpyong.png'), '용평 콘도 10년 차트 — 반영 전', path.join(SS, '2026-10-21', 'after_chart10y_condo_yongpyong.png'), '반영 후', 'height:62mm;object-fit:cover;object-position:top'],
  ['골프장 세부 정보 누적 65곳(10/22, 기흥CC)', path.join(SS, '2026-10-22', 'before_golf_giheung_detail.png'), '추가 전(운영)', path.join(SS, '2026-10-22', 'after_golf_giheung_detail.png'), '추가 후', 'height:62mm;object-fit:cover;object-position:top'],
  ['콘도회원권 매물 썸네일(10/6)', path.join(SS, '2026-10-06', 'before_condo_listings.png'), '이전', path.join(SS, '2026-10-06', 'after_condo_listings_v3.png'), '정리 후', 'height:62mm;object-fit:cover;object-position:top'],
];
const featPairs = FEAT.filter(f => fs.existsSync(f[1]) && fs.existsSync(f[3])).map(([t, b, bc, a, ac, st]) => { const pos = /bottom/.test(st) ? 'bottom' : 'top'; const r = /95mm/.test(st) ? 1.5 : 0.55; return pair(t, cut(b, pos, r), bc, cut(a, pos, r), ac, /95mm/.test(st) ? 'height:88mm;width:auto;max-width:100%;margin:0 auto' : ''); }).join('');

const TITLE = (M && M.title) || `월간 리포트<br>${+DATE.slice(0, 4)}년 ${+DATE.slice(5, 7)}월`;
const SUBTITLE = (M && M.subtitle) || '착수 전과 지금 — 홈페이지·검색·AI 노출 전후 비교';

// ── 구·신 비교표 ──
const cmp = M ? `<table><tr><th style="width:24%">항목 (${md(DATE)} 같은 PC에서 측정)</th><th>구 사이트 hanamarket.co.kr</th><th>새 사이트 hanamember.co.kr</th></tr>
<tr><td>홈 첫 화면 로딩(2회 평균)</td><td>${(M.old.loadMs / 1000).toFixed(1)}초</td><td><b>${(M.new.loadMs / 1000).toFixed(1)}초</b></td></tr>
<tr><td>페이지 제목(검색 결과 제목)</td><td>${esc(M.old.title)}</td><td>${esc(M.new.title)}</td></tr>
<tr><td>검색 결과 설명문</td><td>${esc(M.old.desc)}</td><td>${esc(M.new.desc)}</td></tr>
<tr><td>대표 제목(H1)</td><td>${M.old.h1.filter(Boolean).length ? esc(M.old.h1[0]) : '없음'}</td><td>${esc(M.new.h1[0] || '')}</td></tr>
<tr><td>구조화 데이터(AI·검색엔진용 회사·FAQ·시세 정보)</td><td>없음</td><td>${esc(M.new.ld.join(', '))}</td></tr>
<tr><td>사이트맵(검색엔진에 알리는 페이지 목록)</td><td>없음</td><td>${n(M.sitemapNew)}개 주소</td></tr>
<tr><td>홈 본문 글자 수</td><td>${n(M.old.textLen)}자</td><td>${n(M.new.textLen)}자</td></tr>
<tr><td>이미지 대체 텍스트 누락</td><td>${M.old.imgsNoAlt}/${M.old.imgs}장</td><td>${M.new.imgsNoAlt}/${M.new.imgs}장</td></tr></table>` : '<p class="muted">실측값 없음</p>';

// ── 이번 달 한 일 ──
const DONE = (M && M.done) || [
  ['사이트', ['정식 도메인 hanamember.co.kr 연결·운영(9/23), 구 사이트 주소별 연결표 내장', '헤더·메뉴·회사 연혁·골프장 지도 개편, 모바일 메뉴 오류 수정', '문의 폼 상담 시간 선택, 시세 차트 옆 상담 버튼(리드 수집)', '검색 결과 설명문 우선 키워드 보강(회원권거래소 → 하나회원권거래소 → 콘도·피트니스·골프회원권 시세)']],
  ['데이터', ['구 사이트 시세 전체 이관(골프·법인·콘도·피트니스) + 동아 시세 매일 자동 반영', '시세 종목 상세·90일~10년 추이 차트', '법인 시세 중복 통합, 골프 시세 명칭 정정 2차, 피트니스·콘도 정리', '골프장별 소개 페이지, 공식 홈페이지 기준 세부 정보(회원 구성·예약·명의개서·법인 규정)']],
  ['콘텐츠', [`시세 리포트·가이드 블로그 ${n(health.posts || 0)}건 발행(매일 예약 발행 + 매주 시세 리포트)`, '키워드별 글: 회원권거래소·무기명·콘도/피트니스/골프 시세·지역 비교·법인', '새 글 주제 겹침 점검(같은 키워드로 우리 글끼리 경쟁하지 않게)', '디오너스 골프 선불카드 상품 등록']],
  ['관리자', ['총괄·업체 관리자·직원 권한 분리, 직원 계정 개설', '문의·고객 통합 관리(담당자·상담 기록·CSV), 유입 경로·전환 상세', '시세 수기 잠금, 업체용 대시보드(일간 방문·문의), 관리자 사용 설명서']],
  ['측정', ['구글·네이버·Bing·네이버 AI탭·Perplexity·ChatGPT·Gemini 매일 캡처, 주간 신규 노출 리포트(매주 수)', '네이버 \'회원권거래소\' 순위 원인 점검, 네이버 IndexNow 직접 전송']],
];

// ── 콘텐츠·데이터 현황 ──
const STAT = (() => { try {
  const { db } = require(ROOT + '/db'); const kd = (s) => new Date(s * 1000 + 9 * 3600e3).toISOString().slice(0, 10);
  const posts = db.prepare("SELECT title, slug, status, published_at FROM posts WHERE slug NOT LIKE 'club-guide-%' ORDER BY published_at").all();
  const KW = [['회원권거래소·거래소 추천', /거래소/], ['콘도회원권 시세', /콘도/], ['피트니스회원권 시세', /피트니스/], ['골프회원권 시세·비교', /골프.*시세|시세.*골프|골프회원권.*(비교|얼마|몇)|골프장.*시세/], ['매매 절차·세금·명의개서 가이드', /./]];
  const kw = KW.map(([k, re]) => ({ k, re, pub: [], sch: [] })); for (const p of posts) { const g = kw.find(x => x.re.test(p.title)); (p.status === 'scheduled' ? g.sch : g.pub).push(p); }
  const prices = ['golf', 'corporate', 'condo', 'fitness'].map(c => ({ c, n: db.prepare('SELECT COUNT(*) n FROM prices WHERE category=?').get(c).n, ...db.prepare("SELECT COUNT(DISTINCT p.id) h, COUNT(*) pts, MIN(h.date) mn FROM prices p JOIN price_history h ON h.price_id=p.id WHERE p.category=? AND h.date<'2026-09-30'").get(c) }));
  return { kw, prices, kd, details: Object.keys(require(ROOT + '/data/seed/club-details.json').clubs).length };
} catch (e) { console.error('통계 생략:', e.message); return null; } })();
const CATN = { golf: '골프', corporate: '법인', condo: '콘도', fitness: '피트니스' };
let SN = 0; const sec = () => ++SN;
const statHtml = () => !STAT ? '' : `<section><h2>${sec()}. 콘텐츠·데이터 현황</h2>
<h3>블로그(시세 리포트·가이드) — 운영 발행 ${n(health.posts || 0)}건(골프장별 자동 글 포함), 예약 ${STAT.kw.reduce((s, g) => s + g.sch.length, 0)}건</h3>
<table><tr><th style="width:26%">겨냥 키워드</th><th style="width:9%">발행</th><th>대표 글(최근 순)</th></tr>${STAT.kw.map(g => `<tr><td><b>${esc(g.k)}</b></td><td>${g.pub.length}${g.sch.length ? ` <span class="muted">+예약 ${g.sch.length}</span>` : ''}</td><td class="small">${g.pub.slice(-3).reverse().concat(g.sch).slice(0, 3).map(p => `${md(STAT.kd(p.published_at))} ${esc(p.title.length > 46 ? p.title.slice(0, 46) + '…' : p.title)}${p.status === 'scheduled' ? ' <span class="muted">(예약)</span>' : ''}`).join('<br>')}</td></tr>`).join('')}</table>
<h3>시세 데이터 — 매일 갱신 + 과거 기록</h3>
<table class="c"><tr><th>분류</th><th>시세 종목</th><th>과거 기록 있는 종목</th><th>과거 기록 점</th><th>가장 오래된 기록</th></tr>${STAT.prices.map(p => `<tr><td>${CATN[p.c]}</td><td>${n(p.n)}</td><td>${n(p.h)}</td><td>${n(p.pts)}</td><td>${p.mn ? p.mn.slice(0, 4) + '년' : '-'}</td></tr>`).join('')}</table>
<p class="small muted">과거 기록: 동아회원권 공개 시세 기록과 구 하나회원권 사이트 기록을 이어 붙였고, 9/30부터는 하나회원권거래소가 매일 기록합니다. 현재 시세와 30% 넘게 어긋나는 과거 기록은 걸러 냈습니다(법인 17종목 제외).</p>
<h3>골프장 정보</h3><p>골프장 소개 페이지 ${n(M ? M.golfClubs : 0)}곳 · 공식 홈페이지만 출처로 쓴 세부 정보(회원 구성·그린피·예약 규정·명의개서·법인 규정) <b>${n(STAT.details)}곳</b>. 그린피·수수료에는 확인 날짜를 함께 적었습니다.</p>
</section>`;
const tlHtml = () => !(M && M.timeline) ? '' : `<section><h2>${sec()}. 진행 경과 (${md(FROM)} ~ ${md(DATE)})</h2><table><tr><th style="width:15%">기간</th><th style="width:22%">단계</th><th>주요 작업</th></tr>${M.timeline.map(([p, s, items]) => `<tr><td>${esc(p)}</td><td><b>${esc(s)}</b></td><td><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></td></tr>`).join('')}</table>
${M.weekly ? `<h3>주간 신규 노출 리포트</h3><table class="c"><tr><th>주간</th><th>새로 노출</th><th>새 상호 언급</th><th>비고</th></tr>${M.weekly.map(w => `<tr><td>${esc(w[0])}</td><td>${esc(w[1])}</td><td>${esc(w[2])}</td><td style="text-align:left">${esc(w[3])}</td></tr>`).join('')}</table>` : ''}</section>`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하나회원권거래소 ${NAME.replace('월간리포트', ' 월간 리포트')} ${DATE}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{--navy:#0f1c36;--blue:#1f3a73;--green:#03a65a;--line:#dfe5ef;--muted:#5b6678}
*{box-sizing:border-box}body{font-family:Pretendard Variable,Pretendard,'Malgun Gothic',sans-serif;color:#1c2333;margin:0;font-size:10.6pt;line-height:1.6;word-break:keep-all}
.cover{height:255mm;display:flex;flex-direction:column;justify-content:center;border-left:10px solid var(--navy);padding-left:14mm;page-break-after:always}
.cover .k{color:var(--green);font-weight:800;letter-spacing:.08em;font-size:11pt}.cover h1{font-size:28pt;margin:8px 0 6px;color:var(--navy);line-height:1.25}.cover .sub{font-size:13pt;color:var(--muted);margin-bottom:22px}.cover .meta{font-size:10.5pt;color:var(--muted);line-height:1.9}.cover .meta b{color:#1c2333}
h2{font-size:15pt;color:var(--navy);border-bottom:2.5px solid var(--navy);padding-bottom:4px;margin:0 0 10px;page-break-after:avoid}h3{font-size:11pt;color:var(--blue);margin:10px 0 4px;page-break-after:avoid}
section{page-break-before:always;padding-top:2mm}section.first{page-break-before:auto}
p{margin:4px 0}ul{margin:4px 0;padding-left:18px}li{margin:2px 0}
table{width:100%;border-collapse:collapse;font-size:9.6pt;margin:6px 0}tr{page-break-inside:avoid}th,td{border:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top}th{background:#eef2f9;color:var(--navy)}table.c td,table.c th{text-align:center}table.c td:first-child{text-align:left}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.kpi div{border:1px solid var(--line);border-radius:8px;padding:9px 11px}.kpi b{display:block;font-size:18pt;color:var(--navy);line-height:1.2}.kpi s{color:#9aa3b2;font-size:11pt;margin-right:4px}.kpi span{font-size:9pt;color:var(--muted)}
.pair{page-break-inside:avoid;margin-bottom:8px}.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.four{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
figure{margin:0}figure img{width:100%;border:1px solid var(--line);border-radius:5px;display:block}figcaption{font-size:8.6pt;color:var(--muted);margin-top:2px}figure.miss{border:1px dashed var(--line);padding:20px;color:var(--muted);font-size:9pt}
.tag{display:inline-block;font-size:8.5pt;font-weight:800;border-radius:4px;padding:0 6px;margin-bottom:3px}.tag.before{background:#eceff4;color:#5b6678}.tag.after{background:#e3f6ec;color:#03804a}
.ok{color:#1b6b3a}.warn{color:#8a6400}.muted{color:var(--muted)}.small{font-size:9pt}
.note{background:#f3f7ff;border-left:4px solid var(--blue);padding:6px 10px;border-radius:0 6px 6px 0;font-size:9.6pt;margin:8px 0}.alert{background:#fdecea;border-left:4px solid #c0392b;padding:6px 10px;border-radius:0 6px 6px 0;font-size:9.8pt;margin:8px 0}
.done{display:grid;grid-template-columns:1fr 1fr;gap:8px}.done div{border:1px solid var(--line);border-radius:8px;padding:6px 10px}.done b{color:var(--navy)}
@page{size:A4;margin:13mm 12mm}
</style></head><body>
<div class="cover"><div class="k">HANA MEMBERSHIP EXCHANGE · MONTHLY REPORT</div><h1>${TITLE}</h1><div class="sub">${SUBTITLE}</div>
<div class="meta">기간 <b>${FROM} ~ ${DATE}</b><br>사이트 <b>https://hanamember.co.kr</b><br>비교 기준 착수 전 구 사이트(hanamarket.co.kr, 9/14 캡처) · AI·검색 첫 측정(${FIRST})<br><br>모든 '후' 캡처는 ${md(DATE)} 운영 사이트와 실제 검색 결과에서 새로 찍었습니다.</div></div>

<section class="first"><h2>${sec()}. 한눈에 보기</h2>
<div class="kpi">
<div><b><s>${T0 ? T0.s : '-'}</s>→ ${T1 ? T1.s : '-'}</b><span>검색·AI 노출 (같은 6개 키워드 × 5개 엔진, ${md(T0 && T0.d)} → ${md(T1 && T1.d)})</span></div>
<div><b>${nowSite}<small style="font-size:11pt;color:#5b6678">/${nowValid}</small></b><span>오늘 노출 (우선 키워드 포함 9개 × ${engsToday.length}개 엔진)</span></div>
<div><b>${M ? (M.old.loadMs / 1000).toFixed(1) + '→' + (M.new.loadMs / 1000).toFixed(1) + '초' : '-'}</b><span>홈 첫 화면 로딩 (구→새, 같은 PC 실측)</span></div>
<div><b>${n(health.posts || 0)}건</b><span>발행된 시세 리포트·가이드 (착수 전 0)</span></div>
<div><b>${n(health.prices || 0)}</b><span>시세 종목 (골프·법인·콘도·피트니스, 매일 갱신)</span></div>
<div><b>${M ? n(M.sitemapNew) : '-'}</b><span>검색엔진에 알리는 페이지 주소 (구 사이트 사이트맵 없음)</span></div>
<div><b>${n(M ? M.golfClubs : 0)}곳</b><span>골프장 소개 페이지 · 공식 홈페이지 기준 세부 정보 ${n(M ? M.clubDetails : 0)}곳</span></div>
${M && M.inquiryTotal != null ? `<div><b>${n(M.inquiryTotal)}</b><span>누적 홈페이지 문의</span></div>` : STAT ? `<div><b>${n(STAT.prices.reduce((s, p) => s + p.pts, 0))}</b><span>과거 시세 기록 점 (골프 ${STAT.prices[0].mn.slice(0, 4)}년~, 차트 최대 10년 이상)</span></div>` : '<div><b>-</b><span>문의 수는 관리자 대시보드에서 확인</span></div>'}
</div>
<h3>검색·AI 노출 추이 (${md(T0 && T0.d)} ~ ${md(T1 && T1.d)})</h3>${trendSvg}
<p class="small muted">남색: 결과에 우리 사이트 링크가 나온 건수 / 회색: 상호(하나회원권거래소)가 언급된 건수. 9/29부터 매번 같은 6개 키워드(하나회원권거래소·골프회원권·무기명 골프회원권·콘도회원권·골프회원권 시세·골프회원권 거래소 추천)를 같은 방법으로 검색했습니다(네이버 AI탭은 10/6부터).</p>
</section>
${tlHtml()}
${M && M.timeline ? statHtml() : ''}
<section><h2>${sec()}. 홈페이지 전후 — PC</h2>${pagePairs}</section>
<section><h2>${sec()}. 홈페이지 전후 — 모바일과 기본 품질</h2>${mobilePair}<h3>구·신 사이트 실측 비교</h3>${cmp}</section>

<section><h2>${sec()}. 검색·AI 노출 전후 캡처</h2><p>${md(FIRST)} 첫 측정 때 우리 사이트가 없던 결과 중, 지금은 우리 사이트가 나오는 곳입니다. 오른쪽은 실제 노출 위치 부근을 잘라 보여 줍니다.</p>${aiPairs || '<p class="muted">해당 없음</p>'}</section>

<section><h2>${sec()}. 오늘 기준 키워드별 노출 (${md(LAST)})</h2>
<table class="c"><tr><th>키워드</th>${engsToday.map(e => `<th>${ENG[e]}</th>`).join('')}<th>노출</th></tr>${NOW9.map((q, i) => `<tr><td>${i < 5 ? `<b>${['①', '②', '③', '④', '⑤'][i]} ${esc(q)}</b>` : esc(q)}</td>${engsToday.map(e => `<td>${mark(cell(LAST, e, q))}</td>`).join('')}<td>${engsToday.filter(e => (cell(LAST, e, q) || {}).site).length}/${engsToday.filter(e => cell(LAST, e, q)).length}</td></tr>`).join('')}</table>
<p class="small muted">✅ 우리 사이트 노출 · △ 상호만 언급 · — 없음 · - 측정 못 함(로그인 필요 등). ①~⑤는 우선 키워드. 원본 캡처: 측정/AI검색/${LAST}/</p>
${M && M.notes ? `<div class="note">${M.notes}</div>` : ''}</section>

<section><h2>${sec()}. ${M && M.timeline ? '기능 개선 전후' : '이번 달 기능 개선 전후'}</h2>${featPairs}</section>

<section><h2>${sec()}. ${M && M.timeline ? '구축·운영 범위' : '이번 달 한 일'}</h2><div class="done">${DONE.map(([t, items]) => `<div><b>${t}</b><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>
</section><section><h2>${sec()}. 다음 달 계획</h2>
<table><tr><th style="width:24%">항목</th><th>내용</th></tr>${(M && M.next || []).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>
${M && M.asks && M.asks.length ? `<h3>협조 요청</h3><ul>${M.asks.map(a => `<li>${a}</li>`).join('')}</ul>` : ''}
<p class="small muted">하나회원권거래소 월간 리포트 · ${DATE}</p></section>
</body></html>`;

const out = path.join(PROJ, '보고', `하나회원권_${NAME}_${DATE}`); fs.writeFileSync(out + '.html', html);
console.log(`trend ${T0 && T0.d}:${T0 && T0.s} → ${T1 && T1.d}:${T1 && T1.s} · 오늘 ${nowSite}/${nowValid} · AI 전후 ${pickGains.map(g => g.e + ':' + g.q).join(', ')}`);
(async () => { const b = await shot.launch(); const p = await b.newPage(); await p.goto('file:///' + (out + '.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 120000 }); await p.pdf({ path: out + '.pdf', format: 'A4', printBackground: true, margin: { top: '13mm', bottom: '13mm', left: '12mm', right: '12mm' }, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: `<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:sans-serif">하나회원권거래소 ${NAME.replace('월간리포트', ' 월간 리포트')} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>` }); await b.close(); console.log('ok', out + '.pdf', Math.round(fs.statSync(out + '.pdf').size / 1024) + 'KB'); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });
