'use strict';
// AI·검색 노출 리포트(키워드 기준) → 보고/하나회원권_AI노출리포트_YYYY-MM-DD.html/.pdf
// 입력: 측정/AI검색/추이.csv + 날짜 폴더의 캡처(.txt/.png). 실행: node scripts/build-ai-report.js [날짜]
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const PROJ = path.join(ROOT, '..'); const AI = path.join(PROJ, '측정', 'AI검색');
const shot = require(ROOT + '/lib/screenshot');
const DATE = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : require(ROOT + '/lib/util').kstDate();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safe = (q) => q.replace(/[\\/:*?"<>|\s]+/g, '_');
const ENG = [['google', '구글'], ['naver', '네이버'], ['bing', 'Bing'], ['naverai', '네이버 AI탭'], ['perplexity', 'Perplexity']];
const KW = [['골프회원권', '골프회원권 (대표 키워드)', '/guide/golf · /market/golf · /golf'], ['무기명 골프회원권', '무기명 골프회원권', '/guide/anonymous · /exclusive/anonymous'], ['콘도회원권', '콘도회원권', '/guide/condo · /market/condo'], ['골프회원권 시세', '골프회원권 시세', '/market/golf · 시세 리포트 글'], ['골프회원권 거래소 추천', '골프회원권 거래소 추천', '거래소 추천 글 2편(10/7) · 회사소개'], ['하나회원권거래소', '하나회원권거래소 (브랜드)', '/ · /about']];
const BASEQ = ['하나회원권거래소는 어떤 회사야?', '하나회원권은 어떤 회사야?', '골프회원권 거래소 추천해줘. 시세도 확인하고 싶어', '골프회원권 시세 어디서 확인해? 신뢰할 만한 거래소도 알려줘'];

// 추이.csv
const lines = fs.readFileSync(path.join(AI, '추이.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1);
const rows = lines.map(l => { const c = l.split(','); return { date: c[0], engine: c[1], query: c[2], site: +c[3], brand: +c[4], comp: (c[5] || '').split('|').filter(Boolean) }; }).filter(r => r.date <= DATE);
const dates = [...new Set(rows.filter(r => KW.some(k => k[0] === r.query)).map(r => r.date))].sort();
const latestDate = dates[dates.length - 1];
const cell = (d, e, q) => { const m = rows.filter(r => r.date === d && r.engine === e && r.query === q); return m.length ? m[m.length - 1] : null; };
const dayTotal = (d) => { let s = 0, b = 0, n = 0; for (const [e] of ENG) for (const [q] of KW) { const c = cell(d, e, q); if (c) { n++; s += c.site; b += c.brand; } } return { s, b, n }; };
const trend = dates.map(d => ({ date: d, ...dayTotal(d) }));
const today = dayTotal(latestDate);
const trendSvg = (() => { const W = 640, H = 170, L = 36, R = 12, T = 14, B = 30; const mx = Math.max(10, ...trend.map(t => Math.max(t.b, t.s))); const x = (i) => L + (trend.length === 1 ? 0 : i / (trend.length - 1)) * (W - L - R); const y = (v) => T + (1 - v / mx) * (H - T - B);
  const ln = (k, col) => `<polyline fill="none" stroke="${col}" stroke-width="2.5" points="${trend.map((t, i) => `${x(i)},${y(t[k])}`).join(' ')}"/>${trend.map((t, i) => `<circle cx="${x(i)}" cy="${y(t[k])}" r="3.5" fill="${col}"/><text x="${x(i)}" y="${y(t[k]) - 7}" font-size="10" text-anchor="middle" fill="${col}">${t[k]}</text>`).join('')}`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${[0, .5, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(mx * f)}" y2="${y(mx * f)}" stroke="#e3e8f0"/><text x="${L - 6}" y="${y(mx * f) + 4}" font-size="10" text-anchor="end" fill="#6b7485">${Math.round(mx * f)}</text>`).join('')}${ln('b', '#8e44ad')}${ln('s', '#1f3a73')}${trend.map((t, i) => `<text x="${x(i)}" y="${H - 10}" font-size="10" text-anchor="middle" fill="#6b7485">${t.date.slice(5)}</text>`).join('')}</svg>`; })();

// 캡처 본문에서 우리 사이트가 언급된 문맥 추출
const clean = (t) => t.replace(/새 창 열림/g, ' ').replace(/\s+/g, ' ').trim();
function quote(d, e, q) { const f = path.join(AI, d, `${e}_${safe(q)}.txt`); if (!fs.existsSync(f)) return ''; const T = clean(fs.readFileSync(f, 'utf8')); let i = T.search(/hanamember\.co/i); if (i < 0) i = T.indexOf('하나회원권'); if (i < 0) return ''; const a = Math.max(0, i - 170), b = Math.min(T.length, i + 130); return (a > 0 ? '… ' : '') + T.slice(a, b) + (b < T.length ? ' …' : ''); }
function answerHead(d, e, q) { const f = path.join(AI, d, `${e}_${safe(q)}.txt`); if (!fs.existsSync(f)) return ''; const T = clean(fs.readFileSync(f, 'utf8')); const m = T.match(/(?:조사 완료 \d+초|AI 개요|AI Tab)\s*(.{0,220})/); return m ? m[1] + ' …' : ''; }
const imgTag = (f, cap) => fs.existsSync(f) ? `<figure class="cap"><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" alt="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>` : '';
const mark = (c) => !c ? '<span class="muted">미측정</span>' : c.site ? '<b class="ok">✅ 노출</b>' : c.brand ? '<span class="warn">△ 언급</span>' : '<span class="muted">—</span>';
const firstSeen = (e, q) => { const d = dates.find(d => { const c = cell(d, e, q); return c && c.site; }); return d ? d.slice(5) : '-'; };
const hits = (e, q) => dates.filter(d => { const c = cell(d, e, q); return c && c.site; }).length;

const NEXT = {
  '골프회원권': '구글·네이버 일반검색은 상호 언급 단계. 골프회원권 안내 페이지에 "골프회원권이란" 직답 문단과 FAQ를 보강하고, 네이버 블로그에 안내 글 요약을 올려 네이버 AI탭 인용을 노립니다.',
  '무기명 골프회원권': '네이버 일반검색·AI탭·Perplexity·Bing에서 잡히기 시작. 무기명 시세 글(10/14 예약)과 전용관 매물 31건을 연결해 구글 노출을 당깁니다.',
  '콘도회원권': 'Bing·네이버 AI탭 노출. 10/11 콘도 시세표 글 색인 후 구글·Perplexity 재측정. 리조트별(소노·용평·아난티) 글로 롱테일 확장.',
  '골프회원권 시세': 'Perplexity·Bing은 우리 숫자를 인용. 구글은 구 사이트(hanamarket.co.kr)를 인용 → 구 도메인 301 전환이 핵심. 네이버 AI탭은 카페·블로그 인용 → 네이버 블로그 주 3편 게시.',
  '골프회원권 거래소 추천': 'Perplexity 1순위·Bing 노출. 구글 AI 개요는 업력 긴 5개사만 나열 → 회사소개·llms.txt의 "2004년부터·267종목 매일 갱신·KGMMA 정회원사" 문장 유지, 외부 프로필(플레이스·유튜브) 명칭 통일로 신뢰 신호 축적.',
  '하나회원권거래소': '5개 엔진 노출(네이버 AI탭은 상호 언급). 약칭 "하나회원권" 질의도 10/7부터 자사 인용. 구 도메인 통합으로 분산된 브랜드 신호를 합칩니다.',
};

const kwSections = KW.map(([q, label, landing]) => {
  const todayCells = ENG.map(([e, l]) => ({ e, l, c: cell(latestDate, e, q) }));
  const exposedEngines = todayCells.filter(x => x.c && x.c.site);
  const comps = [...new Set(todayCells.flatMap(x => x.c ? x.c.comp : []))];
  const quotes = todayCells.map(x => ({ ...x, qt: x.c && (x.c.site || x.c.brand) ? quote(latestDate, x.e, q) : '' })).filter(x => x.qt);
  const imgs = exposedEngines.slice(0, 2).map(x => imgTag(path.join(AI, latestDate, `${x.e}_${safe(q)}.png`), `${x.l} — "${q}" (${latestDate})`)).join('');
  return `<section><h2>${esc(label)}</h2>
<p class="small muted">랜딩 페이지: ${esc(landing)}</p>
<table><tr><th style="width:18%">엔진</th><th style="width:14%">${latestDate.slice(5)} 결과</th><th style="width:12%">첫 노출</th><th style="width:14%">노출 일수/측정</th><th>함께 나온 경쟁 거래소</th></tr>
${todayCells.map(x => `<tr><td>${x.l}</td><td>${mark(x.c)}</td><td>${firstSeen(x.e, q)}</td><td>${hits(x.e, q)}/${dates.filter(d => cell(d, x.e, q)).length}</td><td class="small">${x.c && x.c.comp.length ? esc(x.c.comp.join(', ')) : '-'}</td></tr>`).join('')}</table>
<h3>추이 (엔진별 노출 ●)</h3>
<table class="tiny"><tr><th>엔진</th>${dates.map(d => `<th>${d.slice(5)}</th>`).join('')}</tr>${ENG.map(([e, l]) => `<tr><td>${l}</td>${dates.map(d => { const c = cell(d, e, q); return `<td class="c">${!c ? '·' : c.site ? '<b class="ok">●</b>' : c.brand ? '<span class="warn">○</span>' : '–'}</td>`; }).join('')}</tr>`).join('')}</table>
<p class="small muted">● 사이트 노출 · ○ 상호 언급 · – 미노출 · · 미측정 (네이버 AI탭은 10/6부터 측정)</p>
${quotes.length ? `<h3>${latestDate.slice(5)} 답변·검색결과에서 우리를 언급한 문맥</h3><ul>${quotes.map(x => `<li><b>${x.l}</b>: <span class="q">${esc(x.qt)}</span></li>`).join('')}</ul>` : '<p class="small muted">오늘 결과에는 우리 사이트·상호가 나오지 않았습니다.</p>'}
<div class="tip"><b>다음 조치</b> — ${esc(NEXT[q] || '')}</div>
${imgs ? `<div class="g2">${imgs}</div>` : ''}</section>`;
}).join('');

// 베이스라인 4질의(최근 측정)
const baseDate = [...new Set(rows.filter(r => BASEQ.includes(r.query)).map(r => r.date))].sort().pop();
const baseRows = baseDate ? BASEQ.map((q, i) => { const r = (e) => { const c = rows.filter(x => x.date === baseDate && x.engine === e && x.query === q).pop(); return c ? mark(c) : '<span class="muted">미측정</span>'; }; const before = ['자사 계열 3/10 (구도메인·신도메인·네이버블로그)', '하나금융으로 오인, 자사 0', '0 (토탈골프·프리미엄 추천)', '0 (프리미엄·회원권마켓·신라)'][i]; return `<tr><td>Q${i + 1}</td><td>${esc(q)}</td><td class="small">${before}</td><td>${r('perplexity')}</td><td>${r('google')}</td><td>${r('naverai')}</td></tr>`; }).join('') : '';

const engineTotals = ENG.map(([e, l]) => { let s = 0, n = 0; for (const [q] of KW) { const c = cell(latestDate, e, q); if (c) { n++; s += c.site; } } return `<tr><td>${l}</td><td class="num">${s}/${n}</td><td class="small">${KW.filter(([q]) => { const c = cell(latestDate, e, q); return c && c.site; }).map(([q]) => q).join(', ') || '-'}</td></tr>`; }).join('');

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하나회원권거래소 AI·검색 노출 리포트 — 주요 키워드 기준 ${DATE}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{--navy:#0f1c36;--blue:#1f3a73;--green:#03a65a;--line:#dfe5ef;--muted:#5b6678}
*{box-sizing:border-box}body{font-family:Pretendard Variable,Pretendard,'Malgun Gothic',sans-serif;color:#1c2333;margin:0;font-size:10.6pt;line-height:1.6;word-break:keep-all}
.cover{height:250mm;display:flex;flex-direction:column;justify-content:center;border-left:10px solid var(--navy);padding-left:14mm;page-break-after:always}
.cover .k{color:var(--green);font-weight:800;letter-spacing:.08em;font-size:11pt}.cover h1{font-size:26pt;margin:8px 0 6px;color:var(--navy);line-height:1.25}.cover .sub{font-size:13pt;color:var(--muted);margin-bottom:22px}.cover .meta{font-size:10.5pt;color:var(--muted);line-height:1.9}.cover .meta b{color:#1c2333}
h2{font-size:15pt;color:var(--navy);border-bottom:2.5px solid var(--navy);padding-bottom:4px;margin:0 0 10px;page-break-after:avoid}h3{font-size:11.5pt;color:var(--blue);margin:12px 0 4px;page-break-after:avoid}
section{page-break-before:always;padding-top:3mm}section.first{page-break-before:auto}
p{margin:4px 0}ul{margin:4px 0;padding-left:20px}li{margin:3px 0}
table{width:100%;border-collapse:collapse;font-size:9.8pt;margin:6px 0}tr{page-break-inside:avoid}th,td{border:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top}th{background:#eef2f9;color:var(--navy)}td.num{text-align:right}
table.tiny{font-size:9pt}table.tiny td.c{text-align:center;padding:2px 4px}table.tiny th{padding:2px 4px;font-size:8.6pt}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.kpi div{border:1px solid var(--line);border-radius:6px;padding:8px 10px}.kpi b{display:block;font-size:17pt;color:var(--navy)}.kpi span{font-size:9.2pt;color:var(--muted)}
.tip{background:#f3f7ff;border-left:4px solid var(--blue);padding:6px 10px;margin:8px 0;border-radius:0 6px 6px 0}.warn-box{background:#fff7e8;border-left:4px solid #d4a017;padding:6px 10px;margin:8px 0;border-radius:0 6px 6px 0}
.ok{color:#1b6b3a}.warn{color:#8a6400}.small{font-size:9.3pt}.muted{color:var(--muted)}.q{color:#333;background:#f7f9fd;padding:1px 4px;border-radius:3px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}figure.cap{margin:0;max-height:100mm;overflow:hidden;page-break-inside:avoid}figure.cap img{width:100%;border:1px solid var(--line);border-radius:5px;object-fit:cover;object-position:top;max-height:92mm}figcaption{font-size:9pt;color:var(--muted);margin-top:3px}
@page{size:A4;margin:14mm 13mm}
</style></head><body>
<div class="cover"><div class="k">HANA MEMBERSHIP EXCHANGE · AI VISIBILITY REPORT</div><h1>AI·검색 노출 리포트<br>주요 키워드 기준</h1><div class="sub">골프회원권 · 무기명 골프회원권 · 콘도회원권 · 골프회원권 시세 · 골프회원권 거래소 추천 · 하나회원권거래소</div>
<div class="meta">기준일 <b>${DATE}</b> (측정 ${dates[0]} ~ ${latestDate}, ${dates.length}회)<br>측정 엔진 <b>구글 · 네이버 · Bing · 네이버 AI탭 · Perplexity</b><br>사이트 <b>https://hanamember.co.kr</b><br><br>같은 키워드를 매번 같은 방법(로그인 없는 실제 크롬)으로 넣어 결과 화면을 저장하고, 답변·검색결과 본문에 우리 사이트 링크가 나오면 '노출', 상호만 나오면 '언급'으로 판정했습니다. 키워드별로 오늘 결과, 엔진별 추이, 실제 인용 문맥, 다음 조치를 정리했습니다.</div></div>

<section class="first"><h2>1. 한눈에 보기 (${latestDate})</h2>
<div class="kpi"><div><b>${today.s}/${today.n}</b><span>우리 사이트 노출 (6키워드 × 5엔진)</span></div><div><b>${today.b}/${today.n}</b><span>상호 언급</span></div><div><b>${trend[0].s}/${trend[0].n}</b><span>첫 측정 ${trend[0].date.slice(5)}</span></div><div><b>${Math.max(...trend.map(t => t.s))}</b><span>최고 노출 (${trend.find(t => t.s === Math.max(...trend.map(x => x.s))).date.slice(5)})</span></div></div>
${trendSvg}<p class="small muted">진한 남색: 사이트 노출 건수 / 보라: 상호 언급 건수. 10/6부터 네이버 AI탭이 추가돼 30건 기준.</p>
<h3>엔진별 (${latestDate.slice(5)})</h3><table><tr><th style="width:20%">엔진</th><th style="width:14%">노출/키워드</th><th>노출된 키워드</th></tr>${engineTotals}</table>
<h3>키워드별 (${latestDate.slice(5)})</h3><table><tr><th>키워드</th>${ENG.map(([, l]) => `<th>${l}</th>`).join('')}<th style="width:12%">노출 엔진</th></tr>${KW.map(([q, label]) => `<tr><td><b>${esc(q)}</b></td>${ENG.map(([e]) => `<td>${mark(cell(latestDate, e, q))}</td>`).join('')}<td class="num">${ENG.filter(([e]) => { const c = cell(latestDate, e, q); return c && c.site; }).length}/5</td></tr>`).join('')}</table>
<div class="warn-box"><b>핵심 판단</b> — Perplexity와 Bing은 카테고리 질의에서 우리 시세·안내 페이지를 직접 인용하고, 네이버는 무기명·콘도부터 잡히기 시작했습니다. 구글은 브랜드 질의만 노출되며 '골프회원권 시세'에서는 구 사이트(hanamarket.co.kr)를 인용하고, 구글 AI 개요 '거래소 추천'은 업력 긴 거래소 5곳만 나열합니다. 구 도메인 301 전환과 네이버 블로그 게시가 다음 단계의 핵심입니다.</div></section>

${kwSections}

<section><h2>8. 베이스라인 4질의 재측정 (9/15 → ${baseDate || '-'})</h2>
<table><tr><th>#</th><th style="width:30%">질의</th><th>9/15 베이스라인(Perplexity)</th><th>Perplexity</th><th>구글</th><th>네이버 AI탭</th></tr>${baseRows}</table>
<p class="small muted">9/15에는 약칭 "하나회원권"을 하나금융으로 오인했고 카테고리 질의 노출이 0이었습니다. 재측정에서는 두 브랜드 질의 모두 Perplexity·구글이 자사 사이트를 인용하고, 거래소 추천 질의에서 Perplexity가 자사를 노출했습니다.</p></section>

<section><h2>9. 종합 판단과 다음 2주 조치</h2>
<table><tr><th style="width:26%">조치</th><th>내용</th><th style="width:16%">담당</th></tr>
<tr><td>구 도메인 301 전환</td><td>구글이 '골프회원권 시세'에서 구 사이트 시세표를 인용. hanamarket.co.kr → hanamember.co.kr 301로 인용·링크를 합치면 구글 카테고리 노출이 당겨집니다(앱에 이미 내장, DNS만 변경).</td><td>계정 보유자</td></tr>
<tr><td>네이버 블로그 주 3편</td><td>네이버 AI탭·일반검색은 블로그·카페 글을 우선 인용. 매주 월요일 게시용 원고 3편 제공(보고/네이버블로그_게시용_날짜.md) → hngolf2 게시 + 홈페이지 링크.</td><td>업체 / 계정 보유자</td></tr>
<tr><td>네이버 서치어드바이저 등록</td><td>소유확인·사이트맵·RSS 제출로 네이버 수집 속도 확보.</td><td>계정 보유자</td></tr>
<tr><td>키워드 글 유지</td><td>10/14 무기명 시세, 10/15 용인·여주·이천 비교, 이후 콘도 리조트별·법인 거래소·명의개서 비용 2026. 매일 1편 + 월요일 카테고리별 시세 리포트(법인→콘도→피트니스 로테이션).</td><td>총괄</td></tr>
<tr><td>엔티티 신호 통일</td><td>네이버 플레이스·구글 비즈니스·유튜브·블로그의 상호·주소·전화를 홈페이지와 동일하게. 구글 AI 개요가 거래소를 소개 문장으로 요약하므로 "2004년부터·267종목 매일 갱신·KGMMA 정회원사" 문장을 모든 프로필에 통일.</td><td>업체 / 총괄</td></tr>
<tr><td>측정</td><td>주 2회(화·금) 6키워드 캡처, 10/14·10/15 글 발행 후 '무기명 골프회원권 시세'·'콘도회원권 시세'·'콘도회원권 거래소 추천' 키워드를 측정 세트에 추가.</td><td>총괄</td></tr></table>
<p class="small muted">하나회원권거래소 AI·검색 노출 리포트 · ${DATE}</p></section>
</body></html>`;
const out = path.join(PROJ, '보고', `하나회원권_AI노출리포트_${DATE}`); fs.writeFileSync(out + '.html', html);
(async () => { const b = await shot.launch(); const p = await b.newPage(); await p.goto('file:///' + (out + '.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 90000 }); await p.pdf({ path: out + '.pdf', format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '13mm', right: '13mm' }, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:sans-serif">하나회원권거래소 AI·검색 노출 리포트 · <span class="pageNumber"></span>/<span class="totalPages"></span></div>' }); await b.close(); console.log('ok', out + '.pdf', Math.round(fs.statSync(out + '.pdf').size / 1024) + 'KB'); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });
