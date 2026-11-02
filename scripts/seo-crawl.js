'use strict';
// 운영 사이트맵 전체 주소 SEO·AEO 점검 — 상태·제목·설명문·H1·canonical·구조화 데이터·본문 분량·이미지 alt·내부 링크
// 실행: node scripts/seo-crawl.js [https://hanamember.co.kr] → ../측정/SEO점검_<날짜>.json + 요약 출력
const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'https://hanamember.co.kr';
const UA = 'Mozilla/5.0 (compatible; hana-site seo-audit; +https://hanamember.co.kr)';
const DATE = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const strip = (s) => String(s || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (h, re) => { const m = h.match(re); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : ''; };
async function get(u) { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(30000) }); return { status: r.status, loc: r.headers.get('location') || '', text: r.status === 200 ? await r.text() : '' }; } catch (e) { if (i === 2) return { status: 0, text: '', err: e.message }; await new Promise(r => setTimeout(r, 1500)); } } }

(async () => {
  const sm = (await get(BASE + '/sitemap.xml')).text; let urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (/<sitemapindex/.test(sm)) { const subs = urls; urls = []; for (const s of subs) urls.push(...[...(await get(s)).text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])); }
  const rows = []; let i = 0;
  const worker = async () => { while (i < urls.length) { const u = urls[i++]; const r = await get(u); const h = r.text;
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => { try { const j = JSON.parse(m[1]); return [].concat(j['@graph'] || j).map(x => [].concat(x['@type']).join('/')).join(','); } catch (_) { return 'INVALID'; } });
    const main = (h.match(/<main[\s\S]*<\/main>/) || [h])[0];
    const imgs = [...main.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    rows.push({ url: u.replace(BASE, ''), status: r.status, loc: r.loc,
      title: attr(h, /<title>([^<]*)<\/title>/), desc: attr(h, /<meta name="description" content="([^"]*)"/),
      h1: [...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => strip(m[1])), canonical: attr(h, /<link rel="canonical" href="([^"]*)"/),
      robots: attr(h, /<meta name="robots" content="([^"]*)"/), ld, text: strip(main).length,
      imgNoAlt: imgs.filter(t => !/\balt="[^"]+"/.test(t)).length, imgs: imgs.length,
      links: [...main.matchAll(/href="(\/[^"#?]*)/g)].map(m => m[1]) });
    if (rows.length % 100 === 0) process.stdout.write(rows.length + ' '); } };
  await Promise.all(Array.from({ length: 6 }, worker));
  const out = path.join(__dirname, '..', '..', '측정', `SEO점검_${DATE}.json`); fs.writeFileSync(out, JSON.stringify(rows));
  // 요약
  const ok = rows.filter(r => r.status === 200); const by = (k) => { const m = new Map(); for (const r of ok) { const v = r[k]; if (!v) continue; m.set(v, (m.get(v) || []).concat(r.url)); } return [...m].filter(([, v]) => v.length > 1); };
  const sec = (u) => '/' + (u.split('/')[1] || '');
  const inbound = new Map(); for (const r of ok) for (const l of new Set(r.links)) inbound.set(l, (inbound.get(l) || 0) + 1);
  const S = {
    total: rows.length, status: rows.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {}),
    titleLen: { over60: ok.filter(r => r.title.length > 60).length, under15: ok.filter(r => r.title.length < 15).length },
    descLen: { missing: ok.filter(r => !r.desc).length, over160: ok.filter(r => r.desc.length > 160).length, under50: ok.filter(r => r.desc && r.desc.length < 50).length },
    dupTitle: by('title').length, dupDesc: by('desc').length,
    h1: { none: ok.filter(r => !r.h1.length).length, multi: ok.filter(r => r.h1.length > 1).length },
    canonicalMismatch: ok.filter(r => r.canonical && r.canonical.replace(/\/$/, '') !== (BASE + r.url).replace(/\/$/, '')).length,
    noindex: ok.filter(r => /noindex/.test(r.robots)).length, ldInvalid: ok.filter(r => r.ld.includes('INVALID')).length, noLd: ok.filter(r => !r.ld.length).length,
    thin: ok.filter(r => r.text < 600).length, imgNoAlt: ok.reduce((a, r) => a + r.imgNoAlt, 0),
    orphans: ok.filter(r => !inbound.get(r.url) && r.url !== '/').length,
    bySection: Object.fromEntries([...new Set(ok.map(r => sec(r.url)))].map(s => { const g = ok.filter(r => sec(r.url) === s); return [s, { n: g.length, thin: g.filter(r => r.text < 600).length, noFaq: g.filter(r => !r.ld.join(',').includes('FAQPage')).length, descOver: g.filter(r => r.desc.length > 160).length }]; })),
  };
  fs.writeFileSync(out.replace('.json', '_요약.json'), JSON.stringify({ S, dupTitle: by('title').slice(0, 40), dupDesc: by('desc').slice(0, 40) }, null, 1));
  console.log('\n' + JSON.stringify(S, null, 1));
})().catch(e => { console.error(e); process.exitCode = 1; });
