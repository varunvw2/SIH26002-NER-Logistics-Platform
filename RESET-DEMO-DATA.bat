@echo off
title SIH26002 - Reset Demo Data
echo ==================================================
echo   Reset the demo database back to a clean state
echo ==================================================
echo.
echo This wipes any shipments/incidents you created while testing
echo and restores the original demo data.
echo.
echo NOTE: with internet, this also re-downloads real road shapes.
echo Without internet it still works, but roads will be drawn as
echo straight lines instead of following real highways - so prefer
echo running this while you have Wi-Fi.
echo.
pause

echo Stopping any running servers on ports 3000 and 5173...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1

cd /d "%~dp0backend"
if exist data rmdir /s /q data
call npm run migrate
if errorlevel 1 goto fail
call npm run seed
if errorlevel 1 goto fail

echo.
echo ==================================================
echo   Demo data reset. Now run START-HERE.bat
echo ==================================================
pause
exit /b 0

:fail
echo.
echo [ERROR] Reset failed - read the message above.
pause
exit /b 1
