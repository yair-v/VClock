@echo off
title VClock Start

cd /d "%~dp0"

echo ==========================================
echo Building frontend...
echo ==========================================
cd frontend
call npm install
if errorlevel 1 goto :error
call npm run build
if errorlevel 1 goto :error

cd ..\backend

echo ==========================================
echo Starting VClock on port 3000
echo ==========================================
call npm install
if errorlevel 1 goto :error

start "VClock Server" cmd /k "set PORT=3000 && npm start"

echo Waiting for server...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false; for($i=0;$i -lt 40;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health -TimeoutSec 2; if($r.StatusCode -eq 200){$ok=$true; break} } catch {}; Start-Sleep -Seconds 1 }; if(-not $ok){ exit 1 }"
if errorlevel 1 goto :error

start "" http://localhost:3000
exit /b 0

:error
echo Failed to start VClock.
pause
exit /b 1
