@echo off
title VClock Stop
echo Closing VClock...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /PID %%a /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq VClock Server*" /T /F >nul 2>&1
echo Done.
timeout /t 2 >nul
