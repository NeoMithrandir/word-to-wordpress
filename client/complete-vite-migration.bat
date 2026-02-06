@echo off
echo ========================================
echo Completing Vite Migration
echo ========================================
echo.
echo This script will:
echo 1. Clean node_modules
echo 2. Reinstall dependencies
echo 3. Start the Vite dev server
echo.
echo IMPORTANT: Close all terminals and IDE instances before running!
echo.
pause

echo.
echo Step 1: Cleaning node_modules...
if exist node_modules (
    rmdir /s /q node_modules 2>nul
    if exist node_modules (
        echo WARNING: Some files are locked. Please close all apps and try again.
        pause
        exit /b 1
    )
)

if exist package-lock.json (
    del package-lock.json
)

echo.
echo Step 2: Installing dependencies...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo Step 3: Checking for vulnerabilities...
call npm audit

echo.
echo ========================================
echo Migration Complete!
echo ========================================
echo.
echo To start the development server:
echo   npm run dev
echo.
echo Or to build for production:
echo   npm run build
echo.
pause
