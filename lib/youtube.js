'use strict';
// 유튜브 채널 최신 영상(공개 RSS) — 관리자 「수동 실행」에서 새 영상을 골라 홈페이지 영상 목록에 추가할 때 사용(2026-11-17)
const { db, getSetting } = require('../db');

const DEFAULT_CHANNEL = 'UCq3d-PD77ToeSCxg_27rZgA'; // 하나회원권TV(@hanamarket)
const channelId = () => String(getSetting('youtube_channel_id', '') || DEFAULT_CHANNEL).trim();
const unesc = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function parse(xml) {
  return [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
    const e = m[1]; const g = (re) => { const x = e.match(re); return x ? unesc(x[1]).trim() : ''; };
    return { youtube_id: g(/<yt:videoId>([^<]+)<\/yt:videoId>/), title: g(/<title>([^<]*)<\/title>/), published: g(/<published>([^<]+)<\/published>/).slice(0, 10), description: g(/<media:description>([\s\S]*?)<\/media:description>/).slice(0, 500) };
  }).filter(v => v.youtube_id);
}

// 최신 영상 목록 + 이미 홈페이지에 있는지 표시
async function latest() {
  const id = channelId();
  const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(id), { headers: { 'User-Agent': 'Mozilla/5.0 (hana-site)' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('유튜브 채널을 읽지 못했습니다(HTTP ' + r.status + ')');
  const have = new Set(db.prepare('SELECT youtube_id FROM videos').all().map(v => v.youtube_id));
  return { channelId: id, items: parse(await r.text()).map(v => ({ ...v, added: have.has(v.youtube_id) })) };
}

module.exports = { latest, parse, channelId };
