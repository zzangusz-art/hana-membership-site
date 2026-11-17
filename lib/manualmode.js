'use strict';
// 2026-11-19 운영 대행 종결: 이날(KST)부터 서버 자동 작업(예약 발행·시세 반영·시세 기록·네이버 블로그 갱신·IndexNow·썸네일 예열·리포트·감사)을 멈추고
// 관리자 「수동 실행」 버튼으로만 실행한다. 설정 manual_only_from 을 빈 값으로 두면 자동 작업이 다시 돈다(재수임 시).
const { getSetting } = require('../db');
const { kstDate } = require('./util');
const DEFAULT_FROM = '2026-11-19';
function from() { return getSetting('manual_only_from', DEFAULT_FROM); }
function manualOnly(date = kstDate()) { const f = from(); return !!f && date >= f; }
module.exports = { manualOnly, from, DEFAULT_FROM };
