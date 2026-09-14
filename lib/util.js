'use strict';
const crypto = require('crypto');

function uid(n = 16) { return crypto.randomBytes(n).toString('hex'); }
function now() { return Math.floor(Date.now() / 1000); }

// KST 현재 시각 (서버 TZ와 무관)
function kstParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short'
  }).formatToParts(d);
  const g = (t) => parts.find(p => p.type === t)?.value;
  const hour = g('hour') === '24' ? '00' : g('hour');
  return {
    date: `${g('year')}-${g('month')}-${g('day')}`,
    hm: `${hour}:${g('minute')}`,
    time: `${hour}:${g('minute')}:${g('second')}`,
    weekday: g('weekday'), // Mon, Tue ...
  };
}
function kstDate(d) { return kstParts(d).date; }
function kstDateTime(d) { const p = kstParts(d); return `${p.date} ${p.hm}`; }
// 'YYYY-MM-DD' + n일
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  d.setUTCDate(d.getUTCDate() + n);
  return kstDate(d);
}
function fmtKoDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}
function isoFromTs(ts) { return new Date(ts * 1000).toISOString(); }

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function attr(s) { return esc(s); }
function fmtNum(n) { if (n === null || n === undefined || n === '') return '-'; return Number(n).toLocaleString('ko-KR'); }
// 만원 → 억/만원 표기
function fmtMan(n) {
  n = Number(n) || 0;
  if (n >= 10000) {
    const eok = Math.floor(n / 10000); const man = n % 10000;
    return man ? `${eok}억 ${man.toLocaleString('ko-KR')}만원` : `${eok}억원`;
  }
  return `${n.toLocaleString('ko-KR')}만원`;
}

function slugify(input, fallback) {
  let s = String(input || '').toLowerCase().trim()
    .replace(/[^\w\s가-힣-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!s || /[가-힣]/.test(s)) s = (fallback || 'p-' + uid(4));
  return s.slice(0, 80);
}

// 한글 포함 slug 허용(URL 인코딩되어도 검색엔진은 정상 처리). 골프장 페이지용.
function koSlug(name) {
  return String(name || '').trim().replace(/[\s/]+/g, '-').replace(/[()（）]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function stripHtml(html) { return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|object|embed)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '').replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}
function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = fence ? fence[1] : text;
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  const raw = c.slice(s, e + 1);
  try { return JSON.parse(raw); } catch (_) {
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')); } catch (_) { return null; }
  }
}
function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

module.exports = { uid, now, kstParts, kstDate, kstDateTime, addDays, fmtKoDate, isoFromTs, esc, attr, fmtNum, fmtMan, slugify, koSlug, stripHtml, sanitizeHtml, extractJson, truncate };
