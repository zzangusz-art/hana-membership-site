'use strict';
// 공개 페이지 ② 회원권 안내 · FAQ · 전용관 · 매물 · 매매신청 · 회사소개 · 개인정보 · 유튜브
const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { page, faqLd } = require('../lib/layout');
const settings = require('../lib/settings');
const prices = require('../lib/prices');
const { esc, attr, fmtNum, fmtMan, kstDate, isoFromTs, fmtKoDate, truncate } = require('../lib/util');
const { chg, faqHtml } = require('./pages-main');

const router = express.Router();
const FAQ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed', 'faq.json'), 'utf8'));
const site = () => settings.siteUrl();

function articleLd({ title, desc, url, faqs }) {
  const s = site();
  const out = [{ '@context': 'https://schema.org', '@type': 'Article', headline: title, description: desc, url: s + url, author: { '@id': s + '/#org' }, publisher: { '@id': s + '/#org' }, mainEntityOfPage: s + url, dateModified: kstDate(), inLanguage: 'ko-KR' }];
  if (faqs?.length) out.push(faqLd(faqs));
  return out;
}
function guideShell({ eyebrow, h1, bluf, sections, faqs, side }) {
  return `<section class="page-head"><div class="wrap"><p class="eyebrow">${eyebrow}</p><h1>${h1}</h1><p class="bluf">${bluf}</p></div></section>
<section class="section"><div class="wrap club-grid2"><div class="club-main"><article class="prose">${sections}</article>${faqs?.length ? faqHtml(faqs) : ''}</div><aside class="club-side">${side || ''}<div class="side-card"><h3>상담 신청</h3><p>희망 종목과 예산을 남겨 주시면 당일 연락드립니다.</p><a class="btn btn-green block" href="/apply">매매 신청</a><a class="btn btn-ghost block" href="tel:${attr(settings.cfg('phone'))}">${esc(settings.cfg('phone'))}</a></div></aside></div></section>`;
}
function sideStats() {
  const g = prices.stats('golf');
  return `<div class="side-card"><h3>오늘의 골프 시세</h3><ul class="side-list">${g.topUp.slice(0, 3).map(r => `<li><a href="/market/golf?q=${encodeURIComponent(r.name)}">${esc(r.name)}</a>${chg(r)}</li>`).join('')}${g.topDown.slice(0, 2).map(r => `<li><a href="/market/golf?q=${encodeURIComponent(r.name)}">${esc(r.name)}</a>${chg(r)}</li>`).join('')}</ul><a class="link" href="/market/golf">전체 시세표 →</a></div>`;
}

// ── 골프회원권 안내 ──
router.get('/guide/golf', (req, res) => {
  const g = prices.stats('golf');
  const faqs = [FAQ[0], FAQ[3], FAQ[4], FAQ[5]];
  const sections = `
<h2>골프회원권이란 무엇인가요?</h2>
<p>골프회원권은 회원제 골프장에 입회금을 예치하고 회원 자격을 얻어 <strong>우선 예약권과 회원 그린피 혜택</strong>을 받는 권리입니다. 회원권은 골프장의 승인을 거쳐 제3자에게 양도할 수 있어 시장에서 거래되며, 그 거래 가격이 "회원권 시세"입니다. 하나회원권거래소는 ${g.total}종목의 시세를 매주 갱신합니다.</p>
<h2>골프회원권에는 어떤 종류가 있나요?</h2>
<table><thead><tr><th>종류</th><th>특징</th><th>적합한 매수자</th></tr></thead><tbody>
<tr><td>정회원권(개인 기명)</td><td>본인 명의 등록, 주중·주말 회원 자격, 가족 회원 등록 가능한 곳도 있음</td><td>월 2회 이상 라운드하는 개인 골퍼</td></tr>
<tr><td>주중 회원권</td><td>주중만 회원 자격, 정회원 대비 저렴</td><td>평일 라운드 위주의 자영업자·은퇴자</td></tr>
<tr><td>법인 회원권</td><td>법인 명의, 지정 등록자 복수 등록(골프장별 인원 상이)</td><td>임직원 접대·복지 수요가 있는 기업</td></tr>
<tr><td>무기명 회원권</td><td>등록자 지정 없이 소지자 누구나 회원 이용</td><td>이용자가 자주 바뀌는 법인·모임</td></tr>
<tr><td>분담금(주주) 회원권</td><td>골프장 지분·분담금 형태, 반환 조건이 다름</td><td>장기 보유·자산 성격을 중시하는 매수자</td></tr>
</tbody></table>
<h2>골프회원권을 사면 무엇이 좋은가요?</h2>
<ul><li><strong>예약 우선권</strong>: 주말·성수기 부킹을 회원 우선 배정으로 확보합니다.</li><li><strong>비용 절감</strong>: 회원 그린피는 비회원 대비 크게 낮아 자주 이용할수록 유리합니다.</li><li><strong>자산 가치</strong>: 시세가 형성돼 있어 필요 시 양도로 회수할 수 있고, 골프장 정책에 따라 시세 상승 여지도 있습니다.</li><li><strong>동반자 혜택</strong>: 회원 동반 시 동반자 그린피 할인이 적용되는 골프장이 많습니다.</li></ul>
<h2>매수 전에 반드시 확인할 것은?</h2>
<ol><li><strong>입회금 반환 조건</strong>: 거치 기간과 반환 절차, 반환 지연 이력.</li><li><strong>명의개서료와 심사 기간</strong>: 골프장별로 수십만~수백만 원, 심사 1~2주.</li><li><strong>회원 수 대비 홀 수</strong>: 회원이 많을수록 부킹 경쟁이 심합니다.</li><li><strong>주말 부킹 방식</strong>: 추첨제·선착순·지정일 배정 등.</li><li><strong>연회비·관리비</strong>와 <strong>양도 제한 기간</strong> 유무.</li></ol>
<h2>매수·매도 절차는 어떻게 되나요?</h2>
<p><a href="/guide/process">거래 절차·수수료 안내</a>에서 단계별 절차와 서류를 확인하실 수 있습니다. 요약하면 상담 → 시세·매물 확인 → 계약·정산 → 골프장 명의개서 접수 → 심사·등록 완료 순이며, 전 과정을 하나회원권거래소가 대행합니다.</p>
<p class="cta">지금 시세를 보려면 <a href="/market/golf">골프회원권 시세표</a>, 골프장별 조건은 <a href="/golf">골프장 소개</a>를 참고하세요.</p>`;
  res.send(page({ title: '골프회원권 안내 — 종류·혜택·매수 전 확인사항·절차', description: `골프회원권의 정의와 정회원·주중·법인·무기명·분담금 회원권의 차이, 회원권 혜택, 매수 전 확인할 5가지, 거래 절차를 정리. ${g.total}종목 시세 매주 갱신.`, path: '/guide/golf', body: guideShell({ eyebrow: '회원권 안내', h1: '골프회원권 안내', bluf: '골프회원권은 회원제 골프장의 우선 예약권과 회원 그린피 혜택을 받는 양도 가능한 권리입니다. 종류별 차이와 매수 전 확인사항, 절차를 한 페이지에 정리했습니다.', sections, faqs, side: sideStats() }), breadcrumbs: [{ name: '회원권 안내', href: '/guide/golf' }, { name: '골프회원권 안내', href: '/guide/golf' }], jsonld: articleLd({ title: '골프회원권 안내', desc: '골프회원권 종류·혜택·확인사항·절차', url: '/guide/golf', faqs }) }));
});

// ── 콘도회원권 안내 ──
router.get('/guide/condo', (req, res) => {
  const faqs = [FAQ[6], { q: '콘도 회원권 관리비는 매년 내나요?', a: '대부분의 리조트는 연간 관리비(연회비)를 부과합니다. 금액과 부과 방식은 리조트·객실 타입별로 다르므로 매수 전 확인이 필요합니다.' }, { q: '콘도 회원권도 양도소득세가 있나요?', a: '개인이 양도차익을 얻으면 골프회원권과 같이 양도소득세 대상입니다. 공유제(등기) 회원권은 부동산 지분 성격이라 취득세 등 세무 처리가 달라질 수 있으니 세무사 확인을 권장합니다.' }];
  const sections = `
<h2>콘도회원권이란 무엇인가요?</h2><p>콘도(리조트) 회원권은 리조트 객실을 <strong>연간 정해진 일수만큼 회원가로 이용</strong>할 수 있는 권리입니다. 가족 단위 휴가, 임직원 복지, 워크숍 숙소 확보 목적으로 활용되며, 골프장·스키장·워터파크를 함께 운영하는 리조트는 부대시설 할인도 받습니다.</p>
<h2>공유제와 회원제는 무엇이 다른가요?</h2><table><thead><tr><th>구분</th><th>공유제(등기)</th><th>회원제(입회금)</th></tr></thead><tbody><tr><td>권리 형태</td><td>객실 지분 소유(등기)</td><td>입회금 예치 후 이용권</td></tr><tr><td>만기</td><td>없음(영구)</td><td>계약 기간 후 입회금 반환·연장</td></tr><tr><td>세금</td><td>취득세·재산세 등 부동산 성격</td><td>양도 시 양도소득세</td></tr><tr><td>가격</td><td>상대적으로 높음</td><td>상대적으로 낮음</td></tr></tbody></table>
<h2>가격을 결정하는 요소는 무엇인가요?</h2><ul><li><strong>성수기 이용 일수</strong>와 예약 우선순위</li><li><strong>객실 타입</strong>(평형·룸 수)과 이용 가능한 체인 지점 수</li><li><strong>관리비</strong> 수준과 부대시설 혜택</li><li><strong>브랜드</strong>(소노·한화·용평·하이원 등)와 신규 분양 여부</li></ul>
<h2>매수 전 확인할 것은?</h2><ol><li>연간 이용 일수 중 성수기 배정 일수</li><li>관리비 금액과 인상 이력</li><li>양도 시 명의개서료와 리조트 승인 절차</li><li>입회금 반환 조건(회원제)</li></ol>
<p class="cta"><a href="/market/condo">콘도회원권 시세표</a>에서 종목별 시세를 확인하고, <a href="/exclusive/daemyung">대명리조트 전용관</a>에서 소노 계열 매물을 보실 수 있습니다.</p>`;
  res.send(page({ title: '콘도회원권 안내 — 공유제·회원제 차이, 가격 결정 요소, 매수 전 확인사항', description: '콘도(리조트) 회원권의 정의, 공유제와 회원제 비교표, 성수기 이용일수·관리비·객실 타입이 가격에 미치는 영향, 매수 전 체크리스트.', path: '/guide/condo', body: guideShell({ eyebrow: '회원권 안내', h1: '콘도회원권 안내', bluf: '콘도회원권은 리조트 객실을 연간 정해진 일수만큼 회원가로 이용하는 권리입니다. 공유제(등기)와 회원제(입회금)의 차이가 가격과 세금을 가릅니다.', sections, faqs }), breadcrumbs: [{ name: '회원권 안내', href: '/guide/golf' }, { name: '콘도회원권 안내', href: '/guide/condo' }], jsonld: articleLd({ title: '콘도회원권 안내', desc: '공유제·회원제 차이와 가격 요소', url: '/guide/condo', faqs }) }));
});

// ── 피트니스회원권 안내 ──
router.get('/guide/fitness', (req, res) => {
  const faqs = [{ q: '호텔 피트니스 회원권은 어떻게 양도하나요?', a: '호텔의 양도 승인 절차를 거쳐 명의를 변경합니다. 양도 수수료(명의변경료)와 연회비 정산이 필요하며, 하나회원권거래소가 서류와 절차를 대행합니다.' }, { q: '개인 회원권과 부부 회원권은 무엇이 다른가요?', a: '부부 회원권은 배우자까지 회원 자격이 부여되는 상품으로 개인 회원권보다 가격이 높습니다. 자녀 동반 규정은 호텔별로 다릅니다.' }, { q: '연회비는 얼마나 되나요?', a: '호텔·등급별로 상이하며 매년 부과됩니다. 매수 전 연회비와 부대시설(수영장·사우나·골프연습장) 이용 범위를 확인하세요.' }];
  const sections = `<h2>피트니스회원권이란 무엇인가요?</h2><p>호텔·프리미엄 스포츠클럽의 <strong>정회원 자격</strong>으로, 입회금을 예치하고 연회비를 내며 헬스·수영·사우나 등 시설을 이용하는 권리입니다. 그랜드 인터컨티넨탈·노보텔·롯데 등 호텔 피트니스는 회원권이 양도 가능해 시세가 형성돼 있습니다.</p><h2>가격은 무엇에 따라 달라지나요?</h2><ul><li>호텔 등급과 시설 수준(수영장·사우나·골프연습장·라운지)</li><li>개인 / 부부 / 가족 회원권 구분</li><li>연회비 수준과 입회금 반환 조건</li><li>회원 수 제한 여부(신규 모집 중단 시 시세 강세)</li></ul><h2>매수 절차는?</h2><p>상담 → 매물 확인 → 계약·정산 → 호텔 양도 승인·명의변경 → 이용 시작. 호텔별 승인 기간은 보통 1~2주입니다.</p><p class="cta"><a href="/market/fitness">피트니스회원권 시세표</a>에서 종목별 시세를 확인하세요.</p>`;
  res.send(page({ title: '피트니스회원권 안내 — 호텔 헬스 개인·부부 회원권 구조와 양도 절차', description: '그랜드 인터컨티넨탈·노보텔·롯데 등 호텔 피트니스 회원권의 구조, 가격 결정 요소, 개인·부부 회원권 차이, 양도 절차와 연회비.', path: '/guide/fitness', body: guideShell({ eyebrow: '회원권 안내', h1: '피트니스회원권 안내', bluf: '피트니스회원권은 호텔·프리미엄 스포츠클럽의 양도 가능한 정회원 자격입니다. 호텔 등급, 개인·부부 구분, 연회비가 가격을 결정합니다.', sections, faqs }), breadcrumbs: [{ name: '회원권 안내', href: '/guide/golf' }, { name: '피트니스회원권 안내', href: '/guide/fitness' }], jsonld: articleLd({ title: '피트니스회원권 안내', desc: '호텔 피트니스 회원권 구조·양도', url: '/guide/fitness', faqs }) }));
});

// ── 거래 절차·수수료 ──
router.get('/guide/process', (req, res) => {
  const faqs = [FAQ[1], FAQ[2], FAQ[7], { q: '계약금과 잔금은 어떻게 처리되나요?', a: '계약 시 계약금을, 명의개서 서류 접수 시 잔금을 정산하는 것이 일반적입니다. 대금은 거래소를 통해 안전하게 정산되며 정산 내역서를 드립니다.' }];
  const sections = `
<h2>회원권 매매는 어떤 순서로 진행되나요?</h2>
<ol class="steps"><li><strong>상담·시세 확인</strong> — 희망 종목·예산·이용 패턴을 듣고 현재 시세와 매물 상황을 안내합니다.</li><li><strong>매물 매칭</strong> — 매수자는 조건에 맞는 매물을, 매도자는 매수 호가를 제시받습니다.</li><li><strong>계약·정산</strong> — 계약서 작성, 계약금·잔금 정산. 대금은 거래소 안전 정산.</li><li><strong>명의개서 접수</strong> — 골프장(리조트)에 양도·양수 서류 접수, 명의개서료 납부.</li><li><strong>심사·등록 완료</strong> — 골프장 심사(보통 1~2주) 후 회원 등록. 등록 후 부킹·이용 문의 지속 지원.</li></ol>
<h2>준비 서류는 무엇인가요?</h2><table><thead><tr><th>구분</th><th>개인</th><th>법인</th></tr></thead><tbody><tr><td>매도자</td><td>회원증, 신분증, 인감증명서, 양도서류(골프장 양식)</td><td>법인인감증명서, 사업자등록증, 법인등기부등본, 양도서류</td></tr><tr><td>매수자</td><td>신분증, 입회신청서, 사진, 명의개서료</td><td>사업자등록증, 법인등기부등본, 법인인감, 지정등록자 신분증·사진</td></tr></tbody></table><p class="note">골프장별로 추가 서류(주민등록등본·가족관계증명서 등)를 요구할 수 있으며, 접수 전 최신 목록을 안내해 드립니다.</p>
<h2>비용은 어떻게 구성되나요?</h2><ul><li><strong>회원권 대금</strong>: 시세표의 금액(만원 단위).</li><li><strong>거래소 수수료</strong>: 매도·매수 각각, 거래 금액 구간별 정해진 요율. 상담 시 사전 고지.</li><li><strong>명의개서료</strong>: 골프장에 납부. 골프장별 상이(수십만~수백만 원).</li><li><strong>세금</strong>: 법인 취득 시 취득세, 개인·법인 양도차익 발생 시 양도소득세·법인세. 세무사 확인 권장.</li></ul>
<h2>거래 안전은 어떻게 보장되나요?</h2><p>하나회원권거래소는 2004년부터 회원권 매매를 중개해 온 등록 사업자(사업자등록번호 ${esc(settings.cfg('biz_no'))}, 통신판매업 ${esc(settings.cfg('telecom_no'))})로, 계약서·정산 내역서를 발급하고 명의개서 완료까지 담당자가 책임집니다. 회원권 실소유 여부와 압류·가압류 유무를 사전 확인한 뒤 계약을 진행합니다.</p>`;
  res.send(page({ title: '회원권 거래 절차·수수료·준비 서류 — 상담부터 명의개서 완료까지', description: '골프·콘도·피트니스 회원권 매매 5단계 절차, 개인·법인별 준비 서류, 수수료·명의개서료·세금 구성, 거래 안전 장치를 정리했습니다.', path: '/guide/process', body: guideShell({ eyebrow: '회원권 안내', h1: '거래 절차·수수료 안내', bluf: '회원권 매매는 상담 → 매물 매칭 → 계약·정산 → 명의개서 접수 → 심사·등록 완료 5단계로 진행되며, 비용은 회원권 대금 + 거래소 수수료 + 골프장 명의개서료(+세금)로 구성됩니다.', sections, faqs, side: sideStats() }), breadcrumbs: [{ name: '회원권 안내', href: '/guide/golf' }, { name: '거래 절차·수수료', href: '/guide/process' }], jsonld: [...articleLd({ title: '회원권 거래 절차·수수료', desc: '5단계 절차와 비용 구성', url: '/guide/process', faqs }), { '@context': 'https://schema.org', '@type': 'HowTo', name: '회원권 매매 절차', step: ['상담·시세 확인', '매물 매칭', '계약·정산', '명의개서 접수', '심사·등록 완료'].map((n, i) => ({ '@type': 'HowToStep', position: i + 1, name: n })) }] }));
});

// ── FAQ ──
router.get('/faq', (req, res) => {
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">FAQ</p><h1>회원권 거래 자주 묻는 질문</h1><p class="bluf">시세 결정 요인, 수수료, 명의개서 절차, 법인·무기명 회원권, 세금 등 실제 상담에서 가장 많이 받는 질문에 직답으로 정리했습니다.</p></div></section><section class="section"><div class="wrap narrow">${faqHtml(FAQ, '')}<p class="cta">원하는 답이 없다면 ${esc(settings.cfg('phone'))} 또는 <a href="/apply">매매 신청</a>으로 문의해 주세요.</p></div></section>`;
  res.send(page({ title: '회원권 거래 FAQ — 시세·수수료·명의개서·법인·세금 질문 답변', description: '골프회원권 시세 결정 요인, 매매 수수료, 명의개서 절차, 법인 회원권 취득세, 무기명 회원권 장단점, 양도소득세, 콘도 회원권 차이 등 자주 묻는 질문 답변.', path: '/faq', body, breadcrumbs: [{ name: '자주 묻는 질문', href: '/faq' }], jsonld: [faqLd(FAQ)] }));
});

// ── 전용관 ──
const EXCL = {
  anonymous: { h1: '무기명 회원권 전용관', desc: '등록자 지정 없이 소지자 누구나 회원 자격으로 이용하는 무기명 골프회원권 매물과 이용 조건', bluf: '무기명 회원권은 특정인 등록 없이 회원권(또는 지정 카드) 소지자가 회원 자격으로 이용하는 상품으로, 이용자가 자주 바뀌는 법인 접대·모임에 적합합니다. 같은 골프장의 기명 회원권보다 가격이 높고 주말 이용 조건이 골프장마다 다르므로 매수 전 확인이 필수입니다.', cat: 'golf', kind: '무기명', faqs: [FAQ[4], { q: '무기명 회원권은 주말에도 쓸 수 있나요?', a: '골프장별로 주말 이용 횟수·동반 조건을 제한하는 경우가 있습니다. 매물별 이용 조건을 상담 시 확인해 드립니다.' }] },
  daemyung: { h1: '대명리조트(소노) 전용관', desc: '소노호텔앤리조트(구 대명리조트) 회원권 전용 매물과 이용 안내', bluf: '소노호텔앤리조트(구 대명리조트) 회원권은 전국 체인 이용과 성수기 배정 조건이 상품별로 다릅니다. 전용관에서는 상품별 이용 일수·객실 타입·관리비 조건을 비교해 매물을 안내합니다.', cat: 'condo', kind: '대명', faqs: [{ q: '대명(소노) 회원권은 어떤 지점을 쓸 수 있나요?', a: '상품에 따라 전국 소노 체인 이용 범위가 다릅니다. 매물별 이용 가능 지점과 성수기 배정 조건을 안내해 드립니다.' }, FAQ[6]] },
  prepaid: { h1: '선불카드 전용관', desc: '골프장 선불카드·이용권 매물', bluf: '선불카드는 특정 골프장·리조트의 이용 요금을 미리 충전해 회원가 수준으로 이용하는 상품으로, 회원권보다 낮은 비용으로 이용 혜택을 얻고자 하는 분께 적합합니다. 잔액·유효기간·양도 조건을 확인 후 거래합니다.', cat: 'sale', kind: '선불카드', faqs: [{ q: '선불카드도 양도가 되나요?', a: '상품별로 양도 가능 여부와 수수료가 다릅니다. 잔액과 유효기간을 확인한 뒤 골프장 승인 절차를 거쳐 양도합니다.' }] },
};
router.get('/exclusive/:key', (req, res, next) => {
  const e = EXCL[req.params.key]; if (!e) return next();
  const items = db.prepare("SELECT * FROM listings WHERE status='open' AND (kind=? OR title LIKE ?) ORDER BY featured DESC, id DESC").all(e.kind, `%${e.kind}%`);
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">전용관</p><h1>${e.h1}</h1><p class="bluf">${e.bluf}</p><div class="tabs">${Object.entries(EXCL).map(([k, v]) => `<a class="tab${k === req.params.key ? ' active' : ''}" href="/exclusive/${k}">${v.h1}</a>`).join('')}</div></div></section>
<section class="section"><div class="wrap"><h2>${e.h1} 매물 ${items.length}건</h2>${items.length ? `<div class="lst-grid">${items.map(l => `<div class="lst reveal" id="l${l.id}"><span class="tag">${esc(l.kind || '')}</span><h3>${esc(l.title)}</h3><p>${esc(l.region || '')}${l.price ? ' · ' + fmtMan(l.price) : ''}</p>${l.body ? `<p class="lst-body">${esc(truncate(l.body, 140))}</p>` : ''}<a class="btn btn-primary" href="/apply?item=${encodeURIComponent(l.name || l.title)}">문의</a></div>`).join('')}</div>` : `<p class="note">현재 등록된 매물이 없습니다. 원하시는 조건을 <a href="/apply">매매 신청</a>으로 남겨 주시면 매물이 나오는 즉시 연락드립니다.</p>`}
<div class="narrow" style="margin-top:32px">${faqHtml(e.faqs)}</div></div></section>`;
  res.send(page({ title: `${e.h1} — 매물 ${items.length}건과 이용 조건`, description: `${e.desc}. 하나회원권거래소 전용관, 매물 ${items.length}건.`, path: `/exclusive/${req.params.key}`, body, breadcrumbs: [{ name: '매물·전용관', href: '/listings' }, { name: e.h1, href: `/exclusive/${req.params.key}` }], jsonld: [faqLd(e.faqs)] }));
});

// ── 매물 ──
const LCAT = { golf: '골프회원권', condo: '콘도회원권', fitness: '피트니스회원권', sale: '회원권 분양', tour: '해외투어' };
router.get('/listings', (req, res) => {
  const cat = LCAT[req.query.category] ? req.query.category : '';
  const rows = db.prepare(`SELECT * FROM listings WHERE status='open'${cat ? ' AND category=?' : ''} ORDER BY featured DESC, id DESC`).all(...(cat ? [cat] : []));
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">회원권 매물</p><h1>회원권 매물 <small>${rows.length}건</small></h1><p class="bluf">매도·매수 의뢰가 들어온 골프·콘도·피트니스 회원권 매물과 신규 분양, 해외 골프투어 상품입니다. 매물은 실시간으로 바뀌므로 관심 종목은 상담으로 확인하세요.</p><div class="tabs"><a class="tab${!cat ? ' active' : ''}" href="/listings">전체</a>${Object.entries(LCAT).map(([k, v]) => `<a class="tab${cat === k ? ' active' : ''}" href="/listings?category=${k}">${v}</a>`).join('')}</div></div></section>
<section class="section"><div class="wrap">${rows.length ? `<div class="lst-grid">${rows.map(l => `<div class="lst reveal" id="l${l.id}"><span class="tag">${esc(l.kind || LCAT[l.category] || '')}</span><h3>${esc(l.title)}</h3><p>${esc(LCAT[l.category] || '')} ${l.region ? '· ' + esc(l.region) : ''}${l.price ? ' · ' + fmtMan(l.price) : ''}</p>${l.body ? `<p class="lst-body">${esc(truncate(l.body, 160))}</p>` : ''}<a class="btn btn-primary" href="/apply?item=${encodeURIComponent(l.name || l.title)}">이 매물 문의</a></div>`).join('')}</div>` : '<p class="note">등록된 매물이 없습니다. 원하시는 조건을 <a href="/apply">매매 신청</a>으로 남겨 주세요.</p>'}
<div class="narrow" style="margin-top:32px"><h2>매물에 없는 종목은 어떻게 하나요?</h2><p>표시된 매물은 일부이며, 대부분의 거래는 상담을 통해 매수·매도 호가를 맞춰 성사됩니다. 희망 종목·예산을 남기시면 담당자가 시장의 매물을 찾아 연락드립니다.</p></div></div></section>`;
  res.send(page({ title: `회원권 매물 ${cat ? LCAT[cat] + ' ' : ''}${rows.length}건 — 골프·콘도·피트니스·분양·해외투어`, description: `하나회원권거래소 회원권 매물 ${rows.length}건. 골프·콘도·피트니스 회원권 매도·매수 의뢰, 신규 분양, 해외 골프투어 상품.`, path: '/listings', body, breadcrumbs: [{ name: '매물·전용관', href: '/listings' }] }));
});

// ── 매매 신청 ──
router.get('/apply', (req, res) => {
  const s = settings.all(); const item = String(req.query.item || '').slice(0, 60);
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">매매 신청</p><h1>회원권 매매 신청</h1><p class="bluf">매수·매도 희망 종목과 예산을 남겨 주시면 담당 상담사가 당일 연락드려 시세·매물·절차를 안내합니다. 접수 후 연락까지 평균 1시간 이내(영업시간 기준), 급한 경우 ${esc(s.phone)}으로 24시간 전화 상담이 가능합니다.</p></div></section>
<section class="section"><div class="wrap club-grid2">
  <form class="inq-form big reveal" method="post" action="/api/inquiry" data-ajax>
    <fieldset><legend>신청 구분</legend><div class="radio-row"><label><input type="radio" name="kind" value="buy" checked> 매수(사고 싶어요)</label><label><input type="radio" name="kind" value="sell"> 매도(팔고 싶어요)</label><label><input type="radio" name="kind" value="consult"> 상담만</label></div></fieldset>
    <div class="row"><label>성함 <input name="name" required maxlength="40"></label><label>연락처 <input name="phone" required maxlength="20" inputmode="tel" placeholder="010-0000-0000"></label></div>
    <div class="row"><label>이메일(선택) <input name="email" type="email" maxlength="80"></label><label>구분 <select name="category"><option value="golf">골프회원권</option><option value="corporate">법인회원권</option><option value="condo">콘도회원권</option><option value="fitness">피트니스회원권</option><option value="sale">분양</option><option value="tour">해외투어</option></select></label></div>
    <div class="row"><label>희망 종목 <input name="item" maxlength="60" value="${attr(item)}" placeholder="예: 아시아나, 남촌, 소노"></label><label>예산 / 희망가 <input name="budget" maxlength="40" placeholder="예: 1억 이내, 9,500만원"></label></div>
    <label>문의 내용 <textarea name="message" rows="5" maxlength="1500" placeholder="이용 패턴(주중/주말), 개인/법인, 연락 가능 시간 등"></textarea></label>
    <label class="agree"><input type="checkbox" name="agree" value="1" required> <a href="/privacy" target="_blank">개인정보 수집·이용</a>에 동의합니다. (수집 항목: 성함·연락처·이메일·문의 내용 / 목적: 회원권 매매 상담 / 보유: 상담 종료 후 1년)</label>
    <button class="btn btn-green block" type="submit">매매 신청하기</button><p class="form-msg" aria-live="polite"></p>
  </form>
  <aside class="club-side"><div class="side-card"><h3>접수 후 절차</h3><ol class="side-steps"><li>담당 상담사 배정 · 당일 연락</li><li>시세·매물·조건 안내</li><li>계약·정산 → 명의개서 대행</li><li>등록 완료 · 이용 지원</li></ol></div><div class="side-card"><h3>바로 통화</h3><p>24시간 전화 상담</p><a class="btn btn-primary block" href="tel:${attr(s.phone)}">${esc(s.phone)}</a><p class="note">팩스 ${esc(s.fax)} · ${esc(s.email)}</p></div></aside>
</div></section>`;
  res.send(page({ title: '회원권 매매 신청 — 매수·매도 상담 접수 (당일 연락)', description: `골프·콘도·피트니스·법인 회원권 매수·매도 신청. 희망 종목과 예산을 남기면 담당 상담사가 당일 연락. 24시간 전화 상담 ${s.phone}.`, path: '/apply', body, breadcrumbs: [{ name: '매매 신청', href: '/apply' }] }));
});

// ── 회사소개 ──
router.get('/about', (req, res) => {
  const s = settings.all(); const g = prices.stats('golf'); const years = new Date().getFullYear() - 2004;
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">회사소개</p><h1>${esc(s.legal_name)} 소개</h1><p class="bluf">${esc(s.legal_name)}는 2004년 설립된 골프·콘도·피트니스 회원권 매매 중개 및 컨설팅 전문기업입니다. 국내 최상위권 회원권 거래량과 20여 건의 분양 대행 실적을 바탕으로 회원권 상담·매매·분양·예약 알선·해외 골프투어 서비스를 제공합니다. 하나카드 '하나멤버스', 하나금융그룹과는 관련이 없는 독립 기업입니다.</p></div></section>
<section class="section"><div class="wrap club-grid2"><div class="club-main"><article class="prose">
<h2>하나회원권거래소는 어떤 회사인가요?</h2><p>서울 강남구 압구정에 본사를 둔 회원권 전문 거래소로, 2004년 에이원회원권거래소로 시작해 2008년 비전회원권거래소를 합병하고 2014년 하나회원권거래소로 이름을 바꿔 오늘에 이르렀습니다. 대표이사 ${esc(s.ceo)}(연세대학교 경제대학원, 전 비전회원권거래소·에이원회원권거래소 대표이사)를 중심으로 ${years}년간 회원권 시장을 지켜 왔습니다.</p>
<h2>무엇을 하나요?</h2><table><thead><tr><th>서비스</th><th>내용</th></tr></thead><tbody><tr><td>회원권 상담</td><td>골프·콘도·피트니스 회원권의 시황 분석과 정확한 시세 제시</td></tr><tr><td>회원권 매매</td><td>상담에서 애프터 서비스까지 책임지는 안전한 매매 중개</td></tr><tr><td>회원권 분양</td><td>신규 분양 회원권 정보를 체계적으로 파악해 제공</td></tr><tr><td>예약 알선</td><td>어려운 골프장·리조트 예약을 대행·알선</td></tr><tr><td>해외 골프투어</td><td>전담팀이 준비하는 편안한 해외 골프 여행</td></tr></tbody></table>
<h2>왜 하나회원권거래소를 선택하나요?</h2><ul><li><strong>정확한 시세</strong>: 골프 ${g.total}종목 시세를 매주 실거래·호가로 갱신하고 홈페이지에 공개합니다.</li><li><strong>분양 실적</strong>: 블루버드·서원밸리·엘리시안 강촌·리베라·레이크힐스·프리스틴밸리·크리스탈밸리·썬밸리·서울드래곤시티 등 골프장·리조트·피트니스 분양 대행.</li><li><strong>파트너십</strong>: 한국골프회원권경영인협회, 네오위즈, 미래신용정보, 동양생명, 삼양, 포스코ICT, 한글과컴퓨터, 서울드래곤시티 등과 협력.</li><li><strong>책임 담당제</strong>: 상담·계약·명의개서·등록 후 이용 문의까지 담당자 1인이 끝까지 지원.</li></ul>
<h2>회사 정보</h2><table class="spec"><tbody><tr><th>상호</th><td>${esc(s.legal_name)} (${esc(s.en_name)})</td></tr><tr><th>대표이사</th><td>${esc(s.ceo)}</td></tr><tr><th>설립</th><td>2004년</td></tr><tr><th>사업자등록번호</th><td>${esc(s.biz_no)}</td></tr><tr><th>통신판매업신고</th><td>${esc(s.telecom_no)}</td></tr><tr><th>주소</th><td>${esc(s.address)}</td></tr><tr><th>전화 / 팩스</th><td>${esc(s.phone)} / ${esc(s.fax)}</td></tr><tr><th>이메일</th><td>${esc(s.email)}</td></tr><tr><th>업종</th><td>골프·콘도·피트니스 회원권 매매 중개, 해외 골프투어</td></tr><tr><th>공식 채널</th><td><a href="${attr(s.youtube)}" target="_blank" rel="noopener">YouTube @hanamarket</a></td></tr></tbody></table>
</article></div><aside class="club-side"><div class="side-card"><h3>바로가기</h3><ul class="side-list"><li><a href="/about/history">연혁·실적</a></li><li><a href="/about/location">찾아오시는 길</a></li><li><a href="/about/careers">채용 안내</a></li><li><a href="/market/golf">골프회원권 시세</a></li></ul></div></aside></div></section>`;
  res.send(page({ title: `회사소개 — ${s.legal_name} (2004년 설립, 골프·콘도·피트니스 회원권 전문)`, description: `${s.legal_name}는 2004년 설립된 회원권 매매 중개·컨설팅 전문기업. 대표이사 ${s.ceo}, 서울 강남 압구정 본사, 국내 최상위권 거래량과 20여 건 분양 대행 실적. 하나금융과 무관한 독립 기업.`, path: '/about', body, breadcrumbs: [{ name: '회사소개', href: '/about' }], jsonld: [{ '@context': 'https://schema.org', '@type': 'AboutPage', name: '회사소개', url: site() + '/about', mainEntity: { '@id': site() + '/#org' } }] }));
});
router.get('/about/history', (req, res) => {
  const hist = [['2004', '에이원회원권거래소 설립'], ['2006', '블루버드 컨트리클럽 분양 · 서원밸리 컨트리클럽 특별 분양 · 엘리시안 강촌리조트 분양'], ['2008', '비전회원권거래소 합병 · 칸리조트 분양 · 가산노블리제 컨트리클럽 분양 · 파인리즈 컨트리클럽 분양'], ['2010', '리베라 컨트리클럽 무기명 회원권 분양 · 레이크힐스 컨트리클럽 무기명 회원권 분양 · 반얀트리 휘트니스 분양'], ['2011', '블루버드 컨트리클럽 무기명 회원권 분양'], ['2014', '하나회원권거래소로 사명 변경 · 프리스틴밸리 골프클럽 분양 · 엘리시안 강촌리조트 분양 · 크리스탈밸리 컨트리클럽 분양 · 썬밸리 컨트리클럽 분양 · 비에이비스타 컨트리클럽 분양'], ['2015', '세라지오 컨트리클럽 분양'], ['2016', '레이크힐스 리조트 분양 · 더 스타휴 분양'], ['2019', '서울드래곤시티 휘트니스 분양 · 서울드래곤시티 시티클럽 분양 · 서울드래곤시티 호텔 멤버십 분양'], ['2022', '레저 분야 마케팅 선두주자로 다양한 실무경험 수행']];
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">회사소개</p><h1>연혁·주요 실적</h1><p class="bluf">2004년 에이원회원권거래소로 출발해 2008년 비전회원권거래소 합병, 2014년 하나회원권거래소 출범까지, 골프장·리조트·피트니스 회원권 분양 대행 20여 건을 수행했습니다.</p></div></section>
<section class="section"><div class="wrap narrow"><h2>연도별 주요 실적은 무엇인가요?</h2><div class="timeline vertical">${hist.map(([y, t]) => `<div class="tl-item reveal"><b>${y}</b><span>${esc(t)}</span></div>`).join('')}</div><h2>파트너십</h2><ul class="checks">${['한국골프회원권경영인협회', '네오위즈 게임즈', '미래신용정보', '수호천사 동양생명', '삼양', '포스코 ICT', '한글과컴퓨터', '서울드래곤시티'].map(p => `<li>${p}</li>`).join('')}</ul></div></section>`;
  res.send(page({ title: '연혁·주요 실적 — 2004년 설립부터 20여 건 회원권 분양 대행까지', description: '하나회원권거래소 연혁: 2004 에이원회원권거래소 설립, 2008 비전회원권거래소 합병, 2014 사명 변경. 블루버드·서원밸리·리베라·레이크힐스·프리스틴밸리·서울드래곤시티 등 분양 실적과 파트너십.', path: '/about/history', body, breadcrumbs: [{ name: '회사소개', href: '/about' }, { name: '연혁·실적', href: '/about/history' }] }));
});
router.get('/about/location', (req, res) => {
  const s = settings.all();
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">회사소개</p><h1>찾아오시는 길</h1><p class="bluf">${esc(s.address)}. 전화 ${esc(s.phone)}, 평일 09:00~18:00 방문 상담(예약 권장), 전화 상담은 24시간 가능합니다.</p></div></section>
<section class="section"><div class="wrap club-grid2"><div class="club-main"><div class="map-box"><iframe title="하나회원권거래소 위치 지도" src="https://www.google.com/maps?q=${encodeURIComponent('서울특별시 강남구 압구정로 152')}&output=embed&hl=ko" width="100%" height="380" loading="lazy" referrerpolicy="no-referrer-when-downgrade" style="border:0;border-radius:14px"></iframe></div><article class="prose"><h2>어떻게 오나요?</h2><ul><li><strong>주소</strong>: 압구정로 152 극동타워 A동 4층 401호(강남구청·압구정 방면 압구정로 대로변).</li><li><strong>대중교통·주차</strong>: 방문 전 전화 주시면 가까운 역 출구와 주차 방법을 안내해 드립니다.</li></ul><h2>방문 전 준비</h2><p>매도 상담은 회원증 사본, 매수 상담은 희망 종목·예산을 준비해 오시면 당일 계약까지 진행할 수 있습니다.</p></article></div><aside class="club-side"><div class="side-card"><h3>연락처</h3><p>${esc(s.legal_name)}<br>${esc(s.address)}<br>전화 <a href="tel:${attr(s.phone)}">${esc(s.phone)}</a><br>팩스 ${esc(s.fax)}<br>이메일 <a href="mailto:${attr(s.email)}">${esc(s.email)}</a></p><a class="btn btn-primary block" href="https://map.naver.com/p/search/${encodeURIComponent('서울 강남구 압구정로 152')}" target="_blank" rel="noopener">네이버 지도에서 보기</a></div></aside></div></section>`;
  res.send(page({ title: '찾아오시는 길 — 서울 강남구 압구정로 152 극동타워 A동 401호', description: `하나회원권거래소 오시는 길. ${s.address}, 전화 ${s.phone}, 팩스 ${s.fax}, 평일 09~18시 방문 상담.`, path: '/about/location', body, breadcrumbs: [{ name: '회사소개', href: '/about' }, { name: '찾아오시는 길', href: '/about/location' }] }));
});
router.get('/about/careers', (req, res) => {
  const s = settings.all();
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">회사소개</p><h1>채용 안내</h1><p class="bluf">하나회원권거래소는 회원권 상담·매매 중개 인력을 수시 채용합니다. 골프·레저 산업에 관심 있고 고객 응대에 강점이 있는 분을 기다립니다.</p></div></section><section class="section"><div class="wrap narrow prose"><h2>어떤 일을 하나요?</h2><ul><li>회원권 매수·매도 고객 상담 및 시세 안내</li><li>계약·정산·명의개서 진행 지원</li><li>골프장·리조트 파트너 커뮤니케이션</li></ul><h2>지원 방법</h2><p>이력서를 <a href="mailto:${attr(s.email)}">${esc(s.email)}</a>로 보내 주시거나 ${esc(s.phone)}으로 문의해 주세요. 서류 검토 후 면접 일정을 안내드립니다.</p></div></section>`;
  res.send(page({ title: '채용 안내 — 회원권 상담·중개 인력 수시 채용', description: `하나회원권거래소 채용 안내. 회원권 상담·매매 중개 담당 수시 채용, 이력서 ${s.email} 접수.`, path: '/about/careers', body, breadcrumbs: [{ name: '회사소개', href: '/about' }, { name: '채용 안내', href: '/about/careers' }], noindex: false }));
});

// ── 유튜브 ──
router.get('/videos', (req, res) => {
  const s = settings.all(); const videos = db.prepare('SELECT * FROM videos ORDER BY sort, id DESC').all();
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">커뮤니티</p><h1>하나회원권거래소 유튜브</h1><p class="bluf">공식 채널 <a href="${attr(s.youtube)}" target="_blank" rel="noopener">@hanamarket</a>의 회원권 시세 해설·골프장 소개 영상입니다. 홈페이지의 시세표·골프장 소개와 함께 보시면 판단에 도움이 됩니다.</p></div></section><section class="section"><div class="wrap">${videos.length ? `<div class="video-grid">${videos.map(v => `<div class="video reveal"><div class="yt" data-id="${attr(v.youtube_id)}"><img src="https://i.ytimg.com/vi/${attr(v.youtube_id)}/hqdefault.jpg" alt="${attr(v.title)}" loading="lazy" width="480" height="360"><button class="yt-play" aria-label="${attr(v.title)} 재생">▶</button></div><h2>${esc(v.title)}</h2>${v.description ? `<p>${esc(truncate(v.description, 120))}</p>` : ''}</div>`).join('')}</div>` : `<p class="note">영상 목록을 준비 중입니다. <a href="${attr(s.youtube)}" target="_blank" rel="noopener">유튜브 채널</a>에서 바로 보실 수 있습니다.</p>`}</div></section>`;
  const ld = videos.map(v => ({ '@context': 'https://schema.org', '@type': 'VideoObject', name: v.title, description: v.description || v.title, thumbnailUrl: `https://i.ytimg.com/vi/${v.youtube_id}/hqdefault.jpg`, uploadDate: v.published || kstDate(), embedUrl: `https://www.youtube.com/embed/${v.youtube_id}`, contentUrl: `https://www.youtube.com/watch?v=${v.youtube_id}`, publisher: { '@id': site() + '/#org' } }));
  res.send(page({ title: `유튜브 영상 — 회원권 시세 해설·골프장 소개 (${videos.length}편)`, description: `하나회원권거래소 공식 유튜브 @hanamarket 영상 ${videos.length}편. 회원권 시세 해설, 골프장 소개, 거래 가이드.`, path: '/videos', body, breadcrumbs: [{ name: '커뮤니티', href: '/notice' }, { name: '유튜브', href: '/videos' }], jsonld: ld }));
});

// ── 개인정보처리방침 ──
router.get('/privacy', (req, res) => {
  const s = settings.all();
  const body = `<section class="page-head"><div class="wrap"><h1>개인정보처리방침</h1><p class="bluf">${esc(s.legal_name)}(이하 "회사")는 개인정보 보호법에 따라 이용자의 개인정보를 보호하고 관련 고충을 신속하게 처리하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다. 시행일 2026년 9월 14일.</p></div></section><section class="section"><div class="wrap narrow prose">
<h2>1. 수집하는 개인정보 항목과 방법</h2><p>회사는 매매 신청·상담 신청 시 성함, 연락처(휴대전화), 이메일(선택), 희망 종목·예산, 문의 내용을 수집합니다. 서비스 이용 과정에서 접속 IP, 브라우저 정보, 유입 경로가 자동 수집될 수 있습니다.</p>
<h2>2. 개인정보의 수집·이용 목적</h2><ul><li>회원권 매매·분양·투어 상담 및 계약 진행</li><li>상담 결과 안내 및 문의 응대</li><li>서비스 개선을 위한 통계(개인 식별 불가 형태)</li></ul>
<h2>3. 보유 및 이용 기간</h2><p>상담 종료 후 1년간 보관 후 지체 없이 파기합니다. 단, 계약이 체결된 경우 전자상거래 등에서의 소비자보호에 관한 법률 등 관계 법령에 따라 계약·대금 결제 기록 5년, 소비자 불만·분쟁 처리 기록 3년을 보관합니다.</p>
<h2>4. 제3자 제공 및 처리 위탁</h2><p>회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 회원권 명의개서를 위해 해당 골프장·리조트에 계약 이행에 필요한 최소 정보를 이용자 동의 하에 전달합니다. 홈페이지 운영을 위한 서버 호스팅(Railway Corporation, 미국)에 데이터 보관을 위탁하며, 이 경우 개인정보 국외 이전에 해당할 수 있습니다.</p>
<h2>5. 정보주체의 권리</h2><p>이용자는 언제든지 개인정보 열람·정정·삭제·처리정지를 요구할 수 있으며, ${esc(s.email)} 또는 ${esc(s.phone)}으로 요청하시면 지체 없이 조치합니다.</p>
<h2>6. 파기 절차 및 방법</h2><p>보유 기간이 경과하거나 목적이 달성된 개인정보는 전자 파일은 복구 불가능한 방법으로 삭제하고, 종이 문서는 분쇄 또는 소각합니다.</p>
<h2>7. 안전성 확보 조치</h2><ul><li>전 구간 HTTPS 암호화 전송</li><li>관리자 접근 권한 최소화 및 비밀번호 암호화 저장</li><li>접근 기록 보관 및 정기 점검</li></ul>
<h2>8. 개인정보 보호책임자</h2><p>성명: ${esc(s.privacy_officer)} · 연락처: ${esc(s.phone)} · 이메일: ${esc(s.email)}</p>
<h2>9. 방침 변경</h2><p>본 방침은 법령·서비스 변경 시 개정될 수 있으며, 개정 시 홈페이지에 시행일과 함께 공지합니다.</p></div></section>`;
  res.send(page({ title: '개인정보처리방침', description: `${s.legal_name} 개인정보처리방침 — 수집 항목·목적·보유기간·위탁·정보주체 권리·보호책임자.`, path: '/privacy', body, breadcrumbs: [{ name: '개인정보처리방침', href: '/privacy' }], noindex: true }));
});

module.exports = { router };
