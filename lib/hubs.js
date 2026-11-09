'use strict';
// 지역 허브 페이지 정의 — clubs.region 값과 짝을 이룬다. terms는 같은 지역을 다룬 블로그 글을 찾는 제목 단어
const { attr, esc } = require('./util');

const HUBS = [
  { slug: 'capital', region: '수도권', terms: ['수도권', '경기', '용인', '여주', '이천', '가평', '포천', '양주', '고양', '안성'] },
  { slug: 'yeongnam', region: '영남', terms: ['영남', '부산', '대구', '울산', '경남', '경북', '경주'] },
  { slug: 'chungcheong', region: '충청', terms: ['충청', '대전', '충남', '충북', '청주', '천안'] },
  { slug: 'honam', region: '호남', terms: ['호남', '광주', '전남', '전북'] },
  { slug: 'gangwon', region: '강원', terms: ['강원', '평창', '춘천', '원주', '홍천'] },
  { slug: 'jeju', region: '제주', terms: ['제주'] },
];

function hubNav(active = '') {
  return `<nav class="chips hub-nav" aria-label="지역별 골프회원권 시세">${HUBS.map(h => `<a class="chip${h.slug === active ? ' active' : ''}" href="/golf/region/${attr(h.slug)}">${esc(h.region)} 골프회원권</a>`).join('')}</nav>`;
}

module.exports = { HUBS, hubNav };
