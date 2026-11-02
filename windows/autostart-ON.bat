@echo off
title AdBazaar - turn ON auto-start
cd /d "%~dp0.."
set "APPDIR=%CD%"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\AdBazaar.vbs" echo CreateObject("WScript.Shell").Run """%APPDIR%\windows\start-hidden.vbs""", 0, False
if not exist "%STARTUP%\AdBazaar.vbs" goto failed
echo.
echo  Auto-start is ON.
echo  AdBazaar will now start by itself every time you log in to Windows.
echo.
echo  Starting it now as well...
call "%~dp03-start-in-background.bat"
exit /b 0

:failed
echo  Could not turn on auto-start. Try right-click - Run as administrator.
pause
