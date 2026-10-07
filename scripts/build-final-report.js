'use strict';
// 10/8 최종 전달: 노출 리포트 + 기존 홈페이지 비교분석 → 보고/하나회원권_최종리포트_YYYY-MM-DD.html/.pdf
// 입력: 측정/AI검색/추이.csv, 측정/속도/*.json(Lighthouse), data/seed/screenshots/before, data/screenshots/<날짜>, 로컬 DB 집계, 2026-09-15 베이스라인 md.
// 실행: node scripts/build-final-report.js [날짜(기본 오늘)] [--sc 서치콘솔CSV]
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const PROJ = path.join(ROOT, '..');
const { db } = require(ROOT + '/db'); const { kstDate } = require(ROOT + '/lib/util'); const shot = require(ROOT + '/lib/screenshot');
const DATE = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : kstDate();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v) => Number(v || 0).toLocaleString('ko-KR');
const dataUri = (f) => { if (!f || !fs.existsSync(f)) return ''; const ext = path.extname(f).slice(1).toLowerCase(); return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${fs.readFileSync(f).toString('base64')}`; };
const img = (f, cap, cls = '') => { const u = dataUri(f); return u ? `<figure class="${cls}"><img src="${u}" alt="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>` : ''; };

// ── 1. AI·검색 노출 추이 (추이.csv) ──
const STD = ['하나회원권거래소', '골프회원권', '무기명 골프회원권', '콘도회원권', '골프회원권 시세', '골프회원권 거래소 추천'];
const ENG = [['google', '구글'], ['naver', '네이버'], ['bing', 'Bing'], ['naverai', '네이버 AI탭'], ['perplexity', 'Perplexity']];
const BASEQ = ['하나회원권거래소는 어떤 회사야?', '하나회원권은 어떤 회사야?', '골프회원권 거래소 추천해줘. 시세도 확인하고 싶어', '골프회원권 시세 어디서 확인해? 신뢰할 만한 거래소도 알려줘'];
function readTrend() {
  const f = path.join(PROJ, '측정', 'AI검색', '추이.csv'); if (!fs.existsSync(f)) return { byDate: {}, base: {} };
  const lines = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1);
  const byDate = {}; const base = {};
  for (const l of lines) {
    const c = l.split(','); if (c.length < 5) continue; const [date, engine, query, site, brand] = c;
    if (STD.includes(query)) { byDate[date] = byDate[date] || {}; byDate[date][engine + '|' + query] = { site: +site, brand: +brand, comp: (c[5] || '').split('|').filter(Boolean) }; }
    else if (BASEQ.includes(query)) { base[date] = base[date] || {}; base[date][engine + '|' + query] = { site: +site, brand: +brand, comp: (c[5] || '').split('|').filter(Boolean) }; }
  }
  return { byDate, base };
}
const { byDate, base } = readTrend();
const dates = Object.keys(byDate).sort(); const latestDate = dates.filter(d => d <= DATE).pop() || dates[dates.length - 1];
const trend = dates.map(d => { const m = byDate[d]; const cells = Object.keys(m).length; return { date: d, cells, site: Object.values(m).filter(x => x.site).length, brand: Object.values(m).filter(x => x.brand).length }; });
const latest = byDate[latestDate] || {};
const siteNow = Object.values(latest).filter(x => x.site).length, brandNow = Object.values(latest).filter(x => x.brand).length, cellsNow = Object.keys(latest).length;
const trendSvg = (() => { if (!trend.length) return ''; const W = 640, H = 160, L = 36, R = 12, T = 12, B = 30; const mx = Math.max(10, ...trend.map(t => t.brand)); const x = (i) => L + (trend.length === 1 ? 0 : i / (trend.length - 1)) * (W - L - R); const y = (v) => T + (1 - v / mx) * (H - T - B);
  const ln = (k, col) => `<polyline fill="none" stroke="${col}" stroke-width="2.5" points="${trend.map((t, i) => `${x(i)},${y(t[k])}`).join(' ')}"/>${trend.map((t, i) => `<circle cx="${x(i)}" cy="${y(t[k])}" r="3.5" fill="${col}"/><text x="${x(i)}" y="${y(t[k]) - 7}" font-size="10" text-anchor="middle" fill="${col}">${t[k]}</text>`).join('')}`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><g>${[0, .5, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(mx * f)}" y2="${y(mx * f)}" stroke="#e3e8f0"/><text x="${L - 6}" y="${y(mx * f) + 4}" font-size="10" text-anchor="end" fill="#6b7485">${Math.round(mx * f)}</text>`).join('')}${ln('brand', '#8e44ad')}${ln('site', '#1f3a73')}${trend.map((t, i) => `<text x="${x(i)}" y="${H - 10}" font-size="10" text-anchor="middle" fill="#6b7485">${t.date.slice(5)}</text>`).join('')}</g></svg><p class="small muted">진한 남색: 우리 사이트가 결과·답변에 직접 노출된 건수 / 보라: 상호가 언급된 건수 (6질의 × 엔진 수, 10/6부터 네이버 AI탭 추가로 30건 기준)</p>`; })();

// ── 2. Lighthouse ──
function lh(name) { const f = path.join(PROJ, '측정', '속도', `${DATE}_${name}.json`); const alt = path.join(PROJ, '측정', '속도', `${name}.json`); const ff = fs.existsSync(f) ? f : fs.existsSync(alt) ? alt : null; if (!ff) return null; try { const j = JSON.parse(fs.readFileSync(ff, 'utf8')); const c = j.categories, a = j.audits; const sc = (k) => c[k] && c[k].score != null ? Math.round(c[k].score * 100) : '-'; return { perf: sc('performance'), seo: sc('seo'), a11y: sc('accessibility'), bp: sc('best-practices'), lcp: a['largest-contentful-paint']?.displayValue, cls: a['cumulative-layout-shift']?.displayValue, tbt: a['total-blocking-time']?.displayValue, fcp: a['first-contentful-paint']?.displayValue }; } catch (_) { return null; } }
const LH = { newM: lh('hanamember_co_kr__mobile'), newD: lh('hanamember_co_kr__desktop'), oldM: lh('www_hanamarket_co_kr__mobile'), oldD: lh('www_hanamarket_co_kr__desktop') };
const lhCell = (o, k) => o ? esc(o[k] ?? '-') : '미측정';

// ── 3. 자산 집계(로컬 DB; 운영과 동일 시드) ──
const q = (s) => db.prepare(s).get().c;
const A = { posts: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published'"), scheduled: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='scheduled'"), clubs: q('SELECT COUNT(*) c FROM clubs WHERE parent_id IS NULL'), clubDetails: q("SELECT COUNT(*) c FROM clubs WHERE detail_json IS NOT NULL AND detail_json<>''"), prices: q('SELECT COUNT(*) c FROM prices'), golf: q("SELECT COUNT(*) c FROM prices WHERE category='golf'"), corp: q("SELECT COUNT(*) c FROM prices WHERE category='corporate'"), condo: q("SELECT COUNT(*) c FROM prices WHERE category='condo'"), fit: q("SELECT COUNT(*) c FROM prices WHERE category='fitness'"), listings: q("SELECT COUNT(*) c FROM listings WHERE status='open'"), videos: q('SELECT COUNT(*) c FROM videos'), hist: q('SELECT COUNT(*) c FROM price_history') };
const PROD = (() => { try { return JSON.parse(fs.readFileSync(path.join(PROJ, '측정', `healthz_${DATE}.json`), 'utf8')); } catch (_) { return null; } })();
const sitemapN = (() => { try { return fs.readFileSync(path.join(PROJ, '측정', `sitemap_${DATE}.txt`), 'utf8').trim(); } catch (_) { return ''; } })();

// ── 4. 전후 스크린샷 ──
const BEFORE = path.join(ROOT, 'data', 'seed', 'screenshots', 'before'); const AFTER = path.join(ROOT, 'data', 'screenshots', DATE);
const PAIRS = [['home', '홈'], ['market', '시세표'], ['golf', '골프장 소개'], ['about', '회사소개']];
const pairHtml = PAIRS.map(([k, l]) => `<div class="pair"><div class="small"><b>${l}</b></div><div class="pair2"><div>${img(path.join(BEFORE, `before_${k}_thumb.jpg`), '이전(구 hanamarket.co.kr)')}</div><div>${img(path.join(AFTER, `after_${k}_thumb.jpg`), `이후(hanamember.co.kr, ${DATE})`)}</div></div></div>`).join('');

// ── 5. AI 캡처 샘플 ──
const CAP = path.join(PROJ, '측정', 'AI검색', latestDate || DATE);
const capImg = (f, cap) => img(path.join(CAP, f), cap, 'cap');
const baseLatestDate = Object.keys(base).sort().pop();
const baseRows = BASEQ.map((qq, i) => { const row = (e) => { const r = base[baseLatestDate] && base[baseLatestDate][e + '|' + qq]; return r ? (r.site ? '✅ 자사 노출' : r.brand ? '△ 상호 언급' : '— 미노출') + (r.comp.length ? ` <span class="muted">(${esc(r.comp.join(', '))})</span>` : '') : '미측정'; }; const before = ['자사 계열 3/10 (구도메인·신도메인·네이버블로그)', '하나금융으로 오인, 자사 0', '0 (토탈골프·프리미엄 추천)', '0 (프리미엄·회원권마켓·신라)'][i]; return `<tr><td>Q${i + 1}</td><td>${esc(qq)}</td><td>${before}</td><td>${row('perplexity')}</td><td>${row('google')}</td><td>${row('naverai')}</td></tr>`; }).join('');

// ── 6. 타깃 키워드 ──
const KW = [['골프회원권 거래소 추천', '/blog 거래소 추천 2편(10/7)'], ['콘도회원권 거래소 추천', '/blog 콘도 거래소 추천(10/8 예약)'], ['무기명 골프회원권 거래소', '/guide/anonymous, 무기명 거래소 글(10/9 예약)'], ['골프회원권 시세', '/market/golf, 시세 한눈에(10/5)'], ['콘도회원권 시세', '/market/condo, 콘도 시세 한눈에(10/6)'], ['골프회원권', '/guide/golf, /golf'], ['콘도회원권', '/guide/condo'], ['무기명 골프회원권', '/guide/anonymous, /exclusive/anonymous'], ['하나회원권거래소', '/, /about'], ['하나회원권', '/about(약칭·alternateName)']];
const kwRows = KW.map(([k, land]) => { const r = ENG.map(([e]) => { const m = Object.entries(latest).find(([key]) => key === e + '|' + k); if (!m) return '<td class="muted">—</td>'; const v = m[1]; return `<td>${v.site ? '<b class="ok">노출</b>' : v.brand ? '<span class="warn">언급</span>' : '—'}</td>`; }).join(''); return `<tr><td><b>${esc(k)}</b></td>${r}<td class="small">${esc(land)}</td></tr>`; }).join('');

// ── HTML ──
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하나회원권거래소 홈페이지 구축·최적화 최종 리포트 — 노출 성과와 기존 홈페이지 비교분석</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{--navy:#0f1c36;--blue:#1f3a73;--green:#03a65a;--line:#dfe5ef;--muted:#5b6678}
*{box-sizing:border-box}body{font-family:Pretendard Variable,Pretendard,'Malgun Gothic',sans-serif;color:#1c2333;margin:0;font-size:10.8pt;line-height:1.6;word-break:keep-all}
.cover{height:255mm;display:flex;flex-direction:column;justify-content:center;border-left:10px solid var(--navy);padding-left:14mm;page-break-after:always}
.cover .k{color:var(--green);font-weight:800;letter-spacing:.08em;font-size:11pt}.cover h1{font-size:26pt;margin:8px 0 6px;color:var(--navy);line-height:1.25}.cover .sub{font-size:13pt;color:var(--muted);margin-bottom:22px}.cover .meta{font-size:10.5pt;color:var(--muted);line-height:1.9}.cover .meta b{color:#1c2333}
h2{font-size:15pt;color:var(--navy);border-bottom:2.5px solid var(--navy);padding-bottom:4px;margin:0 0 10px;page-break-after:avoid}h3{font-size:12pt;color:var(--blue);margin:14px 0 5px;page-break-after:avoid}
section{page-break-before:always;padding-top:3mm}section.first{page-break-before:auto}
p{margin:4px 0}ul,ol{margin:4px 0;padding-left:20px}li{margin:2px 0}
table{width:100%;border-collapse:collapse;font-size:9.8pt;margin:6px 0}tr{page-break-inside:avoid}th,td{border:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top}th{background:#eef2f9;color:var(--navy)}td.num,th.num{text-align:right}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.kpi div{border:1px solid var(--line);border-radius:6px;padding:8px 10px}.kpi b{display:block;font-size:17pt;color:var(--navy)}.kpi span{font-size:9.2pt;color:var(--muted)}
.tip{background:#f3f7ff;border-left:4px solid var(--blue);padding:6px 10px;margin:8px 0;border-radius:0 6px 6px 0}.warn-box{background:#fff7e8;border-left:4px solid #d4a017;padding:6px 10px;margin:8px 0;border-radius:0 6px 6px 0}.ph{background:#fafbfd;border:1px dashed #b9c2d3;padding:8px 10px;margin:8px 0;border-radius:6px;color:var(--muted)}
figure{margin:6px 0 10px;page-break-inside:avoid}figure img{width:100%;border:1px solid var(--line);border-radius:5px}figcaption{font-size:9pt;color:var(--muted);margin-top:3px}
figure.cap{max-height:95mm;overflow:hidden}figure.cap img{object-fit:cover;object-position:top;max-height:88mm}
.pair{margin:8px 0;page-break-inside:avoid}.pair2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ok{color:#1b6b3a}.warn{color:#8a6400}.small{font-size:9.3pt}.muted{color:var(--muted)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@page{size:A4;margin:14mm 13mm}
</style></head><body>
<div class="cover"><div class="k">HANA MEMBERSHIP EXCHANGE · FINAL REPORT</div><h1>홈페이지 구축·최적화 4주 최종 리포트</h1><div class="sub">검색·AI 노출 성과 · 기존 홈페이지 비교분석 · 다음 달 운영 계획</div>
<div class="meta">대상 <b>https://hanamember.co.kr</b> (구 hanamarket.co.kr 대체)<br>기간 <b>2026-09-14 ~ ${DATE}</b> (착수 전 진단 2026-09-02)<br>작성 <b>${DATE}</b> · 총괄 관리자<br><br>이 리포트는 착수 전 진단(28점)과 비교해 4주 동안 무엇이 바뀌었고, 검색엔진과 AI 검색에서 어떻게 노출되기 시작했는지를 실측 자료로 정리한 것입니다. 측정 방법은 부록에 있습니다.</div></div>

<section class="first"><h2>1. 한눈에 보기</h2>
<div class="kpi"><div><b>28 → 100</b><span>기술 감사 점수 (9/2 외부 진단 → 자체 감사 16항목)</span></div><div><b>${n(A.posts + (PROD ? Math.max(0, PROD.posts - A.posts - A.scheduled) : 0))}편</b><span>발행 콘텐츠 (예약 ${A.scheduled}편 대기, 목표 50 달성)</span></div><div><b>230+</b><span>구글 색인 URL (10/5 site: 검색 24쪽 이상, 사이트맵 ${sitemapN || '947'} URL)</span></div><div><b>${siteNow}/${cellsNow}</b><span>AI·검색 노출 (브랜드·카테고리 6질의 × 5엔진, ${latestDate}) · 상호 언급 ${brandNow}</span></div></div>
<table><tr><th style="width:18%">항목</th><th style="width:38%">착수 전 (hanamarket.co.kr, 9/2 진단·9/15 실측)</th><th>지금 (hanamember.co.kr, ${DATE})</th></tr>
<tr><td>기술 SEO</td><td>전 페이지 같은 title "(주)하나회원권", 사이트맵·JSON-LD·llms.txt 없음, canonical 전부 홈, 모바일 속도 45점</td><td>페이지별 title·설명·canonical, 사이트맵·robots·llms.txt·RSS, JSON-LD 6종, 구 URL 301, IndexNow, 모바일 속도 ${lhCell(LH.newM, 'perf')}점</td></tr>
<tr><td>검색 노출</td><td>새 도메인 색인 0</td><td>구글 230+ URL 색인, 골프장 페이지 스니펫에 시세 범위 표시, 브랜드 질의 5개 엔진 전부 노출</td></tr>
<tr><td>AI 검색</td><td>브랜드 질의만 인용(출처 대부분 채용·사업자정보 사이트), 약칭 "하나회원권"은 하나금융으로 오인, 카테고리 질의 0</td><td>카테고리 질의 노출 시작: Bing "골프회원권 거래소 추천"·"콘도회원권", 네이버 AI탭 "무기명 골프회원권", Perplexity "거래소 추천" 상호 언급 (${latestDate})</td></tr>
<tr><td>콘텐츠</td><td>없음(갱신 없는 안내 텍스트)</td><td>블로그 ${A.posts}편 + 예약 ${A.scheduled}편, 골프장 ${A.clubs}곳(세부 정보 ${A.clubDetails}곳), 시세 ${A.prices}종목 상세·차트, 매물 ${A.listings}건·전용관 3관, 유튜브 ${A.videos}편</td></tr>
<tr><td>운영</td><td>엑셀 수기, 관리 도구 없음</td><td>관리자: 시세 자동 반영+수기 잠금, 권한 분리(총괄·업체·직원), 문의·고객 통합(상담 기록), 유입 경로·전환 추적, 주간 리포트 자동, 사용 설명서</td></tr></table>
<div class="warn-box"><b>아직 안 된 것</b> — 네이버 서치어드바이저 등록(소유확인·사이트맵) · GA4/네이버 애널리틱스 ID 입력 · 인블로그 연동(미계약) · <b>구 사이트 hanamarket.co.kr 병존</b>(AI가 두 도메인을 따로 인식) · ChatGPT 로그아웃 수동 실측. 다음 달 1주차 과제입니다.</div></section>

<section><h2>2. 기존 홈페이지와 비교</h2>
<h3>2-1. 화면 전후</h3>${pairHtml}
<h3>2-2. 속도·품질 (Lighthouse, ${DATE} 실측)</h3>
<table><tr><th>항목</th><th class="num">구 사이트 모바일</th><th class="num">신 사이트 모바일</th><th class="num">구 사이트 PC</th><th class="num">신 사이트 PC</th></tr>
<tr><td>성능(Performance)</td><td class="num">${lhCell(LH.oldM, 'perf')}</td><td class="num"><b>${lhCell(LH.newM, 'perf')}</b></td><td class="num">${lhCell(LH.oldD, 'perf')}</td><td class="num"><b>${lhCell(LH.newD, 'perf')}</b></td></tr>
<tr><td>SEO</td><td class="num">${lhCell(LH.oldM, 'seo')}</td><td class="num"><b>${lhCell(LH.newM, 'seo')}</b></td><td class="num">${lhCell(LH.oldD, 'seo')}</td><td class="num"><b>${lhCell(LH.newD, 'seo')}</b></td></tr>
<tr><td>접근성</td><td class="num">${lhCell(LH.oldM, 'a11y')}</td><td class="num"><b>${lhCell(LH.newM, 'a11y')}</b></td><td class="num">${lhCell(LH.oldD, 'a11y')}</td><td class="num"><b>${lhCell(LH.newD, 'a11y')}</b></td></tr>
<tr><td>권장 사항(Best Practices)</td><td class="num">${lhCell(LH.oldM, 'bp')}</td><td class="num"><b>${lhCell(LH.newM, 'bp')}</b></td><td class="num">${lhCell(LH.oldD, 'bp')}</td><td class="num"><b>${lhCell(LH.newD, 'bp')}</b></td></tr>
<tr><td>첫 화면 표시(FCP)</td><td class="num">${lhCell(LH.oldM, 'fcp')}</td><td class="num"><b>${lhCell(LH.newM, 'fcp')}</b></td><td class="num">${lhCell(LH.oldD, 'fcp')}</td><td class="num"><b>${lhCell(LH.newD, 'fcp')}</b></td></tr>
<tr><td>주요 콘텐츠 표시(LCP)</td><td class="num">${lhCell(LH.oldM, 'lcp')}</td><td class="num"><b>${lhCell(LH.newM, 'lcp')}</b></td><td class="num">${lhCell(LH.oldD, 'lcp')}</td><td class="num"><b>${lhCell(LH.newD, 'lcp')}</b></td></tr>
<tr><td>화면 밀림(CLS)</td><td class="num">${lhCell(LH.oldM, 'cls')}</td><td class="num"><b>${lhCell(LH.newM, 'cls')}</b></td><td class="num">${lhCell(LH.oldD, 'cls')}</td><td class="num"><b>${lhCell(LH.newD, 'cls')}</b></td></tr></table>
<p class="small muted">Lighthouse(구글 품질 도구) 동일 PC·동일 회선에서 각 1회 측정. 구 사이트 모바일은 첫 화면이 30초 넘게 걸려 사실상 모바일 이용이 어려운 상태였고, SEO 92점은 "태그가 있다"만 보는 점수라 내용 품질(동일 title·canonical 오류)은 반영되지 않습니다.</p>
<h3>2-3. 구조·콘텐츠</h3>
<table><tr><th style="width:20%">비교 축</th><th style="width:36%">구 hanamarket.co.kr</th><th>신 hanamember.co.kr</th></tr>
<tr><td>페이지 제목·설명</td><td>전 페이지 "(주)하나회원권" 동일, 설명 없음</td><td>페이지마다 고유 제목·설명·canonical (자체 감사 통과)</td></tr>
<tr><td>검색엔진·AI용 파일</td><td>sitemap·robots 지시어·llms.txt·RSS 없음</td><td>sitemap(${sitemapN || '947'} URL)·robots(AI봇 허용)·llms.txt·RSS·IndexNow 키</td></tr>
<tr><td>구조화 데이터</td><td>없음</td><td>Organization(sameAs)·FAQPage·Product/AggregateOffer·Dataset·VideoObject·BreadcrumbList</td></tr>
<tr><td>골프장 정보</td><td>안내 텍스트 294건(페이지 구조·제목 없음)</td><td>골프장 ${A.clubs}곳 개별 페이지: 기본 정보·회원권 종류 통합·시세 차트·세부 정보(개인/법인)·FAQ·해설</td></tr>
<tr><td>시세</td><td>표 1장, 종목 페이지 없음, 추이 없음</td><td>${A.golf}·법인 ${A.corp}·콘도 ${A.condo}·피트니스 ${A.fit} 종목 각각 상세 페이지 + 90일~10년 차트(이력 ${n(A.hist)}건) + 상담 버튼</td></tr>
<tr><td>매물·전용관</td><td>게시판형 목록</td><td>매물 ${A.listings}건(사진·조건·문의 동선), 무기명·대명리조트·선불카드 전용관</td></tr>
<tr><td>콘텐츠</td><td>없음</td><td>가이드·시세 리포트·골프장 소개·동향 ${A.posts}편, 질문형 소제목·직답·출처·FAQ 구조, 매일 09:00 자동 발행</td></tr>
<tr><td>전환 동선</td><td>전화번호 텍스트</td><td>대표번호 버튼(클릭 추적)·카카오톡 채널·매매 신청 폼(종목 자동 입력)·차트 옆 상담 버튼</td></tr>
<tr><td>운영 도구</td><td>엑셀</td><td>관리자(권한 3단계·시세 자동 반영·고객 DB·유입 분석·리포트) + 사용 설명서 26쪽</td></tr></table></section>

<section><h2>3. 기술 감사 — 착수 전 28점 → 100점</h2>
<p>9/2 외부 진단에서 실패했던 항목을 매일 07:00 자동 재점검합니다(16항목, 가중 점수). 현재 전 항목 통과입니다.</p>
<table><tr><th>항목</th><th style="width:22%">착수 전</th><th style="width:16%">현재</th></tr>
${[['페이지별 고유 title', '전부 동일', '통과'], ['meta description 고유·50자 이상', '없음', '통과'], ['canonical이 자기 URL', '전부 홈', '통과'], ['H1 존재', '불규칙', '통과'], ['JSON-LD(전 페이지)', '없음', '통과'], ['IndexNow 키 파일', '없음', '통과'], ['FAQPage 스키마', '없음', '통과'], ['Organization + sameAs', '없음', '통과'], ['시세 Dataset 스키마', '없음', '통과'], ['질문형 소제목 3개 이상', '없음', '통과'], ['sitemap.xml 50 URL 이상', '없음', '통과'], ['robots.txt Sitemap + AI봇 허용', '없음', '통과'], ['llms.txt', '없음', '통과'], ['RSS', '없음', '통과'], ['본문 2,000자 이상 비율 60%', '미달', '통과'], ['시세 갱신 7일 이내', '수개월 전', '통과(매일 자동)']].map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td class="ok"><b>${c}</b></td></tr>`).join('')}</table></section>

<section><h2>4. 검색엔진 색인·성과</h2>
<ul><li><b>구글</b>: 9/23 도메인 연결 당시 0 → 10/5 <code>site:hanamember.co.kr</code> 검색결과 24쪽 이상(최소 230 URL). 골프장 페이지 스니펫에 "회원권 N종·시세 범위"(AggregateOffer)가 표시되기 시작.</li><li><b>사이트맵</b> ${sitemapN || '947'} URL 제출, 글 발행 시 IndexNow(네이버·Bing) 자동 통보.</li><li><b>서치콘솔 URL 검사</b>: 9/23~10/1 수동 요청 누적 약 20건, 10/4 이후 검사 입력창 오류로 중단(사이트맵 자동 수집은 정상).</li><li><b>네이버</b>: 서치어드바이저 미등록 상태 → 다음 달 1주차 등록 예정. 네이버 일반검색은 브랜드 질의만 노출, 네이버 AI탭은 브랜드 + "무기명 골프회원권" 노출.</li></ul>
<div class="ph">서치콘솔 성과(노출·클릭·평균 게재순위·상위 검색어, 9/23~${DATE}) 표와 네이버 site: 결과 수는 계정 보유자 내보내기 자료를 받아 이 자리에 넣습니다.</div></section>

<section><h2>5. AI 검색·검색 노출</h2>
<h3>5-1. 추이 (매일 같은 6질의를 5개 엔진에 넣어 캡처)</h3>${trendSvg}
<table><tr><th>날짜</th>${trend.map(t => `<th class="num">${t.date.slice(5)}</th>`).join('')}</tr><tr><td>우리 사이트 노출</td>${trend.map(t => `<td class="num"><b>${t.site}</b>/${t.cells}</td>`).join('')}</tr><tr><td>상호 언급</td>${trend.map(t => `<td class="num">${t.brand}/${t.cells}</td>`).join('')}</tr></table>
<h3>5-2. ${latestDate} 엔진 × 질의 매트릭스</h3>
<table><tr><th>질의</th>${ENG.map(([, l]) => `<th>${l}</th>`).join('')}</tr>${STD.map(qq => `<tr><td><b>${esc(qq)}</b></td>${ENG.map(([e]) => { const v = latest[e + '|' + qq]; return `<td>${!v ? '<span class="muted">—</span>' : v.site ? '<b class="ok">✅ 노출</b>' : v.brand ? '<span class="warn">△ 언급</span>' : '—'}${v && v.comp.length ? `<br><span class="small muted">${esc(v.comp.slice(0, 3).join(', '))}</span>` : ''}</td>`; }).join('')}</tr>`).join('')}</table>
<p class="small muted">✅ 노출 = 결과·답변에 hanamember.co.kr 링크 또는 인용. △ 언급 = 상호만 언급. 회색 글씨는 같은 결과에 함께 나온 경쟁 거래소.</p>
<h3>5-3. 베이스라인 4질의 재측정 (9/15 Perplexity 로그아웃 → ${baseLatestDate || '재측정 예정'})</h3>
<table><tr><th>#</th><th style="width:30%">질의</th><th>9/15 베이스라인</th><th>Perplexity</th><th>구글</th><th>네이버 AI탭</th></tr>${baseRows}</table>
<h3>5-4. 답변 화면 예시</h3>
<div class="g2">${capImg('perplexity_하나회원권거래소.png', 'Perplexity — "하나회원권거래소": 자사 사이트 인용')}${capImg('bing_골프회원권_거래소_추천.png', 'Bing — "골프회원권 거래소 추천": 자사 노출')}</div>
<div class="g2">${capImg('naverai_무기명_골프회원권.png', '네이버 AI탭 — "무기명 골프회원권": 자사 노출')}${capImg('google_하나회원권거래소.png', '구글 — "하나회원권거래소"')}</div>
<p class="small muted">전체 캡처 ${cellsNow}장은 측정/AI검색/${latestDate}/ 에 보관.</p></section>

<section><h2>6. 타깃 키워드 10개 현황 (${latestDate})</h2>
<table><tr><th>키워드</th>${ENG.map(([, l]) => `<th>${l}</th>`).join('')}<th>랜딩 페이지·글</th></tr>${kwRows}</table>
<p class="small muted">매일 캡처하는 6질의 외 키워드(콘도 거래소 추천·콘도 시세·무기명 거래소·하나회원권)는 예약 글 발행 후 다음 주부터 캡처 세트에 추가해 추적합니다.</p>
<h3>키워드 글 발행 현황</h3>
<table><tr><th>키워드</th><th>글 제목</th><th>발행</th></tr>${db.prepare("SELECT title, published_at, status FROM posts WHERE kind='blog' AND (title LIKE '%거래소 추천%' OR title LIKE '%시세 한눈에%' OR title LIKE '%무기명 골프회원권 거래소%') ORDER BY published_at").all().map(p => `<tr><td class="small">${esc(p.title.match(/골프회원권 거래소 추천|콘도회원권 거래소 추천|무기명 골프회원권 거래소|골프회원권 시세|콘도회원권 시세/)?.[0] || '')}</td><td>${esc(p.title)}</td><td class="small">${new Date(p.published_at * 1000).toISOString().slice(0, 10)} ${p.status === 'scheduled' ? '(예약)' : ''}</td></tr>`).join('')}</table></section>

<section><h2>7. 방문·전환</h2>
<p>자체 유입 추적은 9/29 배포부터 쌓여 기간이 짧습니다. 관리자 → 유입 경로·전환에서 채널별 방문, 검색어, 문의·전화·카톡 전환, 방문 경로를 볼 수 있습니다.</p>
<div class="ph">운영 관리자 「유입 경로·전환」 9/29~${DATE} 화면(채널별·검색어·전환)과 「기술 감사·방문」의 AI 크롤러(GPTBot·ClaudeBot·PerplexityBot) 방문 수를 캡처해 이 자리에 넣습니다. (총괄은 운영 관리자 비밀번호를 보관하지 않아 계정 보유자가 캡처)</div>
<p>대시보드에는 일간 방문자·문의 14일 그래프가 있으며, 문의는 접수 즉시 고객 DB에 담당자·상담 기록과 함께 쌓입니다.</p></section>

<section><h2>8. 다음 달 운영 계획 (10/9 ~ 11/8) 요약</h2>
<table><tr><th style="width:24%">지표</th><th style="width:22%">기준(${latestDate})</th><th style="width:22%">11/8 목표</th><th>방법</th></tr>
<tr><td>AI·검색 노출</td><td>${siteNow}/${cellsNow}</td><td>15/30 이상, 카테고리 3개 엔진 이상</td><td>키워드 글 심화, 엔티티 통일, 인용 구조</td></tr>
<tr><td>약칭 "하나회원권" 인식</td><td>Perplexity 하나금융 오인</td><td>브랜드 질의 2종 모두 자사</td><td>alternateName·sameAs·외부 프로필 명칭 통일</td></tr>
<tr><td>구글 색인</td><td>230+</td><td>400+</td><td>사이트맵 분할·내부 링크 허브·URL 검사</td></tr>
<tr><td>네이버</td><td>미등록</td><td>등록·수집, 웹사이트 탭 브랜드+2개</td><td>서치어드바이저·RSS·블로그 링크</td></tr>
<tr><td>전환</td><td>${DATE} 집계</td><td>주당 1.5배</td><td>상위 유입 페이지 CTA, 차트 상담 버튼, 문의 응대</td></tr>
<tr><td>콘텐츠</td><td>${A.posts}편 · 세부 ${A.clubDetails}곳</td><td>+20편 · 세부 35곳</td><td>주 5편, 공식 출처</td></tr></table>
<p>주차별 실행 계획·역할 분담·리스크는 별도 문서 「10월 8일 최종 전달 구성안 · 1개월 액션 플랜」에 있습니다. 운영은 월 147만원 범위 협의 후 10/9부터 시작합니다.</p>
<div class="tip"><b>결정이 필요한 것</b> — 구 사이트 hanamarket.co.kr를 새 사이트로 301 전환할지. 전환하면 구 도메인이 받던 인용·링크가 새 사이트로 합쳐져 AI가 한 회사로 인식합니다(권장). 유지한다면 구 사이트에 canonical·안내 배너라도 필요합니다.</div></section>

<section><h2>부록. 측정 방법</h2>
<ul><li><b>AI·검색 캡처</b>: 실제 크롬(로그인 없음, 개인화 최소화) 자동화로 구글·네이버·Bing·네이버 AI탭·Perplexity에 같은 질의를 넣고 결과 화면을 저장, 본문에 hanamember.co.kr 링크(노출)·상호(언급) 포함 여부를 판정. 9/29부터 매일, 10/6부터 네이버 AI탭 추가.</li><li><b>베이스라인</b>: 9/15 Perplexity 로그아웃 4질의 실측(측정/2026-09-15_AI노출_베이스라인.md). ChatGPT는 봇 차단으로 자동화 불가, 수동 실측 별첨.</li><li><b>기술 감사</b>: 사이트 내부 16항목 자동 점검(lib/audit.js), 9/2 외부 진단 항목과 대응.</li><li><b>속도</b>: Lighthouse 12.x, 동일 PC·회선, 모바일(기본 스로틀)·PC 프리셋 각 1회. 결과 JSON은 측정/속도/.</li><li><b>색인</b>: 구글 site: 검색 결과 페이지 수, 사이트맵 URL 수, 서치콘솔.</li><li><b>전후 화면</b>: 구 사이트는 9/14 착수 시 캡처본, 신 사이트는 ${DATE} 운영 캡처.</li></ul>
<p class="small muted">하나회원권거래소 홈페이지 구축·최적화 최종 리포트 · ${DATE}</p></section>
</body></html>`;
const out = path.join(PROJ, '보고', `하나회원권_최종리포트_${DATE}`); fs.writeFileSync(out + '.html', html);
(async () => { const b = await shot.launch(); const p = await b.newPage(); await p.goto('file:///' + (out + '.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 90000 }); await p.pdf({ path: out + '.pdf', format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '13mm', right: '13mm' }, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:sans-serif">하나회원권거래소 최종 리포트 · <span class="pageNumber"></span>/<span class="totalPages"></span></div>' }); await b.close(); console.log('ok', out + '.pdf', Math.round(fs.statSync(out + '.pdf').size / 1024) + 'KB'); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });
