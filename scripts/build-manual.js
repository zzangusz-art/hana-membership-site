// 업체 관리자용 어드민 사용설명서 → 단일 HTML(이미지 내장) + PDF
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/user/Desktop/하나회원권 홈페이지';
const SHOTS = process.env.MANUAL_SHOTS || path.join(__dirname, '..', '..', '측정', '스크린샷', 'manual');
const OUTDIR = path.join(ROOT, '문서'); fs.mkdirSync(OUTDIR, { recursive: true });
const shot = require(ROOT + '/hana-site/lib/screenshot');
const img = (f, cap) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(SHOTS, f)).toString('base64')}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`;
const DATE = '2026-10-06';
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하나회원권거래소 관리자 사용 설명서 (업체 관리자·직원용)</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{--navy:#0f1c36;--blue:#1f3a73;--green:#03a65a;--line:#dfe5ef;--muted:#5b6678}
*{box-sizing:border-box}body{font-family:Pretendard Variable,Pretendard,'Malgun Gothic',sans-serif;color:#1c2333;margin:0;font-size:11.5pt;line-height:1.65;word-break:keep-all}
.page{padding:0 2mm}
.cover{height:257mm;display:flex;flex-direction:column;justify-content:center;border-left:10px solid var(--navy);padding-left:14mm;page-break-after:always}
.cover .k{color:var(--green);font-weight:800;letter-spacing:.08em;font-size:12pt}.cover h1{font-size:30pt;margin:8px 0 6px;color:var(--navy);line-height:1.25}.cover .sub{font-size:14pt;color:var(--muted);margin-bottom:28px}
.cover .meta{font-size:10.5pt;color:var(--muted);line-height:1.9}.cover .meta b{color:#1c2333}
h2{font-size:18pt;color:var(--navy);border-bottom:3px solid var(--navy);padding-bottom:6px;margin:0 0 12px;page-break-after:avoid}
h2 small{font-size:10pt;color:var(--muted);font-weight:500;margin-left:8px}
h3{font-size:13pt;color:var(--blue);margin:18px 0 6px;page-break-after:avoid}
section{page-break-before:always;padding-top:4mm}section.first{page-break-before:auto}
p{margin:6px 0}ul,ol{margin:6px 0 6px 0;padding-left:22px}li{margin:3px 0}
table{width:100%;border-collapse:collapse;font-size:10.5pt;margin:8px 0}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef2f9;color:var(--navy)}
figure{margin:10px 0 14px;page-break-inside:avoid}figure img{width:100%;border:1px solid var(--line);border-radius:6px}figcaption{font-size:9.5pt;color:var(--muted);margin-top:4px}
.tip{background:#f3f7ff;border-left:4px solid var(--blue);padding:8px 12px;margin:10px 0;border-radius:0 6px 6px 0}.warn{background:#fff7e8;border-left:4px solid #d4a017;padding:8px 12px;margin:10px 0;border-radius:0 6px 6px 0}
.steps li{margin:5px 0}.kbd{display:inline-block;border:1px solid #b9c2d3;border-bottom-width:2px;border-radius:4px;padding:0 6px;font-size:10pt;background:#fff}
.toc li{margin:4px 0}.toc a{color:var(--navy);text-decoration:none}
.btn{display:inline-block;padding:1px 7px;border:1px solid #b9c2d3;border-radius:5px;font-size:10pt;background:#fff;font-weight:700;color:var(--navy)}
@page{size:A4;margin:16mm 14mm 16mm 14mm}
</style></head><body><div class="page">

<div class="cover"><div class="k">HANA MEMBERSHIP EXCHANGE · ADMIN GUIDE</div>
<h1>하나회원권거래소<br>관리자 사용 설명서</h1><div class="sub">업체 관리자 · 직원용</div>
<div class="meta">접속 주소 <b>https://hanamember.co.kr/admin</b><br>업체 관리자 아이디 <b>hanamember</b> (비밀번호는 총괄 관리자가 별도 전달)<br>기준일 <b>${DATE}</b><br><br>이 설명서는 하나회원권거래소 직원이 홈페이지 관리자 화면에서 <b>시세·골프장·매물·문의·고객·공지</b>를 직접 관리하는 방법을 화면 그대로 설명합니다. 블로그 작성·자동발행·리포트 같은 운영 기능은 총괄 관리자가 맡으므로 이 설명서에서 다루지 않습니다.</div></div>

<section class="first"><h2>차례</h2><ol class="toc">
<li><a href="#s1">시작하기 — 로그인, 계정 종류, 처음 할 일</a></li><li><a href="#s2">메뉴 한눈에 보기</a></li><li><a href="#s3">대시보드</a></li><li><a href="#s4">시세 관리</a></li><li><a href="#s5">골프장 관리</a></li><li><a href="#s6">매물·전용관</a></li><li><a href="#s7">문의·고객 관리</a></li><li><a href="#s8">공지·뉴스·유튜브</a></li><li><a href="#s9">유입 경로·전환</a></li><li><a href="#s10">계정·담당자</a></li><li><a href="#s11">내 계정</a></li><li><a href="#s12">블로그 발행 현황</a></li><li><a href="#s13">자주 묻는 질문·문제 해결</a></li></ol>
<div class="tip"><b>이 설명서의 약속</b><br>· <span class="btn">버튼</span> 모양은 화면의 버튼 이름입니다.<br>· 「 」 안은 메뉴·항목 이름입니다.<br>· 화면 그림은 설명용 예시 데이터이며 실제 숫자와 다릅니다.</div></section>

<section id="s1"><h2>1. 시작하기</h2>
<h3>1-1. 접속과 로그인</h3>
<ol class="steps"><li>크롬·엣지 등 브라우저에서 <b>https://hanamember.co.kr/admin</b> 을 엽니다. (PC 화면 기준으로 만들어졌지만 휴대폰에서도 열립니다.)</li><li>아이디와 비밀번호를 넣고 <span class="btn">로그인</span>. 12시간 동안 로그인이 유지되며, 이후에는 다시 로그인합니다.</li><li>왼쪽 아래에 내 이름과 권한(업체 관리자 / 직원)이 보이면 정상입니다.</li></ol>
${img('00_login.png', '그림 1-1. 로그인 화면')}
<h3>1-2. 계정 종류와 할 수 있는 일</h3>
<table><tr><th style="width:22%">권한</th><th>누가</th><th>할 수 있는 일</th></tr>
<tr><td><b>업체 관리자</b></td><td>하나회원권거래소 대표 계정 <b>hanamember</b></td><td>직원 계정 개설·정지·삭제·비밀번호 재설정, 담당자 관리 + 아래 직원이 할 수 있는 일 전부</td></tr>
<tr><td><b>직원</b></td><td>업체 관리자가 만들어 준 계정</td><td>시세 관리, 골프장 관리, 매물·전용관 등록·수정, 문의·고객 관리(담당자 배정·상담 기록), 공지·뉴스·유튜브, 유입 경로 보기, 블로그 발행 현황 보기</td></tr>
<tr><td><b>총괄</b></td><td>총괄 관리자(admin)</td><td>위 전부 + 블로그 작성·자동발행·리포트·기술 감사·사이트 설정. 업체 화면에는 이 메뉴가 보이지 않습니다.</td></tr></table>
<div class="warn"><b>열람만 되는 것</b> — 「회원권 분양」과 「해외투어」 매물은 업체 화면에서 보기만 되고 수정은 총괄에게 요청합니다. 블로그 글도 발행 현황만 봅니다.</div>
<h3>1-3. 처음 한 번만 할 일</h3>
<ol class="steps"><li><b>비밀번호 변경</b>: 「내 계정」에서 전달받은 초기 비밀번호를 본인만 아는 것으로 바꿉니다(8자 이상).</li><li><b>직원 계정 개설</b>: 「계정·담당자」→ <span class="btn">+ 계정 개설</span>. 여기 등록한 이름이 문의·고객의 「담당자」 목록에 나오므로 상담하는 직원은 모두 만들어 두세요.</li><li><b>홈페이지와 비교</b>: 왼쪽 아래 「홈페이지 열기 ↗」로 공개 화면을 새 탭에 열어 두고, 관리자에서 바꾼 내용이 바로 반영되는지 확인하면서 작업하면 편합니다.</li></ol></section>

<section id="s2"><h2>2. 메뉴 한눈에 보기</h2>
<table><tr><th style="width:24%">메뉴</th><th>무엇을 하는 곳</th><th style="width:26%">얼마나 자주</th></tr>
<tr><td>📊 대시보드</td><td>오늘 문의·방문자·시세·매물 현황을 한 화면에서 확인</td><td>매일 아침</td></tr>
<tr><td>💹 시세 관리</td><td>골프·법인·콘도·피트니스 시세 확인·수정·엑셀 업로드. 골프 시세는 매일 자동 갱신</td><td>필요할 때(수정), 주 1회(점검)</td></tr>
<tr><td>⛳ 골프장 관리</td><td>골프장 페이지 정보(주소·홀수·회원권 세부 정보·개인/법인 안내) 등록·수정</td><td>변경 사항 있을 때</td></tr>
<tr><td>🏷️ 매물·전용관</td><td>골프·콘도·피트니스 매물과 무기명·대명·선불카드 전용관 매물 등록·종료</td><td>매물 들어올 때마다</td></tr>
<tr><td>📨 문의·고객 관리</td><td>홈페이지 문의 확인, 담당자 배정, 상담 기록, 고객 DB</td><td>매일(문의 배지 확인)</td></tr>
<tr><td>📢 공지·뉴스·유튜브</td><td>공지사항·회원권 뉴스 글, 유튜브 영상 등록</td><td>월 1~2회</td></tr>
<tr><td>🧭 유입 경로·전환</td><td>방문자가 어디서 왔고 무엇을 했는지(전화·카톡·문의)</td><td>주 1회</td></tr>
<tr><td>🪪 계정·담당자</td><td>직원 계정 개설·정지, 담당자 정보 (업체 관리자만)</td><td>입·퇴사 때</td></tr>
<tr><td>🔑 내 계정</td><td>내 이름·연락처·비밀번호</td><td>처음 한 번</td></tr>
<tr><td>📝 블로그 발행 현황</td><td>블로그 글의 발행·예약 현황(보기만)</td><td>궁금할 때</td></tr></table>
${img('01_dash.png', '그림 2-1. 업체 관리자로 로그인했을 때의 메뉴와 대시보드')}</section>

<section id="s3"><h2>3. 대시보드</h2>
<p>로그인하면 바로 보이는 화면입니다. 위에서부터 다음 순서로 읽으면 됩니다.</p>
<ol><li><b>숫자 카드 4개</b>: 미처리 문의(오늘 접수·담당자 미배정 포함), 진행 중 고객, 진행 중 매물(골프·콘도·피트니스·전용관), 골프 시세 종목 수와 마지막 갱신일. 미처리 문의가 있으면 카드가 노란색이 됩니다.</li>
<li><b>일간 방문자·문의</b>: 최근 14일 막대그래프. 막대 높이는 방문 수, 붉은 글씨는 그날 들어온 문의 건수입니다. 오늘/어제, 최근 7일/그 전 7일 비교가 함께 나옵니다.</li>
<li><b>시세 현황</b>: 구분별 종목 수·마지막 갱신·수기 잠금 수, 골프 시세 자동 반영 상태. <span class="btn">지금 자동 반영 실행</span>을 누르면 오늘 시세를 즉시 받아옵니다.</li>
<li><b>이번 주 유입 채널</b>과 <b>블로그 발행 현황</b>.</li></ol>
<div class="tip">왼쪽 메뉴 「문의·고객 관리」 옆의 빨간 숫자는 아직 처리하지 않은 문의 건수입니다. 0이 되도록 관리하는 것이 목표입니다.</div></section>

<section id="s4"><h2>4. 시세 관리</h2>
<h3>4-1. 시세가 갱신되는 방식</h3>
<ul><li><b>골프회원권</b>: 매일 08:30에 자동으로 갱신됩니다. 화면 맨 위 상자에 마지막 반영 시각·반영 종목 수·변동 건수가 보입니다.</li><li><b>법인·콘도·피트니스</b>: 자동 갱신이 없으므로 엑셀 업로드 또는 직접 수정으로 관리합니다.</li><li>수정한 값은 홈페이지 시세표와 차트에 바로 반영되고, 이력이 자동으로 쌓여 차트가 그려집니다.</li></ul>
${img('02_prices.png', '그림 4-1. 시세 관리 화면 — 위: 자동 반영 상태, 가운데: 엑셀 업로드, 아래: 구분 탭과 종목표')}
<h3>4-2. 종목 하나를 직접 고치기</h3>
<ol class="steps"><li>구분 탭(골프회원권·법인회원권·콘도회원권·피트니스회원권)에서 종목을 찾습니다. 표가 길면 브라우저의 <span class="kbd">Ctrl</span>+<span class="kbd">F</span>로 이름을 검색하세요.</li><li>행 끝의 <span class="btn">수정</span>을 누르고 금일시세(만원)·전일시세·회원수·지역·비고를 고친 뒤 <span class="btn">저장</span>.</li><li>자동 반영에 덮어쓰이지 않게 하려면 <b>「수기 잠금」</b>에 체크합니다(골프만 해당). 잠금 종목은 자동 반영이 건너뛰므로 직접 넣은 값이 유지됩니다. 다시 자동으로 돌리려면 체크를 풉니다(다음 날부터 자동).</li></ol>
${img('02b_prices_edit.png', '그림 4-2. 시세 수정 창 — 맨 아래 「수기 잠금」')}
<h3>4-3. 엑셀로 한 번에 올리기</h3>
<ol class="steps"><li><span class="btn">현재 시세로 채운 양식 다운로드</span>로 양식을 받습니다. 시트는 골프회원권·법인회원권·콘도회원권·피트니스회원권 4개이고, 열은 회원권명 · 금일시세(만원) · 전일시세 · 회원수 · 지역 · 비고입니다.</li><li>값을 고친 파일을 점선 상자에 끌어다 놓거나 클릭해 선택합니다.</li><li>먼저 <b>미리보기</b>가 뜹니다. 인식된 행 수와 경고를 확인하고 <span class="btn">이대로 반영</span>을 누르면 적용됩니다. 없는 종목은 새로 추가되고, 있는 종목은 갱신됩니다.</li></ol>
<div class="warn">종목명은 홈페이지 시세표와 골프장 페이지를 잇는 열쇠입니다. 양식에 있는 이름을 바꾸지 말고 값만 고치세요. 새 종목은 <span class="btn">+ 종목 추가</span>로 넣는 편이 안전합니다.</div>
<h3>4-4. 종목 추가·삭제</h3>
<p><span class="btn">+ 종목 추가</span>에서 구분·회원권명·금일시세를 넣으면 바로 시세표에 나옵니다. <span class="btn">삭제</span>는 이력까지 함께 지워지므로 되돌릴 수 없습니다. 거래가 끊긴 종목은 삭제보다 비고에 적어 두는 것을 권합니다.</p></section>

<section id="s5"><h2>5. 골프장 관리</h2>
<p>홈페이지 「골프장 소개」의 각 골프장 페이지를 관리합니다. 목록에서 골프장 이름 아래 「보기 ↗」를 누르면 공개 페이지가 열립니다.</p>
${img('03_clubs.png', '그림 5-1. 골프장 목록 — 검색, 검증 체크, 편집')}
<h3>5-1. 검증 체크란?</h3>
<p>골프장의 홀수·주소는 공개 자료로 넣은 초기값입니다. 담당자가 골프장 홈페이지 등으로 확인한 뒤 「검증」에 체크해야 홀수가 공개 페이지에 표시됩니다. 확인되지 않은 정보가 손님에게 보이지 않게 하는 장치입니다.</p>
<h3>5-2. 골프장 정보 편집</h3>
<ol class="steps"><li><span class="btn">편집</span>을 누릅니다. 위에서부터 이름·권역·<b>시세표 종목명</b>(시세 관리의 회원권명과 똑같이 적어야 그 종목의 시세·차트가 페이지에 붙습니다)·주소·홀수·운영 형태.</li><li><b>한 줄 요약(직답)</b>: 페이지 맨 위에 나오는 한 문장. 적합한 매수자·부킹 특징·입회·명의개서는 손님이 가장 많이 묻는 항목이니 상담 경험대로 적어 주세요.</li><li><b>회원권 세부 정보 · 개인/법인 회원권 정보</b> 상자를 펼치면 회원권 소개·코스 소개·연혁·위치 정보·향후 전망과, 개인/법인 각각의 추천 고객·회원권 구성·종류·부킹·입회 조건·필요 서류·특징을 넣을 수 있습니다. 비워 둔 항목은 홈페이지에 나오지 않고, 줄을 바꾸면 그대로 줄이 나뉩니다.</li><li>맨 아래 「본문 HTML」은 소개글 전문입니다. 글자만 고칠 때는 태그(&lt; &gt;)를 건드리지 말고 글자 부분만 바꾸세요. 상태를 「비공개」로 두면 홈페이지에서 숨겨집니다.</li><li><span class="btn">저장</span>. 공개 페이지를 새로고침해 확인합니다.</li></ol>
${img('03b_club_edit.png', '그림 5-2. 골프장 편집 창 — 기본 정보와 회원권 세부 정보')}
<h3>5-3. 새 골프장 등록</h3>
<p><span class="btn">+ 골프장 등록</span>에서 이름만 넣어도 페이지가 생깁니다. 시세표 종목명까지 넣으면 시세·차트가 자동으로 붙습니다. 같은 골프장의 회원권 종류(예: 주중·가족)는 총괄이 묶어 두므로, 새로 생기면 알려 주세요.</p></section>

<section id="s6"><h2>6. 매물·전용관</h2>
<p>홈페이지 「회원권 매물」과 「전용관」에 나오는 매물을 관리합니다. 위쪽 탭으로 골프회원권·콘도회원권·피트니스회원권·전용관·회원권 분양·해외투어를 나눠 봅니다.</p>
${img('04_listings.png', '그림 6-1. 매물·전용관 — 탭과 목록')}
<h3>6-1. 매물 등록</h3>
<ol class="steps"><li><span class="btn">+ 매물 등록</span>.</li><li><b>제목</b>: 손님이 보는 제목(예: 아시아나CC 정회원권 급매). <b>구분</b>: 골프·콘도·피트니스. <b>종류</b>: 매도/매수. <b>종목명</b>: 시세표의 회원권명과 같게 적으면 시세와 연결됩니다.</li><li>지역·가격(만원)·설명을 적고, 사진이 있으면 「대표 이미지 URL」에 주소를 넣습니다(사진 파일 업로드가 필요하면 총괄에게 보내 주세요).</li><li>홈 화면에 띄우고 싶으면 「홈 추천 노출」 체크. <span class="btn">저장</span>.</li></ol>
${img('04b_listing_form.png', '그림 6-2. 매물 등록 창')}
<h3>6-2. 전용관(무기명·대명리조트·선불카드) 매물</h3>
<p>따로 메뉴가 있는 것이 아니라 <b>「종류」에 무기명 / 대명 / 선불카드</b> 중 하나를 적으면 해당 전용관 페이지에 자동으로 나옵니다. 「전용관」 탭에서 모아 볼 수 있습니다.</p>
${img('04c_listings_excl.png', '그림 6-3. 전용관 탭 — 종류가 무기명·대명·선불카드인 매물')}
<h3>6-3. 거래가 끝났을 때</h3>
<p>삭제하지 말고 <span class="btn">편집</span>→ 상태를 「종료」로 바꾸세요. 홈페이지에서는 사라지고 기록은 남습니다. 완전히 지우려면 <span class="btn">삭제</span>.</p>
<div class="warn">「회원권 분양」·「해외투어」 탭은 <span class="btn">열람</span>만 됩니다. 내용을 바꾸려면 총괄 관리자에게 요청하세요.</div></section>

<section id="s7"><h2>7. 문의·고객 관리</h2>
<h3>7-1. 흐름</h3>
<p>홈페이지에서 매매 신청·상담 문의가 들어오면 <b>그 즉시 이 화면에 고객으로 자동 등록</b>됩니다(같은 연락처가 다시 문의하면 새 고객을 만들지 않고 그 고객의 기록에 쌓입니다). 처리 순서는 다음과 같습니다.</p>
<ol class="steps"><li>「신규 접수」 탭에서 새 문의를 확인합니다. 문의 내용과 유입 경로(네이버 검색·구글 등)가 함께 보입니다.</li><li>표에서 <b>담당자</b>를 고릅니다(바로 저장됩니다).</li><li>연락한 뒤 <b>상태</b>를 「상담중」으로 바꾸고, <span class="btn">상담 기록</span>에서 통화 내용을 적습니다.</li><li>계약이 되면 「계약」, 보류·종료되면 「보류」/「종료」. 상태를 바꾸면 대시보드의 미처리 문의 숫자도 같이 줄어듭니다.</li></ol>
${img('05_customers.png', '그림 7-1. 문의·고객 관리 — 상태 탭, 필터, 담당자·상태 즉시 변경')}
<h3>7-2. 화면 읽는 법</h3>
<ul><li><b>상태 탭</b>: 진행 중(신규+상담중) · 신규 접수 · 상담중 · 계약 · 보류 · 종료 · 전체. 숫자는 건수입니다.</li><li><b>필터</b>: 검색(성함·연락처·종목·문의 내용·메모), 구분(매수·매도·상담·보유회원), 담당자, 출처(홈페이지 문의 / 직접 등록).</li><li><b>문의 내용 · 유입</b>: 손님이 적은 내용과 어디서 들어왔는지. 「경로」를 누르면 그 손님이 어떤 페이지를 보다가 문의했는지 순서대로 보입니다.</li><li><b>최근 상담 기록</b>: 마지막 기록과 한 줄 메모.</li></ul>
<h3>7-3. 상담 기록</h3>
<p><span class="btn">상담 기록</span>을 누르면 그 고객의 기록이 시간순으로 보이고, 위에서 담당자·상태를 바꾸거나 새 기록을 추가할 수 있습니다. 문의 접수와 담당자·상태 변경은 자동으로 기록됩니다. 내가 쓴 기록만 삭제할 수 있고, 자동 기록은 지워지지 않습니다.</p>
${img('05b_customer_notes.png', '그림 7-2. 상담 기록 창')}
<h3>7-4. 전화·방문 손님, 보유 회원 직접 등록</h3>
<p><span class="btn">+ 고객 등록</span>에서 성함·연락처·구분(보유회원 포함)·분류·관심 종목·예산·담당자·한 줄 메모·첫 상담 기록을 넣습니다. 한 줄 메모는 표에 항상 보이는 짧은 표시용(예: 기존 회원 · 매도 의향)입니다.</p>
${img('05c_customer_form.png', '그림 7-3. 고객 등록 창')}
<h3>7-5. 내려받기</h3>
<p><span class="btn">CSV 내려받기</span>로 전체 고객을 엑셀에서 열 수 있는 파일로 받습니다(문의 내용·유입·담당자·최근 상담 기록 포함). 개인정보이므로 파일 보관과 공유에 주의하세요.</p></section>

<section id="s8"><h2>8. 공지·뉴스·유튜브</h2>
<ul><li><b>공지사항</b>: 휴무·이전·행사 안내 등. <span class="btn">+ 공지</span>→ 제목·본문→ 상태 「발행」으로 저장하면 홈페이지 공지에 나옵니다. 초안으로 두면 보이지 않습니다.</li><li><b>회원권 뉴스</b>: 업계 소식을 같은 방식으로 올립니다.</li><li><b>유튜브 영상</b>: 영상 주소(https://www.youtube.com/watch?v=…)와 제목·업로드일을 넣고 <span class="btn">추가/갱신</span>. 홈과 「하나TV유튜브」 페이지에 나오고, 검색엔진에 영상 정보로 등록됩니다. 새 영상을 올릴 때마다 추가해 주세요.</li></ul>
${img('06_notice.png', '그림 8-1. 공지·뉴스·유튜브')}</section>

<section id="s9"><h2>9. 유입 경로·전환</h2>
<h3>9-1. 용어</h3>
<table><tr><th style="width:22%">용어</th><th>뜻</th></tr><tr><td>방문(세션)</td><td>한 사람이 들어와서 나갈 때까지 한 번. 30분 이상 쉬면 새 방문으로 셉니다. 봇과 관리자 로그인 중 방문은 제외.</td></tr><tr><td>채널</td><td>검색(자연)·AI 검색·소셜·광고·캠페인 링크·다른 사이트·직접 방문</td></tr><tr><td>출처</td><td>네이버 검색·구글 검색·유튜브처럼 구체적인 곳</td></tr><tr><td>전환</td><td>방문 중 전화 버튼·카카오톡 문의·문의 접수 중 하나라도 한 것</td></tr></table>
<h3>9-2. 보는 법</h3>
<ol><li>위쪽 기간 버튼(오늘·어제·최근 7일·30일·90일)이나 날짜로 기간을 정합니다.</li><li>숫자 카드 → 채널별 → 출처별 → 검색어 → 처음 들어온 페이지 → 전환 페이지 순으로 보면 "어디서 온 손님이 무엇을 보고 연락했는지"가 읽힙니다.</li><li><b>어느 숫자든 누르면 상세가 열립니다.</b> 숫자 카드, 채널·출처의 <span class="btn">자세히</span>, 검색어·페이지·캠페인 행, 일별 막대를 누르면 그 조건에 해당하는 방문의 요약과 목록, 한 명 한 명의 이동 경로가 보입니다.</li></ol>
${img('07_inflow.png', '그림 9-1. 유입 경로·전환')}
${img('07b_inflow_detail.png', '그림 9-2. 숫자 카드를 눌렀을 때 열리는 상세 창')}
<h3>9-3. 추적 링크 만들기</h3>
<p>블로그·카카오톡·유튜브 설명·명함 QR에 붙일 링크를 만들면 그 링크로 들어온 방문이 「캠페인」으로 따로 집계됩니다. 아래쪽 「추적 링크 만들기」에서 연결할 페이지·어디에 붙일지·캠페인 이름을 넣고 <span class="btn">복사</span>해서 쓰면 됩니다.</p></section>

<section id="s10"><h2>10. 계정·담당자 <small>업체 관리자만</small></h2>
${img('08_accounts.png', '그림 10-1. 계정·담당자 목록')}
<h3>10-1. 직원 계정 개설</h3>
<ol class="steps"><li><span class="btn">+ 계정 개설</span>.</li><li>아이디(영문 소문자·숫자 3~30자), 초기 비밀번호(8자 이상), 이름, 소속·담당 업무(예: 골프회원권 매매), 연락처를 넣고 <span class="btn">개설</span>.</li><li>아이디와 초기 비밀번호를 직원에게 전달하고, 첫 로그인 후 「내 계정」에서 비밀번호를 바꾸도록 안내합니다.</li></ol>
${img('08b_account_create.png', '그림 10-2. 계정 개설 창')}
<h3>10-2. 관리</h3>
<ul><li><span class="btn">편집</span>: 이름·소속·연락처 수정.</li><li><span class="btn">비밀번호 재설정</span>: 직원이 비밀번호를 잊었을 때 새 비밀번호를 정해 줍니다.</li><li><span class="btn">정지</span>: 퇴사·휴직 때. 즉시 로그인이 막히고 담당 배정은 그대로 남습니다. <span class="btn">해제</span>로 되돌릴 수 있습니다.</li><li><span class="btn">삭제</span>: 계정을 지우고 그 직원에게 배정된 담당자 표시만 해제됩니다(고객·상담 기록은 남습니다).</li></ul>
<div class="tip">업체 관리자 계정(hanamember)의 비밀번호를 잊으면 총괄 관리자에게 재설정을 요청하세요.</div></section>

<section id="s11"><h2>11. 내 계정</h2>
<p>내 이름·소속·연락처를 고치고 비밀번호를 바꿉니다. 비밀번호는 8자 이상이고, 두 번 같게 입력해야 합니다. 바꾼 뒤에도 현재 로그인은 유지됩니다.</p>
${img('09_account.png', '그림 11-1. 내 계정')}</section>

<section id="s12"><h2>12. 블로그 발행 현황</h2>
<p>매일 발행되는 블로그 글(가이드·시세 리포트·골프장 소개·시장 동향)의 발행 수, 최근 7일 발행, 예약된 글과 발행일을 봅니다. 글 제목 아래 「글 보기 ↗」로 홈페이지 글을 바로 열 수 있습니다. 작성·수정은 총괄이 하므로 수정 요청이 있으면 글 제목과 함께 알려 주세요.</p>
${img('10_blog.png', '그림 12-1. 블로그 발행 현황')}</section>

<section id="s13"><h2>13. 자주 묻는 질문·문제 해결</h2>
<table><tr><th style="width:34%">증상</th><th>해결</th></tr>
<tr><td>메뉴를 눌렀는데 "오류" 글자만 나오거나 화면이 예전 모양이다</td><td>홈페이지가 새로 배포된 직후 브라우저가 옛 화면을 기억한 경우입니다. <span class="kbd">Ctrl</span>+<span class="kbd">F5</span>(강력 새로고침) 한 번이면 해결됩니다.</td></tr>
<tr><td>로그인이 안 된다</td><td>아이디는 영문 소문자입니다. "정지된 계정" 안내가 뜨면 업체 관리자에게, 업체 관리자 본인이면 총괄에게 재설정을 요청하세요. 12시간이 지나면 자동으로 로그아웃됩니다.</td></tr>
<tr><td>골프 시세를 고쳤는데 다음 날 다시 바뀌어 있다</td><td>매일 자동 반영이 덮어쓴 것입니다. 그 종목의 「수기 잠금」을 켜 두세요.</td></tr>
<tr><td>문의가 안 보인다</td><td>상태 탭이 「진행 중」이면 계약·보류·종료된 건은 숨겨집니다. 「전체」 탭이나 검색을 쓰세요.</td></tr>
<tr><td>같은 손님이 두 번 등록됐다</td><td>연락처를 다르게 적은 경우입니다. 한쪽에 상담 기록을 옮겨 적고 다른 쪽은 삭제하세요. 홈페이지 문의는 연락처가 같으면 자동으로 합쳐집니다.</td></tr>
<tr><td>매물을 올렸는데 홈페이지에 안 보인다</td><td>상태가 「종료」가 아닌지, 구분·종류가 맞는지 확인하고 홈페이지를 새로고침하세요. 전용관은 종류가 무기명/대명/선불카드여야 합니다.</td></tr>
<tr><td>골프장 홀수가 홈페이지에 안 나온다</td><td>골프장 관리에서 「검증」에 체크해야 표시됩니다.</td></tr>
<tr><td>직원이 퇴사했다</td><td>계정·담당자에서 <span class="btn">정지</span>. 담당하던 고객은 다른 직원으로 담당자를 바꿔 주세요(문의·고객 관리에서 담당자 필터로 모아 볼 수 있습니다).</td></tr>
<tr><td>사진 업로드, 블로그 글 수정, 분양·해외투어 매물 수정, 사이트 문구·전화번호 변경</td><td>총괄 관리자에게 요청합니다.</td></tr></table>
<div class="tip"><b>개인정보 안내</b> — 문의·고객 화면의 이름·연락처는 개인정보입니다. 화면을 공용 PC에 켜 두지 말고, 작업이 끝나면 로그아웃하세요. CSV 파일은 업무 목적으로만 보관합니다.</div>
<p style="margin-top:24px;color:var(--muted);font-size:10pt">하나회원권거래소 관리자 사용 설명서 · ${DATE}</p></section>
</div></body></html>`;
const htmlPath = path.join(OUTDIR, '하나회원권_관리자_사용설명서.html'); fs.writeFileSync(htmlPath, html);
(async () => {
  const b = await shot.launch(); const p = await b.newPage();
  await p.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 60000 });
  await p.pdf({ path: path.join(OUTDIR, '하나회원권_관리자_사용설명서.pdf'), format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:sans-serif">하나회원권거래소 관리자 사용 설명서 · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  await b.close(); console.log('pdf ok', (fs.statSync(path.join(OUTDIR, '하나회원권_관리자_사용설명서.pdf')).size / 1024 / 1024).toFixed(1) + 'MB');
})();
