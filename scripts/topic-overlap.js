'use strict';
// 블로그 주제 겹침 점검 — 새 글 후보 제목이 이미 발행·예약된 글과 얼마나 겹치는지 본다(같은 키워드로 우리 글끼리 경쟁하지 않게).
// 비교 대상: DB의 글(발행·예약) + data/seed/articles*.json(아직 DB에 안 들어간 예약 글). 골프장별 자동 글(club-guide-*)은 제외.
// 실행: node scripts/topic-overlap.js "후보 제목 1" "후보 제목 2"   (인자 없으면 기존 글끼리 겹치는 쌍을 보여 줌)
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { db } = require(ROOT + '/db');

const STOP = new Set(['하나회원권거래소', '하나회원권', '무엇', '어떻게', '얼마', '정리', '가이드', '한눈에', '방법', '이유', '기준', '확인', '2026년', '10월', '9월']);
const words = (t) => String(t || '').replace(/\(.*?\)/g, ' ').split(/[\s:·,|/?!~—\-–()'"“”]+/).map(w => w.replace(/(은|는|이|가|을|를|의|에|와|과|도|로|으로|에서|까지|부터)$/, '')).filter(w => w.length >= 2 && !STOP.has(w));
const bigrams = (t) => { const s = String(t || '').replace(/[^가-힣a-z0-9]/gi, ''); const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; };
const jac = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, a.size + b.size - n); };
// 앞 30자(검색 결과에 보이는 핵심 구간) 기준 bigram 유사도 + 핵심 단어 겹침
const score = (a, b) => { const ha = a.slice(0, 30), hb = b.slice(0, 30); const w1 = new Set(words(ha)), w2 = new Set(words(hb)); return Math.round((jac(bigrams(ha), bigrams(hb)) * 0.6 + jac(w1, w2) * 0.4) * 100); };

// '○○ 회원권 시세와 매수 가이드'(골프장별 자동 글)는 골프장마다 키워드가 달라 서로 경쟁하지 않으므로 제외
const posts = db.prepare("SELECT slug, title, status, published_at FROM posts WHERE status IN ('published','scheduled') AND slug NOT LIKE 'club-guide%' AND title NOT LIKE '%회원권 시세와 매수 가이드'").all();
const seen = new Set(posts.map(p => p.slug));
for (const f of fs.readdirSync(path.join(ROOT, 'data', 'seed')).filter(f => /^articles.*\.json$/.test(f))) {
  for (const a of [].concat(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed', f), 'utf8')))) if (a.slug && !seen.has(a.slug)) { seen.add(a.slug); posts.push({ slug: a.slug, title: a.title, status: 'seed ' + f.replace(/articles-?|\.json/g, '') }); }
}
const cands = process.argv.slice(2);
if (cands.length) {
  for (const c of cands) {
    const top = posts.filter(p => p.title !== c).map(p => ({ ...p, s: score(c, p.title) })).sort((a, b) => b.s - a.s).slice(0, 4);
    console.log(`\n후보: ${c}\n  최대 유사도 ${top[0].s} ${top[0].s >= 45 ? '⚠ 겹침 — 각도를 바꾸거나 기존 글을 보강' : top[0].s >= 30 ? '△ 일부 겹침 — 제목 앞부분 키워드를 다르게' : '✔ 새 주제'}`);
    for (const t of top) console.log(`  ${String(t.s).padStart(3)}  ${t.title.slice(0, 70)}  [${t.status}]`);
  }
} else {
  const pairs = [];
  for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++) { const s = score(posts[i].title, posts[j].title); if (s >= 45) pairs.push([s, posts[i].title, posts[j].title]); }
  pairs.sort((a, b) => b[0] - a[0]).forEach(([s, a, b]) => console.log(`${s}  ${a.slice(0, 50)}  ↔  ${b.slice(0, 50)}`));
  console.log(`비교 ${posts.length}건, 겹침 의심 ${pairs.length}쌍`);
}
