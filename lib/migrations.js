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

module.exports = { run, REDIRECTS, DELETE_CLUBS, DELETE_PRICES, RENAME_PRICES, RENAME_CLUBS };
