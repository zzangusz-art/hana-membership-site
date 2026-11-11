'use strict';
// 질문형 글(제목에 '?')을 질문 → 한 줄 답 → 글 링크로 모아 FAQ·시세표·블로그 목록에 노출(2026-11-11)
const { db } = require('../db');
const { esc, attr } = require('./util');

const TOPIC = { golf: /골프/, condo: /콘도/, fitness: /피트니스|헬스/, corporate: /법인/ };

function list(topic, n) {
  const re = topic ? TOPIC[topic] || null : null;
  return db.prepare("SELECT slug, title, excerpt FROM posts WHERE kind='blog' AND status='published' AND title LIKE '%?%' ORDER BY published_at DESC LIMIT 300").all()
    .filter(p => !re || re.test(p.title)).slice(0, n);
}
const question = (t) => String(t || '').split('?')[0].trim() + '?';
const answer = (ex) => { const s = String(ex || '').trim(); const m = s.match(/^.*?다\./); return m ? m[0] : s.slice(0, 120); };
const href = (p) => `/blog/${encodeURIComponent(p.slug)}`;

// 정의 목록(질문·답) — 섹션 안에 넣는 조각
function qa(topic, n, title) {
  const rows = list(topic, n); if (!rows.length) return '';
  return `<h2>${esc(title)}</h2><dl class="qa-list">${rows.map(p => `<dt><a href="${attr(href(p))}">${esc(question(p.title))}</a></dt><dd>${esc(answer(p.excerpt))}</dd>`).join('')}</dl>`;
}
// 질문 칩 — 목록 상단용
function chips(n) {
  const rows = list(null, n); if (!rows.length) return '';
  return `<nav class="chips qa-chips" aria-label="자주 찾는 질문">${rows.map(p => `<a class="chip" href="${attr(href(p))}">${esc(question(p.title))}</a>`).join('')}</nav>`;
}

module.exports = { list, qa, chips, question, answer };
