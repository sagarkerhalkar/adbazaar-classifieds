@echo off
title AdBazaar - start in background
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist .env copy .env.example .env >nul
wscript "%~dp0start-hidden.vbs"
echo  Starting AdBazaar in the background...
timeout /t 5 /nobreak >nul
if not exist storage\server-url.txt goto notyet
set /p URL=<storage\server-url.txt
echo.
echo  AdBazaar is running:
type storage\addresses.txt
echo.
echo  You can close this window - the app keeps running.
start "" "%URL%"
goto end

:notyet
echo.
echo  It did not start. Open storage\server.log in Notepad to see why.
echo  (Most common reason: the PORT in .env is used by another program.)
goto end

:nonode
echo  Node.js is not installed. Run windows\1-setup.bat first.

:end
echo.
pause
