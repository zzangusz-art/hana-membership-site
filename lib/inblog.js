'use strict';
// 인블로그(inblog.ai) REST API 연동 — JSON:API 규격. Team 플랜 이상 API 키 필요.
// 참고: @inblog/cli SDK 소스에서 확인한 엔드포인트: POST /api/v1/posts, PATCH /api/v1/posts/{id}, PATCH /api/v1/posts/{id}/publish
const { getSetting } = require('../db');

const BASE = 'https://inblog.ai';
function apiKey() { return process.env.INBLOG_API_KEY || getSetting('inblog_api_key') || ''; }
function enabled() { return !!apiKey(); }

async function call(method, path, body) {
  const r = await fetch(BASE + '/api' + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/vnd.api+json', Accept: 'application/vnd.api+json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (_) { /* no-op */ }
  if (!r.ok) {
    const msg = json?.errors?.map(e => `${e.title}${e.detail ? ': ' + e.detail : ''}`).join('; ') || text.slice(0, 300);
    const err = new Error(`inblog ${r.status}: ${msg}`); err.status = r.status; throw err;
  }
  return json;
}
function flat(res) { const d = res?.data; if (!d) return null; return { id: d.id, ...(d.attributes || {}) }; }

async function me() { return flat(await call('GET', '/v1/blogs/me')); }

// post: {title, slug, content_html, meta_description, description, canonical_url, published, published_at}
async function createPost(post) {
  const attributes = {
    title: post.title, slug: post.slug, content_html: post.content_html,
    description: post.description || post.meta_description || '',
    meta_title: post.meta_title || post.title, meta_description: post.meta_description || '',
    canonical_url: post.canonical_url || undefined,
    published: !!post.published,
  };
  if (post.cta_text) { attributes.cta_text = post.cta_text; attributes.cta_link = post.cta_link; }
  if (post.json_ld) attributes.custom_scripts = { json_ld_script: post.json_ld };
  return flat(await call('POST', '/v1/posts', { data: { type: 'posts', attributes } }));
}
async function updatePost(id, attributes) { return flat(await call('PATCH', `/v1/posts/${id}`, { data: { type: 'posts', id: String(id), attributes } })); }
async function publish(id) { return flat(await call('PATCH', `/v1/posts/${id}/publish`, { data: { type: 'publish_action', attributes: { action: 'publish' } } })); }
async function unpublish(id) { return flat(await call('PATCH', `/v1/posts/${id}/publish`, { data: { type: 'publish_action', attributes: { action: 'unpublish' } } })); }
async function schedule(id, at) { return flat(await call('PATCH', `/v1/posts/${id}/publish`, { data: { type: 'publish_action', attributes: { action: 'schedule', published_at: at } } })); }
async function listPosts(params = {}) { const q = new URLSearchParams(params).toString(); const res = await call('GET', '/v1/posts' + (q ? '?' + q : '')); return (res?.data || []).map(d => ({ id: d.id, ...(d.attributes || {}) })); }

function postUrl(blog, slug) {
  if (!blog) return '';
  const host = blog.custom_domain_verified && blog.custom_domain ? `https://${blog.custom_domain}` : `https://${blog.subdomain}.inblog.io`;
  return `${host}/${slug}`;
}

module.exports = { enabled, apiKey, me, createPost, updatePost, publish, unpublish, schedule, listPosts, postUrl };
