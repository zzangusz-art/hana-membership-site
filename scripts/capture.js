'use strict';
// 전후 스크린샷 캡처 CLI
//   node scripts/capture.js before                      → 구 사이트(hanamarket.co.kr) → data/seed/screenshots/before/
//   node scripts/capture.js after [baseUrl]             → 신규 사이트(기본 http://127.0.0.1:3000) → data/screenshots/<오늘>/ (+관리자 화면)
//   node scripts/capture.js compare [outDir]            → 최신 전후 세트를 좌우 합성 PNG로 생성
require('dotenv').config();
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs');
const path = require('path');
const shot = require('../lib/screenshot');
const { kstDate } = require('../lib/util');

const mode = process.argv[2] || 'after';
(async () => {
  if (!shot.available()) { console.error('크롬/크로미움을 찾지 못했습니다. PUPPETEER_EXECUTABLE_PATH를 설정하세요.'); process.exit(1); }
  if (mode === 'before') {
    const base = process.argv[3] || 'https://www.hanamarket.co.kr';
    const outDir = path.join(__dirname, '..', 'data', 'seed', 'screenshots', 'before');
    const r = await shot.captureSet({ base, side: 'before', outDir });
    console.log(`before: ${r.files.length}장 → ${outDir}`); r.errors.forEach(e => console.error(' !', e));
  } else if (mode === 'after') {
    const base = process.argv[3] || `http://127.0.0.1:${process.env.PORT || 3000}`;
    let cookie = null;
    try {
      const r = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: process.env.ADMIN_ID || 'admin', pw: process.env.ADMIN_PW || 'hana1234!' }) });
      const sc = r.headers.get('set-cookie') || ''; const m = sc.match(/hana_admin=([^;]+)/); cookie = m ? m[1] : null;
    } catch (_) { /* 관리자 캡처 생략 */ }
    const outDir = path.join(shot.SHOT_DIR, kstDate());
    const r = await shot.captureSet({ base, side: 'after', outDir, adminCookie: cookie, adminBase: base });
    console.log(`after: ${r.files.length}장 → ${outDir}`); r.errors.forEach(e => console.error(' !', e));
  } else if (mode === 'compare') {
    const { pairs } = shot.pairs();
    console.log(JSON.stringify(pairs.map(p => ({ key: p.key, before: !!p.before, after: !!p.after })), null, 1));
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
