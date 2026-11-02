'use strict';
// 골프장 페이지의 '회원권 세부 정보'·'개인/법인 회원권 정보' 영역만 캡처(전후 비교용)
// 실행: node scripts/clubshot.js <골프장 slug> <저장 경로.png> [기준 주소=http://127.0.0.1:3000]
const { launch } = require('../lib/screenshot');
const [,, slug, out, base = 'http://127.0.0.1:3000'] = process.argv;
(async () => {
  const b = await launch(); const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
  await p.goto(base + '/golf/' + encodeURIComponent(slug), { waitUntil: 'networkidle2' });
  await p.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')));
  const el = await p.$('#member-info') || await p.$('main'); const d = await p.$('#detail');
  const b1 = await (d || el).boundingBox(), b2 = await el.boundingBox(); const sy = await p.evaluate(() => scrollY);
  const top = Math.min(b1.y, b2.y) + sy;
  await p.screenshot({ path: out, clip: { x: 0, y: Math.max(0, top - 40), width: 1280, height: Math.min(1600, b2.y + b2.height - Math.min(b1.y, b2.y) + 80) }, captureBeyondViewport: true });
  console.log('saved', out, !!d); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
