'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { now } = require('./util');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE = 'hana_admin';

function sign(admin) { return jwt.sign({ id: admin.id, login_id: admin.login_id, name: admin.name }, SECRET, { expiresIn: '12h' }); }

function login(login_id, pw) {
  const a = db.prepare('SELECT * FROM admins WHERE login_id=?').get(String(login_id || '').trim());
  if (!a || !bcrypt.compareSync(String(pw || ''), a.pw_hash)) return null;
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
  req.admin = u; next();
}

module.exports = { login, changePw, verify, requireAdmin, COOKIE };
