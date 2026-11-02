@echo off
title AdBazaar server (close this window to stop)
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 goto nonode
node scripts\check-node.js
if errorlevel 1 goto end
if not exist .env copy .env.example .env >nul
echo.
echo  Starting AdBazaar... keep this window open.
echo  Closing this window stops the app.
echo.
node server.js
goto end

:nonode
echo  Node.js is not installed. Run windows\1-setup.bat first.

:end
echo.
pause
