@echo off
title AdBazaar - turn OFF auto-start
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del "%STARTUP%\AdBazaar.vbs" >nul 2>nul
echo  Auto-start is OFF. AdBazaar will no longer start with Windows.
echo  (If it is running now, use windows\stop.bat to stop it.)
echo.
pause
