'use strict';
// 공개 API — 시세 JSON(AI/개발자용) · 문의 접수
const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const prices = require('../lib/prices');
const { now, kstDate, isoFromTs } = require('../lib/util');
const settings = require('../lib/settings');

const router = express.Router();

router.get('/prices/:category', (req, res) => {
  const cat = req.params.category; if (!prices.CATS[cat]) return res.status(404).json({ error: 'unknown category' });
  const rows = prices.list(cat, { q: req.query.q, region: req.query.region });
  const st = prices.stats(cat);
  res.set('Cache-Control', 'public, max-age=600');
  res.json({ source: settings.cfg('legal_name'), category: cat, label: prices.CATS[cat], unit: '만원', updated: st.lastUpdated ? isoFromTs(st.lastUpdated) : null, date: kstDate(), count: rows.length, note: '회원권 자체 시세. 거래소 수수료·골프장 명의개서료 별도. 출처 표기: 하나회원권거래소(' + settings.siteUrl() + ')', items: rows.map(r => ({ id: r.id, name: r.name, region: r.region, today: r.today, prev: r.prev, diff: r.diff, pct: r.pct, members: r.members })) });
});
router.get('/prices/:category/:id/history', (req, res) => {
  const r = db.prepare('SELECT * FROM prices WHERE id=? AND category=?').get(req.params.id, req.params.category); if (!r) return res.status(404).json({ error: 'not found' });
  const days = Math.min(365, Math.max(7, parseInt(req.query.days || '90', 10) || 90));
  res.set('Cache-Control', 'public, max-age=600');
  res.json({ id: r.id, name: r.name, unit: '만원', history: prices.history(r.id, days) });
});

const inqLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' } });
router.post('/inquiry', inqLimit, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 40); const phone = String(b.phone || '').trim().slice(0, 25);
  if (!name || !phone) return res.status(400).json({ error: '성함과 연락처를 입력해 주세요.' });
  if (!/^[\d\s\-+().]{8,25}$/.test(phone)) return res.status(400).json({ error: '연락처 형식을 확인해 주세요.' });
  if (!b.agree) return res.status(400).json({ error: '개인정보 수집·이용에 동의해 주세요.' });
  if (b.website) return res.json({ ok: true }); // honeypot
  const kind = ['buy', 'sell', 'consult'].includes(b.kind) ? b.kind : 'consult';
  const ts = now();
  const info = db.prepare('INSERT INTO inquiries (kind,category,name,phone,email,item,budget,message,agree,ip,ua,referrer,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?)')
    .run(kind, String(b.category || '').slice(0, 20), name, phone, String(b.email || '').slice(0, 80), String(b.item || '').slice(0, 80), String(b.budget || '').slice(0, 60), String(b.message || '').slice(0, 1500), (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].slice(0, 45), String(req.headers['user-agent'] || '').slice(0, 200), String(req.headers.referer || '').slice(0, 200), ts, ts);
  res.json({ ok: true, id: info.lastInsertRowid, message: '접수되었습니다. 담당 상담사가 곧 연락드리겠습니다.' });
});

module.exports = { router };
