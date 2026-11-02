@echo off
title AdBazaar - addresses
cd /d "%~dp0.."
echo.
if not exist storage\server-url.txt goto notrunning
echo  AdBazaar is running. Open it at:
echo.
type storage\addresses.txt
goto end

:notrunning
echo  AdBazaar is not running. Start it with windows\2-start.bat or windows\3-start-in-background.bat

:end
echo.
pause
