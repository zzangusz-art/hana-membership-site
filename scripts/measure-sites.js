'use strict';
// 구·신 사이트 홈 실측(같은 PC·같은 시점) → 측정/월간_<날짜>.json 의 old/new/sitemapNew 갱신
// 기존 파일이 있으면 notes·next·asks 등 손으로 쓴 항목은 그대로 둔다.
// 실행: node scripts/measure-sites.js [YYYY-MM-DD]
process.env.DISABLE_SCHEDULER = '1';
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const PROJ = path.join(ROOT, '..');
const shot = require(ROOT + '/lib/screenshot');
const DATE = process.argv[2] || require(ROOT + '/lib/util').kstDate();
const OLD = 'https://www.hanamarket.co.kr/'; const NEW = 'https://hanamember.co.kr/';

async function measure(browser, url) {
  const loads = []; let info = null;
  for (let i = 0; i < 2; i++) {
    const p = await browser.newPage(); await p.setViewport({ width: 1440, height: 900 });
    await p.setCacheEnabled(false);
    const t0 = Date.now(); await p.goto(url, { waitUntil: 'load', timeout: 90000 }); loads.push(Date.now() - t0);
    if (!info) info = await p.evaluate(() => {
      const m = (s) => (document.querySelector(s) || {}).content || '';
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { const j = JSON.parse(s.textContent); return [].concat(j['@graph'] || j).map(x => [].concat(x['@type']).join(',')).join(','); } catch (_) { return '?'; } });
      const imgs = [...document.images];
      return { title: document.title.trim(), desc: m('meta[name="description"]'), h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim().replace(/\s+/g, ' ')), ld,
        viewport: !!document.querySelector('meta[name="viewport"]'), canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '', og: !!document.querySelector('meta[property="og:title"]'),
        textLen: document.body.innerText.replace(/\s+/g, '').length, links: document.links.length, imgsNoAlt: imgs.filter(i => !(i.getAttribute('alt') || '').trim()).length, imgs: imgs.length };
    });
    await p.close();
  }
  return { ...info, loadMs: Math.round(loads.reduce((a, b) => a + b, 0) / loads.length) };
}

(async () => {
  const file = path.join(PROJ, '측정', `월간_${DATE}.json`);
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const b = await shot.launch();
  const old = await measure(b, OLD); const neu = await measure(b, NEW); await b.close();
  const sm = await (await fetch(NEW + 'sitemap.xml')).text();
  const locs = (sm.match(/<loc>/g) || []).length;
  // 사이트맵 인덱스면 하위 사이트맵까지 센다
  let sitemapNew = locs;
  if (/<sitemapindex/.test(sm)) { sitemapNew = 0; for (const u of [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])) sitemapNew += ((await (await fetch(u)).text()).match(/<url>/g) || []).length; }
  const out = { ...prev, measuredAt: DATE, old, new: neu, sitemapNew };
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`old ${old.loadMs}ms · new ${neu.loadMs}ms · sitemap ${sitemapNew} → ${file}`);
})().catch(e => { console.error(e); process.exit(1); });
