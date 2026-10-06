'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const { now } = require('./util');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE = 'hana_admin';

// ── 권한 ──
// owner   : 총괄(개발·운영 전체: 콘텐츠·자동발행·실행계획·리포트·기술감사·설정 포함). 최초 계정(admin).
// manager : 하나회원권 업체 관리자. 직원 계정 개설·담당자 관리 + 아래 staff 권한 전부.
// staff   : 직원. 시세·골프장·매물·전용관·문의·고객 DB·공지 관리. 분양·해외투어 매물은 열람만.
const ROLES = { owner: '총괄(개발·운영)', manager: '업체 관리자', staff: '직원' };
const VIEWS = {
  dash: ['owner', 'manager', 'staff'], prices: ['owner', 'manager', 'staff'], clubs: ['owner', 'manager', 'staff'], listings: ['owner', 'manager', 'staff'],
  inquiries: ['owner', 'manager', 'staff'], customers: ['owner', 'manager', 'staff'], notice: ['owner', 'manager', 'staff'], inflow: ['owner', 'manager', 'staff'],
  accounts: ['owner', 'manager'], account: ['manager', 'staff'],
  posts: ['owner', 'manager', 'staff'], /* 비총괄은 발행 현황 열람만(쓰기 API는 핸들러에서 차단) */ auto: ['owner'], plan: ['owner'], reports: ['owner'], audit: ['owner'], settings: ['owner'],
};
// API 경로별 owner 전용 구간(개발·운영 기능). 그 외는 핸들러 안에서 세부 제한.
const OWNER_ONLY = [/^\/(automation|plan|reports|audit|settings|screenshots|indexnow|traffic)(\/|$)/, /^\/donga\/map/, /^\/clubs\/\d+\/(generate|draft)/, /^\/posts\/\d+\/inblog/];
const MANAGER_UP = [/^\/accounts(\/|$)/];
function allowedViews(role) { return Object.keys(VIEWS).filter(v => VIEWS[v].includes(role)); }
function canAccessPath(role, p) {
  if (role === 'owner') return true;
  if (OWNER_ONLY.some(re => re.test(p))) return false;
  if (MANAGER_UP.some(re => re.test(p))) return role === 'manager';
  return true;
}

function sign(admin) { return jwt.sign({ id: admin.id, login_id: admin.login_id, name: admin.name, role: admin.role || 'staff' }, SECRET, { expiresIn: '12h' }); }

function login(login_id, pw) {
  const a = db.prepare('SELECT * FROM admins WHERE login_id=?').get(String(login_id || '').trim().toLowerCase());
  if (!a || !bcrypt.compareSync(String(pw || ''), a.pw_hash)) return null;
  if (a.active === 0) return { disabled: true };
  db.prepare('UPDATE admins SET last_login=? WHERE id=?').run(now(), a.id);
  return sign(a);
}
function changePw(id, newPw) {
  db.prepare('UPDATE admins SET pw_hash=? WHERE id=?').run(bcrypt.hashSync(String(newPw), 10), id);
}
function verify(token) { try { return jwt.verify(token, SECRET); } catch (_) { return null; } }

function requireAdmin(req, res, next) {
  const raw = req.cookies?.[COOKIE] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const u = raw && verify(raw);
  if (!u) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (u.internal) { req.admin = { ...u, role: 'owner' }; return next(); }
  // 권한·활성 여부는 토큰이 아니라 DB 기준(계정 삭제·정지·권한 변경 즉시 반영)
  const a = db.prepare('SELECT id, login_id, name, role, active, phone, dept FROM admins WHERE id=?').get(u.id);
  if (!a || a.active === 0) return res.status(401).json({ error: '사용할 수 없는 계정입니다. 다시 로그인하세요.' });
  req.admin = { id: a.id, login_id: a.login_id, name: a.name, role: a.role || 'staff', phone: a.phone, dept: a.dept };
  next();
}
// 권한 없는 경로 차단(requireAdmin 다음에 사용)
function requireRole(req, res, next) {
  if (!canAccessPath(req.admin.role, req.path)) return res.status(403).json({ error: '이 메뉴는 총괄 관리자 전용입니다.' });
  next();
}

// ── 계정 관리 ──
const ID_RE = /^[a-z0-9_.-]{3,30}$/;
function listAccounts() {
  return db.prepare("SELECT a.id, a.login_id, a.name, a.role, a.phone, a.dept, a.active, a.created_at, a.last_login, a.created_by, b.name created_by_name, (SELECT COUNT(*) FROM inquiries i WHERE i.assignee_id=a.id) inquiries, (SELECT COUNT(*) FROM customers c WHERE c.assignee_id=a.id) customers FROM admins a LEFT JOIN admins b ON b.id=a.created_by ORDER BY CASE a.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, a.id").all();
}
// 생성 규칙: owner는 manager/staff 생성, manager는 staff만 생성. 아이디 영문·숫자 3~30자, 비밀번호 8자 이상.
function createAccount({ login_id, pw, name, role = 'staff', phone = '', dept = '' }, by) {
  login_id = String(login_id || '').trim().toLowerCase();
  if (!ID_RE.test(login_id)) throw new Error('아이디는 영문 소문자·숫자·._- 3~30자');
  if (String(pw || '').length < 8) throw new Error('비밀번호는 8자 이상');
  if (!name || !String(name).trim()) throw new Error('이름을 입력하세요');
  if (!['manager', 'staff'].includes(role)) throw new Error('권한은 업체 관리자 또는 직원');
  if (by.role === 'manager' && role !== 'staff') throw new Error('업체 관리자는 직원 계정만 만들 수 있습니다');
  if (by.role === 'staff') throw new Error('권한 없음');
  if (db.prepare('SELECT 1 FROM admins WHERE login_id=?').get(login_id)) throw new Error('이미 있는 아이디');
  const r = db.prepare('INSERT INTO admins (login_id,pw_hash,name,role,phone,dept,active,created_by,created_at) VALUES (?,?,?,?,?,?,1,?,?)').run(login_id, bcrypt.hashSync(String(pw), 10), String(name).trim(), role, phone || '', dept || '', by.id, now());
  return r.lastInsertRowid;
}
function targetOf(id, by) {
  const t = db.prepare('SELECT * FROM admins WHERE id=?').get(id); if (!t) throw new Error('계정 없음');
  if (t.role === 'owner' && by.role !== 'owner') throw new Error('총괄 계정은 변경할 수 없습니다');
  if (by.role === 'manager' && t.role === 'manager' && t.id !== by.id) throw new Error('다른 업체 관리자 계정은 변경할 수 없습니다');
  if (by.role === 'staff' && t.id !== by.id) throw new Error('권한 없음');
  return t;
}
function updateAccount(id, { name, phone, dept, role, active }, by) {
  const t = targetOf(id, by);
  const nextRole = role && by.role === 'owner' && t.role !== 'owner' && ['manager', 'staff'].includes(role) ? role : t.role;
  const nextActive = (active === 0 || active === 1) && t.id !== by.id && t.role !== 'owner' ? active : t.active;
  db.prepare('UPDATE admins SET name=?, phone=?, dept=?, role=?, active=? WHERE id=?').run(name ? String(name).trim() : t.name, phone ?? t.phone ?? '', dept ?? t.dept ?? '', nextRole, nextActive, t.id);
}
function resetPw(id, pw, by) { const t = targetOf(id, by); if (String(pw || '').length < 8) throw new Error('비밀번호는 8자 이상'); changePw(t.id, pw); }
function deleteAccount(id, by) {
  const t = targetOf(id, by);
  if (t.role === 'owner') throw new Error('총괄 계정은 삭제할 수 없습니다');
  if (t.id === by.id) throw new Error('자기 계정은 삭제할 수 없습니다');
  db.prepare('UPDATE inquiries SET assignee_id=NULL WHERE assignee_id=?').run(t.id);
  db.prepare('UPDATE customers SET assignee_id=NULL WHERE assignee_id=?').run(t.id);
  db.prepare('DELETE FROM admins WHERE id=?').run(t.id);
}
// 담당자 선택용(활성 계정)
function assignees() { return db.prepare("SELECT id, name, role, dept, phone FROM admins WHERE active=1 ORDER BY CASE role WHEN 'manager' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, id").all(); }

// 업체 관리자 계정(hanamember) 최초 생성: 없으면 만든다. 초기 비밀번호는 MANAGER_INIT_PW, 없으면 무작위 생성 후 서버 로그에 1회 출력.
// 총괄(admin)이 관리자 → 계정·담당자에서 언제든 재설정 가능.
function ensureManager() {
  const id = (process.env.MANAGER_ID || 'hanamember').toLowerCase();
  if (db.prepare('SELECT 1 FROM admins WHERE login_id=?').get(id)) return null;
  if (db.prepare("SELECT 1 FROM admins WHERE role='manager'").get()) return null;
  const pw = process.env.MANAGER_INIT_PW || crypto.randomBytes(9).toString('base64url').slice(0, 12);
  const owner = db.prepare("SELECT id FROM admins WHERE role='owner' ORDER BY id LIMIT 1").get();
  db.prepare('INSERT INTO admins (login_id,pw_hash,name,role,phone,dept,active,created_by,created_at) VALUES (?,?,?,?,?,?,1,?,?)').run(id, bcrypt.hashSync(pw, 10), '하나회원권 관리자', 'manager', '', '하나회원권거래소', owner ? owner.id : null, now());
  console.log(`[auth] 업체 관리자 계정 생성: ${id} / 초기 비밀번호 ${process.env.MANAGER_INIT_PW ? '(MANAGER_INIT_PW)' : pw} — 로그인 후 '내 계정'에서 변경하거나 총괄이 재설정하세요`);
  return { id, generated: !process.env.MANAGER_INIT_PW };
}

// 서버 내부 작업(주간 스크린샷 캡처)용 단기 토큰
function signInternal() { const a = db.prepare("SELECT * FROM admins WHERE role='owner' ORDER BY id LIMIT 1").get() || db.prepare('SELECT * FROM admins ORDER BY id LIMIT 1').get(); return a ? jwt.sign({ id: a.id, login_id: a.login_id, name: 'system', role: 'owner', internal: true }, SECRET, { expiresIn: '10m' }) : null; }
module.exports = { login, changePw, verify, requireAdmin, requireRole, COOKIE, signInternal, ROLES, VIEWS, allowedViews, canAccessPath, listAccounts, createAccount, updateAccount, resetPw, deleteAccount, assignees, ensureManager };
