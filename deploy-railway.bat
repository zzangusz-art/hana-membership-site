@echo off
cd /d "%~dp0"
echo ============================================================
echo  하나회원권거래소 홈페이지 - Railway 최초 배포 도우미
echo  1) railway login  2) 프로젝트 생성  3) 볼륨 /data  4) 환경변수  5) 배포
echo  ※ 결제 카드 등록은 Railway 웹에서 직접 진행하세요.
echo ============================================================
where railway >nul 2>&1
if errorlevel 1 (
  echo Railway CLI가 없습니다. 설치: npm i -g @railway/cli
  pause
  exit /b 1
)
railway whoami >nul 2>&1
if errorlevel 1 (
  echo [1/5] 브라우저에서 Railway 로그인 창이 열립니다...
  railway login
  if errorlevel 1 (
    echo 로그인 실패. 다시 실행하세요.
    pause
    exit /b 1
  )
)
echo [2/5] 프로젝트 연결 ^(새 프로젝트 hana-membership-site 생성 또는 기존 선택^)
railway init
if errorlevel 1 (
  echo 이미 연결돼 있으면 계속 진행합니다.
)
echo [3/5] 영구 볼륨 /data 추가 ^(없으면 재배포마다 DB 초기화^)
railway volume add --mount-path /data
echo [4/5] 환경변수 설정
set /p SITEURL=정식 도메인 ^(예 https://www.hanamarket.co.kr, 미정이면 Enter^):
if "%SITEURL%"=="" set SITEURL=https://www.hanamarket.co.kr
set /p ADMINPW=관리자 비밀번호 ^(8자 이상, Enter=hana1234!^):
if "%ADMINPW%"=="" set ADMINPW=hana1234!
for /f "delims=" %%i in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')"') do set JWT=%%i
railway variables --set "DATA_DIR=/data" --set "SITE_URL=%SITEURL%" --set "ADMIN_ID=admin" --set "ADMIN_PW=%ADMINPW%" --set "JWT_SECRET=%JWT%" --set "NODE_ENV=production"
set /p AKEY=Anthropic API 키 ^(있으면 입력, 없으면 Enter - 나중에 관리자 설정에서 입력 가능^):
if not "%AKEY%"=="" railway variables --set "ANTHROPIC_API_KEY=%AKEY%"
set /p IKEY=인블로그 API 키 ^(있으면 입력, 없으면 Enter^):
if not "%IKEY%"=="" railway variables --set "INBLOG_API_KEY=%IKEY%"
echo [5/5] 배포 시작 ^(빌드 2~4분^)
railway up --detach
echo.
echo 배포가 시작됐습니다. Railway 대시보드 ^> Settings ^> Networking 에서 도메인을 생성/연결하세요.
echo 임시 도메인^(*.up.railway.app^)은 자동으로 noindex 처리되어 검색엔진에 노출되지 않습니다.
railway open
pause
