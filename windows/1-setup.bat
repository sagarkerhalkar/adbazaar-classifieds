@echo off
title AdBazaar - setup
cd /d "%~dp0.."
echo.
echo  ==== AdBazaar setup ====
echo.
where node >nul 2>nul
if errorlevel 1 goto nonode
node scripts\check-node.js
if errorlevel 1 goto end

if exist .env goto haveenv
copy .env.example .env >nul
echo  Created your settings file: .env
goto editenv
:haveenv
echo  Your settings file .env already exists - keeping it.

:editenv
echo.
echo  Notepad will open now. Change ADMIN_EMAIL and ADMIN_PASSWORD,
echo  then press Ctrl+S to save and close Notepad.
echo.
pause
notepad .env
echo.
echo  Setup done. Next: double-click  windows\2-start.bat
goto end

:nonode
echo  Node.js is not installed.
echo  Go to https://nodejs.org, download the LTS version, install it,
echo  restart your computer, then run this file again.

:end
echo.
pause
