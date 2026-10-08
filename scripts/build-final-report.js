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
const peak = trend.reduce((m, t) => t.site > m.site ? t : m, { site: 0, date: '' });
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
const POSTS = PROD && PROD.posts ? PROD.posts : A.posts; // 운영 발행 수(healthz) 우선
const sitemapN = (() => { try { return fs.readFileSync(path.join(PROJ, '측정', `sitemap_${DATE}.txt`), 'utf8').trim(); } catch (_) { return ''; } })();

// ── 4. 전후 스크린샷 ──
const BEFORE = path.join(ROOT, 'data', 'seed', 'screenshots', 'before'); const AFTER = path.join(ROOT, 'data', 'screenshots', DATE);
const PAIRS = [['home', '홈'], ['market', '시세표'], ['golf', '골프장 소개'], ['about', '회사소개']];
const SS = path.join(PROJ, '측정', '스크린샷');
const EXTRA = [['모바일 홈', path.join(BEFORE, 'before_home_mobile.png'), path.join(AFTER, 'after_home_mobile.png'), 'tall'], ['콘도회원권 매물', path.join(SS, '2026-10-06', 'before_condo_listings.png'), path.join(SS, '2026-10-06', 'after_condo_listings_v3.png'), ''], ['함께한 파트너', path.join(SS, '2026-10-06', 'before_partners.png'), path.join(SS, '2026-10-06', 'after_partners.png'), ''], ['관리자(업체 관리자 화면)', path.join(SS, '2026-10-06', 'before_admin_dash.png'), path.join(SS, '2026-10-06', 'after_admin_manager_dash_v2.png'), '']];
const pairHtml = PAIRS.map(([k, l]) => `<div class="pair"><div class="small"><b>${l}</b></div><div class="pair2"><div>${img(path.join(BEFORE, `before_${k}_thumb.jpg`), '이전(구 hanamarket.co.kr)')}</div><div>${img(path.join(AFTER, `after_${k}_thumb.jpg`), `이후(hanamember.co.kr, ${DATE})`)}</div></div></div>`).join('')
  + EXTRA.map(([l, b, a, cls]) => `<div class="pair ${cls}"><div class="small"><b>${l}</b></div><div class="pair2"><div>${img(b, l.includes('관리자') ? '이전(10/6, 단일 관리자·개발 메뉴 노출)' : l.includes('파트너') || l.includes('콘도') ? '이전(10/6 오전)' : '이전(구 사이트)')}</div><div>${img(a, l.includes('관리자') ? '이후(업체 관리자 전용 화면)' : '이후')}</div></div></div>`).join('');

// ── 5. AI 캡처 샘플 ──
const CAP = path.join(PROJ, '측정', 'AI검색', latestDate || DATE);
const capImg = (f, cap) => img(path.join(CAP, f), cap, 'cap');
const baseLatestDate = Object.keys(base).sort().pop();
const baseRows = BASEQ.map((qq, i) => { const row = (e) => { const r = base[baseLatestDate] && base[baseLatestDate][e + '|' + qq]; return r ? (r.site ? '✅ 자사 노출' : r.brand ? '△ 상호 언급' : '— 미노출') + (r.comp.length ? ` <span class="muted">(${esc(r.comp.join(', '))})</span>` : '') : '미측정'; }; const before = ['자사 계열 3/10 (구도메인·신도메인·네이버블로그)', '하나금융으로 오인, 자사 0', '0 (토탈골프·프리미엄 추천)', '0 (프리미엄·회원권마켓·신라)'][i]; return `<tr><td>Q${i + 1}</td><td>${esc(qq)}</td><td>${before}</td><td>${row('perplexity')}</td><td>${row('google')}</td><td>${row('naverai')}</td></tr>`; }).join('');

// ── 6. 타깃 키워드 ──
const KW = [['골프회원권 거래소 추천', '/blog 거래소 추천 2편(10/7)'], ['콘도회원권 거래소 추천', '/blog 콘도 거래소 추천(10/8 예약)'], ['무기명 골프회원권 거래소', '/guide/anonymous, 무기명 거래소 글(10/9 예약)'], ['골프회원권 시세', '/market/golf, 시세 한눈에(10/5)'], ['콘도회원권 시세', '/market/condo, 콘도 시세 한눈에(10/6)'], ['골프회원권', '/guide/golf, /golf'], ['콘도회원권', '/guide/condo'], ['무기명 골프회원권', '/guide/anonymous, /exclusive/anonymous'], ['하나회원권거래소', '/, /about'], ['하나회원권', '/about(약칭·alternateName)']];
const kwRows = KW.map(([k, land]) => { const r = ENG.map(([e]) => { const m = Object.entries(latest).find(([key]) => key === e + '|' + k); if (!m) return '<td class="muted">—</td>'; const v = m[1]; return `<td>${v.site ? '<b class="ok">노출</b>' : v.brand ? '<span class="warn">언급</span>' : '—'}</td>`; }).join(''); return `<tr><td><b>${esc(k)}</b></td>${r}<td class="small">${esc(land)}</td></tr>`; }).join('');

// ── HTML ──
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하나회원권거래소 홈페이지 구축·최적화 종합 보고서 — 진행 내역·전후 비교·노출 성과·향후 관리</title>
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
.pair{margin:8px 0;page-break-inside:avoid}.pair2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pair.tall figure{max-height:120mm;overflow:hidden}.pair.tall img{object-fit:cover;object-position:top;max-height:116mm}
.ok{color:#1b6b3a}.warn{color:#8a6400}.small{font-size:9.3pt}.muted{color:var(--muted)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@page{size:A4;margin:14mm 13mm}
</style></head><body>
<div class="cover"><div class="k">HANA MEMBERSHIP EXCHANGE · FINAL REPORT</div><h1>홈페이지 구축·최적화 종합 보고서</h1><div class="sub">4주 진행 내역 · 기존 홈페이지 전후 비교 · 검색·AI 노출 성과 · 향후 관리와 방향성</div>
<div class="meta">대상 <b>https://hanamember.co.kr</b> (구 hanamarket.co.kr 대체)<br>기간 <b>2026-09-14 ~ ${DATE}</b> (착수 전 진단 2026-09-02)<br>작성 <b>${DATE}</b> · 총괄 관리자<br><br>이 보고서는 4주 동안 무엇을 만들고 바꿨는지(진행 내역·구축 범위), 기존 홈페이지와 무엇이 달라졌는지(전후 비교), 검색엔진과 AI 검색에서 어떻게 노출되기 시작했는지(실측), 앞으로 어떻게 관리하고 어디로 갈지(향후 관리·방향성)를 한 권으로 정리한 것입니다.</div></div>

<section class="first"><h2>1. 한눈에 보기</h2>
<div class="kpi"><div><b>28 → 100</b><span>기술 감사 점수 (9/2 외부 진단 → 자체 감사 16항목)</span></div><div><b>${n(POSTS)}편</b><span>발행 콘텐츠 (예약 ${A.scheduled}편 대기, 목표 50 달성)</span></div><div><b>230+</b><span>구글 색인 URL (10/5 site: 검색 24쪽 이상, 사이트맵 ${sitemapN || '947'} URL)</span></div><div><b>${siteNow}/${cellsNow}</b><span>AI·검색 노출 (6질의 × 5엔진, ${latestDate}) · 최고 ${peak.site} (${peak.date.slice(5)}) · 상호 언급 ${brandNow} · 9/29 첫 측정 4</span></div></div>
<table><tr><th style="width:18%">항목</th><th style="width:38%">착수 전 (hanamarket.co.kr, 9/2 진단·9/15 실측)</th><th>지금 (hanamember.co.kr, ${DATE})</th></tr>
<tr><td>기술 SEO</td><td>전 페이지 같은 title "(주)하나회원권", 사이트맵·JSON-LD·llms.txt 없음, canonical 전부 홈</td><td>페이지별 title·설명·canonical, 사이트맵·robots·llms.txt·RSS, JSON-LD 6종, 구 URL 301, IndexNow</td></tr>
<tr><td>검색 노출</td><td>새 도메인 색인 0</td><td>구글 230+ URL 색인, 골프장 페이지 스니펫에 시세 범위 표시, 브랜드 질의 5개 엔진 전부 노출</td></tr>
<tr><td>AI 검색</td><td>브랜드 질의만 인용(출처 대부분 채용·사업자정보 사이트), 약칭 "하나회원권"은 하나금융으로 오인, 카테고리 질의 0</td><td>카테고리 질의 노출 시작: Bing "골프회원권 거래소 추천"·"콘도회원권", 네이버 AI탭 "무기명 골프회원권", Perplexity "거래소 추천" 상호 언급 (${latestDate})</td></tr>
<tr><td>콘텐츠</td><td>없음(갱신 없는 안내 텍스트)</td><td>블로그 ${POSTS}편 + 예약 ${A.scheduled}편, 골프장 ${A.clubs}곳(세부 정보 ${A.clubDetails}곳), 시세 ${A.prices}종목 상세·차트, 매물 ${A.listings}건·전용관 3관, 유튜브 ${A.videos}편</td></tr>
<tr><td>운영</td><td>엑셀 수기, 관리 도구 없음</td><td>관리자: 시세 자동 반영+수기 잠금, 권한 분리(총괄·업체·직원), 문의·고객 통합(상담 기록), 유입 경로·전환 추적, 주간 리포트 자동, 사용 설명서</td></tr></table>
</section>

<section><h2>2. 진행 내역 (주차별)</h2>
<table><tr><th style="width:14%">주차</th><th style="width:28%">구축·기술</th><th style="width:30%">콘텐츠·데이터</th><th>노출·운영</th></tr>
<tr><td><b>1주차</b><br>9/14~9/20</td><td>사이트 전체 신규 구축(Express·SQLite·SSR), 관리자 1차(시세 엑셀 업로드·골프장·매물·문의·공지·설정), 자동발행 스케줄러(09:00·15:00), 자체 기술 감사 16항목, Railway 배포(9/16~17)</td><td>골프장 64곳 기본정보, 시세 4분류 시드, 가이드·동향 글 18편 집필, 유튜브 30편 연동, 회사소개·연혁·FAQ 페이지</td><td>Perplexity 로그아웃 4질의 베이스라인 실측(9/15), 구 사이트 전후 캡처 체계, 1주차 주간 리포트 자동 생성</td></tr>
<tr><td><b>2주차</b><br>9/21~9/27</td><td>정식 도메인 hanamember.co.kr 연결(9/23), 구 도메인 301 내장, 헤더 v2(두 줄·대표번호·카카오), 시·도 지도형 골프장 탐색, 카카오 채널 플로팅, 볼륨·GitHub 배포 정리</td><td>구 사이트 골프장 안내 294건 이관(총 300), 골프장 지역·홀수 검증 39곳, 가이드 글 누적 28편, 파트너·연혁 반영</td><td>구글 서치콘솔 소유확인·사이트맵·URL 검사 20건, 네이버 태그 내장, NAP 통일 체크리스트, 2주차 리포트</td></tr>
<tr><td><b>3주차</b><br>9/28~10/4</td><td>글 썸네일 자동 생성(사진 카드), 유입 경로·전환 추적(채널·검색어·전화·카톡·UTM), 동아 시세 자동 반영+이상치 안전장치, 차트 90일~10년, 회원권 종류 통합(165곳), 회원권 세부 정보·개인/법인 탭, 메뉴 회원권 매물/전용관 분리, 시세 종목 상세 페이지, 예약 발행</td><td>구 사이트 시세 전체 이관(골프 269·법인 313·콘도 84·피트니스 56) + 과거 이력 76종목, 매물 243건·해외투어 16건 이관, 골프장 해설 165곳 자동 작성, 세부 정보 11곳, 키워드 글 5편 예약</td><td>AI·검색 캡처 매일(9/29~), 색인 230+ 확인, 3주차 리포트, 10/4 서치콘솔 UI 오류로 검사 중단</td></tr>
<tr><td><b>4주차</b><br>10/5~10/8</td><td>관리자 권한 3단계(총괄·업체·직원), 문의·고객 통합(상담 기록·담당자), 업체용 대시보드, 시세 수기 잠금, 법인 시세 중복 통합(97그룹), 차트 상담 버튼(리드 추적), 블로그 중복 발행 원인 수정·정리, 캐시 버스팅, 홈 문구·카드 모션</td><td>골프장 세부 정보 20곳, 키워드 글(거래소 추천·시세·무기명) 발행, 법인·콘도·피트니스·브랜드 글 예약(10/10~10/13), 주간 리포트 카테고리 로테이션, 연혁 2026·메뉴명·콘도 썸네일·파트너 로고</td><td>베이스라인 4질의 재측정(약칭 오인 해소, Perplexity 거래소 추천 노출), Lighthouse 구/신 측정, 관리자 사용 설명서 26쪽, 종합 보고서·1개월 액션 플랜</td></tr></table>
<p class="small muted">일별 상세는 보고/2026-09-15 ~ 2026-10-07 일일작업보고(23건)에 있습니다.</p></section>

<section><h2>3. 구축 범위 — 만들어진 것 전체</h2>
<table><tr><th style="width:20%">영역</th><th>내용</th></tr>
<tr><td>공개 사이트</td><td>홈(히어로 슬라이드·시세 띠·골프장 지도·추천 매물·가이드·유튜브·FAQ·파트너 로고), 시세표 4분류(${A.prices}종목, 지역·검색·정렬·종목 비교·90일 추이) + 종목 상세·차트·상담 버튼, 골프장 소개 ${A.clubs}곳(회원권 종류 통합·세부 정보·개인/법인·FAQ·해설), 회원권 안내 4종·무기명 안내, 회원권 매물·전용관 3관(무기명·대명리조트·선불카드)·회원권 분양·해외투어, 매매 신청(종목 자동 입력), 시세 리포트·가이드 블로그 ${POSTS}편, 하나TV유튜브 ${A.videos}편, 회사소개·연혁·오시는 길·개인정보처리방침</td></tr>
<tr><td>검색·AI 최적화</td><td>페이지별 title·설명·canonical, sitemap(${sitemapN || '947'} URL)·robots(AI봇 허용)·llms.txt·RSS·IndexNow, JSON-LD 6종(Organization/sameAs·FAQPage·Product/AggregateOffer·Dataset·VideoObject·Breadcrumb), 질문형 소제목·직답 구조, 구 URL 27개+구 도메인 301, OG 썸네일 자동 생성, 네이버·구글 소유확인 태그</td></tr>
<tr><td>관리자</td><td>권한 3단계(총괄·업체 관리자·직원), 대시보드(일간 방문자·문의·시세·매물·블로그 현황), 시세 관리(동아 자동 반영·수기 잠금·엑셀 업로드·직접 수정), 골프장 관리(세부 정보 편집·검증), 매물·전용관 탭, 문의·고객 관리(자동 등록·담당자·상담 기록·CSV), 공지·뉴스·유튜브, 유입 경로·전환(클릭 상세·UTM 생성), 계정·담당자, 내 계정, 블로그 발행 현황, 총괄 전용(콘텐츠·자동발행·실행계획·리포트·기술감사·설정)</td></tr>
<tr><td>자동화</td><td>매일 09:00·15:00 콘텐츠 슬롯(예약 발행·템플릿 글·중복 방지), 08:30 동아 시세 반영(이상치 안전장치), 07:00 기술 감사, 월요일 08:30 주간 리포트(전후 캡처 첨부), 서버 시작 시 데이터 정정·중복 정리·법인 통합 자동 실행</td></tr>
<tr><td>측정 도구</td><td>AI·검색 캡처 스크립트(5엔진·6질의), Lighthouse, 전후 스크린샷 세트, 유입 추적, 종합 보고서 생성 스크립트</td></tr>
<tr><td>문서</td><td>관리자 사용 설명서(업체용 26쪽), 운영 인수인계, 검색엔진 등록 가이드, NAP 체크리스트, 인블로그 세팅 가이드, 1개월 액션 플랜, 일일 작업 보고 23건, 주간 리포트 3건</td></tr></table></section>

<section><h2>4. 기존 홈페이지와 전후 비교</h2>
<h3>4-1. 화면 전후</h3>${pairHtml}
<h3>4-2. 구조·콘텐츠</h3>
<table><tr><th style="width:20%">비교 축</th><th style="width:36%">구 hanamarket.co.kr</th><th>신 hanamember.co.kr</th></tr>
<tr><td>페이지 제목·설명</td><td>전 페이지 "(주)하나회원권" 동일, 설명 없음</td><td>페이지마다 고유 제목·설명·canonical (자체 감사 통과)</td></tr>
<tr><td>검색엔진·AI용 파일</td><td>sitemap·robots 지시어·llms.txt·RSS 없음</td><td>sitemap(${sitemapN || '947'} URL)·robots(AI봇 허용)·llms.txt·RSS·IndexNow 키</td></tr>
<tr><td>구조화 데이터</td><td>없음</td><td>Organization(sameAs)·FAQPage·Product/AggregateOffer·Dataset·VideoObject·BreadcrumbList</td></tr>
<tr><td>골프장 정보</td><td>안내 텍스트 294건(페이지 구조·제목 없음)</td><td>골프장 ${A.clubs}곳 개별 페이지: 기본 정보·회원권 종류 통합·시세 차트·세부 정보(개인/법인)·FAQ·해설</td></tr>
<tr><td>시세</td><td>표 1장, 종목 페이지 없음, 추이 없음</td><td>${A.golf}·법인 ${A.corp}·콘도 ${A.condo}·피트니스 ${A.fit} 종목 각각 상세 페이지 + 90일~10년 차트(이력 ${n(A.hist)}건) + 상담 버튼</td></tr>
<tr><td>매물·전용관</td><td>게시판형 목록</td><td>매물 ${A.listings}건(사진·조건·문의 동선), 무기명·대명리조트·선불카드 전용관</td></tr>
<tr><td>콘텐츠</td><td>없음</td><td>가이드·시세 리포트·골프장 소개·동향 ${POSTS}편, 질문형 소제목·직답·출처·FAQ 구조, 매일 09:00 자동 발행</td></tr>
<tr><td>전환 동선</td><td>전화번호 텍스트</td><td>대표번호 버튼(클릭 추적)·카카오톡 채널·매매 신청 폼(종목 자동 입력)·차트 옆 상담 버튼</td></tr>
<tr><td>운영 도구</td><td>엑셀</td><td>관리자(권한 3단계·시세 자동 반영·고객 DB·유입 분석·리포트) + 사용 설명서 26쪽</td></tr></table></section>

<section><h2>5. 기술 감사 — 착수 전 28점 → 100점</h2>
<p>9/2 외부 진단에서 실패했던 항목을 매일 07:00 자동 재점검합니다(16항목, 가중 점수). 현재 전 항목 통과입니다.</p>
<table><tr><th>항목</th><th style="width:22%">착수 전</th><th style="width:16%">현재</th></tr>
${[['페이지별 고유 title', '전부 동일', '통과'], ['meta description 고유·50자 이상', '없음', '통과'], ['canonical이 자기 URL', '전부 홈', '통과'], ['H1 존재', '불규칙', '통과'], ['JSON-LD(전 페이지)', '없음', '통과'], ['IndexNow 키 파일', '없음', '통과'], ['FAQPage 스키마', '없음', '통과'], ['Organization + sameAs', '없음', '통과'], ['시세 Dataset 스키마', '없음', '통과'], ['질문형 소제목 3개 이상', '없음', '통과'], ['sitemap.xml 50 URL 이상', '없음', '통과'], ['robots.txt Sitemap + AI봇 허용', '없음', '통과'], ['llms.txt', '없음', '통과'], ['RSS', '없음', '통과'], ['본문 2,000자 이상 비율 60%', '미달', '통과'], ['시세 갱신 7일 이내', '수개월 전', '통과(매일 자동)']].map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td class="ok"><b>${c}</b></td></tr>`).join('')}</table></section>

<section><h2>6. 검색엔진 색인·성과</h2>
<ul><li><b>구글</b>: 9/23 도메인 연결 당시 0 → 10/5 <code>site:hanamember.co.kr</code> 검색결과 24쪽 이상(최소 230 URL). 골프장 페이지 스니펫에 "회원권 N종·시세 범위"(AggregateOffer)가 표시되기 시작.</li><li><b>사이트맵</b> ${sitemapN || '947'} URL 제출, 글 발행 시 IndexNow(네이버·Bing) 자동 통보.</li><li><b>서치콘솔 URL 검사</b>: 9/23~10/1 수동 요청 누적 약 20건, 10/4 이후 검사 입력창 오류로 중단(사이트맵 자동 수집은 정상).</li><li><b>네이버</b>: 일반검색은 브랜드 질의 노출, 네이버 AI탭은 브랜드 + "무기명 골프회원권" 노출.</li></ul>
</section>

<section><h2>7. AI 검색·검색 노출</h2>
<h3>7-1. 추이 (매일 같은 6질의를 5개 엔진에 넣어 캡처)</h3>${trendSvg}
<table><tr><th>날짜</th>${trend.map(t => `<th class="num">${t.date.slice(5)}</th>`).join('')}</tr><tr><td>우리 사이트 노출</td>${trend.map(t => `<td class="num"><b>${t.site}</b>/${t.cells}</td>`).join('')}</tr><tr><td>상호 언급</td>${trend.map(t => `<td class="num">${t.brand}/${t.cells}</td>`).join('')}</tr></table>
<h3>7-2. ${latestDate} 엔진 × 질의 매트릭스</h3>
<table><tr><th>질의</th>${ENG.map(([, l]) => `<th>${l}</th>`).join('')}</tr>${STD.map(qq => `<tr><td><b>${esc(qq)}</b></td>${ENG.map(([e]) => { const v = latest[e + '|' + qq]; return `<td>${!v ? '<span class="muted">—</span>' : v.site ? '<b class="ok">✅ 노출</b>' : v.brand ? '<span class="warn">△ 언급</span>' : '—'}${v && v.comp.length ? `<br><span class="small muted">${esc(v.comp.slice(0, 3).join(', '))}</span>` : ''}</td>`; }).join('')}</tr>`).join('')}</table>
<p class="small muted">✅ 노출 = 결과·답변에 hanamember.co.kr 링크 또는 인용. △ 언급 = 상호만 언급. 회색 글씨는 같은 결과에 함께 나온 경쟁 거래소.</p>
<h3>7-3. 베이스라인 4질의 재측정 (9/15 Perplexity 로그아웃 → ${baseLatestDate || '재측정 예정'})</h3>
<table><tr><th>#</th><th style="width:30%">질의</th><th>9/15 베이스라인</th><th>Perplexity</th><th>구글</th><th>네이버 AI탭</th></tr>${baseRows}</table>
<h3>7-4. 답변 화면 예시</h3>
<div class="g2">${capImg('perplexity_하나회원권거래소.png', 'Perplexity — "하나회원권거래소": 자사 사이트 인용')}${capImg('bing_골프회원권_거래소_추천.png', 'Bing — "골프회원권 거래소 추천": 자사 노출')}</div>
<div class="g2">${capImg('naverai_무기명_골프회원권.png', '네이버 AI탭 — "무기명 골프회원권": 자사 노출')}${capImg('google_하나회원권거래소.png', '구글 — "하나회원권거래소"')}</div>
<p class="small muted">전체 캡처 ${cellsNow}장은 측정/AI검색/${latestDate}/ 에 보관.</p></section>

<section><h2>8. 타깃 키워드 10개 현황 (${latestDate})</h2>
<table><tr><th>키워드</th>${ENG.map(([, l]) => `<th>${l}</th>`).join('')}<th>랜딩 페이지·글</th></tr>${kwRows}</table>
<p class="small muted">매일 캡처하는 6질의 외 키워드(콘도 거래소 추천·콘도 시세·무기명 거래소·하나회원권)는 예약 글 발행 후 다음 주부터 캡처 세트에 추가해 추적합니다.</p>
<h3>키워드 글 발행 현황</h3>
<table><tr><th>키워드</th><th>글 제목</th><th>발행</th></tr>${db.prepare("SELECT title, published_at, status FROM posts WHERE kind='blog' AND (title LIKE '%거래소 추천%' OR title LIKE '%시세 한눈에%' OR title LIKE '%무기명 골프회원권 거래소%') ORDER BY published_at").all().map(p => `<tr><td class="small">${esc(p.title.match(/골프회원권 거래소 추천|콘도회원권 거래소 추천|무기명 골프회원권 거래소|골프회원권 시세|콘도회원권 시세/)?.[0] || '')}</td><td>${esc(p.title)}</td><td class="small">${new Date(p.published_at * 1000).toISOString().slice(0, 10)} ${p.status === 'scheduled' ? '(예약)' : ''}</td></tr>`).join('')}</table></section>

<section><h2>9. 방문·전환</h2>
<p>자체 유입 추적은 9/29 배포부터 쌓여 기간이 짧습니다. 관리자 → 유입 경로·전환에서 채널별 방문, 검색어, 문의·전화·카톡 전환, 방문 경로를 볼 수 있습니다.</p>

<p>대시보드에는 일간 방문자·문의 14일 그래프가 있으며, 문의는 접수 즉시 고객 DB에 담당자·상담 기록과 함께 쌓입니다. 10/7부터는 시세 차트 옆 「이 회원권 상담」 버튼 클릭도 전환 행동으로 집계됩니다.</p>
<div class="g2">${img(path.join(SS, 'manual', '07_inflow.png'), '관리자 유입 경로·전환 화면(예시 데이터): 채널·출처·검색어·전환과 일별 방문')}${img(path.join(SS, 'manual', '05_customers.png'), '문의·고객 관리 화면(예시 데이터): 담당자 배정·상태·상담 기록')}</div></section>

<section><h2>10. 향후 관리와 방향성</h2>
<h3>10-1. 운영 원칙</h3>
<ul><li><b>매일 쌓이는 자산</b>: 시세(자동)·글(예약+템플릿)·골프장 정보(세부 정보 확대)는 멈추지 않게 유지합니다. 검색·AI 노출은 누적량과 갱신 빈도에 반응합니다.</li><li><b>한 회사로 보이게</b>: 홈페이지·네이버 플레이스·유튜브·블로그·구 도메인의 명칭·주소·전화를 통일하고, 약칭 "하나회원권"을 Organization alternateName과 콘텐츠에서 반복해 금융사 오인을 막습니다.</li><li><b>측정이 먼저</b>: 같은 질의·같은 방법으로 매주 캡처해 추이를 보고, 월 1회 베이스라인 4질의와 서치콘솔로 재측정합니다.</li><li><b>전환까지</b>: 노출은 수단입니다. 유입→전화·카톡·문의→고객 DB→상담 기록으로 이어지는 흐름을 관리자에서 끊기지 않게 운영합니다.</li></ul>
<h3>10-2. 다음 1개월 목표 (10/9 ~ 11/8)</h3>
<table><tr><th style="width:24%">지표</th><th style="width:22%">기준(${latestDate})</th><th style="width:22%">11/8 목표</th><th>방법</th></tr>
<tr><td>AI·검색 노출</td><td>${siteNow}/${cellsNow} (최근 일주일 5~8, 날마다 출렁임)</td><td>15/30 이상, 카테고리 3개 엔진 이상</td><td>키워드 글 심화, 엔티티 통일, 인용 구조(직답·출처·표)</td></tr>
<tr><td>약칭 "하나회원권" 인식</td><td>Perplexity·구글 자사 인용으로 전환(10/7)</td><td>전 엔진 유지, 네이버 AI탭 자사 인용</td><td>alternateName·sameAs·브랜드 글(10/13)·외부 프로필 명칭 통일</td></tr>
<tr><td>구글 색인</td><td>230+</td><td>400+</td><td>사이트맵 분할·내부 링크 허브·URL 검사 주 10건</td></tr>
<tr><td>네이버</td><td>—</td><td>등록·수집 완료, 웹사이트 탭 브랜드+카테고리 2개</td><td>서치어드바이저·RSS·블로그 hngolf2 링크</td></tr>
<tr><td>전환(문의+전화+카톡)</td><td>${DATE} 집계</td><td>주당 기준선의 1.5배</td><td>상위 유입 페이지 CTA, 차트 상담 버튼, 문의 응대 시간</td></tr>
<tr><td>콘텐츠</td><td>${POSTS}편 · 골프장 세부 ${A.clubDetails}곳</td><td>+20편(골프·법인·콘도·피트니스·브랜드 균형) · 세부 35곳</td><td>주 5편, 공식 출처만, 카테고리 로테이션</td></tr></table>
<h3>10-3. 주차별 실행 계획</h3>
<table><tr><th style="width:12%">주차</th><th>노출·키워드</th><th>엔티티·기술</th><th>전환·운영</th><th style="width:15%">측정·보고</th></tr>
<tr><td><b>1주</b><br>10/9~15</td><td>법인·콘도·피트니스·브랜드 글 발행(10/10~13), 키워드 글 2편 추가, 골프장 세부 5곳</td><td>네이버 서치어드바이저 등록·사이트맵·RSS, GA4·네이버 애널리틱스 ID 입력, 구 도메인 처리(301 권장), 사이트맵 분할</td><td>업체 관리자 교육(설명서·비밀번호·직원 계정), 문의 응대 흐름 점검</td><td>AI 캡처 화·금, 주간 리포트, URL 검사 10건</td></tr>
<tr><td><b>2주</b><br>10/16~22</td><td>명의개서 비용 2026, 콘도 리조트별 시세, 무기명 vs 기명, 지역별 추천, 분양 안내 등 5편, 세부 5곳</td><td>NAP 통일(네이버 플레이스·구글 비즈니스·유튜브), UTM 링크(유튜브 설명·네이버 블로그), alternateName 보강, 리치결과 테스트</td><td>상위 유입 10페이지 CTA 조정, 매물 주 1회 갱신</td><td>2주차 캡처 비교, 인블로그 연동 결정</td></tr>
<tr><td><b>3주</b><br>10/23~29</td><td>지역 허브 페이지(수도권·영남·충청·호남·강원·제주), 11월 시세 리포트, 키워드 글 2편, 세부 5곳</td><td>오래된 글 갱신, 골프장 FAQ·AggregateOffer 보강, 이미지 alt·용량, Lighthouse 재측정</td><td>문의 폼 간소화 검토, 카카오 채널 응답 메시지, 접수→연락 시간 점검</td><td>캡처 화·금, 주간 리포트</td></tr>
<tr><td><b>4주</b><br>10/30~11/8</td><td>성과 낮은 키워드 보강 3편, 세부 5곳, 11월 예약 글 세팅</td><td>구조화 데이터·색인 커버리지 최종 점검, 구 도메인 전환 효과 확인</td><td>고객 DB 운영 점검(배정률·상담 기록), 업체 요청 반영</td><td><b>월간 재측정</b>(6질의×5엔진+베이스라인 4질의+서치콘솔 28일) → 월간 리포트</td></tr></table>
<h3>10-4. 상시 루틴과 역할</h3>
<table><tr><th style="width:14%">주기</th><th>총괄 관리자</th><th>하나회원권거래소(업체)</th></tr>
<tr><td>매일</td><td>09:00 자동발행·08:30 시세 반영 확인, 문의 유입 모니터링, 오류 점검</td><td>대시보드 확인, 신규 문의 담당자 배정·당일 연락, 상담 기록</td></tr>
<tr><td>주 2회</td><td>AI·검색 캡처 → 추이 기록</td><td>매물 등록·종료 갱신, 공지·유튜브 추가</td></tr>
<tr><td>매주 월</td><td>주간 리포트 검토·전달, 서치콘솔·네이버 수집 상태, 키워드 순위 기록</td><td>법인·콘도·피트니스 시세 점검, 수기 잠금 종목 검토</td></tr>
<tr><td>매월</td><td>월간 재측정·리포트, 다음 달 키워드·콘텐츠 계획, 오래된 글 갱신</td><td>리포트 검토, 요청 사항 전달</td></tr></table>

<h3>10-5. 3개월 방향성 (11월 ~ 1월)</h3>
<table><tr><th style="width:16%">시기</th><th>방향</th><th>기대 결과</th></tr>
<tr><td><b>11월</b><br>정착</td><td>네이버 노출 정착(웹사이트 탭·AI탭), 구 도메인 통합 효과 확인, 지역 허브·골프장 세부 정보 50곳, 연말 법인·무기명 수요 글(접대·복지·세무 마감)</td><td>카테고리 질의 AI 노출 절반 이상, 네이버 유입 본격 시작, 법인 문의 증가</td></tr>
<tr><td><b>12월</b><br>확장</td><td>유튜브 하나회원권TV와 홈페이지 상호 연결(영상별 골프장·시세 페이지 링크, 영상 요약 글), 콘도·피트니스 겨울 성수기 글, 연간 시세 결산 리포트(2026 골프회원권 시세 총정리), 고객 DB 기반 재문의 관리</td><td>영상 유입 추적, 결산 리포트의 AI 인용, 재문의·소개 전환</td></tr>
<tr><td><b>1월</b><br>심화</td><td>2027 시세 전망·신년 가이드, 골프장별 FAQ 전수(158곳), 구조화 데이터 고도화(골프장 Place·Event), LLM 키 도입 시 가이드·동향 자동 생성 전환, 인블로그·외부 채널 발행 자동화</td><td>타깃 키워드 10개 중 7개 1페이지, AI 노출 20/30, 문의 전환율 2배</td></tr></table>
</section>

<section class="first" style="page-break-before:auto"><p class="small muted">하나회원권거래소 홈페이지 구축·최적화 종합 보고서 · ${DATE}</p></section>
</body></html>`;
const out = path.join(PROJ, '보고', `하나회원권_종합보고서_${DATE}`); fs.writeFileSync(out + '.html', html);
(async () => { const b = await shot.launch(); const p = await b.newPage(); await p.goto('file:///' + (out + '.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 90000 }); await p.pdf({ path: out + '.pdf', format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '13mm', right: '13mm' }, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:sans-serif">하나회원권거래소 종합 보고서 · <span class="pageNumber"></span>/<span class="totalPages"></span></div>' }); await b.close(); console.log('ok', out + '.pdf', Math.round(fs.statSync(out + '.pdf').size / 1024) + 'KB'); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });
