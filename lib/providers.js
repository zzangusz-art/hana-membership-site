'use strict';
// LLM Provider 추상화 — Claude / OpenAI / Gemini / OpenAI호환. 관리자에서 전환.
const Anthropic = require('@anthropic-ai/sdk');
const { getSetting } = require('../db');

const PROVIDERS = ['anthropic', 'openai', 'gemini', 'openai-compatible'];
const LABELS = { anthropic: 'Anthropic Claude', openai: 'OpenAI', gemini: 'Google Gemini', 'openai-compatible': 'OpenAI 호환(로컬·기타)' };
const DEFAULT_MODELS = { anthropic: 'claude-sonnet-5', openai: 'gpt-4o', gemini: 'gemini-2.5-flash', 'openai-compatible': '' };
const SUPPORTS_SEARCH = { anthropic: true, openai: true, gemini: true, 'openai-compatible': false };
const KEY_ENV = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', 'openai-compatible': 'OAI_COMPAT_API_KEY' };
const KEY_SETTING = { anthropic: 'anthropic_api_key', openai: 'openai_api_key', gemini: 'gemini_api_key', 'openai-compatible': 'oai_compat_api_key' };
const BASEURL_SETTING = { openai: 'openai_base_url', 'openai-compatible': 'oai_compat_base_url' };

function resolveKey(p) {
  if (process.env[KEY_ENV[p]]) return { key: process.env[KEY_ENV[p]], source: 'env' };
  const s = getSetting(KEY_SETTING[p]); if (s) return { key: s, source: 'db' };
  return { key: null, source: 'none' };
}
function getLlmConfig() {
  let provider = getSetting('llm_provider', '') || 'anthropic';
  // 선택 provider에 키가 없으면 키가 있는 provider로 자동 폴백
  if (!resolveKey(provider).key && provider !== 'openai-compatible') {
    const alt = PROVIDERS.find(p => p !== 'openai-compatible' && resolveKey(p).key);
    if (alt) provider = alt;
  }
  const model = getSetting('model_' + provider) || DEFAULT_MODELS[provider] || '';
  return { provider, model, apiKey: resolveKey(provider).key, baseUrl: BASEURL_SETTING[provider] ? getSetting(BASEURL_SETTING[provider]) : '', supportsSearch: !!SUPPORTS_SEARCH[provider], label: LABELS[provider] };
}
function llmAvailable() { const c = getLlmConfig(); return !!(c.apiKey || (c.provider === 'openai-compatible' && c.baseUrl && c.model)); }
function providerInfo() {
  const out = {};
  for (const p of PROVIDERS) { const { source } = resolveKey(p); out[p] = { label: LABELS[p], model: getSetting('model_' + p) || DEFAULT_MODELS[p], key_set: source !== 'none', key_source: source, supports_search: !!SUPPORTS_SEARCH[p], base_url: BASEURL_SETTING[p] ? getSetting(BASEURL_SETTING[p]) : '' }; }
  return out;
}

async function runAnthropic({ system, user, model, apiKey, webSearch }) {
  const a = new Anthropic({ apiKey });
  const req = { model, max_tokens: 6000, system, messages: [{ role: 'user', content: user }] };
  if (webSearch) req.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }];
  const resp = await a.messages.create(req);
  let text = ''; const sources = new Set();
  for (const b of resp.content || []) {
    if (b.type === 'text') text += b.text;
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r?.url) sources.add(r.url);
  }
  return { text, sources: [...sources] };
}
async function runOpenAI({ system, user, model, apiKey, baseUrl, webSearch }) {
  const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/responses';
  const body = { model, input: [{ role: 'system', content: system }, { role: 'user', content: user }], max_output_tokens: 6000 };
  if (webSearch) body.tools = [{ type: 'web_search_preview' }];
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json(); let text = ''; const sources = new Set();
  for (const it of d.output || []) if (it.type === 'message') for (const c of it.content || []) if (c.type === 'output_text') { text += c.text || ''; for (const an of c.annotations || []) if (an.url) sources.add(an.url); }
  if (!text && typeof d.output_text === 'string') text = d.output_text;
  return { text, sources: [...sources] };
}
async function runGemini({ system, user, model, apiKey, webSearch }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = { system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: 6000 } };
  if (webSearch) body.tools = [{ google_search: {} }];
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json(); const cand = (d.candidates || [])[0]; let text = ''; const sources = new Set();
  for (const p of cand?.content?.parts || []) if (p.text) text += p.text;
  for (const ch of cand?.groundingMetadata?.groundingChunks || []) if (ch?.web?.uri) sources.add(ch.web.uri);
  return { text, sources: [...sources] };
}
async function runCompat({ system, user, model, apiKey, baseUrl }) {
  if (!baseUrl) throw new Error('OpenAI 호환 provider는 Base URL이 필요합니다.');
  const headers = { 'Content-Type': 'application/json' }; if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const r = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 6000 }) });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json(); return { text: d.choices?.[0]?.message?.content || '', sources: [] };
}
async function runLLM(cfg, { system, user, webSearch = true }) {
  const ws = webSearch && cfg.supportsSearch;
  switch (cfg.provider) {
    case 'anthropic': return runAnthropic({ ...cfg, system, user, webSearch: ws });
    case 'openai': return runOpenAI({ ...cfg, system, user, webSearch: ws });
    case 'gemini': return runGemini({ ...cfg, system, user, webSearch: ws });
    default: return runCompat({ ...cfg, system, user });
  }
}

module.exports = { PROVIDERS, LABELS, DEFAULT_MODELS, KEY_SETTING, BASEURL_SETTING, getLlmConfig, llmAvailable, providerInfo, runLLM };
