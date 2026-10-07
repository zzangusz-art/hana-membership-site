'use strict';
// 데이터 정정(클라이언트 지시) — 서버 시작 때 시드 다음에 실행, 모두 멱등.
// 2026-10-06 재현: 인터불고경산 → 해내다CC로 통합, 청우 삭제, 군산·남광주·비발디파크·세라지오·우리들리조트 삭제, 제피로스 → 그린필드
const { db } = require('../db');
const { now } = require('./util');

const DELETE_CLUBS = ['청우(12500)', '군산', '남광주', '비발디파크(16000)', '세라지오(18000)', '우리들리조트', '인터불고경산(25000)', '인터불고경산(27000)'];
const DELETE_PRICES = { golf: ['청우(12500)', '군산', '남광주', '비발디파크(16000)', '세라지오(18000)', '우리들리조트', '인터불고경산', '인터불고경산(25000)', '인터불고경산(27000)'], corporate: ['군산', '남광주', '비발디파크(16000)', '세라지오(18000)', '우리들리조트', '청우(12500)'] };
const RENAME_PRICES = [['golf', '제피로스', '그린필드'], ['corporate', '제피로스', '그린필드'], ['corporate', '인터불고경산(23000) (법인)', '해내다(23000) (법인)']];
// [옛 이름, 새 이름, 새 slug, 새 price_name]
const RENAME_CLUBS = [['인터불고경산골프클럽', '해내다CC', '해내다cc', '해내다(23000)'], ['제피로스', '그린필드', '그린필드', '그린필드']];
// 옛 주소 → 새 주소(server.js REDIRECTS에서 사용)
const REDIRECTS = { '/golf/인터불고경산골프클럽': '/golf/해내다cc', '/golf/인터불고경산25000': '/golf/해내다cc?type=25000', '/golf/인터불고경산27000': '/golf/해내다cc?type=27000', '/golf/제피로스': '/golf/그린필드' };

function run() {
  const log = [];
  const tx = db.transaction(() => {
    for (const n of DELETE_CLUBS) { const r = db.prepare('DELETE FROM clubs WHERE name=?').run(n); if (r.changes) log.push(`골프장 삭제 ${n}`); }
    for (const [cat, names] of Object.entries(DELETE_PRICES)) for (const n of names) {
      const row = db.prepare('SELECT id FROM prices WHERE category=? AND name=?').get(cat, n); if (!row) continue;
      db.prepare('DELETE FROM price_history WHERE price_id=?').run(row.id); db.prepare('DELETE FROM prices WHERE id=?').run(row.id); log.push(`시세 삭제 ${cat} ${n}`);
    }
    for (const [cat, from, to] of RENAME_PRICES) {
      const row = db.prepare('SELECT id FROM prices WHERE category=? AND name=?').get(cat, from); if (!row) continue;
      if (db.prepare('SELECT 1 FROM prices WHERE category=? AND name=?').get(cat, to)) { db.prepare('DELETE FROM price_history WHERE price_id=?').run(row.id); db.prepare('DELETE FROM prices WHERE id=?').run(row.id); log.push(`시세 중복 삭제 ${cat} ${from}`); }
      else { db.prepare('UPDATE prices SET name=?, updated_at=? WHERE id=?').run(to, now(), row.id); log.push(`시세 이름 변경 ${cat} ${from} → ${to}`); }
      db.prepare("UPDATE clubs SET price_name=? WHERE price_name=?").run(to, from);
    }
    for (const [from, to, slug, priceName] of RENAME_CLUBS) {
      const row = db.prepare('SELECT id FROM clubs WHERE name=?').get(from); if (!row) continue;
      db.prepare('UPDATE clubs SET name=?, slug=?, price_name=?, group_name=NULL, parent_id=NULL, variant_label=NULL, updated_at=? WHERE id=?').run(to, slug, priceName, now(), row.id); log.push(`골프장 이름 변경 ${from} → ${to}`);
    }
    // 2026-10-06: 콘도 썸네일 재조정본은 파일명을 -navy.webp로 바꿔 배포(CDN·브라우저 7일 캐시가 옛 -blue.webp를 계속 내보내던 문제)
    // 재조정할 때마다 파일명을 바꾼다(-blue → -navy → -v3). 캐시된 옛 파일이 보이지 않게 하려는 것.
    { const r = db.prepare("UPDATE listings SET image=replace(replace(image,'-blue.webp','-v3.webp'),'-navy.webp','-v3.webp'), images=replace(replace(COALESCE(images,''),'-blue.webp','-v3.webp'),'-navy.webp','-v3.webp'), updated_at=? WHERE image LIKE '%-blue.webp' OR image LIKE '%-navy.webp' OR images LIKE '%-blue.webp%' OR images LIKE '%-navy.webp%'").run(now()); if (r.changes) log.push(`콘도 썸네일 경로 ${r.changes}건 -v3`); }
    // 시드에서 새 이름으로 들어온 경우에도 slug·시세 종목명을 맞춘다
    for (const [, to, slug, priceName] of RENAME_CLUBS) { const r = db.prepare("UPDATE clubs SET slug=?, price_name=CASE WHEN price_name IS NULL OR price_name='' THEN ? ELSE price_name END WHERE name=? AND slug<>?").run(slug, priceName, to, slug); if (r.changes) log.push(`slug 정리 ${to} → ${slug}`); }
  });
  tx();
  return log;
}

// 2026-10-07 재현: 법인회원권 시세표 중복 통합(기준 동아회원권 종목명). "X"와 "X (법인)"처럼 같은 종목이 두 줄이던 것을 한 줄로,
// 법인 시세 값은 "(법인)" 행 것을 쓰고 이력은 합친다. 4WELL(20000/25000/VIP)처럼 구좌가 다른 상품은 그대로 둔다.
// 시세 가져오기(importHanamarket 등) 뒤에 실행해야 하므로 server.js에서 별도로 호출. 멱등.
function mergeCorporate(file) {
  const fs = require('fs'); if (!fs.existsSync(file)) return [];
  const j = JSON.parse(fs.readFileSync(file, 'utf8')); const log = [];
  const get = db.prepare("SELECT * FROM prices WHERE category='corporate' AND name=?");
  const moveHist = db.prepare('INSERT OR IGNORE INTO price_history (price_id, date, value) SELECT ?, date, value FROM price_history WHERE price_id=?');
  const del = db.prepare('DELETE FROM prices WHERE id=?'); const delHist = db.prepare('DELETE FROM price_history WHERE price_id=?');
  const tx = db.transaction(() => {
    for (const g of j.groups || []) {
      const rows = g.drop.map(n => get.get(n)).filter(Boolean); if (rows.length < 2 && !(rows.length === 1 && rows[0].name !== g.keep)) continue;
      const target = rows.find(r => r.name === g.price) || rows.find(r => /\(법인\)/.test(r.name)) || rows[0];
      for (const r of rows) { if (r.id === target.id) continue; moveHist.run(target.id, r.id); delHist.run(r.id); del.run(r.id); }
      // 남는 행 보강: 회원수·지역·시설 정보는 비어 있으면 다른 행 것을 쓴다
      const other = rows.filter(r => r.id !== target.id);
      const pick = (k) => target[k] || (other.find(r => r[k]) || {})[k] || null;
      db.prepare('UPDATE prices SET name=?, members=?, region=?, info_json=COALESCE(NULLIF(info_json,\'\'), ?), old_id=COALESCE(NULLIF(old_id,\'\'), ?), updated_at=? WHERE id=?').run(g.keep, pick('members'), pick('region') || '', pick('info_json') || '', pick('old_id') || '', now(), target.id);
      log.push(`법인 통합 ${g.keep}(${rows.length}→1)`);
    }
    for (const n of j.singles || []) { const r = get.get(n); if (!r) continue; const nn = n.replace(/\s*\(법인\)\s*$/, '').trim(); if (get.get(nn)) continue; db.prepare('UPDATE prices SET name=?, updated_at=? WHERE id=?').run(nn, now(), r.id); log.push(`법인 이름 정리 ${n} → ${nn}`); }
  });
  tx();
  return log;
}

module.exports = { run, mergeCorporate, REDIRECTS, DELETE_CLUBS, DELETE_PRICES, RENAME_PRICES, RENAME_CLUBS };
