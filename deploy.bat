@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
if "%~1"=="--check" (
  echo [check] deploy.bat 파싱 정상
  exit /b 0
)
echo ============================================================
echo  하나회원권거래소 홈페이지 - 배포 ^(GitHub 푸시 + Railway 업로드^)
echo ============================================================

where railway >nul 2>&1
if errorlevel 1 (
  echo [X] Railway CLI가 없습니다. 설치: npm i -g @railway/cli
  pause
  exit /b 1
)

echo [1/5] 스모크 테스트
call npm run smoke >"%TEMP%\hana-smoke.log" 2>&1
if errorlevel 1 (
  echo [X] 스모크 테스트 실패. 로그: %TEMP%\hana-smoke.log
  pause
  exit /b 1
)
echo      통과

echo [2/5] Git 커밋·푸시
git add -A
git diff --cached --quiet
if errorlevel 1 (
  set /p MSG=커밋 메시지 ^(Enter=자동^):
  if "!MSG!"=="" set MSG=deploy: %date% %time:~0,5%
  git commit -q -m "!MSG!"
)
set GIT_TERMINAL_PROMPT=0
git push -q origin main
if errorlevel 1 (
  echo [!] GitHub 푸시 실패 ^(자격증명 확인^). Railway 업로드는 계속합니다.
)
for /f %%i in ('git rev-parse --short HEAD') do set SHA=%%i
echo      커밋 %SHA%

echo [3/5] Railway 로그인·프로젝트 연결 확인
railway whoami >nul 2>&1
if errorlevel 1 (
  echo      브라우저에서 Railway 로그인...
  railway login
  if errorlevel 1 (
    echo [X] 로그인 실패
    pause
    exit /b 1
  )
)
railway status >nul 2>&1
if errorlevel 1 (
  echo      프로젝트가 연결돼 있지 않습니다. 목록에서 hana-membership-site 를 고르세요.
  railway link
  if errorlevel 1 (
    echo [X] 연결 실패
    pause
    exit /b 1
  )
)

echo [4/5] 배포 도장 기록 후 업로드 ^(빌드 3~6분, chromium 포함^)
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-ddTHH:mm:ss"') do set NOW=%%t
> .deploy-stamp echo %SHA% %NOW%
railway up --detach
if errorlevel 1 (
  echo [X] 업로드 실패
  pause
  exit /b 1
)

echo [5/5] 반영 확인 ^(healthz의 commit이 %SHA% 가 될 때까지 최대 12분 대기^)
set URL=https://hana-membership-site-production.up.railway.app
set /a N=0
:WAIT
set /a N+=1
if %N% GTR 36 (
  echo [!] 12분 내 반영 확인 실패. Railway 대시보드에서 빌드 로그를 확인하세요: railway logs
  goto END
)
timeout /t 20 /nobreak >nul
for /f "delims=" %%r in ('curl -s --max-time 10 "%URL%/healthz"') do set RES=%%r
echo !RES! | find "%SHA%" >nul
if errorlevel 1 (
  <nul set /p =.
  goto WAIT
)
echo.
echo [OK] 배포 반영 완료: %URL%  ^(commit %SHA%^)
echo !RES! | find "\"volume\":false" >nul
if not errorlevel 1 (
  echo [!] 경고: 볼륨이 마운트되지 않았습니다. Railway ^> Service ^> Volumes 에서 /data 추가 + 변수 DATA_DIR=/data
)

:END
railway open >nul 2>&1
pause
