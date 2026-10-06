'use strict';
// 문의·고객 통합 관리 — 홈페이지 문의(매매신청·상담)는 접수 즉시 고객 DB에 자동 등록되고, 직접 등록한 고객과 한 화면에서 담당자·상태·상담 기록을 관리한다.
const { db } = require('../db');
const { now } = require('./util');

const KIND = { buy: '매수', sell: '매도', consult: '상담', member: '보유회원' };
const STATUS = { new: '신규', contacting: '상담중', contract: '계약', hold: '보류', closed: '종료' };
// 고객 상태 → 문의 테이블 상태(대시보드 배지·구 API 호환)
const INQ_STATUS = { new: 'new', contacting: 'contacted', contract: 'contacted', hold: 'done', closed: 'done' };

const normPhone = (p) => String(p || '').replace(/\D/g, '');

function addNote(customerId, body, adminId, kind = 'memo') {
  body = String(body || '').trim(); if (!body) return null;
  const ts = now();
  const r = db.prepare('INSERT INTO customer_notes (customer_id, admin_id, kind, body, created_at) VALUES (?,?,?,?,?)').run(customerId, adminId || null, kind, body.slice(0, 4000), ts);
  db.prepare('UPDATE customers SET last_note_at=?, updated_at=? WHERE id=?').run(ts, ts, customerId);
  return r.lastInsertRowid;
}
function notes(customerId) {
  return db.prepare('SELECT n.id, n.kind, n.body, n.created_at, a.name admin_name FROM customer_notes n LEFT JOIN admins a ON a.id=n.admin_id WHERE n.customer_id=? ORDER BY n.id DESC').all(customerId);
}

// 문의 1건 → 고객 등록. 같은 문의가 이미 등록돼 있으면 그 고객, 같은 연락처 고객이 있으면 거기에 문의를 연결하고 기록만 남긴다.
function fromInquiry(i, adminId = null) {
  if (!i) return null;
  const dup = db.prepare('SELECT id FROM customers WHERE inquiry_id=?').get(i.id); if (dup) return { id: dup.id, existed: true };
  const ts = now(); const np = normPhone(i.phone);
  const same = np.length >= 8 ? db.prepare("SELECT id, status FROM customers WHERE replace(replace(replace(phone,'-',''),' ',''),'.','')=? ORDER BY id DESC LIMIT 1").get(np) : null;
  const summary = [KIND[i.kind] || i.kind, i.category, i.item, i.budget].filter(Boolean).join(' · ');
  if (same) {
    // 기존 고객의 재문의: 문의는 연결하고, 상태는 종료/보류였으면 다시 신규로
    db.prepare('UPDATE customers SET status=CASE WHEN status IN (\'hold\',\'closed\') THEN \'new\' ELSE status END, item=CASE WHEN item IS NULL OR item=\'\' THEN ? ELSE item END, updated_at=? WHERE id=?').run(i.item || '', ts, same.id);
    db.prepare('UPDATE inquiries SET customer_id=? WHERE id=?').run(same.id, i.id);
    addNote(same.id, `[재문의 접수] ${summary}${i.message ? '\n' + i.message : ''}`, adminId, 'inquiry');
    return { id: same.id, existed: false, merged: true };
  }
  const r = db.prepare('INSERT INTO customers (name,phone,email,kind,category,item,budget,memo,status,assignee_id,inquiry_id,source,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(i.name, i.phone, i.email || '', KIND[i.kind] ? i.kind : 'consult', i.category || '', i.item || '', i.budget || '', '', i.status === 'done' ? 'closed' : i.status === 'contacted' ? 'contacting' : 'new', i.assignee_id || null, i.id, 'inquiry', adminId, i.created_at || ts, ts);
  db.prepare('UPDATE inquiries SET customer_id=? WHERE id=?').run(r.lastInsertRowid, i.id);
  addNote(r.lastInsertRowid, `[문의 접수] ${summary}${i.message ? '\n' + i.message : ''}`, adminId, 'inquiry');
  if (i.memo) addNote(r.lastInsertRowid, i.memo, adminId, 'memo');
  return { id: r.lastInsertRowid, existed: false };
}
// 서버 시작 때: 아직 고객으로 등록되지 않은 문의를 모두 가져온다(멱등)
function importAll() {
  const rows = db.prepare('SELECT * FROM inquiries WHERE id NOT IN (SELECT inquiry_id FROM customers WHERE inquiry_id IS NOT NULL) ORDER BY id').all();
  let n = 0; for (const i of rows) { fromInquiry(i); n++; }
  return n;
}

function list({ q = '', status = '', kind = '', assignee = '', source = '', limit = 1000 } = {}) {
  const w = []; const a = [];
  if (q) { const s = `%${String(q).trim()}%`; w.push('(c.name LIKE ? OR c.phone LIKE ? OR c.item LIKE ? OR c.memo LIKE ? OR i.message LIKE ?)'); a.push(s, s, s, s, s); }
  if (status === 'open') w.push("c.status IN ('new','contacting')"); else if (STATUS[status]) { w.push('c.status=?'); a.push(status); }
  if (KIND[kind]) { w.push('c.kind=?'); a.push(kind); }
  if (assignee === 'none') w.push('c.assignee_id IS NULL'); else if (assignee) { w.push('c.assignee_id=?'); a.push(Number(assignee)); }
  if (source === 'inquiry') w.push('c.inquiry_id IS NOT NULL'); else if (source === 'manual') w.push('c.inquiry_id IS NULL');
  const rows = db.prepare(`SELECT c.*, a.name assignee_name, b.name created_by_name,
      i.message inq_message, i.created_at inq_at, i.src_source, i.src_keyword, i.src_campaign, i.src_landing, i.session_id, i.referrer,
      (SELECT COUNT(*) FROM customer_notes n WHERE n.customer_id=c.id AND n.kind='memo') note_count,
      (SELECT body FROM customer_notes n WHERE n.customer_id=c.id AND n.kind='memo' ORDER BY n.id DESC LIMIT 1) last_note
    FROM customers c LEFT JOIN admins a ON a.id=c.assignee_id LEFT JOIN admins b ON b.id=c.created_by LEFT JOIN inquiries i ON i.id=c.inquiry_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY CASE c.status WHEN 'new' THEN 0 WHEN 'contacting' THEN 1 ELSE 2 END, c.updated_at DESC LIMIT ?`).all(...a, Math.min(5000, Math.max(1, Number(limit) || 1000)));
  return rows;
}
function counts() {
  const by = db.prepare('SELECT status, COUNT(*) c FROM customers GROUP BY status').all().reduce((o, r) => { o[r.status] = r.c; return o; }, {});
  return { total: db.prepare('SELECT COUNT(*) c FROM customers').get().c, byStatus: by, unassigned: db.prepare("SELECT COUNT(*) c FROM customers WHERE status IN ('new','contacting') AND assignee_id IS NULL").get().c, fromInquiry: db.prepare('SELECT COUNT(*) c FROM customers WHERE inquiry_id IS NOT NULL').get().c };
}

// 저장(등록·수정). 상태를 바꾸면 연결된 문의 상태도 맞춰 준다.
function save(b, adminId) {
  const name = String(b.name || '').trim(); const phone = String(b.phone || '').trim();
  if (!name || !phone) throw new Error('성함·연락처 필요');
  const kind = KIND[b.kind] ? b.kind : 'consult'; const status = STATUS[b.status] ? b.status : 'new'; const ts = now();
  const assignee = b.assignee_id ? Number(b.assignee_id) : null;
  let id;
  if (b.id) {
    const cur = db.prepare('SELECT * FROM customers WHERE id=?').get(b.id); if (!cur) throw new Error('고객 없음');
    db.prepare('UPDATE customers SET name=?,phone=?,email=?,kind=?,category=?,item=?,budget=?,memo=?,status=?,assignee_id=?,updated_at=? WHERE id=?').run(name, phone, b.email || '', kind, b.category || '', b.item || '', b.budget || '', b.memo ?? cur.memo ?? '', status, assignee, ts, cur.id);
    id = cur.id;
    if (cur.status !== status) addNote(id, `상태 변경: ${STATUS[cur.status] || cur.status} → ${STATUS[status]}`, adminId, 'system');
    if ((cur.assignee_id || null) !== assignee) { const nm = assignee ? (db.prepare('SELECT name FROM admins WHERE id=?').get(assignee) || {}).name : null; addNote(id, `담당자 ${nm ? '배정: ' + nm : '해제'}`, adminId, 'system'); }
    if (cur.inquiry_id) db.prepare('UPDATE inquiries SET status=?, assignee_id=?, updated_at=? WHERE id=?').run(INQ_STATUS[status], assignee, ts, cur.inquiry_id);
  } else {
    const r = db.prepare('INSERT INTO customers (name,phone,email,kind,category,item,budget,memo,status,assignee_id,inquiry_id,source,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(name, phone, b.email || '', kind, b.category || '', b.item || '', b.budget || '', b.memo || '', status, assignee, b.inquiry_id ? Number(b.inquiry_id) : null, 'manual', adminId, ts, ts);
    id = r.lastInsertRowid; addNote(id, '직접 등록', adminId, 'system');
  }
  if (b.note) addNote(id, b.note, adminId, 'memo');
  return id;
}
// 표에서 바로 바꾸는 담당자·상태(부분 갱신)
function quick(id, { status, assignee_id }, adminId) {
  const cur = db.prepare('SELECT * FROM customers WHERE id=?').get(id); if (!cur) throw new Error('고객 없음');
  return save({ ...cur, status: status ?? cur.status, assignee_id: assignee_id === undefined ? cur.assignee_id : (assignee_id || null) }, adminId);
}
function remove(id) { db.prepare('DELETE FROM customer_notes WHERE customer_id=?').run(id); db.prepare('UPDATE inquiries SET customer_id=NULL WHERE customer_id=?').run(id); db.prepare('DELETE FROM customers WHERE id=?').run(id); }

function csv() {
  const rows = list({ limit: 5000 }); const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'; const kst = (ts) => ts ? new Date(ts * 1000 + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : '';
  const head = ['번호', '접수·등록', '출처', '구분', '분류', '성함', '연락처', '이메일', '관심 종목', '예산', '문의 내용', '유입 출처', '검색어', '상태', '담당자', '메모', '최근 상담 기록', '상담 기록 수', '마지막 수정'];
  const body = rows.map(r => [r.id, kst(r.created_at), r.inquiry_id ? '홈페이지 문의' : '직접 등록', KIND[r.kind] || r.kind, r.category, r.name, r.phone, r.email, r.item, r.budget, r.inq_message, r.src_source, r.src_keyword, STATUS[r.status] || r.status, r.assignee_name, r.memo, r.last_note, r.note_count, kst(r.updated_at)].map(q).join(','));
  return '﻿' + [head.map(q).join(','), ...body].join('\r\n');
}

module.exports = { KIND, STATUS, INQ_STATUS, fromInquiry, importAll, list, counts, save, quick, remove, addNote, notes, csv };
