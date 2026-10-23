'use strict';
// 구 하나회원권 사이트 시세 → data/seed/legacy-prices.json (운영 서버는 구 사이트 접속이 막혀 있어 국내 PC에서 실행)
// 법인 전 종목·동아 미연결 골프·콘도·피트니스. 운영은 배포(푸시) 때 lib/hanamarket.js importSeed 로 반영.
// 실행: node scripts/legacy-export.js [--push]   (--push: 바뀐 경우 커밋·푸시까지)
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const hm = require('../lib/hanamarket'); const { kstDate } = require('../lib/util');
const OUT = path.join(__dirname, '..', 'data', 'seed', 'legacy-prices.json');
(async () => {
  const date = kstDate(); const items = {}; const summary = [];
  for (const cat of ['corporate', 'golf', 'condo', 'fitness']) {
    const p = await hm.plan(cat); if (p.error) throw new Error(cat + ': ' + p.error);
    items[cat] = Object.fromEntries(p.matched.map(m => [m.ours, m.today]).sort((a, b) => a[0].localeCompare(b[0])));
    summary.push(`${cat} ${p.matched.length}`);
  }
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const same = prev && JSON.stringify(prev.items) === JSON.stringify(items);
  if (same) { console.log('변동 없음 —', summary.join(' · ')); return; }
  fs.writeFileSync(OUT, JSON.stringify({ date, note: '구 하나회원권 사이트(hanamarket.co.kr) 시세 — scripts/legacy-export.js', items }, null, 1) + '\n');
  console.log('저장', OUT, '—', summary.join(' · '));
  if (process.argv.includes('--push')) {
    const cwd = path.join(__dirname, '..'); const git = (...a) => execFileSync('git', a, { cwd, stdio: 'inherit' });
    git('add', 'data/seed/legacy-prices.json'); git('commit', '-q', '-m', `data: 구 사이트 시세 반영(${date})`); git('push', '-q', 'origin', 'main');
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
