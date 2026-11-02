@echo off
title AdBazaar - allow phones/laptops on your Wi-Fi to open the site
cd /d "%~dp0.."
rem Needs "Run as administrator" to change the Windows Firewall.
net session >nul 2>nul
if errorlevel 1 goto needadmin

set PORT=4780
if exist .env for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "PORT=%%b"

netsh advfirewall firewall delete rule name="AdBazaar" >nul 2>nul
netsh advfirewall firewall add rule name="AdBazaar" dir=in action=allow protocol=TCP localport=%PORT% profile=private,domain >nul
if errorlevel 1 goto failed
echo.
echo  Done. Other devices on your home/office Wi-Fi can now open AdBazaar on port %PORT%.
echo  (Only on "Private" networks - not on public Wi-Fi.)
echo.
echo  Your addresses:
if exist storage\addresses.txt type storage\addresses.txt
if not exist storage\addresses.txt echo  Start AdBazaar first, then run windows\show-addresses.bat
goto end

:needadmin
echo.
echo  Please RIGHT-CLICK this file and choose "Run as administrator".
goto end

:failed
echo  Could not add the firewall rule.

:end
echo.
pause
