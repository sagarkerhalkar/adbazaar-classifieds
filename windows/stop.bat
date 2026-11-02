@echo off
title AdBazaar - stop
cd /d "%~dp0.."
if not exist storage\server.pid goto notrunning
set /p PID=<storage\server.pid
taskkill /PID %PID% /T /F >nul 2>nul
del storage\server.pid >nul 2>nul
del storage\server-url.txt >nul 2>nul
echo  AdBazaar stopped.
goto end

:notrunning
echo  AdBazaar is not running.

:end
echo.
pause
