'use strict';
// SQLite 초기화 — DATA_DIR(Railway Volume) 아래 hana.db
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { now } = require('./lib/util');

// DATA_DIR(Railway Volume 등)이 지정되면 그 경로를 만들어 쓰고, 없으면 프로젝트 ./data
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'reports'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'hana.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL, name TEXT,
  created_at INTEGER NOT NULL, last_login INTEGER
);

-- 시세 (현재값) : category = golf | corporate | condo | fitness
CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  today INTEGER,            -- 만원
  prev INTEGER,             -- 만원
  members INTEGER,
  note TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(category, name)
);
CREATE INDEX IF NOT EXISTS idx_prices_cat ON prices(category);

-- 시세 이력 (일자별 스냅샷)
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_id INTEGER NOT NULL REFERENCES prices(id) ON DELETE CASCADE,
  date TEXT NOT NULL,       -- YYYY-MM-DD (KST)
  value INTEGER,
  UNIQUE(price_id, date)
);

-- 시세 업로드 이력
CREATE TABLE IF NOT EXISTS price_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT, rows INTEGER, inserted INTEGER, updated INTEGER,
  by_admin TEXT, created_at INTEGER NOT NULL, detail TEXT
);

-- 골프장(종목) 소개 페이지
CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  region TEXT, address TEXT, holes INTEGER, opened TEXT, type TEXT,
  summary TEXT,              -- 한 줄 요약 (BLUF)
  body_html TEXT,            -- 서술형 해설
  faq_json TEXT,             -- [{q,a}]
  fit_for TEXT,              -- 적합 매수자
  booking TEXT,              -- 부킹 특징
  transfer TEXT,             -- 입회·명의개서 조건
  price_name TEXT,           -- prices.name 매핑(시세 자동 연결)
  status TEXT NOT NULL DEFAULT 'published', -- draft|published
  ai_generated INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,      -- 기본정보(홀수·주소) 담당자 검증 여부
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- 매물
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,   -- golf|condo|fitness|sale|tour
  title TEXT NOT NULL, name TEXT, region TEXT,
  price INTEGER, kind TEXT, -- kind: 매도|매수|분양|투어
  body TEXT, status TEXT NOT NULL DEFAULT 'open', -- open|closed
  featured INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- 게시글: 블로그(콘텐츠)·공지·뉴스
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'blog', -- blog|notice|news
  type TEXT,                          -- blog 유형: club|report|guide|trend
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT, meta_description TEXT,
  body_html TEXT NOT NULL,
  tags TEXT,                          -- comma
  author TEXT DEFAULT '하나회원권거래소 편집팀',
  status TEXT NOT NULL DEFAULT 'draft', -- draft|published
  source TEXT DEFAULT 'manual',       -- manual|ai|template
  model TEXT, gen_slot TEXT, source_urls TEXT,
  inblog_id TEXT, inblog_status TEXT, inblog_error TEXT, inblog_url TEXT,
  published_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_kind ON posts(kind, status, published_at);

-- 자동 생성 주제 풀
CREATE TABLE IF NOT EXISTS topic_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,      -- club|report|guide|trend
  topic TEXT NOT NULL, hint TEXT, weight INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1, last_used INTEGER, use_count INTEGER DEFAULT 0
);

-- 자동 생성 실행 (멱등)
CREATE TABLE IF NOT EXISTS gen_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL, slot TEXT NOT NULL,
  status TEXT, post_id INTEGER, detail TEXT, created_at INTEGER NOT NULL,
  UNIQUE(run_date, slot)
);

-- 문의(매매신청·상담)
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,      -- buy|sell|consult
  category TEXT, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  item TEXT, budget TEXT, message TEXT, agree INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'new', -- new|contacted|done
  memo TEXT, ip TEXT, ua TEXT, referrer TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- 페이지뷰(경량 자체 통계) — 일자·경로·봇 분류별 집계
CREATE TABLE IF NOT EXISTS pageviews (
  date TEXT NOT NULL, path TEXT NOT NULL, agent TEXT NOT NULL, -- agent: human|ai-bot|search-bot|other-bot
  bot_name TEXT, ref_host TEXT, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(date, path, agent, bot_name, ref_host)
);

-- 4주 실행계획 체크리스트
CREATE TABLE IF NOT EXISTS plan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week INTEGER NOT NULL, title TEXT NOT NULL, owner TEXT, auto_key TEXT,
  done INTEGER DEFAULT 0, done_at INTEGER, note TEXT, sort INTEGER DEFAULT 0
);

-- 주간 리포트
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week INTEGER NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'weekly', -- weekly|monthly|baseline
  title TEXT, html TEXT, json TEXT, docx_path TEXT,
  created_at INTEGER NOT NULL, UNIQUE(kind, week)
);

-- 기술 점검 결과(자체 감사) 이력
CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, score INTEGER, json TEXT, created_at INTEGER NOT NULL
);

-- 유튜브 영상 (VideoObject)
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id TEXT UNIQUE NOT NULL, title TEXT NOT NULL, description TEXT,
  published TEXT, sort INTEGER DEFAULT 0, created_at INTEGER NOT NULL
);
`);

// ── settings helpers ──
const getStmt = db.prepare('SELECT value FROM settings WHERE key=?');
const setStmt = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
function getSetting(key, def = '') { const r = getStmt.get(key); return r ? r.value : def; }
function setSetting(key, val) { setStmt.run(key, val == null ? '' : String(val)); }
function allSettings() { const o = {}; for (const r of db.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value; return o; }

// ── 최초 관리자 ──
if (db.prepare('SELECT COUNT(*) c FROM admins').get().c === 0) {
  const id = process.env.ADMIN_ID || 'admin';
  const pw = process.env.ADMIN_PW || 'hana1234!';
  db.prepare('INSERT INTO admins (login_id,pw_hash,name,created_at) VALUES (?,?,?,?)')
    .run(id, bcrypt.hashSync(pw, 10), '관리자', now());
  console.log(`[db] 최초 관리자 생성: ${id} (비밀번호는 로그인 후 변경하세요)`);
}

module.exports = { db, DATA_DIR, getSetting, setSetting, allSettings };
