'use strict';
// 사이트 설정 — env → settings 테이블 → 기본값 순 폴백
const { getSetting } = require('../db');

const DEFAULTS = {
  site_url: process.env.SITE_URL || 'https://www.hanamarket.co.kr',
  site_name: '하나회원권거래소',
  legal_name: '(주)하나회원권거래소',
  en_name: 'Hana Membership Exchange',
  slogan: '골프·콘도·피트니스 회원권 시세와 매매, 2004년부터',
  phone: '02-583-0583',
  fax: '02-517-0965',
  email: 'hanagolf00@naver.com',
  address: '서울특별시 강남구 압구정로 152 극동타워 A동 401호',
  address_short: '서울 강남구 압구정로 152 극동타워 A동 4층',
  biz_no: '120-88-15770',
  ceo: '김상학',
  privacy_officer: '정인철',
  telecom_no: '2017-서울용산-1060',
  founded: '2004',
  hours: '평일 09:00 – 18:00 (전화 상담 24시간)',
  youtube: 'https://www.youtube.com/@hanamarket',
  naver_blog: '',
  instagram: '',
  kakao_channel: '',
  inblog_url: '',              // 인블로그 주소 (예: https://blog.hanamarket.co.kr)
  naver_verification: process.env.NAVER_SITE_VERIFICATION || '',
  google_verification: process.env.GOOGLE_SITE_VERIFICATION || '',
  ga_id: process.env.GA_MEASUREMENT_ID || '',
  // 자동발행
  gen_times: '09:00,15:00',
  auto_publish: '1',
  inblog_push: '1',
  llm_provider: 'anthropic',
  // 기획
  kickoff_date: '2026-09-14',
};

function cfg(key) {
  const v = getSetting(key, null);
  if (v !== null && v !== '') return v;
  return DEFAULTS[key] ?? '';
}
function siteUrl() { return cfg('site_url').replace(/\/$/, ''); }
function all() { const o = {}; for (const k of Object.keys(DEFAULTS)) o[k] = cfg(k); return o; }

module.exports = { cfg, siteUrl, all, DEFAULTS };
