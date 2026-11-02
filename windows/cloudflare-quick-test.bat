@echo off
title AdBazaar - free temporary internet link (Cloudflare Quick Tunnel)
cd /d "%~dp0.."
rem Gives a temporary https://xxxx.trycloudflare.com link to your local AdBazaar.
rem No Cloudflare account or domain needed. The link changes every time and stops when you close this window.

where cloudflared >nul 2>nul
if errorlevel 1 goto nocf
if not exist storage\server-url.txt goto notrunning

set PORT=4780
if exist .env for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "PORT=%%b"

echo.
echo  In a few seconds a line like this appears:
echo      https://something-random-words.trycloudflare.com
echo  Copy that address and open it on any phone or computer.
echo  Keep this window open while testing. Close it to stop the link.
echo.
cloudflared tunnel --url http://localhost:%PORT%
goto end

:nocf
echo.
echo  cloudflared is not installed yet. Open Command Prompt and run:
echo      winget install --id Cloudflare.cloudflared
echo  then close Command Prompt and run this file again.
goto end

:notrunning
echo.
echo  Start AdBazaar first (windows\2-start.bat or windows\3-start-in-background.bat).

:end
echo.
pause
