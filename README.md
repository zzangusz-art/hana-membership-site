# (주)하나회원권거래소 홈페이지 + 관리자

골프·법인·콘도·피트니스 회원권 시세와 매매 상담을 위한 신규 홈페이지. SEO·AEO·GEO 최적화, 콘텐츠 자동발행(인블로그 연동), 주간 리포트 자동 생성이 내장된 단일 Node 앱.

- 공개 사이트: `/` 홈 · `/market/{golf|corporate|condo|fitness}` 시세표 · `/golf` 골프장 소개 · `/guide/*` 회원권 안내 · `/faq` · `/listings` 매물 · `/exclusive/*` 전용관 · `/apply` 매매 신청 · `/blog` 시세 리포트·가이드 · `/notice` `/news` `/videos` · `/about*`
- 관리자: `/admin` (시세 엑셀 업로드 · 골프장 소개 · 콘텐츠 · 자동발행 · 매물 · 문의 · 4주 계획 · 리포트 · 기술 감사 · 설정)
- SEO 파일: `/sitemap.xml` `/robots.txt` `/llms.txt` `/llms-full.txt` `/rss.xml` · 공개 API `/api/prices/{category}`

## 실행

```bash
npm install
cp .env.example .env   # JWT_SECRET, ADMIN_PW 등 수정
npm start              # http://localhost:3000  (관리자 /admin, 기본 admin / hana1234!)
npm run smoke          # 런타임 스모크 테스트(임시 포트·임시 DB)
```

첫 실행 시 `data/seed/*.json`으로 시세 105종목·골프장 64개·주제 24개·4주 계획·가이드 6편·공지 1건을 자동 시드합니다(비어 있을 때만).

## 배포 (Railway)

**일상 배포는 `deploy.bat` 더블클릭** — 스모크 테스트 → git 커밋·푸시 → `railway up` → healthz 커밋 확인까지 자동. 최초 1회는 `deploy-railway.bat`(프로젝트 생성·볼륨·환경변수).

1. GitHub 저장소 연결 → Railway 새 프로젝트(Nixpacks 자동 인식, Node 22).
2. **Volume 추가 → 마운트 경로 `/data`** (없으면 재배포마다 DB 초기화).
3. 환경변수: `DATA_DIR=/data`, `JWT_SECRET`, `ADMIN_ID`, `ADMIN_PW`, `SITE_URL=https://www.hanamarket.co.kr`(실제 도메인), 선택 `ANTHROPIC_API_KEY`(또는 OPENAI/GEMINI), `INBLOG_API_KEY`, `NAVER_SITE_VERIFICATION`, `GOOGLE_SITE_VERIFICATION`, `GA_MEASUREMENT_ID`.
4. 도메인 연결 후 관리자 → 설정에서 사이트 URL 확인(canonical·sitemap·JSON-LD가 이 값을 씁니다).
5. 구 사이트 URL(`/market/01`, `/company/03` 등)은 새 URL로 301 처리되어 검색 신호가 승계됩니다.

## 자동화

| 작업 | 시각(KST) | 내용 |
|---|---|---|
| 콘텐츠 자동발행 | 매일 09:00 · 15:00 (설정 변경 가능) | 유형 로테이션(가이드 40 / 골프장 소개 30 / 동향 20 / 시세 리포트 10, 월요일 첫 슬롯은 시세 리포트 고정). 발행 즉시 인블로그로 전송. LLM 키가 없으면 시세 리포트·골프장 소개(템플릿)만 발행 |
| 시세 스냅샷 | 매일 | 90일 추이·스파크라인용 이력 |
| 기술 감사 | 매일 07:00 | 진단보고서 실패 항목 15개 재점검 → 점수 |
| 주간 리포트 | 매주 월 08:30 | 지난주 실행계획 체크 + 콘텐츠·시세·문의·방문·AI 크롤러·감사 → HTML + DOCX |
| 월간 리포트 | 4주차 종료 다음 월요일 | 월간 종합 |

멱등: `gen_runs(run_date, slot)` UNIQUE — 서버가 여러 번 재시작돼도 같은 슬롯은 한 번만. 실패 시 같은 날 3회 재시도.

## 시세 엑셀 양식

관리자 → 시세 관리 → "현재 시세로 채운 양식 다운로드". 시트별(골프회원권·법인회원권·콘도회원권·피트니스회원권) 열: `회원권명 | 금일시세(만원) | 전일시세 | 회원수 | 지역 | 비고`. 헤더 이름은 유사어(종목/현재시세 등)도 인식. 업로드 전 미리보기 → 반영.

## 구조

```
server.js            엔트리(보안 헤더·정적·SEO 파일·301·라우트·자체감사 렌더러)
db.js                SQLite 스키마(DATA_DIR/hana.db)
lib/                 layout(SEO 레이아웃·JSON-LD) seo prices providers(LLM) inblog scheduler report audit analytics settings auth util
lib/content/         generate(생성 파이프라인) templates(시세 리포트·골프장 소개 템플릿)
routes/              pages-main(홈·시세·골프장) pages-info(안내·FAQ·전용관·매물·신청·회사) pages-content(블로그·공지·뉴스) api admin
public/              css/js, admin SPA, img(로고·아이콘·OG)
data/seed/           prices clubs topics plan faq articles
scripts/             seed smoke make-price-template
docs/                인블로그 세팅 가이드 · 운영 인수인계 · 4주 실행계획
```
