'use strict';
// 주간 신규 노출 리포트 — 지난주 같은 요일(기준일 -7일 이전 마지막 측정일) 대비 이번에 새로 노출된 건만 모은다.
// 입력: 측정/AI검색/추이.csv + 날짜 폴더 캡처(.txt/.png). 출력: 보고/하나회원권_주간신규노출리포트_<날짜>.html/.pdf
// 실행: node scripts/build-weekly-new-exposure.js [YYYY-MM-DD] [--base YYYY-MM-DD]
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const PROJ = path.join(ROOT, '..'); const AI = path.join(PROJ, '측정', 'AI검색');
const shot = require(ROOT + '/lib/screenshot');
const argv = process.argv.slice(2); const opt = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const DATE = argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a) && argv[argv.indexOf(a) - 1] !== '--base') || require(ROOT + '/lib/util').kstDate();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safe = (q) => q.replace(/[\\/:*?"<>|\s]+/g, '_');
const ENG = { google: '구글', naver: '네이버', bing: 'Bing', naverai: '네이버 AI탭', perplexity: 'Perplexity', chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
// 우선 키워드 순서(재현 지정) → 그 밖의 측정 키워드
const PRIORITY = ['회원권거래소', '하나회원권거래소', '콘도회원권 시세', '피트니스회원권 시세', '골프회원권 시세', '무기명 골프회원권', '골프회원권', '콘도회원권', '골프회원권 거래소 추천'];

const rows = fs.readFileSync(path.join(AI, '추이.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1)
  .map(l => { const c = l.split(','); return { date: c[0], engine: c[1], query: c[2], site: +c[3], brand: +c[4], comp: (c[5] || '').split('|').filter(Boolean), blocked: +c[6], error: c[7] || '' }; })
  .filter(r => r.date <= DATE && ENG[r.engine]);
const valid = (r) => r && !r.blocked && !r.error;
const cell = (d, e, q) => { const m = rows.filter(r => r.date === d && r.engine === e && r.query === q && valid(r)); return m.length ? m[m.length - 1] : null; };
const dates = [...new Set(rows.map(r => r.date))].sort();
const minus7 = new Date(new Date(DATE + 'T00:00:00Z').getTime() - 7 * 864e5).toISOString().slice(0, 10);
const BASE = opt('base') || dates.filter(d => d <= minus7).pop();
if (!rows.some(r => r.date === DATE)) { console.error('측정 없음:', DATE); process.exit(1); }
if (!BASE) { console.error('지난주 기준 측정 없음'); process.exit(1); }
const week = dates.filter(d => d > BASE && d <= DATE);

const order = (q) => { const i = PRIORITY.indexOf(q); return i < 0 ? 99 : i; };
const todays = rows.filter(r => r.date === DATE && valid(r));
const pairs = [...new Map(todays.map(r => [r.engine + '|' + r.query, r])).values()]
  .map(r => cell(DATE, r.engine, r.query)).sort((a, b) => order(a.query) - order(b.query) || Object.keys(ENG).indexOf(a.engine) - Object.keys(ENG).indexOf(b.engine));
const firstMeasured = (e, q) => dates.find(d => cell(d, e, q));
const weekHits = (e, q) => { const m = week.filter(d => cell(d, e, q)); return { hit: m.filter(d => cell(d, e, q).site).length, n: m.length }; };

const newSite = [], newSiteUnmeasured = [], newBrand = []; let lost = 0, kept = 0;
for (const t of pairs) {
  const b = cell(BASE, t.engine, t.query);
  if (t.site && b && !b.site) newSite.push({ t, b });
  else if (t.site && !b) newSiteUnmeasured.push({ t, first: firstMeasured(t.engine, t.query) });
  else if (!t.site && t.brand && b && !b.site && !b.brand) newBrand.push({ t });
  if (b && b.site) { if (t.site) kept++; else lost++; }
}

// 증빙: 캡처 본문에서 우리를 언급한 문맥 + 스크린샷(언급 위치 부근)
const clean = (t) => t.replace(/새 창 열림/g, ' ').replace(/\s+/g, ' ').trim();
const findHit = (T, siteOnly) => { let i = T.search(/hanamember\.co/i); if (i < 0 && !siteOnly) i = T.search(/하나회원권/); if (i < 0) i = T.search(/하나회원권/); return i; };
function evidence(d, e, q, siteOnly) {
  const f = path.join(AI, d, `${e}_${safe(q)}.txt`); const png = path.join(AI, d, `${e}_${safe(q)}.png`);
  const raw = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; const T = clean(raw); const i = findHit(T, siteOnly);
  const qt = i < 0 ? '' : (i > 110 ? '… ' : '') + T.slice(Math.max(0, i - 110), i + 110) + (i + 110 < T.length ? ' …' : '');
  // 위치: 캡처 때 기록한 실제 좌표(result.json의 hit, 10/15~) → 없으면 본문 텍스트 위치로 추정
  const res = (() => { try { return JSON.parse(fs.readFileSync(path.join(AI, d, 'result.json'), 'utf8')); } catch (_) { return []; } })().filter(x => x.engine === e && x.query === q).pop();
  const truncated = raw.length >= 19990; let ratio = i < 0 || truncated ? 0 : Math.min(1, i / Math.max(1, T.length)); let exact = false;
  if (res && res.hit && res.hit.h) { ratio = Math.min(1, res.hit.y / res.hit.h); exact = true; }
  return { qt, png: fs.existsSync(png) ? png : null, ratio, exact };
}
// PNG 크기로 object-position을 계산해 언급 위치가 잘린 영역 가운데(정확 좌표면 위쪽 1/3)에 오게 한다. 상자 비율 64mm:180mm
const boxH = (ev) => ev.exact ? 60 : 76; // 추정 위치는 오차를 감안해 더 길게 보여 준다
const posPct = (ev) => { const b = fs.readFileSync(ev.png); const w = b.readUInt32BE(16), h = b.readUInt32BE(20); const BOX = boxH(ev) / 180; const hs = h / w; if (hs <= BOX) return 0; const y = ev.ratio * hs - BOX * (ev.exact ? 0.33 : 0.15); return Math.max(0, Math.min(100, Math.round(y / (hs - BOX) * 1000) / 10)); };
const imgTag = (ev, cap) => ev.png ? `<figure class="cap"><img src="data:image/png;base64,${fs.readFileSync(ev.png).toString('base64')}" style="object-position:50% ${posPct(ev)}%;height:${boxH(ev)}mm" alt="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>` : '';
const st = (c) => !c ? '미측정' : c.site ? '노출' : c.brand ? '상호 언급' : '없음';
const md = (d) => d ? d.slice(5).replace('-', '/') : '-';

const card = ({ t, b, first }, kind) => {
  const ev = evidence(DATE, t.engine, t.query, kind !== 'brand'); const w = weekHits(t.engine, t.query);
  const before = kind === 'unmeasured' ? `지난주 미측정 (첫 측정 ${md(first)})` : `${md(BASE)} ${st(b)}`;
  return `<div class="item"><div class="ih"><span class="kw">${esc(t.query)}</span><span class="en">${ENG[t.engine]}</span><span class="chg">${esc(before)} → <b>${md(DATE)} ${kind === 'brand' ? '상호 언급' : '노출'}</b></span></div>
<p class="small muted">이번 주 측정 ${w.n}회 중 ${kind === 'brand' ? '노출' : '노출'} ${w.hit}회${t.comp.length ? ` · 함께 나온 거래소: ${esc(t.comp.join(', '))}` : ' · 함께 나온 경쟁 거래소 없음'}</p>
${ev.qt ? `<p class="q">${esc(ev.qt)}</p>` : ''}${imgTag(ev, `${ENG[t.engine]} — "${t.query}" (${DATE})`)}</div>`;
};
const table = (list, kind) => `<table><tr><th style="width:26%">키워드</th><th style="width:16%">엔진</th><th style="width:22%">지난주</th><th style="width:14%">이번 주</th><th>이번 주 노출 횟수</th></tr>${list.map(({ t, b, first }) => { const w = weekHits(t.engine, t.query); return `<tr><td><b>${esc(t.query)}</b></td><td>${ENG[t.engine]}</td><td>${kind === 'unmeasured' ? `미측정 (첫 측정 ${md(first)})` : st(b)}</td><td class="ok"><b>${kind === 'brand' ? '상호 언급' : '노출'}</b></td><td>${w.hit}/${w.n}회</td></tr>`; }).join('')}</table>`;

const engs = [...new Set(todays.map(r => r.engine))].map(e => ENG[e]).join(' · ');
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하나회원권거래소 주간 신규 노출 리포트 ${DATE}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{--navy:#0f1c36;--blue:#1f3a73;--green:#03a65a;--line:#dfe5ef;--muted:#5b6678}
*{box-sizing:border-box}body{font-family:Pretendard Variable,Pretendard,'Malgun Gothic',sans-serif;color:#1c2333;margin:0;font-size:10.6pt;line-height:1.6;word-break:keep-all}
.head{border-left:8px solid var(--navy);padding:2mm 0 2mm 8mm;margin-bottom:6mm}.head .k{color:var(--green);font-weight:800;letter-spacing:.08em;font-size:9.5pt}.head h1{font-size:21pt;margin:4px 0;color:var(--navy)}.head .meta{color:var(--muted);font-size:10pt}
h2{font-size:14pt;color:var(--navy);border-bottom:2.5px solid var(--navy);padding-bottom:3px;margin:16px 0 8px;page-break-after:avoid}
table{width:100%;border-collapse:collapse;font-size:9.8pt;margin:6px 0}tr{page-break-inside:avoid}th,td{border:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top}th{background:#eef2f9;color:var(--navy)}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}.kpi div{border:1px solid var(--line);border-radius:6px;padding:8px 10px}.kpi b{display:block;font-size:20pt;color:var(--navy)}.kpi span{font-size:9.2pt;color:var(--muted)}
.item{border:1px solid var(--line);border-radius:8px;padding:6px 10px;margin:6px 0;page-break-inside:avoid}.ih{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.kw{font-weight:800;font-size:12pt;color:var(--navy)}.en{background:#eef2f9;color:var(--blue);border-radius:4px;padding:0 6px;font-size:9.5pt;font-weight:700}.chg{font-size:9.8pt;color:var(--muted)}.chg b{color:#1b6b3a}
.q{background:#f7f9fd;border-left:3px solid var(--blue);padding:5px 8px;font-size:9.4pt;margin:6px 0}
figure.cap{margin:6px 0 0}figure.cap img{width:100%;height:64mm;object-fit:cover;border:1px solid var(--line);border-radius:5px}figcaption{font-size:8.8pt;color:var(--muted)}
.ok{color:#1b6b3a}.small{font-size:9.3pt}.muted{color:var(--muted)}.note{background:#f3f7ff;border-left:4px solid var(--blue);padding:6px 10px;border-radius:0 6px 6px 0;font-size:9.6pt}
@page{size:A4;margin:14mm 13mm}
</style></head><body>
<div class="head"><div class="k">HANA MEMBERSHIP EXCHANGE · WEEKLY NEW EXPOSURE</div><h1>주간 신규 노출 리포트</h1>
<div class="meta">비교 <b>${BASE}</b> → <b>${DATE}</b> · 측정 엔진 ${engs} · 사이트 hanamember.co.kr</div></div>
<div class="kpi"><div><b>${newSite.length}</b><span>지난주 대비 새로 노출된 건 (키워드×엔진)</span></div><div><b>${newSiteUnmeasured.length}</b><span>지난주 측정하지 않은 키워드·엔진에서 노출</span></div><div><b>${newBrand.length}</b><span>새로 생긴 상호 언급 (링크 없이 이름만)</span></div></div>
<p class="small muted">같은 키워드를 매번 같은 방법(로그인 없는 실제 크롬)으로 검색·질문해 결과 화면을 저장하고, 결과 본문에 우리 사이트 링크가 나오면 '노출', 상호만 나오면 '상호 언급'으로 판정했습니다. 이 리포트에는 지난주(${BASE}) 결과에 없던 것만 담았습니다.</p>

<p class="note">지난주 노출 중 이번 측정에서 유지된 건 ${kept}건, 이번에는 나오지 않은 건 ${lost}건입니다. AI 답변과 검색 결과는 날마다 조금씩 바뀌므로, 위 '이번 주 노출 횟수'(${md(week[0])}~${md(DATE)} 측정 중 노출된 횟수)를 함께 봐 주세요. 원본 캡처: 측정/AI검색/${DATE}/</p>
<h2>1. 지난주 대비 새로 노출된 건 (${newSite.length}건)</h2>
${newSite.length ? table(newSite, 'site') : '<p class="muted">이번 주에는 지난주 대비 새로 노출된 건이 없습니다.</p>'}
${newSiteUnmeasured.length ? `<h2>2. 지난주에는 측정하지 않았던 키워드·엔진에서 노출 (${newSiteUnmeasured.length}건)</h2><p class="small muted">이번 주에 측정 키워드·엔진을 늘리면서 처음 확인된 노출입니다.</p>${table(newSiteUnmeasured, 'unmeasured')}` : ''}
${newBrand.length ? `<h2>${newSiteUnmeasured.length ? 3 : 2}. 새로 생긴 상호 언급 (${newBrand.length}건)</h2><p class="small muted">링크 없이 "하나회원권거래소"라는 이름만 나온 경우입니다.</p>${table(newBrand, 'brand')}` : ''}

<h2>증빙: 결과 화면과 언급 문맥</h2>
${newSite.map(x => card(x, 'site')).join('')}${newSiteUnmeasured.map(x => card(x, 'unmeasured')).join('')}${newBrand.map(x => card(x, 'brand')).join('')}

</body></html>`;

const out = path.join(PROJ, '보고', `하나회원권_주간신규노출리포트_${DATE}`); fs.writeFileSync(out + '.html', html);
console.log(`base ${BASE} → ${DATE}: 신규 노출 ${newSite.length}, 미측정→노출 ${newSiteUnmeasured.length}, 신규 언급 ${newBrand.length}, 유지 ${kept}, 빠짐 ${lost}`);
(async () => { const b = await shot.launch(); const p = await b.newPage(); await p.goto('file:///' + (out + '.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 90000 }); await p.pdf({ path: out + '.pdf', format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '13mm', right: '13mm' }, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:sans-serif">하나회원권거래소 주간 신규 노출 리포트 · <span class="pageNumber"></span>/<span class="totalPages"></span></div>' }); await b.close(); console.log('ok', out + '.pdf', Math.round(fs.statSync(out + '.pdf').size / 1024) + 'KB'); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });
