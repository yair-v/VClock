@echo off
title VClock Start
cd /d "%~dp0backend"

echo ==========================================
echo VClock starting on port 3000
echo ==========================================

call npm install

start "VClock Server" cmd /k "set PORT=3000 && npm start"

echo Waiting for server...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false; for($i=0;$i -lt 25;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health -TimeoutSec 2; if($r.StatusCode -eq 200){$ok=$true; break} } catch {}; Start-Sleep -Seconds 1 }; if(-not $ok){ exit 1 }"

start "" http://localhost:3000