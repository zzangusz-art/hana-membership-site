'use strict';
// 문의 스팸 판정 — 자동 등록 봇(외국어 칭찬글·링크 홍보·형식에 안 맞는 번호)을 걸러 문의·고객 DB에 넣지 않는다(2026-10-20).
// 걸린 문의는 spam_log 테이블에만 남긴다(나중에 오판 확인용). 정상 고객을 막지 않도록 기준은 보수적으로 둔다.
const { db } = require('../db');
db.exec(`CREATE TABLE IF NOT EXISTS spam_log (id INTEGER PRIMARY KEY AUTOINCREMENT, reason TEXT, name TEXT, phone TEXT, email TEXT, message TEXT, ip TEXT, ua TEXT, inquiry_id INTEGER, created_at INTEGER)`);

const HANGUL = /[가-힣]/;
// 국내 전화번호: 휴대폰 010~019, 지역번호 02·031~064, 070, 050x 안심번호, 15xx·16xx·18xx 대표번호(+82 국제 표기 허용)
const KR_PHONE = /^(01[016789]\d{7,8}|02\d{7,8}|0[3-6]\d\d{7,8}|070\d{8}|050\d{8,9}|1[5-8]\d{6})$/;
const normPhone = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('82')) d = '0' + d.slice(2).replace(/^0/, ''); return d; };
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|top|ru|io)\b)/i;

// 반환: 스팸이면 이유 문자열, 아니면 ''
// 번호가 국내 형식이 아니면 '스팸 또는 오타' — 접수 화면에서 연락처 확인을 요청(사람이면 고쳐서 다시 보냄)하고 기록만 남긴다.
// 번호가 정상이어도 본문에 링크가 있으면 홍보 스팸으로 보고 조용히 걸러 낸다. 한글이 없어도 번호가 정상이면 받는다(외국인 고객).
function check({ name = '', phone = '', message = '' } = {}) {
  if (!KR_PHONE.test(normPhone(phone))) return { reason: HANGUL.test() ? '국내 전화번호 형식 아님' : '국내 전화번호 형식 아님 · 한글 없음', action: 'reject' };
  if (LINK.test(message)) return { reason: '본문에 링크', action: 'drop' };
  return null;
}
function log(reason, b, extra = {}) {
  db.prepare('INSERT INTO spam_log (reason,name,phone,email,message,ip,ua,inquiry_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(reason, String(b.name || '').slice(0, 60), String(b.phone || '').slice(0, 30), String(b.email || '').slice(0, 80), String(b.message || '').slice(0, 1500), extra.ip || '', extra.ua || '', extra.inquiry_id || null, extra.created_at || Math.floor(Date.now() / 1000));
}
// 이미 들어온 스팸 정리(1회): 같은 기준에 걸리고, 담당자 배정·상담 메모가 없는(사람이 손대지 않은) 문의만 spam_log로 옮긴다
function cleanupExisting() {
  const { getSetting, setSetting } = require('../db'); if (getSetting('spam_cleanup_20261020', '')) return null;
  let moved = 0;
  for (const i of db.prepare('SELECT * FROM inquiries').all()) {
    const r = check(i); if (!r || (r.action === 'reject' && HANGUL.test(`${i.name} ${i.message || ''}`))) continue; const reason = r.reason; // 기존 문의는 한글 없는 번호 오류·링크만 정리(한글 문의는 사람일 수 있어 둠)
    const c = i.customer_id ? db.prepare('SELECT * FROM customers WHERE id=?').get(i.customer_id) : null;
    if (c && (c.assignee_id || db.prepare("SELECT COUNT(*) n FROM customer_notes WHERE customer_id=? AND kind='memo'").get(c.id).n)) continue;
    if (c && db.prepare('SELECT COUNT(*) n FROM inquiries WHERE customer_id=? AND id<>?').get(c.id, i.id).n) continue; // 같은 고객의 다른(정상) 문의가 있으면 두기
    log(reason, i, { ip: i.ip, ua: i.ua, inquiry_id: i.id, created_at: i.created_at });
    if (c) { db.prepare('DELETE FROM customer_notes WHERE customer_id=?').run(c.id); db.prepare('DELETE FROM customers WHERE id=?').run(c.id); }
    db.prepare('DELETE FROM inquiries WHERE id=?').run(i.id); moved++;
  }
  setSetting('spam_cleanup_20261020', JSON.stringify({ at: new Date().toISOString(), moved }));
  return { moved };
}
function stats() { return { total: db.prepare('SELECT COUNT(*) c FROM spam_log').get().c, last7: db.prepare('SELECT COUNT(*) c FROM spam_log WHERE created_at>=?').get(Math.floor(Date.now() / 1000) - 7 * 86400).c }; }

module.exports = { check, log, cleanupExisting, stats, normPhone, KR_PHONE };
