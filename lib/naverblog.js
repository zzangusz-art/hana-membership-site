'use strict';
// 네이버 블로그 RSS(https://rss.blog.naver.com/<id>.xml) 최신 글을 홈·블로그 목록에 노출. 메모리 캐시(1시간) + 설정 캐시(재시작 대비).
const { getSetting, setSetting } = require('../db');
const settings = require('./settings');

let MEM = { at: 0, items: [], loading: null };
const TTL = 3600e3;

function blogId() { const m = String(settings.cfg('naver_blog') || '').match(/blog\.naver\.com\/([A-Za-z0-9_-]+)/); return m ? m[1] : ''; }
function rssUrl() { const id = blogId(); return id ? `https://rss.blog.naver.com/${id}.xml` : ''; }
function cdata(t) { return String(t || '').replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim(); }
function strip(t) { return cdata(t).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim(); }

function parse(xml) {
  const out = [];
  for (const it of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const g = (tag) => { const m = it.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1] : ''; };
    const title = strip(g('title')); let link = cdata(g('link')).replace(/[?&]fromRss.*$/i, '').replace(/\?.*$/, '');
    const pub = g('pubDate'); const d = pub ? new Date(pub) : null;
    const desc = strip(g('description')).slice(0, 140);
    if (title && link) out.push({ title, link, date: d && !isNaN(d) ? d.toISOString().slice(0, 10) : '', desc });
  }
  // 같은 제목 연속 중복(수정 재발행) 제거
  const seen = new Set(); return out.filter(x => (seen.has(x.title) ? false : (seen.add(x.title), true)));
}

async function refresh() {
  const url = rssUrl(); if (!url) { MEM = { at: Date.now(), items: [], loading: null }; return []; }
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (hana-site rss reader)' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const items = parse(await r.text()).slice(0, 12);
  MEM = { at: Date.now(), items, loading: null };
  setSetting('naverblog_cache', JSON.stringify({ at: MEM.at, items }));
  return items;
}
// 동기 호출용: 캐시를 즉시 돌려주고, 오래됐으면 백그라운드 갱신
function cached(n = 6) {
  if (!MEM.items.length && !MEM.at) { try { const c = JSON.parse(getSetting('naverblog_cache', '') || 'null'); if (c && Array.isArray(c.items)) MEM = { at: c.at || 0, items: c.items, loading: null }; } catch (_) { /* no-op */ } }
  if (Date.now() - MEM.at > TTL && !MEM.loading) { MEM.loading = refresh().catch(e => { console.error('[naverblog]', e.message); MEM.at = Date.now() - TTL + 600e3; }).finally(() => { MEM.loading = null; }); }
  return MEM.items.slice(0, n);
}
async function latest(n = 6) { if (Date.now() - MEM.at > TTL) { try { await refresh(); } catch (e) { console.error('[naverblog]', e.message); } } return cached(n); }
function status() { return { blogId: blogId(), rss: rssUrl(), cachedAt: MEM.at ? new Date(MEM.at).toISOString() : null, count: MEM.items.length }; }

module.exports = { parse, refresh, cached, latest, status, blogId, rssUrl };
