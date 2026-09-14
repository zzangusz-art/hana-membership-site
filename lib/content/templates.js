'use strict';
// LLM 없이도 발행 가능한 템플릿 콘텐츠 — 자사 시세 DB(1차 데이터) 기반
// ① 주간 시세 리포트  ② 골프장 소개 페이지 초안
const { db } = require('../../db');
const prices = require('../prices');
const { esc, fmtNum, fmtMan, kstDate, addDays, fmtKoDate } = require('../util');

function signHtml(diff, pct) {
  if (diff > 0) return `<span class="up">▲ ${fmtNum(diff)} (+${pct}%)</span>`;
  if (diff < 0) return `<span class="down">▼ ${fmtNum(Math.abs(diff))} (${pct}%)</span>`;
  return '<span class="flat">보합</span>';
}
function rowsTable(rows, cols = ['종목', '금일시세', '전일 대비']) {
  return `<table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(r => `<tr><td>${esc(r.name)}</td><td>${fmtNum(r.today)}만원</td><td>${signHtml(r.diff, r.pct)}</td></tr>`).join('') + '</tbody></table>';
}

// ── 주간 시세 리포트 ──
function weeklyReport({ date = kstDate() } = {}) {
  const g = prices.stats('golf');
  const c = prices.stats('condo');
  const f = prices.stats('fitness');
  const from = addDays(date, -6);
  const title = `주간 골프회원권 시세 리포트 (${fmtKoDate(from)} ~ ${fmtKoDate(date)})`;
  const upRatio = g.total ? Math.round((g.up / g.total) * 100) : 0;
  const tone = g.up > g.down ? '상승 우위' : g.up < g.down ? '하락 우위' : '보합';
  const regionRows = Object.entries(g.regions).sort((a, b) => b[1].n - a[1].n)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}종목</td><td class="up">${v.up}</td><td class="down">${v.down}</td><td>${fmtNum(Math.round(v.sum / v.n))}만원</td></tr>`).join('');
  const bluf = `이번 주 하나회원권거래소 골프회원권 시세는 집계 ${g.total}종목 중 상승 ${g.up}·하락 ${g.down}·보합 ${g.flat}으로 <strong>${tone}</strong> 흐름을 보였습니다. ` +
    (g.topUp[0] ? `주간 상승률 1위는 ${esc(g.topUp[0].name)}(+${g.topUp[0].pct}%)` : '') +
    (g.topDown[0] ? `, 하락률 1위는 ${esc(g.topDown[0].name)}(${g.topDown[0].pct}%)입니다.` : '.');
  const body = `
<p class="bluf">${bluf}</p>
<h2>이번 주 골프회원권 시세는 어떻게 움직였나요?</h2>
<p>집계 대상 ${g.total}개 종목 가운데 ${upRatio}%가 상승했습니다. 평균 시세는 ${fmtMan(g.avg)}이며, 최고가 종목은 ${g.max[0] ? esc(g.max[0].name) + ' ' + fmtMan(g.max[0].today) : '-'}입니다. 아래 표는 하나회원권거래소가 매주 갱신하는 자체 시세 데이터를 기준으로 합니다.</p>
<h3>상승률 상위 5종목</h3>
${rowsTable(g.topUp)}
<h3>하락률 상위 5종목</h3>
${rowsTable(g.topDown)}
<h2>지역별로는 어떤 차이가 있나요?</h2>
<table><thead><tr><th>권역</th><th>종목 수</th><th>상승</th><th>하락</th><th>평균 시세</th></tr></thead><tbody>${regionRows}</tbody></table>
<p>수도권 종목은 부킹 수요가 꾸준해 시세 변동 폭이 비교적 작고, 영남·강원권은 계절 요인과 골프장 정책 변화에 따라 등락이 크게 나타나는 경향이 있습니다. 개별 종목의 매수·매도 판단은 최근 4주 흐름과 골프장별 입회 조건을 함께 확인하시기 바랍니다.</p>
<h2>콘도·피트니스 회원권은요?</h2>
<p>콘도회원권 ${c.total}종목 중 상승 ${c.up}·하락 ${c.down}, 피트니스회원권 ${f.total}종목 중 상승 ${f.up}·하락 ${f.down}입니다. ${f.topUp[0] ? `피트니스에서는 ${esc(f.topUp[0].name)}이(가) +${f.topUp[0].pct}%로 가장 많이 올랐습니다.` : ''}</p>
<h2>이번 주 시세로 무엇을 판단할 수 있나요?</h2>
<ul>
<li><strong>매수 검토 시</strong>: 하락률 상위 종목은 단기 조정인지 골프장 정책 변화(회원수 조정·입회금 변경) 때문인지 원인 확인이 우선입니다.</li>
<li><strong>매도 검토 시</strong>: 상승률 상위 종목은 호가가 실거래로 이어지는지 확인한 뒤 매도 호가를 정하는 것이 유리합니다.</li>
<li><strong>법인 수요</strong>: 무기명·법인 회원권은 연말 접대 수요를 앞두고 문의가 늘어나는 시기이므로 조건 좋은 매물은 선점 경쟁이 있습니다.</li>
</ul>
<h3>자주 묻는 질문</h3>
<h4>시세는 언제 갱신되나요?</h4><p>하나회원권거래소 시세는 매주 월요일 오전 실거래·호가를 반영해 갱신되며, 이 리포트는 그 데이터를 기준으로 작성됩니다.</p>
<h4>표의 가격 단위는 무엇인가요?</h4><p>모든 가격은 만원 단위이며, 골프장에 별도 납부하는 명의개서료와 거래소 수수료는 포함되지 않은 회원권 자체 시세입니다.</p>
<p class="cta">종목별 상세 시세와 매물은 <a href="/market/golf">골프회원권 시세표</a>에서 확인하시고, 매수·매도 상담은 02-583-0583 또는 <a href="/apply">매매 신청</a>으로 문의해 주세요.</p>`;
  const excerpt = `집계 ${g.total}종목 중 상승 ${g.up}·하락 ${g.down}·보합 ${g.flat}. ${g.topUp[0] ? '상승 1위 ' + g.topUp[0].name + ' +' + g.topUp[0].pct + '%' : ''}${g.topDown[0] ? ', 하락 1위 ' + g.topDown[0].name + ' ' + g.topDown[0].pct + '%' : ''}.`;
  return {
    title, slug: `weekly-golf-price-report-${date}`, type: 'report',
    meta_description: `${fmtKoDate(from)}~${fmtKoDate(date)} 골프회원권 시세 동향. ${excerpt}`.slice(0, 155),
    excerpt, body_html: body, tags: '골프회원권 시세,주간 시세 리포트,회원권 동향',
    faq: [{ q: '시세는 언제 갱신되나요?', a: '매주 월요일 오전 실거래·호가를 반영해 갱신됩니다.' }, { q: '표의 가격 단위는 무엇인가요?', a: '만원 단위이며 명의개서료·수수료는 제외한 회원권 시세입니다.' }],
  };
}

// ── 골프장 소개 초안 (시세 DB + 기본정보만으로 작성. 추측 정보 없음) ──
function clubDraft(club) {
  const p = club.price_name ? prices.byName('golf', club.price_name) : null;
  const region = club.region || '';
  const addr = club.address || '';
  const priceLine = p ? `${fmtMan(p.today)} (전일 대비 ${p.diff > 0 ? '+' : ''}${fmtNum(p.diff)}만원, ${p.pct}%)` : '상담 시 안내';
  const summary = `${club.name}은(는) ${addr ? addr + '에 위치한 ' : ''}${region ? region + ' 권역 ' : ''}${club.type || '회원제'} 골프장으로, 하나회원권거래소 기준 현재 회원권 시세는 ${priceLine}입니다.`;
  const body = `
<h2>${esc(club.name)} 회원권은 어떤 사람에게 맞나요?</h2>
<p>${esc(club.name)} 회원권은 ${region === '수도권' ? '서울·수도권에서 접근이 쉬운 골프장을 원하는 개인 골퍼와 접대 수요가 있는 법인' : region ? region + ' 권역에 거주하거나 사업장을 둔 골퍼와 지역 법인' : '거주지 인근 골프장을 안정적으로 이용하려는 골퍼'}에게 우선 검토 대상입니다. 회원 그린피 혜택과 우선 예약권이 핵심 가치이므로, 월 2회 이상 라운드하는 분이라면 비회원 이용 대비 비용 절감 효과를 계산해 볼 만합니다.</p>
<h2>매수 전에 무엇을 확인해야 하나요?</h2>
<ul>
<li><strong>입회 조건</strong>: 명의개서료, 입회 심사 기간, 법인 등록 가능 인원은 골프장별로 다르므로 계약 전에 최신 조건을 확인합니다.</li>
<li><strong>부킹 조건</strong>: 주말 예약 배정 방식(추첨·선착순)과 회원 동반 인원 규정을 확인합니다.</li>
<li><strong>시세 흐름</strong>: 최근 4주 시세 추이를 보고 단기 급등·급락 종목은 원인을 파악한 뒤 판단합니다.</li>
</ul>
<h2>하나회원권거래소에서 거래하면 무엇이 다른가요?</h2>
<p>2004년부터 회원권 매매를 중개해 온 하나회원권거래소는 ${esc(club.name)} 회원권의 매수·매도 상담부터 계약, 명의개서 대행, 등록 완료 후 부킹 문의까지 한 담당자가 끝까지 지원합니다. 시세는 매주 갱신되며 상담은 24시간 가능합니다.</p>`;
  const faq = [
    { q: `${club.name} 회원권 시세는 얼마인가요?`, a: p ? `하나회원권거래소 기준 현재 ${fmtMan(p.today)}이며 매주 갱신됩니다. 명의개서료·수수료는 별도입니다.` : '시세는 상담 시 안내드리며 홈페이지 시세표에서 최신 값을 확인할 수 있습니다.' },
    { q: `${club.name} 회원권은 법인 명의로 살 수 있나요?`, a: '대부분의 회원제 골프장은 법인 회원권을 별도 운영하거나 개인 회원권의 법인 명의 등록을 허용합니다. 등록 가능 인원과 무기명 여부는 골프장 규정에 따르므로 상담 시 확인해 드립니다.' },
    { q: '명의개서까지 얼마나 걸리나요?', a: '서류 접수 후 골프장 심사를 거쳐 보통 1~2주 내 등록이 완료됩니다.' },
  ];
  return { summary, body_html: body, faq_json: JSON.stringify(faq), fit_for: region === '수도권' ? '수도권 개인 골퍼 · 접대용 법인' : '지역 거주 골퍼 · 지역 법인', booking: '주말 예약 방식·동반 인원 규정은 골프장 규정 확인', transfer: '명의개서료·입회 심사 기간은 상담 시 최신 조건 안내' };
}

module.exports = { weeklyReport, clubDraft, rowsTable, signHtml };
