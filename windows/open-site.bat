@echo off
cd /d "%~dp0.."
if not exist storage\server-url.txt goto notrunning
set /p URL=<storage\server-url.txt
start "" "%URL%"
exit /b 0

:notrunning
echo  AdBazaar is not running. Start it with windows\3-start-in-background.bat
pause
