'use strict';
// 골프장 페이지의 "회원권 세부 정보"와 "개인/법인 회원권 정보".
//  - 골프장별 내용은 clubs.detail_json에 저장(관리자에서 편집, 또는 data/seed/club-details.json에서 공급).
//  - 값이 없는 항목은 화면에 내지 않는다. 시세 흐름은 우리 시세 기록으로 계산한다(문장을 지어내지 않음).
//  - 필요 서류는 골프장별 값이 없으면 일반 기준을 "일반 기준"이라고 밝히고 보여 준다.
const { db } = require('../db');
const { esc, fmtMan, kstDate, addDays } = require('./util');

const INFO_FIELDS = [['intro', '회원권 소개'], ['course', '코스 소개'], ['history', '연혁'], ['access', '위치 정보'], ['trend', '시세 흐름'], ['outlook', '향후 전망']];
const MEMBER_FIELDS = [['target', '추천 고객'], ['composition', '회원권 구성'], ['kinds', '회원권 종류'], ['booking', '부킹'], ['entry', '입회 조건'], ['docs', '필요 서류'], ['features', '회원권 특징']];
const STD_DOCS = {
  personal: ['인감증명서 1통', '주민등록등본 1통', '신분증 사본 1부', '증명사진', '인감도장'],
  corporate: ['법인인감증명서 1통', '법인등기부등본 1통', '사업자등록증 사본 1부', '법인인감 도장', '등록할 임직원의 재직증명서', '등록할 임직원의 주민등록등본·신분증 사본·증명사진'],
};

function parse(json) {
  let d = {}; try { d = JSON.parse(json || '{}') || {}; } catch (_) { d = {}; }
  const s = (v) => (Array.isArray(v) ? v.join('\n') : String(v || '')).trim();
  const out = { personal: {}, corporate: {}, sources: Array.isArray(d.sources) ? d.sources.filter(Boolean) : [], checked: s(d.checked), _edited: !!d._edited, _seed: s(d._seed) };
  for (const [k] of INFO_FIELDS) out[k] = s(d[k]);
  for (const [k] of MEMBER_FIELDS) { out.personal[k] = s((d.personal || {})[k]); out.corporate[k] = s((d.corporate || {})[k]); }
  return out;
}
// 관리자 폼(d_intro, dp_target, dc_target …) → detail_json
function fromForm(b, prevJson) {
  const prev = parse(prevJson); const t = (v) => String(v || '').replace(/\r/g, '').trim().slice(0, 4000);
  const d = { personal: {}, corporate: {}, sources: t(b.d_sources).split('\n').map(x => x.trim()).filter(Boolean).slice(0, 10), checked: t(b.d_checked) || prev.checked, _edited: true };
  for (const [k] of INFO_FIELDS) if (k !== 'trend') d[k] = t(b['d_' + k]);
  for (const [k] of MEMBER_FIELDS) { d.personal[k] = t(b['dp_' + k]); d.corporate[k] = t(b['dc_' + k]); }
  return JSON.stringify(d);
}
const hasForm = (b) => Object.keys(b || {}).some(k => /^d[pc]?_/.test(k));

// 시세 흐름: 현재가, 1년 전 대비, 최근 5년 최저·최고 (시세 기록이 있을 때만)
function trendOf(p) {
  if (!p) return '';
  const today = kstDate(); const rows = db.prepare('SELECT date, value FROM price_history WHERE price_id=? AND date>=? ORDER BY date').all(p.id, addDays(today, -1826));
  let t = `현재 ${fmtMan(p.today)}`;
  const yearAgo = addDays(today, -365); const base = [...rows].reverse().find(r => r.date <= yearAgo && r.date >= addDays(today, -460));
  if (base && base.value) { const diff = p.today - base.value; const pct = Math.round(diff / base.value * 1000) / 10; t += diff === 0 ? `, 1년 전(${base.date})과 같습니다.` : `, 1년 전(${base.date} ${fmtMan(base.value)})보다 ${fmtMan(Math.abs(diff))} ${diff > 0 ? '올랐습니다' : '내렸습니다'}(${diff > 0 ? '+' : ''}${pct}%).`; } else t += '.';
  if (rows.length >= 6) { const lo = rows.reduce((a, r) => (r.value < a.value ? r : a)); const hi = rows.reduce((a, r) => (r.value > a.value ? r : a)); const span = Math.round((Date.parse(today) - Date.parse(rows[0].date)) / 86400000 / 365 * 10) / 10; t += ` 최근 ${span >= 4.5 ? '5년' : span >= 1 ? Math.round(span) + '년' : '기록 기간'} 최저 ${fmtMan(lo.value)}(${lo.date.slice(0, 7)}), 최고 ${fmtMan(hi.value)}(${hi.date.slice(0, 7)}).`; }
  return t;
}

const cell = (v) => esc(v).split('\n').map(x => x.trim()).filter(Boolean).join('<br>');
const rowsHtml = (rows) => rows.map(([k, v, raw]) => `<tr><th>${esc(k)}</th><td>${raw ? v : cell(v)}</td></tr>`).join('');

// c: 대표 골프장 행, vs: 회원권 종류(clubgroup.variants), s: settings
function render(c, vs, s) {
  const d = parse(c.detail_json); const title = c.group_name || c.name; const priced = vs.filter(v => v.price);
  const trend = priced.length > 1 ? priced.map(v => `${v.label}: ${trendOf(v.price)}`).join('\n') : trendOf(priced[0] && priced[0].price);
  const loc = [c.address, d.access].filter(Boolean).join('\n');
  const info = [['회원권 소개', d.intro], ['코스 소개', d.course], ['연혁', d.history || (c.opened ? `${c.opened}년 개장` : '')], ['위치 정보', loc], ['시세 흐름', trend], ['향후 전망', d.outlook]].filter(([, v]) => v);
  const kinds = vs.length > 1 ? vs.map(v => v.name).join('\n') : '';
  const member = (key) => { const m = d[key]; const std = !m.docs; return [['추천 고객', m.target || (key === 'personal' ? c.fit_for : '')], ['회원권 구성', m.composition], ['회원권 종류', m.kinds || kinds], ['부킹', m.booking || (key === 'personal' ? c.booking : '')], ['입회 조건', m.entry || (key === 'personal' ? c.transfer : '')], [std ? '필요 서류(일반 기준)' : '필요 서류', m.docs || STD_DOCS[key].join('\n')], ['회원권 특징', m.features]].filter(([, v]) => v); };
  const per = member('personal'), cor = member('corporate');
  const own = (rows) => rows.some(([k]) => !/일반 기준|회원권 종류/.test(k));
  const seenHost = new Set(); const srcs = d.sources.filter(u => /^https?:\/\//.test(u)).filter(u => { const h = u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]; if (seenHost.has(h)) return false; seenHost.add(h); return true; });
  const foot = `<p class="note">${d.checked ? `${esc(d.checked)} 확인 기준. ` : ''}부킹·입회 조건과 서류는 골프장 사정으로 바뀔 수 있습니다. 계약 전에 ${esc(s.phone)}으로 최신 조건을 확인해 드립니다.${srcs.length ? ` 참고: ${srcs.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</a>`).join(', ')}` : ''}</p>`;
  const infoHtml = info.length ? `<div class="spec-card dt-card" id="detail"><h2>${esc(title)} 회원권 세부 정보</h2><table class="spec dt-table"><tbody>${rowsHtml(info)}</tbody></table>${trend ? '<p class="note">시세 흐름은 하나회원권거래소 시세 기록으로 계산한 값입니다. 단위 만원.</p>' : ''}</div>` : '';
  const tabsHtml = `<div class="spec-card dt-card tabs2" id="member-info"><h2 class="sr-h">${esc(title)} 개인·법인 회원권 정보</h2><div class="t2-tabs" role="tablist"><button type="button" class="t2-tab active" role="tab" aria-selected="true" data-t2="personal">개인 회원권 정보</button><button type="button" class="t2-tab" role="tab" aria-selected="false" data-t2="corporate">법인 회원권 정보</button></div>
    <div class="t2-panel" role="tabpanel" data-t2="personal"><h3 class="sr-h">${esc(title)} 개인 회원권</h3><table class="spec dt-table"><tbody>${rowsHtml(per)}</tbody></table>${own(per) ? '' : '<p class="note">이 골프장의 개인 회원권 세부 조건은 정리 중입니다. 상담으로 먼저 안내해 드립니다.</p>'}</div>
    <div class="t2-panel" role="tabpanel" data-t2="corporate" hidden><h3 class="sr-h">${esc(title)} 법인 회원권</h3><table class="spec dt-table"><tbody>${rowsHtml(cor)}</tbody></table>${own(cor) ? '' : '<p class="note">이 골프장의 법인 회원권 세부 조건은 정리 중입니다. 상담으로 먼저 안내해 드립니다.</p>'}</div>${foot}</div>`;
  return { html: infoHtml + tabsHtml, detail: d, trend };
}

// 시드 공급: data/seed/club-details.json { "골프장 이름": {…} } — 관리자가 고친 골프장은 건드리지 않는다
function seed(file) {
  const fs = require('fs'); if (!fs.existsSync(file)) return 0;
  const j = JSON.parse(fs.readFileSync(file, 'utf8')); let n = 0;
  for (const [name, d] of Object.entries(j.clubs || {})) {
    const c = db.prepare('SELECT id, detail_json FROM clubs WHERE name=?').get(name); if (!c) continue;
    const cur = parse(c.detail_json); const stamp = String(d.checked || j.generated || '');
    if (cur._edited || cur._seed === stamp) continue;
    db.prepare('UPDATE clubs SET detail_json=? WHERE id=?').run(JSON.stringify({ ...d, _seed: stamp }), c.id); n++;
  }
  return n;
}

module.exports = { parse, fromForm, hasForm, render, trendOf, seed, INFO_FIELDS, MEMBER_FIELDS, STD_DOCS };
