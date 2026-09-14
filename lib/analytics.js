'use strict';
// 경량 자체 통계: 일자·경로·에이전트(사람/AI봇/검색봇)별 카운트.
// AI 답변엔진 크롤러 방문은 GEO 진행 지표라 별도 집계한다.
const { db } = require('../db');
const { kstDate } = require('./util');

const AI_BOTS = [
  ['GPTBot', 'GPTBot'], ['OAI-SearchBot', 'OAI-SearchBot'], ['ChatGPT-User', 'ChatGPT-User'],
  ['PerplexityBot', 'PerplexityBot'], ['Perplexity-User', 'Perplexity-User'],
  ['ClaudeBot', 'ClaudeBot'], ['Claude-User', 'Claude-User'], ['Claude-SearchBot', 'Claude-SearchBot'], ['anthropic-ai', 'anthropic-ai'],
  ['Google-Extended', 'Google-Extended'], ['GoogleOther', 'GoogleOther'], ['Amazonbot', 'Amazonbot'],
  ['Applebot-Extended', 'Applebot-Extended'], ['Bytespider', 'Bytespider'], ['CCBot', 'CCBot'], ['cohere-ai', 'cohere-ai'],
  ['meta-externalagent', 'Meta'], ['DuckAssistBot', 'DuckAssistBot'], ['YouBot', 'YouBot'], ['MistralAI-User', 'MistralAI'],
];
const SEARCH_BOTS = [
  ['Googlebot', 'Googlebot'], ['bingbot', 'Bingbot'], ['Yeti', 'Naver Yeti'], ['NaverBot', 'Naver'], ['Daum', 'Daum'], ['Applebot', 'Applebot'], ['DuckDuckBot', 'DuckDuckBot'], ['YandexBot', 'Yandex'],
];

function classify(ua = '') {
  for (const [k, name] of AI_BOTS) if (ua.includes(k)) return { agent: 'ai-bot', bot: name };
  for (const [k, name] of SEARCH_BOTS) if (ua.includes(k)) return { agent: 'search-bot', bot: name };
  if (/bot|crawl|spider|slurp|fetch|curl|wget|python-requests|axios|node-fetch|Go-http/i.test(ua)) return { agent: 'other-bot', bot: 'other' };
  return { agent: 'human', bot: '' };
}

const upsert = db.prepare(`INSERT INTO pageviews (date,path,agent,bot_name,ref_host,count) VALUES (?,?,?,?,?,1)
  ON CONFLICT(date,path,agent,bot_name,ref_host) DO UPDATE SET count=count+1`);

function refHost(ref) {
  try { if (!ref) return ''; const h = new URL(ref).hostname.replace(/^www\./, ''); return h.slice(0, 80); } catch (_) { return ''; }
}

function middleware(req, res, next) {
  res.on('finish', () => {
    try {
      if (req.method !== 'GET') return;
      if (res.statusCode >= 400) return;
      const p = req.path;
      if (/^\/(admin|api|healthz|css|js|img|fonts|favicon)/.test(p) || /\.(png|jpg|jpeg|gif|svg|ico|css|js|map|woff2?|xml|txt|json|webmanifest)$/.test(p)) return;
      const { agent, bot } = classify(req.headers['user-agent'] || '');
      upsert.run(kstDate(), p.slice(0, 160), agent, bot, refHost(req.headers.referer || req.headers.referrer));
    } catch (_) { /* 통계는 실패해도 서비스에 영향 없음 */ }
  });
  next();
}

function summary(from, to) {
  const rows = db.prepare('SELECT agent, bot_name, SUM(count) c FROM pageviews WHERE date>=? AND date<=? GROUP BY agent, bot_name ORDER BY c DESC').all(from, to);
  const byAgent = {}; const aiBots = {}; const searchBots = {};
  for (const r of rows) {
    byAgent[r.agent] = (byAgent[r.agent] || 0) + r.c;
    if (r.agent === 'ai-bot') aiBots[r.bot_name] = r.c;
    if (r.agent === 'search-bot') searchBots[r.bot_name] = r.c;
  }
  const topPages = db.prepare("SELECT path, SUM(count) c FROM pageviews WHERE date>=? AND date<=? AND agent='human' GROUP BY path ORDER BY c DESC LIMIT 10").all(from, to);
  const topRefs = db.prepare("SELECT ref_host, SUM(count) c FROM pageviews WHERE date>=? AND date<=? AND agent='human' AND ref_host<>'' GROUP BY ref_host ORDER BY c DESC LIMIT 10").all(from, to);
  const daily = db.prepare("SELECT date, SUM(CASE WHEN agent='human' THEN count ELSE 0 END) human, SUM(CASE WHEN agent='ai-bot' THEN count ELSE 0 END) ai, SUM(CASE WHEN agent='search-bot' THEN count ELSE 0 END) search FROM pageviews WHERE date>=? AND date<=? GROUP BY date ORDER BY date").all(from, to);
  return { byAgent, aiBots, searchBots, topPages, topRefs, daily };
}

module.exports = { middleware, classify, summary };
