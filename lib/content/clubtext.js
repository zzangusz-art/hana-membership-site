'use strict';
// 골프장 해설 자동 작성(사실 기반) — LLM 키가 없을 때 "해설은 아직 쓰는 중" 대신 채운다.
// 원칙: 확인된 사실(소재지·규모·회원권 종류·골프장 제공 요금표·세부 정보)만 문장으로 만들고, 시세 숫자처럼 매일 바뀌는 값은 본문에 넣지 않는다(페이지의 표가 실시간).
const { db } = require('../../db');
const { esc, fmtNum } = require('../util');
const clubgroup = require('../clubgroup');

const won = (t) => { // "68000" | "87,000" | "13만" | "23.5만" | "토)250000" → 원
  const s = String(t || '').replace(/\s/g, ''); if (!s || s === '-' || /^0+$/.test(s)) return null;
  const m = s.match(/([\d,.]+)만/); if (m) return Math.round(parseFloat(m[1].replace(/,/g, '')) * 10000);
  const n = s.replace(/[^\d]/g, ''); if (!n) return null; const v = Number(n); return v >= 1000 ? v : null;
};
const manwon = (v) => (v == null ? '' : v % 10000 === 0 ? `${v / 10000}만원` : `${Math.floor(v / 10000)}만${fmtNum(v % 10000)}원`);
const sidoShort = (s) => String(s || '').replace(/특별자치도|특별시|광역시|자치시/g, '').replace(/^(경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주도)$/, (m) => ({ 경기도: '경기', 강원도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주도: '제주' }[m]));

function fees(tables_json) {
  let t = []; try { t = JSON.parse(tables_json || '[]'); } catch (_) { t = []; }
  const out = { rows: {}, caddie: null, cart: null };
  for (const tb of t) {
    const head = (tb.head || []).map(h => String(h).trim());
    if (head[0] === '구분' && head.includes('주중')) {
      const iW = head.indexOf('주중'), iE = head.indexOf('주말');
      for (const r of tb.rows || []) { const k = String(r[0] || '').split('\n')[0].trim(); if (!k) continue; const cells = r.length === head.length ? r : [k, ...String(r[0]).split('\n').slice(1), ...r.slice(1)]; out.rows[k] = { weekday: won(cells[iW]), weekend: won(cells[iE]) }; }
    } else if (head[0] === '캐디피') { const r = (tb.rows || [])[0] || []; out.caddie = won(r[0]); out.cart = won(r[1]); }
  }
  return out;
}

// 은/는 조사: 한글 받침, 숫자(영·일·삼·육·칠·팔은 받침), 영문 끝 처리
function eun(w) { const c = String(w || '').trim().slice(-1); if (/[가-힣]/.test(c)) return (c.charCodeAt(0) - 0xac00) % 28 ? '은' : '는'; if (/[0-9]/.test(c)) return '013678'.includes(c) ? '은' : '는'; if (/[a-zA-Z]/.test(c)) return /[lmnr]/i.test(c) ? '은' : '는'; return '은(는)'; }
const kinds = (vs) => { const s = new Set(); for (const v of vs) { const n = v.label + ' ' + v.name; if (/주중/.test(n)) s.add('weekday'); if (/가족/.test(n)) s.add('family'); if (/여자/.test(n)) s.add('women'); if (/무기명/.test(n)) s.add('anon'); if (/우대|VIP|VVIP|로얄|프리미/i.test(n)) s.add('premium'); if (/법인|비즈니스|비지니스/.test(n)) s.add('corp'); } return s; };

// 반환: { body_html, summary, faq, fit_for }
function draft(club, ctx) {
  const vs = clubgroup.variants(club, ctx); const title = club.group_name || club.name; const sd = sidoShort(club.sido); const addrShort = String(club.address || '').split(' ').slice(0, 3).join(' ');
  const f = fees(club.tables_json); const k = kinds(vs); const priced = vs.filter(v => v.price);
  let d = {}; try { d = JSON.parse(club.detail_json || '{}') || {}; } catch (_) { d = {}; }
  const metro = /수도권/.test(club.region) || /서울|경기|인천/.test(sd);
  // 1) 소개 문장
  const facts = [];
  facts.push(`${title}${eun(title)} ${addrShort || sd || '국내'}에 있는 ${club.verified && club.holes ? club.holes + '홀 ' : ''}${club.type || '회원제'} 골프장입니다.`);
  if (club.opened) facts.push(`${club.opened}년에 문을 열었습니다.`);
  if (club.members) facts.push(`회원 수는 약 ${fmtNum(club.members)}명입니다.`);
  if (vs.length > 1) facts.push(`회원권은 ${vs.map(v => v.label).join(', ')} ${vs.length}종으로 나뉘어 거래됩니다.`);
  // 2) 이런 분께
  const who = [];
  if (metro) who.push('서울·경기에서 주 1회 이상 라운드하는 분'); else if (sd) who.push(`${sd}에 살거나 사업장을 둔 분`);
  if (k.has('weekday')) who.push('주중 위주로 치는 분(주중 회원권은 정회원권보다 부담이 적습니다)');
  if (k.has('family')) who.push('배우자나 가족과 함께 등록해 쓰려는 분(가족 회원권)');
  if (k.has('women')) who.push('여성 골퍼(여자 회원권이 따로 있습니다)');
  if (k.has('anon') || k.has('corp')) who.push('접대 인원이 자주 바뀌는 법인(무기명·법인 회원권)');
  if (club.verified && club.holes >= 27) who.push('같은 골프장에서 코스를 바꿔 가며 치고 싶은 분(27홀 이상)');
  if (!who.length) who.push('거주지 가까운 골프장을 정해 놓고 꾸준히 이용하려는 분');
  // 3) 요금 차이
  const reg = f.rows['정회원'] || f.rows['회원'] || null; const non = f.rows['비회원'] || null; const fam = f.rows['가족회원'] || null;
  let feeHtml = '';
  if (reg && non && (reg.weekend && non.weekend || reg.weekday && non.weekday)) {
    const parts = [];
    if (reg.weekday && non.weekday) parts.push(`주중 정회원 ${manwon(reg.weekday)}, 비회원 ${manwon(non.weekday)}`);
    if (reg.weekend && non.weekend) parts.push(`주말 정회원 ${manwon(reg.weekend)}, 비회원 ${manwon(non.weekend)}`);
    const diffE = reg.weekend && non.weekend ? non.weekend - reg.weekend : null; const diffW = reg.weekday && non.weekday ? non.weekday - reg.weekday : null;
    const diff = diffE || diffW; const when = diffE ? '주말' : '주중';
    feeHtml = `<h2>회원과 비회원의 그린피 차이</h2><p>골프장이 제공한 요금표 기준으로 ${parts.join(', ')}입니다.${diff && diff > 0 ? ` ${when} 한 번 라운드에 ${manwon(diff)} 차이가 나고, 한 달에 두 번이면 1년에 약 ${manwon(Math.round(diff * 24 / 10000) * 10000)}을 아끼는 셈입니다.` : ''}${fam && fam.weekend && reg.weekend && fam.weekend > reg.weekend ? ` 가족회원 주말 요금은 ${manwon(fam.weekend)}으로 정회원과 차이가 있으니 가족 이용이 많다면 함께 계산해 보세요.` : ''}${f.caddie || f.cart ? ` 캐디피${f.caddie ? ' ' + manwon(f.caddie) : ''}${f.cart ? ', 카트비 ' + manwon(f.cart) : ''}은 별도입니다.` : ''} 요금은 골프장 공지에 따라 바뀝니다.</p>`;
  }
  // 4) 시세 보는 법(숫자 없이)
  const priceHtml = priced.length ? `<h2>시세는 어떻게 보나요</h2><p>${title} 회원권 시세는 위 ${vs.length > 1 ? '"회원권 종류" 표와 ' : ''}추이 그래프에 매일 반영됩니다.${vs.length > 1 && priced.length > 1 ? ` 종류마다 시세가 다르므로 ${priced.map(v => v.label).join('·')} 중 이용 방식에 맞는 것을 고른 뒤 비교하세요.` : ''} 표시 가격은 만원 단위 회원권 값이고 명의개서료와 수수료는 별도입니다. 단기간에 크게 움직였다면 골프장 정책 변경이나 매물 수급 때문인 경우가 많으니 상담 때 이유를 확인해 드립니다.</p>` : `<h2>시세는 어떻게 보나요</h2><p>${title} 회원권은 시세표에 상시 게시되는 종목이 아니라 매물이 나올 때마다 호가로 거래됩니다. 현재 호가와 매물은 전화로 확인해 드립니다.</p>`;
  // 5) 확인 사항
  const chk = [];
  const P = d.personal || {};
  if (P.entry) chk.push(`<li><strong>명의개서 조건</strong>: ${esc(P.entry.split('\n')[0])}. 자세한 조건은 아래 개인·법인 회원권 정보 탭을 보세요.</li>`); else chk.push('<li><strong>명의개서료와 심사 기간</strong>: 골프장마다 다르므로 계약 전에 최신 조건을 확인합니다. 아래 개인·법인 회원권 정보 탭에 정리돼 있습니다.</li>');
  if (P.booking) chk.push(`<li><strong>부킹 방식</strong>: ${esc(P.booking.split('\n')[0])}.</li>`); else chk.push('<li><strong>주말 부킹 방식</strong>: 추첨·선착순·점수제 중 무엇인지, 회원 동반 인원은 몇 명까지인지 확인합니다.</li>');
  if (k.has('anon') || k.has('corp')) chk.push('<li><strong>법인 등록 인원</strong>: 지정 등록자 수와 변경 조건에 따라 같은 골프장이라도 가격이 다릅니다.</li>');
  chk.push('<li><strong>입회금 반환 여부</strong>: 예탁금제라면 만기와 반환 조건을, 주주제라면 지분 구조를 확인합니다.</li>');
  const body = `<h2>${esc(title)} 회원권, 이런 분께 맞습니다</h2><p>${esc(facts.join(' '))}</p><ul>${who.map(w => `<li>${esc(w)}</li>`).join('')}</ul>${feeHtml}${priceHtml}<h2>매수 전에 확인할 것</h2><ul>${chk.join('')}</ul><h2>하나회원권거래소에서 거래하면</h2><p>2004년부터 회원권 매매를 중개해 온 하나회원권거래소가 ${esc(title)} 회원권의 매수·매도 상담, 계약, 명의개서 대행, 등록 뒤 부킹 문의까지 한 담당자가 맡습니다. 전화 상담은 24시간 받습니다.</p>`;
  const summary = `${facts[0]}${vs.length > 1 ? ` 회원권은 ${vs.length}종(${vs.map(v => v.label).join('·')})으로 거래되며,` : ''} 하나회원권거래소가 시세와 매물을 안내합니다.`.replace(/\s+/g, ' ').trim();
  const faq = [
    { q: `${title} 회원권 시세는 얼마인가요?`, a: `이 페이지의 시세 표와 추이 그래프에 매일 반영됩니다.${vs.length > 1 ? ' 종류(' + vs.map(v => v.label).join('·') + ')마다 다릅니다.' : ''} 명의개서료·수수료는 별도이며, 매수·매도 호가는 전화로 확인해 드립니다.` },
    { q: `${title} 회원권은 법인 명의로 살 수 있나요?`, a: k.has('anon') || k.has('corp') ? `법인용 종류가 따로 거래됩니다. 등록 가능 인원과 변경 조건은 법인 회원권 정보 탭과 상담에서 확인하세요.` : `개인 회원권의 법인 명의 등록 가능 여부와 등록 인원은 골프장 규정에 따릅니다. 상담 시 최신 규정을 확인해 드립니다.` },
    ...(reg && non && non.weekend && reg.weekend ? [{ q: `${title} 회원 그린피는 비회원과 얼마나 차이 나나요?`, a: `골프장 요금표 기준 주말 정회원 ${manwon(reg.weekend)}, 비회원 ${manwon(non.weekend)}으로 ${manwon(non.weekend - reg.weekend)} 차이입니다. 요금은 골프장 공지에 따라 바뀝니다.` }] : [{ q: '명의개서까지 얼마나 걸리나요?', a: '서류 접수 후 골프장 심사를 거쳐 보통 1~2주 안에 등록됩니다. 골프장별 처리 기간은 상담 때 안내합니다.' }]),
  ];
  const fit = who[0].replace(/\(.*?\)/g, '').trim() + (who[1] ? ' · ' + who[1].replace(/\(.*?\)/g, '').trim() : '');
  return { body_html: body, summary, faq_json: JSON.stringify(faq), fit_for: fit.slice(0, 80) };
}

// 해설이 비어 있는 대표 골프장 전부 채우기(멱등). 시세 문장이 박힌 옛 요약도 새로 만든다.
function fillAll() {
  const ctx = clubgroup.context(); let filled = 0, summaries = 0; const ts = Math.floor(Date.now() / 1000);
  const rows = db.prepare("SELECT * FROM clubs WHERE status='published' AND parent_id IS NULL").all();
  const up = db.prepare("UPDATE clubs SET body_html=?, summary=?, faq_json=?, fit_for=CASE WHEN fit_for IS NULL OR fit_for='' OR fit_for LIKE '%·%' THEN ? ELSE fit_for END, updated_at=? WHERE id=?");
  const upSum = db.prepare('UPDATE clubs SET summary=?, updated_at=? WHERE id=?');
  db.transaction(() => {
    for (const c of rows) {
      const empty = !c.body_html || !c.body_html.trim() || /해설은 아직 쓰는 중/.test(c.body_html) || /^\s*<h2>[^<]*회원권은 어떤 사람에게 맞나요\?<\/h2>/.test(c.body_html) && c.ai_generated === 0;
      if (empty) { const d = draft(c, ctx); up.run(d.body_html, d.summary, d.faq_json, d.fit_for, ts, c.id); filled++; }
      else if (/하나회원권거래소 기준 현재 회원권 시세는/.test(c.summary || '')) { upSum.run(draft(c, ctx).summary, ts, c.id); summaries++; }
    }
  })();
  return { filled, summaries };
}

module.exports = { draft, fillAll, fees };
