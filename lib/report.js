'use strict';
// 주간·월간 리포트 자동 생성 — 4주 실행계획 체크 + 실측 지표(콘텐츠·시세·문의·방문·AI봇·기술감사)
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('../db');
const { now, kstDate, addDays, fmtKoDate, esc, fmtNum } = require('./util');
const settings = require('./settings');
const analytics = require('./analytics');
const audit = require('./audit');
const prices = require('./prices');
const inblog = require('./inblog');

function kickoff() { return settings.cfg('kickoff_date') || '2026-09-14'; }
// 주차 계산: 킥오프(월)부터 7일 단위. week n = kickoff + 7(n-1) ~ +6
function weekRange(n) { const s = addDays(kickoff(), 7 * (n - 1)); return { start: s, end: addDays(s, 6) }; }
function currentWeek(date = kstDate()) {
  const diff = Math.floor((new Date(date + 'T00:00:00+09:00') - new Date(kickoff() + 'T00:00:00+09:00')) / 86400000);
  return Math.max(1, Math.floor(diff / 7) + 1);
}
function ts(dateStr) { return Math.floor(new Date(dateStr + 'T00:00:00+09:00').getTime() / 1000); }

// 자동 체크 가능한 계획 항목 판정
function autoStatus(key, { start, end }) {
  const c = (sql, ...a) => db.prepare(sql).get(...a).c;
  const posts = c("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published'");
  const clubs = c("SELECT COUNT(*) c FROM clubs WHERE status='published' AND body_html IS NOT NULL AND body_html<>''");
  const lastAudit = audit.latest();
  switch (key) {
    case 'site_built': return true;
    case 'audit_pass': return !!lastAudit && lastAudit.score >= 80;
    case 'audit_90': return !!lastAudit && lastAudit.score >= 90;
    case 'price_uploaded': return c('SELECT COUNT(*) c FROM price_uploads') > 0;
    case 'price_uploaded_week': return c('SELECT COUNT(*) c FROM price_uploads WHERE created_at>=? AND created_at<?', ts(start), ts(addDays(end, 1))) > 0;
    case 'auto_running': return c("SELECT COUNT(*) c FROM gen_runs WHERE status='ok'") > 0;
    case 'inblog_connected': return inblog.enabled() && c("SELECT COUNT(*) c FROM posts WHERE inblog_status='published'") > 0;
    case 'baseline_report': return c("SELECT COUNT(*) c FROM reports WHERE kind='baseline'") > 0;
    case 'clubs_30': return clubs >= 30; case 'clubs_60': return clubs >= 60;
    case 'posts_14': return posts >= 14; case 'posts_28': return posts >= 28; case 'posts_50': return posts >= 50;
    case 'guides_10': return c("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published' AND type='guide'") >= 10;
    case 'reports_2': return c("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published' AND type='report'") >= 2;
    case 'videos_linked': return c('SELECT COUNT(*) c FROM videos') > 0;
    case 'inquiries_report': return true;
    case 'monthly_report': return c("SELECT COUNT(*) c FROM reports WHERE kind='monthly'") > 0;
    default: return null;
  }
}

function collect(week) {
  const range = weekRange(week);
  const from = ts(range.start), to = ts(addDays(range.end, 1));
  const q = (sql, ...a) => db.prepare(sql).get(...a).c;
  const posts = {
    week: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published' AND published_at>=? AND published_at<?", from, to),
    total: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published'"),
    drafts: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='draft'"),
    byType: db.prepare("SELECT type, COUNT(*) c FROM posts WHERE kind='blog' AND status='published' GROUP BY type").all(),
    inblog: q("SELECT COUNT(*) c FROM posts WHERE inblog_status='published'"),
    inblogErr: q("SELECT COUNT(*) c FROM posts WHERE inblog_status='error'"),
    list: db.prepare("SELECT title, slug, type, source, published_at FROM posts WHERE kind='blog' AND status='published' AND published_at>=? AND published_at<? ORDER BY published_at").all(from, to),
    slotsMissed: q("SELECT COUNT(*) c FROM gen_runs WHERE status<>'ok' AND run_date>=? AND run_date<=?", range.start, range.end),
  };
  const clubs = { total: q("SELECT COUNT(*) c FROM clubs WHERE status='published'"), withBody: q("SELECT COUNT(*) c FROM clubs WHERE status='published' AND body_html IS NOT NULL AND body_html<>''"), verified: q('SELECT COUNT(*) c FROM clubs WHERE verified=1') };
  const priceUp = { week: q('SELECT COUNT(*) c FROM price_uploads WHERE created_at>=? AND created_at<?', from, to), last: db.prepare('SELECT created_at, filename, rows FROM price_uploads ORDER BY id DESC LIMIT 1').get(), golfStats: prices.stats('golf') };
  const inq = { week: q('SELECT COUNT(*) c FROM inquiries WHERE created_at>=? AND created_at<?', from, to), total: q('SELECT COUNT(*) c FROM inquiries'), byKind: db.prepare('SELECT kind, COUNT(*) c FROM inquiries WHERE created_at>=? AND created_at<? GROUP BY kind').all(from, to), pending: q("SELECT COUNT(*) c FROM inquiries WHERE status='new'") };
  const traffic = analytics.summary(range.start, range.end);
  const prevTraffic = week > 1 ? analytics.summary(weekRange(week - 1).start, weekRange(week - 1).end) : null;
  const lastAudit = audit.latest();
  const tasks = db.prepare('SELECT * FROM plan_tasks WHERE week=? ORDER BY sort, id').all(week).map(t => ({ ...t, auto: t.auto_key ? autoStatus(t.auto_key, range) : null }));
  const doneCount = tasks.filter(t => t.done || t.auto === true).length;
  const next = db.prepare('SELECT * FROM plan_tasks WHERE week=? ORDER BY sort, id').all(week + 1);
  return { week, range, posts, clubs, priceUp, inq, traffic, prevTraffic, audit: lastAudit, auditHistory: audit.history(), tasks, doneCount, next, generatedAt: kstDate(), kickoff: kickoff() };
}

function statusBadge(t) { const ok = t.done || t.auto === true; return ok ? '<span class="ok">완료</span>' : t.auto === false ? '<span class="pending">미완</span>' : '<span class="manual">확인 필요</span>'; }

function renderHtml(d, kind = 'weekly') {
  const s = settings.all();
  const typeLabel = { club: '골프장 소개', report: '시세 리포트', guide: '가이드·FAQ', trend: '트렌드' };
  const title = kind === 'baseline' ? '베이스라인 리포트 (착수 시점 기준선)' : kind === 'monthly' ? '월간 종합 리포트 (1개월 구축 결과)' : `${d.week}주차 주간 리포트`;
  const period = `${fmtKoDate(d.range.start)} ~ ${fmtKoDate(d.range.end)}`;
  const tr = d.traffic, pv = tr.byAgent;
  const pct = (a, b) => b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : '-';
  const prevH = d.prevTraffic?.byAgent?.human || 0;
  const auditRows = d.audit ? d.audit.items.map(i => `<tr><td>${esc(i.label)}</td><td>${i.ok ? '<span class="ok">통과</span>' : '<span class="pending">미충족</span>'}</td><td>${esc(i.detail || '')}</td></tr>`).join('') : '<tr><td colspan="3">감사 미실행</td></tr>';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)} — 하나회원권거래소 홈페이지 신설 프로젝트</title>
<style>body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#1c2333;max-width:860px;margin:32px auto;padding:0 20px;line-height:1.6}h1{font-size:24px;border-bottom:3px solid #1f3a73;padding-bottom:8px}h2{font-size:18px;color:#1f3a73;margin-top:32px}table{border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 16px}th,td{border:1px solid #d9dee7;padding:6px 10px;text-align:left;vertical-align:top}th{background:#eef2f9}.ok{color:#1a8f3c;font-weight:700}.pending{color:#c0392b;font-weight:700}.manual{color:#8a6d00;font-weight:700}.kpi{display:flex;gap:12px;flex-wrap:wrap}.kpi div{flex:1 1 150px;background:#f4f6fb;border-radius:10px;padding:12px 14px}.kpi b{display:block;font-size:22px;color:#1f3a73}.muted{color:#667085;font-size:13px}.summary{background:#eef7ee;border-left:4px solid #7dc142;padding:12px 16px;border-radius:6px}@media print{body{margin:0}}</style></head><body>
<p class="muted">하나회원권거래소 홈페이지 신설 · AEO/GEO/SEO 구축 프로젝트 — 공급: 세느루(SAENRU) · 착수 ${fmtKoDate(d.kickoff)} · 작성 ${fmtKoDate(d.generatedAt)} (자동 생성)</p>
<h1>${esc(title)}</h1>
<p><strong>기간:</strong> ${period}</p>
<div class="summary"><strong>요약.</strong> 이번 주 콘텐츠 ${d.posts.week}건 발행(누적 ${d.posts.total}건, 인블로그 동기화 ${d.posts.inblog}건), 골프장 소개 ${d.clubs.withBody}/${d.clubs.total}개 작성, 시세 업로드 ${d.priceUp.week}회, 문의 ${d.inq.week}건. 사람 방문 ${fmtNum(pv.human || 0)}회(전주 대비 ${pct(pv.human || 0, prevH)}), AI 크롤러 방문 ${fmtNum(pv['ai-bot'] || 0)}회. 기술 감사 ${d.audit ? d.audit.score + '점' : '미실행'}. 계획 항목 ${d.doneCount}/${d.tasks.length} 완료.</div>

<h2>1. 이번 주 실행계획 체크</h2>
<table><thead><tr><th style="width:52%">항목</th><th>담당</th><th>상태</th><th>비고</th></tr></thead><tbody>
${d.tasks.map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.owner || '')}</td><td>${statusBadge(t)}</td><td>${esc(t.note || (t.auto === null ? '수동 확인 항목' : '자동 판정'))}</td></tr>`).join('')}
</tbody></table>

<h2>2. 콘텐츠 발행</h2>
<div class="kpi"><div><b>${d.posts.week}</b>이번 주 발행</div><div><b>${d.posts.total}</b>누적 발행</div><div><b>${d.posts.inblog}</b>인블로그 동기화</div><div><b>${d.posts.drafts}</b>검토 대기(초안)</div></div>
<p class="muted">유형별 누적: ${d.posts.byType.map(r => `${typeLabel[r.type] || r.type} ${r.c}`).join(' · ') || '-'}${d.posts.inblogErr ? ` · 인블로그 전송 오류 ${d.posts.inblogErr}건(관리자에서 재전송)` : ''}${d.posts.slotsMissed ? ` · 자동발행 실패 슬롯 ${d.posts.slotsMissed}회` : ''}</p>
<table><thead><tr><th>발행일</th><th>유형</th><th>제목</th><th>생성</th></tr></thead><tbody>
${d.posts.list.map(p => `<tr><td>${kstDate(new Date(p.published_at * 1000))}</td><td>${typeLabel[p.type] || p.type}</td><td><a href="${esc(settings.siteUrl())}/blog/${esc(p.slug)}">${esc(p.title)}</a></td><td>${p.source === 'ai' ? 'AI' : p.source === 'template' ? '데이터 템플릿' : '수동'}</td></tr>`).join('') || '<tr><td colspan="4">이번 주 발행 없음</td></tr>'}
</tbody></table>

<h2>3. 시세 데이터 · 골프장 페이지</h2>
<div class="kpi"><div><b>${d.priceUp.week}</b>이번 주 시세 업로드</div><div><b>${d.priceUp.golfStats.total}</b>골프 시세 종목</div><div><b>${d.clubs.withBody}/${d.clubs.total}</b>골프장 소개 작성</div><div><b>${d.clubs.verified}</b>기본정보 검증 완료</div></div>
<p class="muted">마지막 업로드: ${d.priceUp.last ? `${kstDate(new Date(d.priceUp.last.created_at * 1000))} · ${esc(d.priceUp.last.filename || '')} · ${d.priceUp.last.rows}행` : '없음(초기 시드 데이터 사용 중)'} · 골프 시세 상승 ${d.priceUp.golfStats.up} / 하락 ${d.priceUp.golfStats.down} / 보합 ${d.priceUp.golfStats.flat}</p>

<h2>4. 방문 · AI 크롤러 · 문의</h2>
<div class="kpi"><div><b>${fmtNum(pv.human || 0)}</b>사람 방문 <span class="muted">(전주 ${pct(pv.human || 0, prevH)})</span></div><div><b>${fmtNum(pv['ai-bot'] || 0)}</b>AI 크롤러 방문</div><div><b>${fmtNum(pv['search-bot'] || 0)}</b>검색엔진 봇</div><div><b>${d.inq.week}</b>문의 <span class="muted">(누적 ${d.inq.total}, 미처리 ${d.inq.pending})</span></div></div>
<table><thead><tr><th>AI 크롤러</th><th>방문</th><th>검색 봇</th><th>방문</th><th>유입 경로(사람)</th><th>방문</th></tr></thead><tbody>
${(() => { const a = Object.entries(tr.aiBots), b = Object.entries(tr.searchBots), c = tr.topRefs; const n = Math.max(a.length, b.length, c.length, 1); let rows = ''; for (let i = 0; i < n; i++) rows += `<tr><td>${esc(a[i]?.[0] || '')}</td><td>${a[i]?.[1] ?? ''}</td><td>${esc(b[i]?.[0] || '')}</td><td>${b[i]?.[1] ?? ''}</td><td>${esc(c[i]?.ref_host || '')}</td><td>${c[i]?.c ?? ''}</td></tr>`; return rows; })()}
</tbody></table>
<p class="muted">AI 크롤러(OAI-SearchBot·ChatGPT-User·PerplexityBot·Claude-User 등)의 방문은 AI 답변엔진이 사이트를 읽고 있다는 직접 신호입니다. 인용 여부는 4주차 ChatGPT·Perplexity 실측으로 확인합니다.</p>
<p class="muted">인기 페이지: ${tr.topPages.slice(0, 6).map(p => `${esc(p.path)}(${p.c})`).join(' · ') || '-'}</p>

<h2>5. 기술 감사 (진단보고서 실패 항목 재점검)</h2>
<p>자체 감사 점수 <strong>${d.audit ? d.audit.score : '-'}점</strong> (착수 전 외부 진단 28점 · 추이: ${d.auditHistory.map(h => `${h.date.slice(5)} ${h.score}`).join(' → ') || '-'})</p>
<table><thead><tr><th>항목</th><th>판정</th><th>근거</th></tr></thead><tbody>${auditRows}</tbody></table>

<h2>6. 다음 주 계획</h2>
<ul>${d.next.map(t => `<li>${esc(t.title)} <span class="muted">(${esc(t.owner || '')})</span></li>`).join('') || '<li>월간 리포트로 종료</li>'}</ul>
<p class="muted">본 리포트는 ${esc(s.legal_name)} 홈페이지 시스템이 실측 데이터로 자동 생성했습니다. AI 인용·순위·매출은 보장 대상이 아니며, 지표는 매주 동일 방법으로 재측정합니다.</p>
</body></html>`;
}

// docx 생성 (docx 패키지)
async function buildDocx(d, kind, html) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = require('docx');
  const P = (t, o = {}) => new Paragraph({ children: [new TextRun({ text: t, ...o })] });
  const H = (t, lv = HeadingLevel.HEADING_2) => new Paragraph({ text: t, heading: lv });
  const tbl = (rows) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((r, i) => new TableRow({ children: r.map(c => new TableCell({ children: [P(String(c ?? ''), i === 0 ? { bold: true } : {})] })) })) });
  const typeLabel = { club: '골프장 소개', report: '시세 리포트', guide: '가이드·FAQ', trend: '트렌드' };
  const title = kind === 'baseline' ? '베이스라인 리포트' : kind === 'monthly' ? '월간 종합 리포트' : `${d.week}주차 주간 리포트`;
  const pv = d.traffic.byAgent;
  const children = [
    new Paragraph({ text: `하나회원권거래소 홈페이지 신설 — ${title}`, heading: HeadingLevel.HEADING_1 }),
    P(`기간 ${fmtKoDate(d.range.start)} ~ ${fmtKoDate(d.range.end)} · 작성 ${fmtKoDate(d.generatedAt)} · 공급 세느루(SAENRU)`, { color: '667085' }),
    P(`요약: 콘텐츠 ${d.posts.week}건 발행(누적 ${d.posts.total}, 인블로그 ${d.posts.inblog}), 골프장 소개 ${d.clubs.withBody}/${d.clubs.total}, 시세 업로드 ${d.priceUp.week}회, 문의 ${d.inq.week}건, 사람 방문 ${pv.human || 0}, AI 크롤러 ${pv['ai-bot'] || 0}, 기술 감사 ${d.audit ? d.audit.score + '점' : '미실행'}, 계획 ${d.doneCount}/${d.tasks.length} 완료.`, { bold: true }),
    H('1. 실행계획 체크'), tbl([['항목', '담당', '상태'], ...d.tasks.map(t => [t.title, t.owner || '', (t.done || t.auto === true) ? '완료' : t.auto === false ? '미완' : '확인 필요'])]),
    H('2. 콘텐츠 발행'), tbl([['발행일', '유형', '제목'], ...(d.posts.list.length ? d.posts.list.map(p => [kstDate(new Date(p.published_at * 1000)), typeLabel[p.type] || p.type, p.title]) : [['-', '-', '이번 주 발행 없음']])]),
    H('3. 시세·골프장 페이지'), P(`시세 업로드 ${d.priceUp.week}회 · 골프 시세 ${d.priceUp.golfStats.total}종목(상승 ${d.priceUp.golfStats.up}/하락 ${d.priceUp.golfStats.down}) · 골프장 소개 ${d.clubs.withBody}/${d.clubs.total} · 검증 ${d.clubs.verified}`),
    H('4. 방문·AI 크롤러·문의'), tbl([['구분', '값'], ['사람 방문', String(pv.human || 0)], ['AI 크롤러 방문', String(pv['ai-bot'] || 0)], ['검색엔진 봇', String(pv['search-bot'] || 0)], ['문의(주간/누적)', `${d.inq.week} / ${d.inq.total}`], ['AI 크롤러 상세', Object.entries(d.traffic.aiBots).map(([k, v]) => `${k} ${v}`).join(', ') || '-']]),
    H('5. 기술 감사'), P(`점수 ${d.audit ? d.audit.score : '-'}점 (착수 전 외부 진단 28점)`), tbl([['항목', '판정', '근거'], ...(d.audit ? d.audit.items.map(i => [i.label, i.ok ? '통과' : '미충족', i.detail || '']) : [['감사 미실행', '', '']])]),
    H('6. 다음 주 계획'), ...(d.next.length ? d.next.map(t => P(`• ${t.title} (${t.owner || ''})`)) : [P('월간 리포트로 종료')]),
    P('본 리포트는 홈페이지 시스템이 실측 데이터로 자동 생성했습니다. AI 인용·순위·매출은 보장 대상이 아닙니다.', { color: '667085', size: 18 }),
  ];
  const doc = new Document({ sections: [{ children }] });
  const buf = await Packer.toBuffer(doc);
  const file = path.join(DATA_DIR, 'reports', `${kind}-week${d.week}-${d.generatedAt}.docx`);
  fs.writeFileSync(file, buf);
  return file;
}

async function generate(week, kind = 'weekly') {
  const d = collect(week);
  const html = renderHtml(d, kind);
  let docxPath = null; try { docxPath = await buildDocx(d, kind, html); } catch (e) { console.error('[report] docx 생성 실패', e.message); }
  const title = kind === 'baseline' ? '베이스라인 리포트' : kind === 'monthly' ? '월간 종합 리포트' : `${week}주차 주간 리포트`;
  db.prepare(`INSERT INTO reports (week,period_start,period_end,kind,title,html,json,docx_path,created_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(kind,week) DO UPDATE SET title=excluded.title, html=excluded.html, json=excluded.json, docx_path=excluded.docx_path, created_at=excluded.created_at`)
    .run(week, d.range.start, d.range.end, kind, title, html, JSON.stringify({ ...d, traffic: d.traffic }), docxPath, now());
  return db.prepare('SELECT id, week, kind, title, period_start, period_end, docx_path, created_at FROM reports WHERE kind=? AND week=?').get(kind, week);
}

module.exports = { kickoff, weekRange, currentWeek, collect, renderHtml, generate, autoStatus };
